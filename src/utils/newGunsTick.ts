// research/NEW_GUNS.md(第4版): 新しい銃3挺(塊弾・衛星弾・スキャンセンサー)の「1フレームの進行」。
// useGameLoop から毎フレーム1回呼ぶ(火炎放射器/アイレーザーの状態機械と同じ置き場所の考え方)。
// 判定の中身は純関数(blobShot.ts / satelliteOrbit.ts / scanSensor.ts)に置き、ここは store を読んで
// 純関数を回し、結果(ダメージ・押しのけ・印・弾)を store へ書くだけ。
//
// ★動いている物(塊・回る弾・扇)の位置は**このモジュールの中**に持つ(毎フレーム store に書くと購読者を
// 毎フレーム起こすため=CLAUDE.md React re-render discipline)。描画(pixi/newGunsFx.ts)は
// `getNewGunsView()` を読むだけ。新しいランは gameTime の巻き戻りで検出して片付ける(刀のオート斬撃と同じ作法)。
//
// ★3挺を持たない時: 塊が場に無く、回る弾も扇も無いので、このモジュールは store へ1度も書かない
// (既存の銃・近接・サブの挙動は1bitも変わらない)。
import type { Enemy, Player, Projectile } from '../types/game';
import {
  useGameStore, isKatanaMode, isAttackLocked, isSeekerActive, skillLevel, SKATER_LOCK_ENABLED,
  skillOutgoingDamageMult, skillBloodAwakenDamageMult, resolveShieldWalls, shieldPlayableCtx, PLAYER_MELEE_SWING_MS,
  sniperGunMult, skillComboMasterMult,
} from '../store/gameStore';
import { isPvpIncapacitated } from './pvpPosture';
import { isHurtGunLocked } from './playerHurt';
import { isPlayerGrabbed } from './chaffMoves';
import { dashModeAt } from './dashLocomotion';
import {
  getActiveGun, gunEffectiveRangePx, effectiveFireCooldown, isReloading, weaponAfterGunShot,
  gunShotBaseDamage, gunShotCritChance, gunFireSfxKey,
} from './weaponUtils';
import { pickNearestTarget, isCorpse, isReaperFamily, isTerminalReaper, resistsChipKnockback } from './enemyUtils';
import { clampRectToPlayableArea } from '../world/playableArea';
import { playSfx, playEnemyDeath } from '../audio/audioManager';
import { recoilSpecForWeapon } from './combatFeel';
import { dropGunKillLoot, type GunKillDropCtx } from './gunKillDrops';
import {
  BLOB_WEAPON_KEY, BLOB_MAX_ALIVE, BLOB_RADIUS_PX, BLOB_LIFE_MS, BLOB_FADE_MS, BLOB_TICK_DAMAGE, BLOB_MUZZLE_PX, createBlobShot, stepBlobShot, isBlobExpired,
  accumulateBlobNumber, pruneBlobNumberLedger, blobHitRadius, type BlobShot, type BlobNumberLedger,
} from './blobShot';
import {
  SATELLITE_WEAPON_KEY, SAT_CONTACT_DAMAGE, SAT_SHOT_DAMAGE, SAT_SHOT_DURATION_MS, SAT_SHOT_SPEED_PX_PER_SEC, SAT_SHOT_TURN_RADIUS_PX,
  SAT_SHOT_RANGE_PX, SAT_ORBIT_RADIUS_PX, emptySatelliteOrbit, stepSatelliteOrbit, satelliteBulletPoses, satelliteReleaseDir,
  satelliteTouchesRect, satelliteContactReady, assignSatelliteTargets, type SatelliteOrbit, type SatelliteBulletPose,
} from './satelliteOrbit';
import {
  SCAN_WEAPON_KEY, SCAN_SWEEP_MS, pickScanFanHits, scanBeatIndex, scanMarkUntilFrom,
  isScanMarked, scanMarkDamageMult, type ScanFan,
} from './scanSensor';

/** 描画が読む今の姿(読むだけ。書き換えない)。 */
export interface NewGunsView {
  blobs: readonly BlobShot[];
  /** 回っている衛星弾(持ち替えても回り続ける=社長決定2026-10-18。全部放つか、死亡・出撃の終わり・ランのリセットで消える)。 */
  orbit: SatelliteOrbit | null;
  /** 死亡・出撃の終わり・衛星弾を失った時に消えていく衛星弾(その瞬間の軌道の写し・消え始めの gameTime)。描画が減速しながら回して縮める。 */
  orbitFade: { orbit: SatelliteOrbit; at: number } | null;
  scanFan: ScanFan | null;
  /** 印を付けた瞬間(gameTime)。描画の輪の立ち上がりに使う(敵id→時刻)。 */
  scanMarkedAt: ReadonlyMap<string, number>;
  /** 直近の掃きで印が付いた(付け直した)敵と、その gameTime(白い点滅0.1秒)。 */
  scanSweptIds: ReadonlySet<string>;
  scanSweptAt: number;
  /** 出来事(描画の形を変えるための記録・上限つきの環)。判定には使わない。 */
  events: readonly NewGunsEvent[];
  /** 塊と触れている敵の接点(このフレーム・上限つき)。火の粉/湯気を出す場所。 */
  blobContacts: readonly { x: number; y: number }[];
  /** 塊に押された敵の足元と押された向き(このフレーム・上限つき)。引きずりの土埃。 */
  blobPushed: readonly { x: number; y: number; dx: number; dy: number }[];
}

/** 描画用の出来事。at=gameTime。dirs は衛星弾を放った時の各弾の位置と向き。 */
export interface NewGunsEvent {
  kind: 'blob-fire' | 'blob-stop' | 'sat-release';
  at: number;
  x: number; y: number;
  dirX: number; dirY: number;
  dirs?: { x: number; y: number; dx: number; dy: number }[];
}
const EVENT_MAX = 16;
const CONTACT_MAX = 12;

// ── モジュールの状態(ラン単位) ──
let lastGameTime = -1;
let blobs: BlobShot[] = [];
let blobSeq = 0;
const blobNumbers: BlobNumberLedger = new Map();
let orbit: SatelliteOrbit | null = null;
let orbitFade: { orbit: SatelliteOrbit; at: number } | null = null;
/** 持ち替えている間に立った旗。衛星弾を持って一度動くまで、止まっても放たない(「止まった瞬間」だけ放つ)。 */
let satNeedsMove = false;
const satContactAt = new Map<string, number>();
let satShotSeq = 0;
let scanLastBeat = -1;
let scanFan: ScanFan | null = null;
const scanMarkedAt = new Map<string, number>();
let scanSweptIds: Set<string> = new Set();
let scanSweptAt = -1e9;
let events: NewGunsEvent[] = [];
let blobContacts: { x: number; y: number }[] = [];
let blobPushed: { x: number; y: number; dx: number; dy: number }[] = [];

const view: NewGunsView = { blobs, orbit, orbitFade, scanFan, scanMarkedAt, scanSweptIds, scanSweptAt, events, blobContacts, blobPushed };
const refreshView = (): void => {
  view.blobs = blobs; view.orbit = orbit; view.orbitFade = orbitFade; view.scanFan = scanFan;
  view.scanSweptIds = scanSweptIds; view.scanSweptAt = scanSweptAt; view.events = events;
  view.blobContacts = blobContacts; view.blobPushed = blobPushed;
};
const pushEvent = (ev: NewGunsEvent): void => {
  events = events.length >= EVENT_MAX ? [...events.slice(1), ev] : [...events, ev];
};

/** 描画用の読み口。 */
export const getNewGunsView = (): NewGunsView => view;

/** ラン境界(テスト・新しいランの検出から呼ぶ)。 */
export const resetNewGunsTick = (): void => {
  lastGameTime = -1;
  blobs = []; blobSeq = 0; blobNumbers.clear();
  orbit = null; orbitFade = null; satNeedsMove = false; satContactAt.clear(); satShotSeq = 0;
  scanLastBeat = -1; scanFan = null; scanMarkedAt.clear();
  scanSweptIds = new Set(); scanSweptAt = -1e9; events = []; blobContacts = []; blobPushed = [];
  refreshView();
};

/** 銃を撃てない状態(火炎放射器の封印と同じ並び。弾倉・リロードは各銃で別に見る)。 */
const gunLocked = (p: Player, gameTime: number, gameWon: boolean): boolean =>
  p.health <= 0 || gameWon || isKatanaMode(p) || isAttackLocked()
  || (isSeekerActive(p, gameTime) && skillLevel(p, 'seeker') < 3)
  || isPvpIncapacitated(p.pvpPosture, gameTime)
  || isPlayerGrabbed(p, gameTime)
  || isHurtGunLocked(p, Date.now())
  || (SKATER_LOCK_ENABLED && p.skaterRiding);

/** 狙える敵(死神の徘徊体・死体を除く)。 */
const aimableEnemies = (enemies: readonly Enemy[]): Enemy[] =>
  enemies.filter(e => !(isReaperFamily(e.type) && !isTerminalReaper(e)) && !isCorpse(e));

/** 塊・回る弾が触れる敵(空中の跳び中は当たらない)。 */
const touchableEnemies = (enemies: readonly Enemy[]): Enemy[] =>
  aimableEnemies(enemies).filter(e => e.aiPhase !== 'jump');

/**
 * 銃の出す側の倍率(銃のスキル倍率=gunShotBaseDamage は撃つ時に掛け済み)。弾の当たり処理(useGameLoop)と同じ並び:
 * skillOutgoingDamageMult × 血の覚醒(銃) × sniperGunMult(相手ごと) × skillComboMasterMult(品質監査#11)。
 */
const outgoingGunMult = (p: Player, e: Enemy, gameTime: number): number => {
  const st = useGameStore.getState();
  return skillOutgoingDamageMult(p) * skillBloodAwakenDamageMult(p) * sniperGunMult(p, e)
    * skillComboMasterMult(p, gameTime, st.meleeFinishComboCount, st.meleeFinishComboUntil);
};

/** 弾で倒した時のドロップの設定(URL のツマミは useGameLoop のモジュール定数なので受け取る)。 */
export type NewGunsKillCtx = Pick<GunKillDropCtx, 'indoor' | 'ammoSmart' | 'ammoDirector' | 'noAmmoRun'>;
let killCtx: NewGunsKillCtx | null = null;

/**
 * 1回のダメージを当てる。倒したら、弾で倒した時と同じ撃破演出とドロップ(dropGunKillLoot=品質監査#4)。
 * killChainSlowOk=false で連続撃破10体スローを出さない(塊弾の一定間隔の当たり=品質監査#12)。戻り値=数字に出す量。
 */
const hitEnemy = (e: Enemy, dmg: number, killChainSlowOk: boolean | undefined, dirX?: number, dirY?: number): { killed: boolean; shown: number } => {
  const st = useGameStore.getState();
  const killed = st.damageEnemy(e.id, dmg, false, false, false, 'gun', 'player', null, 1, null, killChainSlowOk);
  // 数字に出す量=印の倍率の後(HPに掛かったのと同じ判定を純関数で引き直す)。
  const mult = scanMarkDamageMult({
    marked: isScanMarked(e, st.gameTime), amount: dmg, enemyHealth: e.health, postureImpact: null,
    rewardActive: false, handledByCaller: false,
  });
  if (killed) {
    playEnemyDeath();
    const k = killCtx ?? { indoor: st.indoorMode, ammoSmart: true, ammoDirector: true, noAmmoRun: false };
    dropGunKillLoot(e, { ...k, player: useGameStore.getState().player, gameTime: st.gameTime, dirX, dirY });
  }
  return { killed, shown: dmg * mult };
};

export interface NewGunsTickInput {
  gameTime: number;
  /** この step の秒(スローモーション込みのシム時間)。 */
  dtSec: number;
  /** 移動の入力がある(キーボード or スティック)。 */
  moveInput: boolean;
  /** 弾で倒した時のドロップの設定(省略時は既定=通常のラン)。 */
  killCtx?: NewGunsKillCtx;
}

export const tickNewGuns = (input: NewGunsTickInput): void => {
  const { gameTime, dtSec } = input;
  killCtx = input.killCtx ?? null;
  if (gameTime < lastGameTime) resetNewGunsTick(); // 新しいラン
  lastGameTime = gameTime;
  const st0 = useGameStore.getState();
  const p0 = st0.player;
  const active = getActiveGun(p0);
  // 何も持たず、場にも何も残っていない=何もしない(store へ1度も書かない)。
  const owns = p0.weapons.some(w => w.key === BLOB_WEAPON_KEY || w.key === SATELLITE_WEAPON_KEY || w.key === SCAN_WEAPON_KEY);
  if (!owns && blobs.length === 0 && orbit === null && orbitFade === null && scanFan === null) return;
  const locked = gunLocked(p0, gameTime, st0.gameWon);
  tickBlob(gameTime, dtSec, active?.key === BLOB_WEAPON_KEY && !locked);
  tickSatellite(gameTime, dtSec, active?.key === SATELLITE_WEAPON_KEY, locked, input.moveInput);
  tickScan(gameTime, active?.key === SCAN_WEAPON_KEY, locked);
  refreshView();
};

// ─────────────────────────────────────────────────────────────────────────
// 塊弾
const tickBlob = (gameTime: number, dtSec: number, canFire: boolean): void => {
  if (canFire) tryFireBlob(gameTime);
  if (blobs.length === 0) { blobContacts = []; blobPushed = []; return; }
  const st = useGameStore.getState();
  const touch = touchableEnemies(st.enemies);
  // 押しのけられる敵(区分のノックバック耐性に従う=ボス・強個体は押さない。固定の敵も押さない)。
  const pushableIds = new Set(touch.filter(en => !resistsChipKnockback(en.type) && !en.fixed).map(en => en.id));
  const isPushable = (e: { id: string }): boolean => pushableIds.has(e.id);
  const isBlocked = (r: { x: number; y: number; width: number; height: number }): boolean => {
    const res = resolveShieldWalls(r);
    return Math.abs(res.x - r.x) > 0.5 || Math.abs(res.y - r.y) > 0.5;
  };
  const next: BlobShot[] = [];
  const pushSum = new Map<string, { dx: number; dy: number }>();
  const hits: { blob: BlobShot; ids: string[] }[] = [];
  for (const b of blobs) {
    if (isBlobExpired(b, gameTime)) continue;
    const r = stepBlobShot(b, dtSec, gameTime, touch, isBlocked, isPushable);
    next.push(r.blob);
    for (const pu of r.pushes) {
      const cur = pushSum.get(pu.id);
      if (cur) { cur.dx += pu.dx; cur.dy += pu.dy; } else pushSum.set(pu.id, { dx: pu.dx, dy: pu.dy });
    }
    if (r.hitIds.length > 0) hits.push({ blob: r.blob, ids: r.hitIds });
    if (r.stoppedNow) {
      // 止まった形: 進む向きへの扇形の土埃+地面のひび(描画=pixi/newGunsFx.ts)。広がる円は出さない。
      pushEvent({ kind: 'blob-stop', at: gameTime, x: r.blob.x + r.blob.dirX * BLOB_RADIUS_PX, y: r.blob.y + r.blob.dirY * BLOB_RADIUS_PX, dirX: r.blob.dirX, dirY: r.blob.dirY });
      playSfx('heavy-impact', 0.35);
    }
  }
  blobs = next;
  // 描画用: 触れている敵との接点(火の粉/湯気)と、押された敵の足元(引きずりの土埃)。判定には使わない。
  const contacts: { x: number; y: number }[] = [];
  for (const b of blobs) {
    if (gameTime - b.bornAt >= BLOB_LIFE_MS - BLOB_FADE_MS) continue;
    for (const e of touch) {
      if (contacts.length >= CONTACT_MAX) break;
      const qx = Math.max(e.x, Math.min(b.x, e.x + e.width)), qy = Math.max(e.y, Math.min(b.y, e.y + e.height));
      if ((qx - b.x) ** 2 + (qy - b.y) ** 2 <= (blobHitRadius(b, gameTime) + 3) ** 2) contacts.push({ x: qx, y: qy });
    }
  }
  blobContacts = contacts;
  const pushedFx: { x: number; y: number; dx: number; dy: number }[] = [];
  for (const [id, pu] of pushSum) {
    if (pushedFx.length >= CONTACT_MAX) break;
    const e = touch.find(x => x.id === id);
    if (e) pushedFx.push({ x: e.x + e.width / 2, y: e.y + e.height, dx: pu.dx, dy: pu.dy });
  }
  blobPushed = pushedFx;
  // 押しのけ: 行ける帯(clampRectToPlayableArea)と壁(resolveShieldWalls)の内側へ収める。
  if (pushSum.size > 0) {
    const ctx = shieldPlayableCtx();
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => {
        const pu = pushSum.get(e.id);
        if (!pu) return e;
        const walled = resolveShieldWalls({ x: e.x + pu.dx, y: e.y + pu.dy, width: e.width, height: e.height });
        const c = clampRectToPlayableArea(walled.x, walled.y, e.width, e.height, ctx, e.x);
        return { ...e, x: c.x, y: c.y };
      }),
    }));
  }
  if (hits.length > 0) {
    const p = useGameStore.getState().player;
    for (const h of hits) {
      for (const id of h.ids) {
        const e = useGameStore.getState().enemies.find(x => x.id === id);
        if (!e || isCorpse(e)) continue;
        const dmg = Math.max(1, h.blob.tickDamage * outgoingGunMult(p, e, gameTime)); // 小数のまま(9.5)。数字はまとめで丸める
        const { shown } = hitEnemy(e, dmg, false, h.blob.dirX, h.blob.dirY);
        const v = accumulateBlobNumber(blobNumbers, id, shown, gameTime);
        if (v !== null) {
          const marked = isScanMarked(e, gameTime);
          useGameStore.getState().spawnDamageNumber(e.x + e.width / 2, e.y, v, false, { scanMarked: marked });
        }
      }
    }
  }
  const alive = new Set(useGameStore.getState().enemies.map(e => e.id));
  pruneBlobNumberLedger(blobNumbers, alive, gameTime);
};

const tryFireBlob = (gameTime: number): void => {
  const st = useGameStore.getState();
  const p = st.player;
  const gun = p.weapons.find(w => w.key === BLOB_WEAPON_KEY);
  if (!gun || p.activeWeaponId !== gun.id) return;
  if (isReloading(p, gun.id) || (gun.magazine ?? 0) <= 0) return;
  const now = Date.now();
  if (now - gun.lastFired < effectiveFireCooldown(gun, p)) return;
  const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
  const range = gunEffectiveRangePx(gun);
  const target = pickNearestTarget(pcx, pcy, aimableEnemies(st.enemies), gameTime, range * range);
  if (!target) return;
  const dx = target.x + target.width / 2 - pcx, dy = target.y + target.height / 2 - pcy;
  const dl = Math.max(0.001, Math.hypot(dx, dy));
  const dirX = dx / dl, dirY = dy / dl;
  // 銃のスキル倍率(撃った時点の弾倉で)。CATALOG の damage はカウンターの元値なので、塊の1回の値は定数から(品質監査#13)。
  const tickDamage = gunShotBaseDamage({ damage: BLOB_TICK_DAMAGE, magazine: gun.magazine }, p, gameTime);
  if (blobs.length >= BLOB_MAX_ALIVE) blobs = blobs.slice(1); // プールの上限(古い順)
  const sx = pcx + dirX * BLOB_MUZZLE_PX, sy = pcy + dirY * BLOB_MUZZLE_PX;
  blobs = [...blobs, createBlobShot(`blob-${gameTime}-${blobSeq++}`, sx, sy, dirX, dirY, gameTime, tickDamage)];
  useGameStore.setState(s => ({
    player: { ...s.player, weapons: s.player.weapons.map(w => (w.id === gun.id ? weaponAfterGunShot(w, s.player, now) : w)) },
  }));
  playSfx(gunFireSfxKey(gun.category, gun.key));
  const rs = recoilSpecForWeapon(gun);
  st.triggerKick(rs.kickPx, rs.kickMs, -dirX, -dirY, rs.overshoot);
  pushEvent({ kind: 'blob-fire', at: gameTime, x: sx, y: sy, dirX, dirY }); // 銃口から前へ吹く煙1本(描画)
};

// ─────────────────────────────────────────────────────────────────────────
// 衛星弾
const tickSatellite = (gameTime: number, dtSec: number, holding: boolean, locked: boolean, moveInput: boolean): void => {
  const st = useGameStore.getState();
  const p = st.player;
  // 軌道の根元=足元(扇と同じ)。楕円の位置は satelliteOrbitPoint(絵と同じ関数)。
  const pcx = p.x + p.width / 2, pcy = p.y + p.height;
  if (orbitFade && gameTime - orbitFade.at > 400) orbitFade = null;
  // 消えるのは死亡・出撃の終わり・衛星弾を手放した時だけ(持ち替えでは消えない=社長決定2026-10-18)。寿命は無い。
  const ownsSat = p.weapons.some(w => w.key === SATELLITE_WEAPON_KEY);
  if (p.health <= 0 || st.gameWon || !ownsSat) {
    if (orbit && orbit.slots.length > 0) orbitFade = { orbit, at: gameTime };
    orbit = null; satNeedsMove = false;
    return;
  }
  if (!holding && !orbit) return;
  if (!orbit) orbit = emptySatelliteOrbit();
  // 持ち替えている間は増えない・放たない(止まっても放たない)。持ち直してから一度動き、止まった瞬間に放つ。
  if (!holding) satNeedsMove = true;
  else if (moveInput) satNeedsMove = false;
  // 放つまでの時計(と描画の「溜め」)は持ち替えている間・持ち直して動く前は数えない。
  if ((!holding || satNeedsMove) && orbit.idleMs !== 0) orbit = { ...orbit, idleMs: 0 };
  const nowMs = Date.now();
  // 押されて動いている間・近接を振っている間は「動いている」と数えない(放出の時計も進めない=保留)。
  const forced = (p.knockbackUntil !== undefined && nowMs < p.knockbackUntil)
    || dashModeAt(p, nowMs) !== null
    || nowMs < (p.lungeUntil ?? 0) || nowMs < p.shijinSlideUntil;
  const swinging = (p.meleeSwingAt || 0) > 0 && nowMs - p.meleeSwingAt >= 0 && nowMs - p.meleeSwingAt < PLAYER_MELEE_SWING_MS;
  const held = (moveInput && (forced || swinging)) || !holding || satNeedsMove;
  const step = stepSatelliteOrbit(orbit, dtSec * 1000, { moving: holding && moveInput && !held, held, locked: holding && locked }, gameTime, pcx, pcy);
  const prevAngVel = orbit.angVel;
  orbit = step.orbit;
  if (step.release) releaseSatellites(step.release, prevAngVel, gameTime);
  // 回っている弾も当たる(敵ごとに400msに1回・弾は消えない)。持ち替えていても当たる。
  // 銃を撃てない間(gunLocked=シーカー・掴まれ・紫/daze・被弾の復帰・刀モード・スケボー等)は、構えているかに
  // 関係なく当たりを止める(回り続けるのは構わない=品質監査2巡目#1)。
  if (locked || orbit.slots.length === 0) return;
  const poses = satelliteBulletPoses(orbit, pcx, pcy, gameTime);
  const touch = touchableEnemies(st.enemies);
  const contactBase = gunShotBaseDamage({ damage: SAT_CONTACT_DAMAGE, magazine: undefined }, p, gameTime);
  for (const e of touch) {
    if (!satelliteContactReady(satContactAt.get(e.id), gameTime)) continue;
    // 軌道の外側の敵は早めに捨てる(半径+敵の大きさより遠い)。
    const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
    if (Math.hypot(ecx - pcx, ecy - pcy) > SAT_ORBIT_RADIUS_PX + Math.max(e.width, e.height) + 12) continue; // 足元からの粗い足切り(余裕あり)
    const touching = poses.find(ps => satelliteTouchesRect(ps.x, ps.y, e));
    if (!touching) continue;
    satContactAt.set(e.id, gameTime);
    const live = useGameStore.getState().enemies.find(x => x.id === e.id);
    if (!live || isCorpse(live)) continue;
    const dmg = Math.max(1, Math.round(contactBase * outgoingGunMult(p, live, gameTime)));
    hitEnemy(live, dmg, undefined, touching.tx, touching.ty);
    useGameStore.getState().spawnDamageNumber(ecx, live.y, dmg, false, { enemyId: live.id });
    useGameStore.getState().spawnBurst(touching.x, touching.y, '#e8b25a', 4, touching.tx, touching.ty);
  }
  if (satContactAt.size > 64) {
    for (const [id, at] of satContactAt) if (gameTime - at > 2000) satContactAt.delete(id);
  }
};

const releaseSatellites = (poses: SatelliteBulletPose[], angVel: number, gameTime: number): void => {
  const st = useGameStore.getState();
  const p = st.player;
  const gun = p.weapons.find(w => w.key === SATELLITE_WEAPON_KEY);
  if (!gun) return;
  const pcx = p.x + p.width / 2, pcy = p.y + p.height; // 軌道の根元(足元)。散る先の方位もここから測る
  const reach = SAT_SHOT_RANGE_PX + SAT_ORBIT_RADIUS_PX;
  const near = aimableEnemies(st.enemies)
    .map(e => ({ e, d: Math.hypot(e.x + e.width / 2 - pcx, e.y + e.height - pcy) })) // 足元どうし
    .filter(x => x.d <= reach)
    .sort((a, b) => a.d - b.d)
    .slice(0, poses.length)
    .map(x => ({ id: x.e.id, azimuthRad: Math.atan2(x.e.y + x.e.height - pcy, x.e.x + x.e.width / 2 - pcx) }));
  const targets = assignSatelliteTargets(poses.map(ps => Math.atan2(ps.ry, ps.rx)), near);
  const damage = gunShotBaseDamage({ damage: SAT_SHOT_DAMAGE, magazine: undefined }, p, gameTime); // CATALOG の damage はカウンターの元値(品質監査#13)
  const critChance = gunShotCritChance(gun, p, gameTime);
  const now = Date.now();
  const size = 8;
  poses.forEach((ps, i) => {
    const dir = satelliteReleaseDir(ps, angVel);
    const proj: Projectile = {
      id: `sat-${now}-${satShotSeq++}`,
      x: ps.x - size / 2, y: ps.y - size / 2, width: size, height: size,
      speed: SAT_SHOT_SPEED_PX_PER_SEC, damage, direction: dir,
      weaponType: 'shotgun', weaponKey: SATELLITE_WEAPON_KEY,
      duration: SAT_SHOT_DURATION_MS, createdAt: now,
      passthrough: false, hitEnemies: [], hostile: false, reflected: false,
      critChance,
      ...(targets[i] !== undefined ? { targetEnemyId: targets[i], homingPellet: true as const, homingTurnRadiusPx: SAT_SHOT_TURN_RADIUS_PX } : {}),
    };
    st.addProjectile(proj);
  });
  useGameStore.setState(s => ({
    player: { ...s.player, weapons: s.player.weapons.map(w => (w.id === gun.id ? { ...w, lastFired: now } : w)) },
  }));
  playSfx('satellite-release'); // 放つ瞬間の専用の音(金属の澄んだ鳴り)
  // 放った形: 各弾の進む向きへ伸びる線(描画)。広がる円は出さない。
  pushEvent({
    kind: 'sat-release', at: gameTime, x: pcx, y: pcy, dirX: 0, dirY: 0,
    dirs: poses.map(ps => { const d = satelliteReleaseDir(ps, angVel); return { x: ps.x, y: ps.y, dx: d.x, dy: d.y }; }),
  });
};

// ─────────────────────────────────────────────────────────────────────────
// スキャンセンサー
const SCAN_FAN_FADE_MS = 260;

const tickScan = (gameTime: number, holding: boolean, locked: boolean): void => {
  const beat = scanBeatIndex(gameTime);
  if (scanLastBeat < 0) scanLastBeat = beat; // ランの頭(または初めて見た拍)は拍としない
  const st = useGameStore.getState();
  const p = st.player;
  if (beat !== scanLastBeat) {
    scanLastBeat = beat;
    if (holding && !locked) {
      // 向いている方(照準の慣性ベクトル→無ければ最後の向き)。
      let dx = p.aimX, dy = p.aimY;
      if (Math.hypot(dx, dy) < 0.001) { dx = p.lastDirection?.x ?? 1; dy = p.lastDirection?.y ?? 0; }
      const dl = Math.hypot(dx, dy) || 1;
      scanFan = { beat, startAt: gameTime, dirX: dx / dl, dirY: dy / dl, resolved: false, marked: false };
    }
  }
  if (!scanFan) return;
  if (!scanFan.resolved) {
    if (!holding || locked) {
      // 掃き終わる前に持ち替えた=印は付かない(扇は途中から消える)。
      scanFan = { ...scanFan, resolved: true, marked: false, abortedAt: gameTime };
    } else if (gameTime - scanFan.startAt >= SCAN_SWEEP_MS) {
      // 地面に倒した扇(根元=プレイヤーの足元・敵は足元で見る)。描画と同じ関数で形を作る(scanSensor.ts)。
      const hits = pickScanFanHits(p.x + p.width / 2, p.y + p.height, scanFan.dirX, scanFan.dirY, aimableEnemies(st.enemies));
      if (hits.length > 0) {
        const ids = new Set(hits.map(e => e.id));
        const until = scanMarkUntilFrom(gameTime);
        for (const e of hits) {
          // 新しく付いた(切れていた)敵だけ「付いた瞬間」を打ち直す=輪の立ち上がり。延長は輪が満ちに戻るだけ。
          if (!isScanMarked(e, gameTime)) scanMarkedAt.set(e.id, gameTime);
        }
        scanSweptIds = ids; scanSweptAt = gameTime; // 掃いて印が付いた敵の白い点滅(描画)
        useGameStore.setState(s => ({ enemies: s.enemies.map(e => (ids.has(e.id) ? { ...e, scanMarkUntil: until } : e)) }));
        playSfx('homing-lock', 0.3);
      }
      scanFan = { ...scanFan, resolved: true, marked: true };
    }
  }
  const endAt = scanFan.abortedAt ?? (scanFan.startAt + SCAN_SWEEP_MS);
  if (scanFan.resolved && gameTime - endAt > SCAN_FAN_FADE_MS) scanFan = null;
  if (scanMarkedAt.size > 64) {
    for (const [id, at] of scanMarkedAt) if (gameTime - at > 4000) scanMarkedAt.delete(id);
  }
};
