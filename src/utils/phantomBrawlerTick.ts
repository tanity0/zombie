// research/BRAWLER_PHANTOM.md §4・§9-1: 格闘の幻影(拳鬼)の格闘を1tick進める(幻影専用に書く部分)。
//
// 状態機械はプレイヤーと同じ純関数(utils/brawler.ts)。当たりの相手はプレイヤー(と形に入った守護霊・英雄)で、
// 当たった後の解決(盾・カウンター・会心・致命・damagePlayer・体勢)は汎用の幻影の近接と同じ1本
// (phantomTick.landPhantomMeleeOnPlayer)を呼び手から受け取る(循環 import を作らない)。
//
// 対人の規則は今の幻影のまま(社長指示2026-11-10「他の幻影と同じ仕様」): 被弾無敵=近接は互いに無視・遠隔は守る /
// 対人ダメージ ×0.2 / パリィ=窓モデル(格闘の幻影の窓は構えの間だけ開く) / 体勢=対人体勢。
// ★赤い予告は付けない(社長裁定2026-11-10「幻影と同じ配線なので、赤い予告がないならないで、そのままでいい。」)。
import type { Enemy, Player, Projectile } from '../types/game';
import type { BrawlerState, BrawlerTechKind } from './brawlerTypes';
import * as BR from './brawler';
import { brawlerProration } from './brawlerCombo';
import { brawlerSpeedDamageMult, brawlerTimeKeeperDiscount, brawlerOverclockRefunds } from './brawlerSkills';
import {
  createPhantomBrawlerMind, decidePhantomBrawler, notePlayerStrike, phantomBrawlerBreath, pbInterruptScript, pbSecretAfterLeap,
  pbScriptFinisherKiko, type PhantomBrawlerMind,
} from './phantomBrawlerAi';
import { kenkiPrepDue, kenkiPrepStart, type KenkiPrep } from './kenkiPrep';
import { kenkiAccDecAlong, kenkiGuardKbVector, kenkiNewGuardReceive, KENKI_GUARD_KB_MS } from './kenkiGuardKb';
import { bulletEtaMs, bulletPlanRates, phantomBulletLungeDir, pickBulletPlan, type BulletPlan } from './phantomLunge';
import { BULLET_MOVE_KEYS } from './moveReaction';
import { isPhantomTargetBullet } from './weaponUtils';
import { distToBandRect } from './geometry';
import { hitThirdParties } from './heroBlast';
import { HUMAN_REACTION_MS } from './bossSkeleton';
import { PVP_DAMAGE_SCALE } from './phantomScript';
import {
  useGameStore, huntingMeleeRadius, playerMoveStatMult, skillLevel, PLAYER_KNOCKBACK_SPEED, isCounterActive, enqueueBrawlerSfx,
  ENEMY_ATTACK_SPEED_MULT, PUMPKIN_CROUCH_MS, PUMPKIN_EXPLOSION_RADIUS, pumpkinRecoverMs, groundJumpAirMsRaw,
} from '../store/gameStore';
import { groundJumpStep, groundJumpStartCrouch, groundBlastCircleHits } from './groundJump';
import { kenkiLeapEligible, kenkiLeapReadyAt, kenkiNoteHit, kenkiUnderFire } from './kenkiLeap';
import type { PlayerProfile } from './playerTraits';
import { notePlayerLaunched } from './playerAirFollow';
import {
  kenkiNewCounter, kenkiShukuchiShouldFire, kenkiShukuchiReadyAt, kenkiShukuchiCandidates, kenkiShukuchiPick,
} from './kenkiShukuchi';
import { GLOW_R_M, GLOW_R_S } from './glowTiers';

/** 格闘のレベル(技ポイントの上限の段)。記録のサブのレベル(無ければ1)。 */
const brawlerLevelOf = (e: Enemy): number => Math.max(1, Math.min(3, e.phantomBuild?.subWeaponLevels?.brawler ?? 1));
/**
 * ストライカーの素手 ×1.5(gameStore.strikerMeleeMult の格闘の枝と同じ決まり=ストライカー職で格闘中)。
 * 疑似プレイヤーは格闘を外して作るので strikerMeleeMult は弾切れの判定へ落ちる=ここで同じ決まりを当てる
 * (research/BRAWLER_PHANTOM.md §5-3 の案1)。
 */
export const phantomBrawlerStrikerMult = (cls: string | undefined): number => (cls === 'rogue' ? 1.5 : 1);

/** 格闘の幻影の実行時の持ち越し(PhantomTickState.brawler)。 */
export interface PhantomBrawlerRuntime {
  mind: PhantomBrawlerMind;
  /** 踏み込みの器(詰め・跳び・蹴り・掌底・ステップ)。gameTime 基準。 */
  move: { dx: number; dy: number; dist: number; startAt: number; ms: number; holdUntil: number; shape: 'accel' | 'decel' | 'accdec' } | null;
  /** 弾ごとに1回決めた対処。 */
  bulletPlans: Map<string, BulletPlan | 'done'>;
  /** 間合いに入った時刻(gameTime・外なら null)。 */
  reachSince: number | null;
  /** 最後に見た幻影の被弾(Enemy.lastHit)。 */
  lastHitSeen: number;
  /** 縮地(§14): 前に見たカウンターの時刻(1回のカウンターで1回まで)と、次に縮地してよい時刻(gameTime)。 */
  lastCounterSeen: number;
  shukuchiReadyAt: number;
  /** 跳びかかり(§15): 次に使えるまで(gameTime)と、最近の被弾の時刻(撃たれ続けているか)。 */
  leapReadyAt: number;
  hitTimes: number[];
  /** 技の予備動作(§16-5・拳鬼だけ)。null=していない。描画には Enemy.gpBrawlerPrep で見せる。 */
  prep: KenkiPrep | null;
  /** 最後に見た「近接で食らった」打刻(Enemy.gpMeleeHurtAt・食らっても技ポイントが貯まる=§16-8)。 */
  lastMeleeHurtSeen: number;
  /** 最後に見た「構えで近接を受けた」時刻(拳鬼が大きく下がる=§16-9。1回の受けで1回まで)。 */
  lastGuardKbSeen: number;
}
export const createPhantomBrawlerRuntime = (): PhantomBrawlerRuntime => ({
  mind: createPhantomBrawlerMind(), move: null, bulletPlans: new Map(), reachSince: null, lastHitSeen: 0,
  lastCounterSeen: 0, shukuchiReadyAt: 0, leapReadyAt: 0, hitTimes: [], prep: null, lastMeleeHurtSeen: 0, lastGuardKbSeen: 0,
});

/** 予備動作を取り消す(技は出ない・ポイントは払わない)。気絶・拘束・浮き・紫・殴られた・縮地(§16-5・§16-7)。 */
export const phantomBrawlerCancelPrep = (rt: PhantomBrawlerRuntime | undefined, patch: Partial<Enemy>): boolean => {
  if (!rt?.prep) return false;
  rt.prep = null;
  patch.gpBrawlerPrep = undefined;
  return true;
};

export interface PhantomBrawlerCtx {
  phantom: Enemy;
  rt: PhantomBrawlerRuntime;
  player: Player;
  projectiles: readonly Projectile[];
  /** 疑似プレイヤー(記録のビルド)。無ければプレイヤー本人を土台にする。 */
  actor: Player;
  profile: PlayerProfile;
  t: number;
  nowMs: number;
  deltaTime: number;
  rand: () => number;
  patch: Partial<Enemy>;
  /** 素ダメージ(phantomMeleeDamage=記録の近接×装備・スキル×育成)。 */
  baseDamage: number;
  /** 当たった後の解決(phantomTick.landPhantomMeleeOnPlayer を束ねた物)。 */
  land: (bcx: number, bcy: number, mult: number, o: {
    moveKey: string; sourceLabel: string; knockback?: 'none' | { speed: number; dirX: number; dirY: number }; onCountered: () => void;
    /** 範囲技(予告ありの着地の爆風)=プレイヤーの被弾無敵を守る。 */
    area?: boolean;
  }) => 'shield' | 'countered' | 'hit' | 'nodamage';
  /** 行き先を「立てる所」へ(障害物→行ける帯)。 */
  resolveMove: (nx: number, ny: number) => { x: number; y: number };
  /** 一番新しいカウンター成立の時刻(gameTime・近接の窓/構えの受け=gpParriedAt・弾の打ち返し=gpBulletParriedAt の新しい方)。縮地のきっかけ(§14)。 */
  counterAt?: number;
  /** 構えでプレイヤーの近接を受けた時刻(gameTime・gpParriedAt・弾の打ち返しは含めない)。拳鬼が大きく下がる(§16-9)。 */
  meleeCounterAt?: number;
  /** 縮地の音(呼び手が格闘の音の列へ積む)。 */
  shukuchiSfx?: () => void;
  label: string;
}

const edgeDist = (cx: number, cy: number, r: { x: number; y: number; width: number; height: number }): number => {
  const nx = Math.max(r.x, Math.min(cx, r.x + r.width));
  const ny = Math.max(r.y, Math.min(cy, r.y + r.height));
  return Math.hypot(cx - nx, cy - ny);
};
const unit = (x: number, y: number): { x: number; y: number } => {
  const l = Math.hypot(x, y);
  return l > 1e-6 ? { x: x / l, y: y / l } : { x: 1, y: 0 };
};

/** 相の登録(research/BRAWLER_PHANTOM.md §4-1): 行動中=技の最中 / 戻り=硬直 / 待機=追いかけ。 */
export const phantomBrawlerBossState = (s: BrawlerState | undefined, t: number): 'chase' | 'gp-brawler' | 'gp-brawler-recover' => {
  if (!s) return 'chase';
  if (s.secret) return 'gp-brawler';
  if (s.phase === 'idle') return 'chase';
  if (s.phase === 'tech' && s.tech === 'guard') return 'gp-brawler';
  const el = BR.brawlerElapsed(s, t);
  return s.resolved && el >= s.windupMs && !BR.brawlerInHitstop(s, t) ? 'gp-brawler-recover' : 'gp-brawler';
};

/** 戻りで固められている間、格闘の時計を止める(固まりの残りぶん止めを伸ばす=明けたら戻りの続きから)。 */
export const phantomBrawlerHoldClock = (s: BrawlerState, t: number, remainMs: number): BrawlerState => {
  if (remainMs <= 0 || s.phase === 'idle') return s;
  return BR.brawlerApplyHitstop(s, t, remainMs);
};

/** 出かかった行動を取り消す(紫・気絶・拘束・カウンター)。秘奥義なら秘奥義ごと(技ポイント0)。 */
export const phantomBrawlerCancelled = (s: BrawlerState): BrawlerState =>
  (s.secret ? BR.brawlerSecretEnd(s) : BR.brawlerCancel(s));

const setMove = (rt: PhantomBrawlerRuntime, dx: number, dy: number, ms: number, t: number, shape: 'accel' | 'decel' | 'accdec', holdMs = 0): void => {
  const dist = Math.hypot(dx, dy);
  rt.move = dist > 0.5 && ms > 0 ? { dx, dy, dist, startAt: t + holdMs, ms, holdUntil: t + holdMs, shape } : null;
};

/** 踏み込みの器を1tick進める(加速して最大速度のまま/初速最大→0)。障害物と行ける帯で止まる。 */
const stepMove = (c: PhantomBrawlerCtx): void => {
  const m = c.rt.move;
  if (!m) return;
  const { t } = c;
  if (t < m.holdUntil) return;
  const p0 = Math.max(0, Math.min(1, (t - c.deltaTime * 1000 - m.startAt) / m.ms));
  const p1 = Math.max(0, Math.min(1, (t - m.startAt) / m.ms));
  const along = (p: number): number => (m.shape === 'accdec' ? kenkiAccDecAlong(p) : m.shape === 'decel' ? 1 - (1 - p) * (1 - p) : p <= BR.BRAWLER_ACCEL_FRAC
    ? (p * p) / (2 * BR.BRAWLER_ACCEL_FRAC) / (1 - BR.BRAWLER_ACCEL_FRAC / 2)
    : (p - BR.BRAWLER_ACCEL_FRAC / 2) / (1 - BR.BRAWLER_ACCEL_FRAC / 2));
  const k = along(p1) - along(p0);
  if (k > 0) {
    const e = c.phantom;
    const x0 = c.patch.x ?? e.x, y0 = c.patch.y ?? e.y;
    const r = BR.sweepResolve(x0, y0, (m.dx / m.dist) * m.dist * k, (m.dy / m.dist) * m.dist * k, e.width, e.height, BR.BRAWLER_SWEEP_STEP_PX,
      rect => c.resolveMove(rect.x, rect.y));
    c.patch.x = r.x; c.patch.y = r.y;
    if (r.stopped) c.rt.move = null;
  }
  if (p1 >= 1) c.rt.move = null;
};

const pointCapOf = (e: Enemy): number => BR.brawlerPointCap(brawlerLevelOf(e));
const discountOf = (actor: Player) => (kind: BrawlerTechKind): number => brawlerTimeKeeperDiscount(kind, skillLevel(actor, 'time-keeper'));

/** 段・技の当たりの量(素ダメージ×ストライカー×足の速さ×補正)。会心と対人の×0.2は land の側。 */
const strikeMultOf = (c: PhantomBrawlerCtx, s: BrawlerState, moveMult: number, secret = false): number =>
  moveMult * phantomBrawlerStrikerMult(c.actor.characterClass)
  * brawlerSpeedDamageMult(playerMoveStatMult(c.actor, c.t))
  * (secret ? 1 : brawlerProration((s.flowHits ?? 0) + 1));

/**
 * 押しの差し替え(research/BRAWLER_PHANTOM.md §4-8 の表)。small=押さなかった段(1・2・4段目)の小さな押し
 * (社長指示2026-11-10「どの攻撃も押さない攻撃でも多少押そう。少しずつズレた方が楽しい」→「ボスも拳鬼も」・§16-8)。
 * 速さ=プレイヤーの普通の押し×BRAWLER_SMALL_KB_MULT・向き=当てた向き。押しの長さは被弾の段の値のまま(damagePlayer)=
 * 被弾の「動けない」窓(moveLockMs)の内に収まる=動けない時間は増えない。
 */
const kbOf = (kind: 'none' | 'small' | 'builtin' | 'big', mult: number, dir: { x: number; y: number }): 'none' | { speed: number; dirX: number; dirY: number } | undefined =>
  kind === 'none' ? 'none' : kind === 'builtin' ? undefined
    : { speed: PLAYER_KNOCKBACK_SPEED * (kind === 'small' ? BR.BRAWLER_SMALL_KB_MULT : mult), dirX: dir.x, dirY: dir.y };
// ---- 音(社長指摘2026-11-10「音の問題なのかな?拳鬼の攻撃間隔がやたら速い気がする」の是正) ----
// 旧: 振りが刃物の音('melee'=slash.mp3)で、被弾の音('player-damage')と中身が同じファイル=1発ごとに斬撃音が2回鳴っていた。
// 拳鬼の振り・当たりはプレイヤーの格闘と同じ音・同じ音量の考え方(gameStore の格闘の brawlerSfx の呼び方を写す)。プレイヤーの被弾音は変えない。
const brJit = (): number => 0.94 + Math.random() * 0.12; // 音程の揺らぎ(gameStore.brJitter と同じ幅・頭脳の乱数は使わない)
/** 振りの音。段=段ごとの音程 / 飛び蹴り / その他の技 / 秘奥義の1発。 */
const kenkiSwingSfx = (k: { stage: number } | { kick: number } | 'tech' | 'secret'): void => {
  if (k === 'tech') { enqueueBrawlerSfx('whip-swing', 0.5, 1.25 * brJit(), 140); return; }
  if (k === 'secret') { enqueueBrawlerSfx('whip-swing', 0.45, 1.5 * brJit(), 90); return; }
  if ('kick' in k) { enqueueBrawlerSfx('whip-swing', 0.55, (k.kick >= 3 ? 0.78 : 0.92) * brJit(), 160); return; }
  const st = Math.max(1, Math.min(5, k.stage));
  enqueueBrawlerSfx('whip-swing', st >= 4 ? 0.55 : 0.4, BR.BRAWLER_SWING_PITCH[st] * brJit(), 140);
};
/** 当たりの音(当たった時だけ)。段の音・蹴り(3発目は重い)・大叩き潰し。 */
const kenkiHitSfx = (k: { stage: number } | { kick: number } | 'stomp'): void => {
  if (k === 'stomp') { enqueueBrawlerSfx('brawler-hit', 1.0, 0.62 * brJit(), 260); return; }
  if ('kick' in k) {
    const big = k.kick >= BR.BRAWLER_KICK_MAX;
    enqueueBrawlerSfx('brawler-hit', big ? 1.1 : 0.8, (big ? 0.66 : 1.0) * brJit(), big ? 300 : 200);
    enqueueBrawlerSfx('whip-hit', 0.55, (big ? 0.7 : 0.85) * brJit(), 160, 10);
    return;
  }
  const st = Math.max(1, Math.min(5, k.stage));
  enqueueBrawlerSfx('brawler-hit', BR.BRAWLER_HIT_GAIN[st], BR.BRAWLER_HIT_PITCH[st] * brJit(), st <= 2 ? 180 : 280);
  enqueueBrawlerSfx('whip-hit', 0.4, BR.BRAWLER_HIT_PITCH[st] * 1.1 * brJit(), 110, 8);
};

/** 段の押し: 普通の押しの段(3段目)=組み込み/それ以外(1・2・4段目=押さなかった段・'small')=小さな押し。 */
const stageKb = (kb: BR.BrawlerKb): 'small' | 'builtin' => (kb === 'normal' ? 'builtin' : 'small');

/**
 * 1発を当てる(形に掛かっていれば)。第三者(守護霊・英雄)にも同じ形で当てる。
 * 戻り: 体に触れたか(段のつながり・技ポイント)/カウンターされたか。
 */
const strikePlayer = (
  c: PhantomBrawlerCtx, s: BrawlerState, hit: boolean, shapeForThird: Parameters<typeof hitThirdParties>[0],
  moveMult: number, moveKey: string, kb: 'none' | { speed: number; dirX: number; dirY: number } | undefined,
  originX: number, originY: number, secret = false, area = false,
): { touched: boolean; countered: boolean; landed?: boolean } => {
  const mult = strikeMultOf(c, s, moveMult, secret);
  hitThirdParties(shapeForThird, c.baseDamage * mult * PVP_DAMAGE_SCALE, c.phantom.id, 'guardian-phantom');
  if (!hit) return { touched: false, countered: false };
  let countered = false;
  const r = c.land(originX, originY, mult, { moveKey, sourceLabel: `${c.label}の格闘`, knockback: kb, onCountered: () => { countered = true; }, area });
  // landed=本当に体力を削った(構え・無敵・神モードで0ダメージだった時は false)。秘奥義の1手目はこれで数える。
  return { touched: r === 'hit' || r === 'nodamage', countered: countered || r === 'countered', landed: r === 'hit' };
};

/** 弾への対処(弾ごとに1回だけ決める・人格の割合)。この tick で実行するもの。 */
const bulletAction = (c: PhantomBrawlerCtx, cx: number, cy: number): { kind: 'counter' } | { kind: 'dodge'; dirX: number; dirY: number } | null => {
  const radius = Math.max(c.phantom.width, c.phantom.height) / 2;
  const alive = new Set<string>();
  let act: { kind: 'counter' } | { kind: 'dodge'; dirX: number; dirY: number } | null = null;
  const rates = bulletPlanRates(c.profile.moveReactions, BULLET_MOVE_KEYS);
  for (const p of c.projectiles) {
    if (!isPhantomTargetBullet(p)) continue;
    alive.add(p.id);
    if (c.nowMs - p.createdAt < HUMAN_REACTION_MS) continue;
    let plan = c.rt.bulletPlans.get(p.id);
    if (plan === undefined) {
      if (bulletEtaMs(cx, cy, radius, p) === null) continue;
      plan = pickBulletPlan(rates, c.rand());
      c.rt.bulletPlans.set(p.id, plan);
    }
    if (act || plan === 'done' || plan === 'take') continue;
    if (plan === 'counter') {
      const eta = bulletEtaMs(cx, cy, radius, p);
      if (eta !== null && eta <= BR.BRAWLER_GUARD_MS) { act = { kind: 'counter' }; c.rt.bulletPlans.set(p.id, 'done'); }
    } else {
      const dir = phantomBulletLungeDir(cx, cy, radius, c.phantom.speed, BR.BRAWLER_STEP_PX, BR.BRAWLER_STEP_MS, p);
      if (dir) { act = { kind: 'dodge', dirX: dir.x, dirY: dir.y }; c.rt.bulletPlans.set(p.id, 'done'); }
    }
  }
  for (const id of [...c.rt.bulletPlans.keys()]) if (!alive.has(id)) c.rt.bulletPlans.delete(id);
  return act;
};

/** 通常の段を始める(詰め=相手の縁の手前へ・向き=相手へ)。 */
const startAttack = (c: PhantomBrawlerCtx, s0: BrawlerState): BrawlerState => {
  const { t, phantom, player } = c;
  const stage = BR.brawlerStageForPress(s0, t);
  const spec = BR.brawlerStageSpec(stage);
  const cx = phantom.x + phantom.width / 2, cy = phantom.y + phantom.height / 2;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const dir = unit(pcx - cx, pcy - cy);
  const s = { ...BR.brawlerStartAttack(s0, stage, t, s0.quickUntil > t), targetId: 'player', dirX: dir.x, dirY: dir.y, pressAt: c.nowMs };
  // 詰め: 相手の縁から BRAWLER_STANDOFF_PX 手前まで(最大 spec.dashPx)。
  const gap = edgeDist(cx, cy, player) - BR.BRAWLER_STANDOFF_PX;
  const go = Math.max(0, Math.min(spec.dashPx, gap));
  if (go > 0.5) setMove(c.rt, dir.x * go, dir.y * go, Math.max(1, spec.windupMs), t, 'accel');
  else c.rt.move = null;
  kenkiSwingSfx({ stage: spec.stage });
  return s;
};

/** 技を始める(値段を払い・秘奥義の順番を数える)。秘奥義が揃ったら秘奥義へ置き換える。 */
const startTech = (
  c: PhantomBrawlerCtx, s0: BrawlerState, kind: BrawlerTechKind,
  /** 予備動作の後に出す時: 決めた時刻(秘奥義の間隔を予備動作の分で切らさない)・決めた時点の取り消しの扱い・蹴りの何発目。 */
  o?: { decidedAt: number; cancel: boolean; kickN: number },
): BrawlerState => {
  const { t, phantom, player } = c;
  const cancel = o ? o.cancel : s0.phase === 'tech' && !(kind === 'kick' && s0.tech === 'kick');
  const kickN = o ? o.kickN : kind === 'kick' ? BR.brawlerNextKickN(s0, t) : 0;
  const at = o ? o.decidedAt : t;
  const cost = BR.brawlerTechCost(kind, false, discountOf(c.actor)(kind));
  const refund = brawlerOverclockRefunds(cost, skillLevel(c.actor, 'overclock'), c.rand);
  let s: BrawlerState = { ...BR.brawlerStartTech(s0, kind, t, kickN, cancel), pressAt: c.nowMs, points: s0.points - (refund ? 0 : cost) };
  const step = BR.brawlerSecretStep(s0.secretProgress ?? 0, cancel ? at : (s0.secretLastEndAt ?? 0), kind, kickN, at);
  s = { ...s, secretProgress: step.progress };
  c.rt.move = null;
  // ★秘奥義が起動するのは台本6で狙っている時だけ(§16-7「秘奥義の暴発を止める」=台本2の 蹴り→潰し→気功 で順番が満ちても起動しない)。
  if (step.fire && c.rt.mind.secretPlan) return startSecret(c, s);
  const cx = phantom.x + phantom.width / 2, cy = phantom.y + phantom.height / 2;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const dir = unit(pcx - cx, pcy - cy);
  s = { ...s, targetId: 'player', dirX: dir.x, dirY: dir.y };
  if (kind === 'kick') {
    const gap = edgeDist(cx, cy, player) - BR.BRAWLER_STANDOFF_PX;
    const go = Math.max(0, Math.min(BR.BRAWLER_KICK_RANGE, gap));
    const flightMs = BR.brawlerKickFlightMs(go);
    const chargeMs = kickN >= BR.BRAWLER_KICK_MAX ? BR.BRAWLER_KICK3_CHARGE_MS : 0;
    s = { ...s, windupMs: chargeMs + flightMs, kickChargeMs: chargeMs };
    setMove(c.rt, dir.x * go, dir.y * go, flightMs, t, 'accel', chargeMs);
  }
  if (kind === 'guard') c.patch.gpGuardUntil = s.guardUntil;
  kenkiSwingSfx(kind === 'kick' ? { kick: kickN } : 'tech');
  return s;
};

/**
 * 技を出す(頭脳が決めた時)。予備動作が付く技(気功・大叩き潰し・1発目の飛び蹴り)は予備動作を始めるだけ
 * (動かない・判定なし・まだ払わない)。予備動作の終わりに startTech が決めた時点の扱いで出す(§16-5)。
 */
const beginTech = (c: PhantomBrawlerCtx, s: BrawlerState, kind: BrawlerTechKind): BrawlerState => {
  const { t, phantom, player } = c;
  const cancel = s.phase === 'tech' && !(kind === 'kick' && s.tech === 'kick');
  const kickN = kind === 'kick' ? BR.brawlerNextKickN(s, t) : 0;
  const cx = phantom.x + phantom.width / 2;
  const pcx = player.x + player.width / 2;
  const prep = kenkiPrepStart(kind, kickN, t, cancel, pcx >= cx ? 1 : -1);
  if (!prep) return startTech(c, s, kind);
  c.rt.prep = prep;
  c.rt.move = null;
  c.patch.gpBrawlerPrep = { tex: prep.tex, dirX: prep.dirX };
  return s;
};

/** 予備動作の一歩。終わった瞬間に技を出す(値段もその時に払う)。払えなければ出さない。 */
const stepPrep = (c: PhantomBrawlerCtx, s: BrawlerState): BrawlerState => {
  const p = c.rt.prep;
  if (!p) return s;
  c.rt.move = null;
  if (c.player.health <= 0 || s.secret) { phantomBrawlerCancelPrep(c.rt, c.patch); return s; }
  if (!kenkiPrepDue(p, c.t)) return s;
  phantomBrawlerCancelPrep(c.rt, c.patch);
  if (!BR.brawlerCanPay(s, p.kind, false, discountOf(c.actor)(p.kind))) return s;
  return startTech(c, s, p.kind, { decidedAt: p.at, cancel: p.cancel, kickN: p.kickN });
};

/** ステップ(100px・加速→減速・無敵なし)。 */
const startStep = (c: PhantomBrawlerCtx, s: BrawlerState, dirX: number, dirY: number): BrawlerState => {
  if (!BR.brawlerStepAllowed(s, c.t)) return s;
  const d = unit(dirX, dirY);
  setMove(c.rt, d.x * BR.BRAWLER_STEP_PX, d.y * BR.BRAWLER_STEP_PX, BR.BRAWLER_STEP_MS, c.t, 'decel');
  return BR.brawlerStepStart(s, c.t, c.nowMs);
};

// ---------------------------------------------------------------------------------------------
// 判定(前隙の終わり)
// ---------------------------------------------------------------------------------------------
const resolveAction = (c: PhantomBrawlerCtx, s: BrawlerState): BrawlerState => {
  const { t, phantom, player } = c;
  const cx = (c.patch.x ?? phantom.x) + phantom.width / 2, cy = (c.patch.y ?? phantom.y) + phantom.height / 2;
  const foot = { x: cx, y: cy + phantom.height / 2 - 6 };
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const pr = Math.max(player.width, player.height) / 2;
  const reach = huntingMeleeRadius(c.actor);
  const dir = unit(pcx - cx, pcy - cy);
  const cap = pointCapOf(phantom);
  const cancelOnCounter = (r: { countered: boolean }): BrawlerState | null => (r.countered ? phantomBrawlerCancelled(s) : null);

  if (s.phase === 'attack') {
    const spec = BR.brawlerStageSpec(s.stage);
    let r: { touched: boolean; countered: boolean; landed?: boolean };
    if (spec.shape === 'landing') {
      r = strikePlayer(c, s, edgeDist(foot.x, foot.y, player) <= BR.BRAWLER_LANDING_RADIUS,
        { kind: 'circle', cx: foot.x, cy: foot.y, r: BR.BRAWLER_LANDING_RADIUS }, spec.mult, 'brawler-s4',
        kbOf('small', 1, unit(pcx - foot.x, pcy - foot.y)), foot.x, foot.y);
    } else if (spec.shape === 'band') {
      const x0 = s.palmFromX ?? cx, y0 = s.palmFromY ?? cy;
      const travel = Math.max(BR.BRAWLER_PALM_MIN_REACH_PX, (cx - x0) * s.dirX + (cy - y0) * s.dirY);
      const x1 = x0 + s.dirX * travel, y1 = y0 + s.dirY * travel;
      const side = (pcx - x0) * -s.dirY + (pcy - y0) * s.dirX >= 0 ? 1 : -1;
      r = strikePlayer(c, s, distToBandRect({ x: pcx, y: pcy }, { x: x0, y: y0 }, { x: x1, y: y1 }, BR.BRAWLER_BAND_HALF_W) <= pr,
        { kind: 'capsule', fx: x0, fy: y0, tx: x1, ty: y1, hw: BR.BRAWLER_BAND_HALF_W }, spec.mult, 'brawler-s5',
        kbOf('big', spec.kbMult ?? BR.BRAWLER_BIG_KB_MULT, { x: -s.dirY * side, y: s.dirX * side }), cx, cy);
    } else {
      r = strikePlayer(c, s, edgeDist(cx, cy, player) <= reach, { kind: 'circle', cx, cy, r: reach }, spec.mult,
        spec.stage === 3 ? 'brawler-s3' : spec.stage === 2 ? 'brawler-s2' : 'brawler-s1',
        kbOf(stageKb(spec.kb), 1, dir), cx, cy);
    }
    const cancelled = cancelOnCounter(r);
    if (cancelled) { c.rt.move = null; return cancelled; }
    if (r.landed) c.rt.mind.landedStartAt = s.startAt; // 台本の「当たった」(§16-7)
    const hits = r.touched ? 1 : 0;
    if (hits > 0) kenkiHitSfx({ stage: spec.stage });
    // 3段目のアッパー・4段目の跳び踏み潰しを食らったプレイヤーは、絵だけ浮く(操作は奪わない・research/BRAWLER_PHANTOM.md §4-9)。
    if (hits > 0 && (spec.stage === 3 || spec.stage === 4)) notePlayerLaunched(c.nowMs, BR.BRAWLER_LIFT_MS);
    let next = BR.brawlerAfterResolve(s, t, hits, { pointCap: cap, countPoint: true, hitstopMs: spec.hitstopMs });
    if (hits > 0) next = BR.brawlerFlowOnHit(next, 1);
    // 当てた=反動で止める / 5段目=抜けた先で止まる。
    if (spec.shape === 'band' || hits > 0) c.rt.move = null;
    return next;
  }
  // 技
  if (s.tech === 'guard') return { ...s, resolved: true };
  if (s.tech === 'stomp') {
    const r = strikePlayer(c, s, edgeDist(foot.x, foot.y, player) <= BR.BRAWLER_STOMP_RADIUS,
      { kind: 'circle', cx: foot.x, cy: foot.y, r: BR.BRAWLER_STOMP_RADIUS }, BR.BRAWLER_STOMP_MULT, 'brawler-stomp',
      kbOf('big', BR.BRAWLER_BIG_KB_MULT, unit(pcx - foot.x, pcy - foot.y)), foot.x, foot.y);
    const cancelled = cancelOnCounter(r);
    if (cancelled) return cancelled;
    if (r.landed) c.rt.mind.landedStartAt = s.startAt; // 台本の「当たった」(§16-7)
    if (r.touched) kenkiHitSfx('stomp');
    const g = useGameStore.getState();
    g.spawnRing(foot.x, foot.y, 20, BR.BRAWLER_STOMP_RADIUS * 1.25, BR.BRAWLER_RGBA(0.9), 5, 420, true);
    g.triggerShake(220, 12, 0, 1);
    const hits = r.touched ? 1 : 0;
    const next = BR.brawlerAfterResolve(s, t, hits, { pointCap: cap, countPoint: false, hitstopMs: BR.BRAWLER_STOMP_HITSTOP_MS });
    return hits > 0 ? BR.brawlerFlowOnHit(next, 1) : next;
  }
  if (s.tech === 'kiko') {
    if (!phantom.gpKiko) {
      c.patch.gpKiko = { id: `gpkiko-${c.nowMs}`, x: cx + dir.x * 18, y: cy - 4 + dir.y * 18, dirX: dir.x, dirY: dir.y, traveled: 0, createdAt: c.nowMs,
        // 台本(2・3)の締めの気功は当てる=近接の打撃と同じ扱い(社長裁定2026-11-10 §16-8)。単発の気功は今どおり(遠隔=被弾無敵を守る)。
        ...(pbScriptFinisherKiko(c.rt.mind) ? { melee: true } : {}) };
    }
    return { ...s, resolved: true, dirX: dir.x, dirY: dir.y };
  }
  // 飛び蹴り(着いた瞬間に判定)
  const big = s.kickN >= BR.BRAWLER_KICK_MAX;
  const hs = BR.BRAWLER_KICK_HITSTOP_MS[Math.max(1, Math.min(3, s.kickN))];
  const r = strikePlayer(c, s, edgeDist(cx, cy, player) <= reach, { kind: 'circle', cx, cy, r: reach }, BR.brawlerKickMult(s.kickN), 'brawler-kick',
    kbOf(big ? 'big' : 'builtin', BR.BRAWLER_BIG_KB_MULT, dir), cx, cy);
  const cancelled = cancelOnCounter(r);
  if (cancelled) { c.rt.move = null; return cancelled; }
  if (r.landed) c.rt.mind.landedStartAt = s.startAt; // 台本の「当たった」(§16-7)
  const hits = r.touched ? 1 : 0;
  if (hits > 0) kenkiHitSfx({ kick: s.kickN });
  const after = BR.brawlerAfterResolve(s, t, hits, { pointCap: cap, countPoint: false, hitstopMs: hs });
  c.rt.move = null;
  return {
    ...(hits > 0 ? BR.brawlerFlowOnHit(after, 1) : after),
    // ★秘奥義の1手目は「飛び蹴りが本当に当たった(体力を削った)時」だけ(社長指示2026-11-10「拳鬼も飛び蹴り当てないと秘奥義は打てない様にしないとおかしい」)。
    // 構えで受けられた・無敵で0ダメージだった蹴りは数えない(プレイヤーの「1発目は敵に当たっていること」と同じ考え)。
    secretProgress: BR.brawlerSecretAfterKick(s.secretProgress ?? 0, r.landed === true),
    kickChainUntil: big ? 0 : t + BR.BRAWLER_KICK_CHAIN_MS, kickCount: big ? 0 : s.kickN,
  };
};

// ---------------------------------------------------------------------------------------------
// 気功(1発・プレイヤーの気功と同じ速さ・届く距離・爆発の半径)。遠隔=被弾無敵は守る。
// ---------------------------------------------------------------------------------------------
const stepKiko = (c: PhantomBrawlerCtx): void => {
  const k = c.patch.gpKiko ?? c.phantom.gpKiko;
  if (!k) return;
  const stepPx = BR.BRAWLER_KIKO_SPEED * c.deltaTime;
  const nx = k.x + k.dirX * stepPx, ny = k.y + k.dirY * stepPx;
  const traveled = k.traveled + stepPx;
  const pl = c.player;
  const touch = edgeDist(nx, ny, pl) <= BR.BRAWLER_KIKO_HIT_PAD;
  if (!touch && traveled < BR.BRAWLER_KIKO_RANGE) { c.patch.gpKiko = { ...k, x: nx, y: ny, traveled }; return; }
  c.patch.gpKiko = undefined;
  const g = useGameStore.getState();
  // カウンターの窓の中で触れたら弾ける(赤=カウンター可の技・research/BRAWLER.md §4)。ダメージは無い。
  if (touch && isCounterActive(g.player, c.nowMs)) {
    g.spawnRing(nx, ny, 10, 80, 'rgba(56,189,248,0.9)', 3, 300);
    g.spawnBurst(nx, ny, '#38bdf8', 10);
    return;
  }
  g.spawnExplosionFx(nx, ny, BR.BRAWLER_KIKO_RADIUS);
  const dmg = c.baseDamage * BR.BRAWLER_KIKO_MULT * phantomBrawlerStrikerMult(c.actor.characterClass)
    * brawlerSpeedDamageMult(playerMoveStatMult(c.actor, c.t)) * PVP_DAMAGE_SCALE;
  hitThirdParties({ kind: 'circle', cx: nx, cy: ny, r: BR.BRAWLER_KIKO_RADIUS }, dmg, c.phantom.id, 'guardian-phantom');
  if (edgeDist(nx, ny, pl) <= BR.BRAWLER_KIKO_RADIUS) {
    if (k.melee) {
      // 台本の締めの気功(§16-8): 近接の打撃と同じ1本(landPhantomMeleeOnPlayer)で当てる=プレイヤーの被弾無敵に吸われない。
      // 量は単発の気功と同じ式(×0.2 は land の側)。押しは組み込み(単発の気功の damagePlayer と同じ)。
      c.land(nx, ny, BR.BRAWLER_KIKO_MULT * phantomBrawlerStrikerMult(c.actor.characterClass) * brawlerSpeedDamageMult(playerMoveStatMult(c.actor, c.t)),
        { moveKey: 'brawler-kiko', sourceLabel: `${c.label}の気功`, onCountered: () => {} });
    } else {
      // 遠隔の行(research/BRAWLER_PHANTOM.md §4-8 の3行目): 型名を渡さない=通常の被弾無敵を守る。死因は末尾の記録で残す。
      g.damagePlayer(dmg, `${c.label}の気功`, nx, ny, undefined, undefined, 'brawler-kiko', undefined, undefined, { type: 'guardian-phantom', id: c.phantom.id });
    }
  }
};

// ---------------------------------------------------------------------------------------------
// 秘奥義(相手=プレイヤー。プレイヤーを止めない)
// ---------------------------------------------------------------------------------------------
const startSecret = (c: PhantomBrawlerCtx, s: BrawlerState): BrawlerState => {
  const { phantom } = c;
  const cx = phantom.x + phantom.width / 2, cy = phantom.y + phantom.height / 2;
  const g = useGameStore.getState();
  g.spawnFlash('rgba(0,0,0,0.5)', 220);
  g.spawnRing(cx, cy, 16, 260, BR.BRAWLER_RGBA(0.95), 6, 620, true);
  g.spawnRing(cx, cy, 10, 180, 'rgba(56,189,248,0.9)', 4, 520, true);
  g.spawnBurst(cx, cy, BR.BRAWLER_COLOR, 30);
  g.triggerShake(360, 14, 0, 0);
  // 題字は幻影の頭上(寄り=ズームは出さない: 起動の間にプレイヤーの画面を動かさない・research/BRAWLER_PHANTOM.md §8)。
  g.spawnImageMark(cx, cy - phantom.height * 0.6, 'fx/brawler-secret-title', { scale: 0.9, duration: 1050, titlePop: true, fadeFrom: 0.75, moveY: -6 });
  c.rt.move = null;
  return { ...BR.brawlerSecretStart(s, c.t, c.nowMs), flashAt: c.nowMs };
};

const secretStrike = (c: PhantomBrawlerCtx, s: BrawlerState): BrawlerState => {
  const { t, phantom, player } = c;
  const sec = s.secret!;
  const from = { x: (c.patch.x ?? phantom.x) + phantom.width / 2, y: (c.patch.y ?? phantom.y) + phantom.height / 2 };
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  // プレイヤーの脇へ(来た側を基準に ±0.9rad 散らす)。立てる所へ寄せる。
  const base = Math.atan2(from.y - pcy, from.x - pcx) + (c.rand() * 2 - 1) * 0.9;
  const gap = BR.BRAWLER_STANDOFF_PX + phantom.width / 2 + player.width / 2;
  const want = { x: pcx + Math.cos(base) * gap - phantom.width / 2, y: pcy + Math.sin(base) * gap - phantom.height / 2 };
  const spot = c.resolveMove(want.x, want.y);
  c.patch.x = spot.x; c.patch.y = spot.y;
  const to = { x: spot.x + phantom.width / 2, y: spot.y + phantom.height / 2 };
  const dir = unit(pcx - to.x, pcy - to.y);
  const move = BR.brawlerSecretPickMove(c.rand());
  let s1: BrawlerState = {
    ...BR.brawlerSecretMovePose(s, move, t, dir.x, dir.y), targetId: 'player',
    secret: { ...sec, phase: 'strike', phaseAt: t, hits: sec.hits + 1, nextAt: t + BR.BRAWLER_SECRET_STRIKE_MS, move,
      warpFromX: from.x, warpFromY: from.y, warpToX: to.x, warpToY: to.y, warpAt: c.nowMs },
  };
  const g = useGameStore.getState();
  g.spawnGlow(to.x, to.y - 6, 30, 'rgba(255,248,230,', 240, true);
  const reach = huntingMeleeRadius(c.actor);
  const foot = { x: to.x, y: to.y + phantom.height / 2 - 6 };
  let r: { touched: boolean; countered: boolean } = { touched: false, countered: false };
  if (move === 'kiko') {
    // 秘奥義の中の気功はその場(プレイヤーの所)で爆発(プレイヤー版と同じ)。遠隔の行。
    g.spawnExplosionFx(pcx, pcy, BR.BRAWLER_KIKO_RADIUS);
    // 足の速さの能力値も通常の気功と同じく掛ける(2026-11-10 の総点検で抜けを直した)。
    const dmg = c.baseDamage * BR.BRAWLER_KIKO_MULT * phantomBrawlerStrikerMult(c.actor.characterClass)
      * brawlerSpeedDamageMult(playerMoveStatMult(c.actor, c.t)) * PVP_DAMAGE_SCALE;
    hitThirdParties({ kind: 'circle', cx: pcx, cy: pcy, r: BR.BRAWLER_KIKO_RADIUS }, dmg, phantom.id, 'guardian-phantom');
    g.damagePlayer(dmg, `${c.label}の気功`, pcx, pcy, undefined, undefined, 'brawler-secret', undefined, undefined, { type: 'guardian-phantom', id: phantom.id });
  } else if (move === 'stomp') {
    r = strikePlayer(c, s1, edgeDist(foot.x, foot.y, player) <= BR.BRAWLER_STOMP_RADIUS, { kind: 'circle', cx: foot.x, cy: foot.y, r: BR.BRAWLER_STOMP_RADIUS },
      BR.BRAWLER_STOMP_MULT, 'brawler-secret', kbOf('big', BR.BRAWLER_BIG_KB_MULT, unit(pcx - foot.x, pcy - foot.y)), foot.x, foot.y, true);
  } else if (move === 'kick') {
    r = strikePlayer(c, s1, edgeDist(to.x, to.y, player) <= reach, { kind: 'circle', cx: to.x, cy: to.y, r: reach },
      BR.brawlerKickMult(3), 'brawler-secret', kbOf('big', BR.BRAWLER_BIG_KB_MULT, dir), to.x, to.y, true);
  } else {
    const spec = BR.brawlerStageSpec(move);
    if (spec.shape === 'landing') {
      r = strikePlayer(c, s1, edgeDist(foot.x, foot.y, player) <= BR.BRAWLER_LANDING_RADIUS, { kind: 'circle', cx: foot.x, cy: foot.y, r: BR.BRAWLER_LANDING_RADIUS },
        spec.mult, 'brawler-secret', kbOf('small', 1, unit(pcx - foot.x, pcy - foot.y)), foot.x, foot.y, true);
    } else if (spec.shape === 'band') {
      const x1 = to.x + dir.x * BR.BRAWLER_BAND_LEN, y1 = to.y + dir.y * BR.BRAWLER_BAND_LEN;
      r = strikePlayer(c, s1, distToBandRect({ x: pcx, y: pcy }, to, { x: x1, y: y1 }, BR.BRAWLER_BAND_HALF_W) <= Math.max(player.width, player.height) / 2,
        { kind: 'capsule', fx: to.x, fy: to.y, tx: x1, ty: y1, hw: BR.BRAWLER_BAND_HALF_W }, spec.mult, 'brawler-secret',
        kbOf('big', spec.kbMult ?? BR.BRAWLER_BIG_KB_MULT, dir), to.x, to.y, true);
    } else {
      r = strikePlayer(c, s1, edgeDist(to.x, to.y, player) <= reach, { kind: 'circle', cx: to.x, cy: to.y, r: reach },
        spec.mult, 'brawler-secret', kbOf(stageKb(spec.kb), 1, dir), to.x, to.y, true);
    }
  }
  if (r.countered) return BR.brawlerSecretEnd(s1); // 1発でも返されたら秘奥義ごと打ち切り(技ポイント0)
  if (r.touched) s1 = BR.brawlerFlowOnHit(s1, 1);
  kenkiSwingSfx('secret');
  if (r.touched) kenkiHitSfx(typeof move === 'number' ? { stage: move } : move === 'kick' ? { kick: BR.BRAWLER_KICK_MAX } : 'stomp');
  return s1;
};

const secretFall = (c: PhantomBrawlerCtx, s: BrawlerState): BrawlerState => {
  const { phantom, player } = c;
  const from = { x: (c.patch.x ?? phantom.x) + phantom.width / 2, y: (c.patch.y ?? phantom.y) + phantom.height / 2 };
  // 落ちる先=プレイヤーの所(その時の位置を行き先として立てる所へ)。
  const spot = c.resolveMove(player.x + player.width / 2 - phantom.width / 2, player.y + player.height / 2 - phantom.height / 2);
  c.patch.x = spot.x; c.patch.y = spot.y;
  return {
    ...s, phase: 'idle', tech: null, stage: 0,
    secret: { ...s.secret!, phase: 'fall', phaseAt: c.t, nextAt: c.t + BR.BRAWLER_SECRET_FALL_MS,
      warpFromX: from.x, warpFromY: from.y, warpToX: spot.x + phantom.width / 2, warpToY: spot.y + phantom.height / 2, warpAt: c.nowMs },
  };
};

const secretLand = (c: PhantomBrawlerCtx, s: BrawlerState): BrawlerState => {
  const { phantom, player } = c;
  const cx = (c.patch.x ?? phantom.x) + phantom.width / 2, cy = (c.patch.y ?? phantom.y) + phantom.height / 2;
  const foot = { x: cx, y: cy + phantom.height / 2 - 6 };
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const next: BrawlerState = { ...s, secret: { ...s.secret!, phase: 'land', phaseAt: c.t, nextAt: c.t + BR.BRAWLER_SECRET_LAND_MS }, flashAt: c.nowMs };
  const r = strikePlayer(c, next, edgeDist(foot.x, foot.y, player) <= BR.BRAWLER_SECRET_LAND_RADIUS,
    { kind: 'circle', cx: foot.x, cy: foot.y, r: BR.BRAWLER_SECRET_LAND_RADIUS }, BR.BRAWLER_SECRET_LAND_MULT, 'brawler-secret-land',
    kbOf('big', BR.BRAWLER_BIG_KB_MULT, unit(pcx - foot.x, pcy - foot.y)), foot.x, foot.y, true);
  const g = useGameStore.getState();
  g.spawnRing(foot.x, foot.y, 24, BR.BRAWLER_SECRET_LAND_RADIUS * 1.3, BR.BRAWLER_RGBA(0.95), 7, 620, true);
  g.spawnBurst(foot.x, foot.y, BR.BRAWLER_COLOR, 36);
  g.triggerShake(420, 20, 0, 1);
  if (r.countered) return BR.brawlerSecretEnd(next);
  return next;
};

const tickSecret = (c: PhantomBrawlerCtx, s0: BrawlerState): BrawlerState => {
  let s = s0;
  for (let i = 0; i < 3; i++) {
    if (!s.secret) return s;
    if (c.player.health <= 0) return BR.brawlerSecretEnd(s);
    const ev = BR.brawlerSecretDue(s.secret, c.t);
    if (ev === null) return s;
    if (ev === 'strike') s = secretStrike(c, s);
    else if (ev === 'fall') s = secretFall(c, s);
    else if (ev === 'land') s = secretLand(c, s);
    else return BR.brawlerSecretEnd(s);
  }
  return s;
};

// ---------------------------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------------------------
/**
 * 格闘の幻影の1tick。状態は c.patch.phantomBrawler に書く(値が変わった時だけ)。
 * 戻り値: 行動中か(呼び手は歩かせない)。
 */
/**
 * 縮地(research/BRAWLER_PHANTOM.md §14・社長指示2026-11-10「拳鬼はカウンターすると縮地で距離を一気に詰めてくる。
 * (ただし無限にワープはしない)」)。プレイヤーの正面のすぐ手前(来た側・格闘の詰めの立ち位置)へ瞬間移動する。
 * 立てる所が無ければしない。ワープ直後の無敵は付けない。行動(構えなど)を解いて、すぐ次の段・技へ移れるようにする。
 */
const kenkiShukuchi = (c: PhantomBrawlerCtx, s: BrawlerState, cx: number, cy: number): { s: BrawlerState; cx: number; cy: number } | null => {
  const { phantom, player, t } = c;
  const spot = kenkiShukuchiPick(kenkiShukuchiCandidates({ x: cx, y: cy }, player, phantom.width / 2), phantom, (x, y) => c.resolveMove(x, y));
  if (!spot) return null;
  const to = { x: spot.x + phantom.width / 2, y: spot.y + phantom.height / 2 };
  c.patch.x = spot.x; c.patch.y = spot.y; c.patch.vx = 0; c.patch.vy = 0;
  c.patch.gpShukuchi = { at: c.nowMs, fromX: cx, fromY: cy };
  if (phantom.gpGuardUntil !== undefined) c.patch.gpGuardUntil = undefined;
  c.rt.move = null;
  phantomBrawlerCancelPrep(c.rt, c.patch);
  pbInterruptScript(c.rt.mind); // 縮地が入った=台本は打ち切り(§16-7)
  c.rt.shukuchiReadyAt = kenkiShukuchiReadyAt(t);
  // すぐ次の行動へ: 息継ぎ・反応の下限・考える拍・様子見を外す(間合いに入った扱い)。
  const m = c.rt.mind;
  m.nextStringAt = t; m.approachBeatAt = 0; m.holdUntil = 0;
  c.rt.reachSince = t - 10_000;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const d = unit(pcx - to.x, pcy - to.y);
  // 見せ方(秘奥義のワープと同じ残光=fx/dash-wind の線+消える所と現れる所の光)。線は縮みながら消える(慣性)。
  const g = useGameStore.getState();
  const wdx = to.x - cx, wdy = to.y - cy, wl = Math.hypot(wdx, wdy);
  if (wl > 8) {
    g.spawnImageMark((cx + to.x) / 2, (cy + to.y) / 2 - 6, 'fx/dash-wind', {
      additive: true, noPop: true, scale: 0.16, scaleX: wl / (0.16 * 130 * (233 / 64)), rot: Math.atan2(wdy, wdx), duration: 260, fadeFrom: 0.15,
      tint: 0x9be7ff, moveX: wdx * 0.18, moveY: wdy * 0.18, alpha: 0.95,
    });
    g.spawnGlow(cx, cy - 6, GLOW_R_S, 'rgba(125,211,252,', 220, true);
  }
  g.spawnGlow(to.x, to.y - 6, GLOW_R_M, 'rgba(255,248,230,', 240, true);
  c.shukuchiSfx?.();
  return { s: { ...BR.brawlerCancel(s), dirX: d.x, dirY: d.y }, cx: to.x, cy: to.y };
};

// ---------------------------------------------------------------------------------------------
// 跳びかかり(research/BRAWLER_PHANTOM.md §15・社長「一つだけボス技をつけるのは?ジャンプ攻撃。赤予告あり。」
// →「え、新しい技?ハンターが使ってるよ」=ハンターの跳びを流用)。溜め・跳ぶ弧・着地の円の予告・判定の円・着地後の停止・
// 時間・範囲はハンターの値と共通の一歩(utils/groundJump.groundJumpStep)のまま。拳鬼の側は使う場面と、当たりの解決(対人の規則)だけ。
// ---------------------------------------------------------------------------------------------
/** ハンターの跳びの値(拳鬼専用の値は作らない)。 */
const KENKI_JUMP_STYLE = 'hunter' as const;
const kenkiAtkUntil = (t: number) => (ms: number): number => t + ms / ENEMY_ATTACK_SPEED_MULT;

/** 跳びかかりを始める(ハンターの縮み溜め)。 */
const startKenkiLeap = (c: PhantomBrawlerCtx): void => {
  Object.assign(c.patch, groundJumpStartCrouch(kenkiAtkUntil(c.t), PUMPKIN_CROUCH_MS));
  c.rt.leapReadyAt = kenkiLeapReadyAt(c.t, c.rand);
  c.rt.move = null;
};

/** 跳びかかりの一歩(溜め・跳び・着地・停止)。跳びかかりの最中なら true(他の行動をしない)。 */
const stepKenkiLeap = (c: PhantomBrawlerCtx, s: BrawlerState): boolean => {
  const { phantom, player, t } = c;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const gj = groundJumpStep(phantom, {
    gameTime: t, aimX: pcx, aimY: pcy, atkUntil: kenkiAtkUntil(t), attackSpeedMult: ENEMY_ATTACK_SPEED_MULT,
    jumpMsRaw: groundJumpAirMsRaw(KENKI_JUMP_STYLE), recoverMsRaw: pumpkinRecoverMs(KENKI_JUMP_STYLE),
  });
  if (!gj) {
    c.rt.mind.leapForSecret = false; // 跳びかかりが溜めで取り消された(台本6の跳びも捨てる)
    return false;
  }
  Object.assign(c.patch, gj.patch);
  if (gj.landed) {
    // 着地の爆風: ハンターと同じ円(半径・中心=着地した体の中心・プレイヤーの当たり半径を足す式)。
    const { x: bx, y: by } = gj.landed;
    const pr = Math.max(player.width, player.height) / 2;
    const hit = groundBlastCircleHits(pcx, pcy, pr, bx, by, PUMPKIN_EXPLOSION_RADIUS);
    // ダメージ=拳鬼の格闘の大踏み潰しの式(記録の近接×装備・スキル×ストライカー×足の速さ×大踏み潰しの倍率)×対人0.2。
    // 押しは外向き・大踏み潰しと同じ強さ。範囲技=プレイヤーの被弾無敵を守る(ハンターの爆風と同じ扱い)。カウンターで返せる。
    // ★食らっても吹き飛ばさず、浮かせる(社長指示2026-11-10「拳鬼のジャンプ攻撃は食らっても吹き飛ばず、浮かされる」)。
    //   押しは無し=その場で、3・4段目と同じ「絵だけ浮く」(操作は奪わない・§4-9)。浮く長さは4段目の打ち上げと同じ。
    const lr = strikePlayer(c, s, hit, { kind: 'circle', cx: bx, cy: by, r: PUMPKIN_EXPLOSION_RADIUS }, BR.BRAWLER_STOMP_MULT, 'kenki-leap',
      'none', bx, by, false, true);
    if (lr.landed) notePlayerLaunched(c.nowMs, BR.BRAWLER_LIFT_MS);
    // 地面を叩く絵と音(格闘の大踏み潰しの流用・ハンターの武器の絵は使わない)。
    const g = useGameStore.getState();
    g.spawnRing(bx, by, 20, PUMPKIN_EXPLOSION_RADIUS * 1.25, BR.BRAWLER_RGBA(0.9), 5, 420, true);
    g.spawnBurst(bx, by, BR.BRAWLER_COLOR, 24);
    g.triggerShake(240, 12, 0, 1);
    enqueueBrawlerSfx('brawler-stomp', 1.0, 0.85);
  }
  if (gj.done) {
    c.rt.mind.nextStringAt = t + phantomBrawlerBreath(c.rand);
    pbSecretAfterLeap(c.rt.mind); // 台本6: 着地したら(当たり外れに関わらず)秘奥義を狙う(§16-3)
    return false;
  }
  return true;
};

export const stepPhantomBrawler = (c: PhantomBrawlerCtx): boolean => {
  const { phantom, player, t } = c;
  const before = phantom.phantomBrawler;
  let s: BrawlerState = before ?? BR.initialBrawlerState();
  let cx = phantom.x + phantom.width / 2, cy = phantom.y + phantom.height / 2;
  const m = c.rt.mind;

  // プレイヤーの近接が当たりを解いた(=リズムの記録)。時計は gameTime で記録する(research/BRAWLER_PHANTOM.md §4-2)。
  const commitAt = player.meleeSwingCommitAt ?? 0;
  if (commitAt > 0 && commitAt !== m.lastSeenCommitAt) {
    if (m.lastSeenCommitAt !== 0) notePlayerStrike(m, t);
    m.lastSeenCommitAt = commitAt;
  }
  // 被弾した=段は1段目へ・先行入力は捨てる(プレイヤーと同じ brawlerOnHurt。行動そのものは続く)。
  if ((phantom.lastHit ?? 0) > c.rt.lastHitSeen) {
    if (c.rt.lastHitSeen !== 0) {
      s = BR.brawlerOnHurt(s);
      // 殴られた=予備動作は取り消し(払わない)・台本は打ち切り(段が1段目へ戻る・§16-7)。
      phantomBrawlerCancelPrep(c.rt, c.patch);
      pbInterruptScript(m);
    }
    c.rt.lastHitSeen = phantom.lastHit ?? 0;
    kenkiNoteHit(c.rt.hitTimes, t); // 跳びかかりの「撃たれ続けている」(§15)
  }
  // 近接(打撃・技)で食らった=技ポイント+1(当てた時と同じ量・上限・§16-8)。銃弾・爆発・遠隔では打刻されない(gameStore.gatePhantomHit)。
  const mh = phantom.gpMeleeHurtAt ?? 0;
  if (mh > c.rt.lastMeleeHurtSeen) {
    c.rt.lastMeleeHurtSeen = mh;
    s = BR.brawlerAfterHurtPoints(s, pointCapOf(phantom), true, c.nowMs);
  }
  // 跳びかかりの最中(ハンターの跳びの流用・§15)は他の行動をしない。
  if (stepKenkiLeap(c, s)) {
    // 相の登録(区分どおり): 溜め・跳び=技の最中(固まらない)/着地後の停止=戻り(固まる・確定反撃の隙)。
    const phaseNow = 'aiPhase' in c.patch ? c.patch.aiPhase : phantom.aiPhase;
    const bs = phaseNow === 'recover' ? 'gp-brawler-recover' : 'gp-brawler';
    if (phantom.bossState !== bs) c.patch.bossState = bs;
    // 跳びかかりの最中に食らった分(段は1段目へ・技ポイント+1)も書く(書かずに抜けると捨てられていた)。
    if (s !== before) c.patch.phantomBrawler = s;
    return true;
  }
  // 縮地(§14): カウンターが成立したら、届く距離より遠い時だけ一気に詰める(1回のカウンターで1回・4秒に1回まで)。
  if (kenkiNewCounter(c.counterAt, c.rt.lastCounterSeen)) {
    const fire = kenkiShukuchiShouldFire({
      counterAt: c.counterAt, lastSeenCounterAt: c.rt.lastCounterSeen, t, readyAt: c.rt.shukuchiReadyAt,
      edgeDist: edgeDist(cx, cy, player), reach: huntingMeleeRadius(c.actor), secretActive: !!s.secret,
    });
    c.rt.lastCounterSeen = c.counterAt!;
    const r = fire ? kenkiShukuchi(c, s, cx, cy) : null;
    if (r) { s = r.s; cx = r.cx; cy = r.cy; }
  }
  // 構えでプレイヤーの近接を受けた=今のカウンター効果に加えて、拳鬼が大きく下がる(プレイヤーから離れる向き・加速→減速・壁で止まる・
  // 社長指示2026-11-10 §16-9)。構えは時間いっぱい続く(受けは切れない)。弾の打ち返しでは下がらない。縮地が出た受け(遠い所からの近接)は下がらない。
  if (kenkiNewGuardReceive(c.meleeCounterAt, c.rt.lastGuardKbSeen)) {
    c.rt.lastGuardKbSeen = c.meleeCounterAt!;
    if (c.patch.gpShukuchi === undefined) {
      const v = kenkiGuardKbVector(cx, cy, player.x + player.width / 2, player.y + player.height / 2);
      phantomBrawlerCancelPrep(c.rt, c.patch);
      setMove(c.rt, v.dx, v.dy, KENKI_GUARD_KB_MS, t, 'accdec');
    }
  }

  if (s.secret) {
    s = tickSecret(c, s);
  } else {
    // 判定の時刻・終わり(プレイヤーの tickBrawler と同じ並び)。
    if (BR.brawlerPalmDashDue(s, t)) {
      const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
      const d = unit(pcx - cx, pcy - cy);
      s = { ...s, palmFromX: cx, palmFromY: cy, dirX: d.x, dirY: d.y };
      setMove(c.rt, d.x * BR.BRAWLER_PALM_PASS_PX, d.y * BR.BRAWLER_PALM_PASS_PX, BR.BRAWLER_PALM_DASH_MS, t, 'accel');
    }
    for (let i = 0; i < 3; i++) {
      const ev = BR.brawlerDueEvent(s, t);
      if (ev === null) break;
      if (ev === 'resolve') { s = resolveAction(c, s); continue; }
      const { state: fin, fire } = BR.brawlerFinish(s, t);
      s = fin;
      if (fire) s = startAttack(c, s);
      break;
    }
    // 構えの窓(gameTime): 構えが終わったら閉じる。
    const gu = BR.isBrawlerGuardingAt(s, t) ? s.guardUntil : 0;
    if ((phantom.gpGuardUntil ?? 0) !== gu && c.patch.gpGuardUntil === undefined) c.patch.gpGuardUntil = gu > 0 ? gu : undefined;
    if (gu > 0) m.guardReadyAt = Math.max(m.guardReadyAt, s.guardUntil + 3000);

    // 次の行動。
    const ed = edgeDist(cx, cy, player);
    const reach = huntingMeleeRadius(c.actor);
    if (ed <= reach) c.rt.reachSince = c.rt.reachSince ?? t; else c.rt.reachSince = null;
    const reachReady = c.rt.reachSince !== null && t - c.rt.reachSince >= Math.max(HUMAN_REACTION_MS, c.profile.reactionMs);
    // 予備動作(§16-5): 間は行動中扱い(歩かない・頭脳を呼ばない=先行入力・構え・ステップ・跳びかかりも出さない)。終わった瞬間に技を出す。
    const inPrep = c.rt.prep !== null;
    if (inPrep) s = stepPrep(c, s);
    const wasBusy = m.wasBusy;
    const busyNow = BR.isBrawlerBusy(s) || c.rt.prep !== null;
    if (wasBusy && !busyNow && !(s.nextStage > 1 && t <= s.chainUntil)) m.nextStringAt = t + phantomBrawlerBreath(c.rand);
    m.wasBusy = busyNow;
    if (player.health > 0 && !inPrep) {
      const act = decidePhantomBrawler({
        s, t, edgeDist: ed, reach, reachReady, playerReach: huntingMeleeRadius(player),
        kikoClear: true, discount: discountOf(c.actor), counterChance: c.profile.counterChance, meleeBias: c.profile.meleeBias,
        bullet: bulletAction(c, cx, cy), rand: c.rand,
        leap: {
          eligible: kenkiLeapEligible({ edgeDist: ed, t, readyAt: c.rt.leapReadyAt, idle: s.phase === 'idle', secret: !!s.secret }),
          underFire: kenkiUnderFire(c.rt.hitTimes, t),
          // 台本6(§16-3): 距離の下限だけ外す(クールダウン・上限・待機・秘奥義の最中でないことは同じ)。
          eligibleNear: kenkiLeapEligible({ edgeDist: ed, t, readyAt: c.rt.leapReadyAt, idle: s.phase === 'idle', secret: !!s.secret }, 0),
        },
        hpFrac: phantom.maxHealth > 0 ? phantom.health / phantom.maxHealth : 1,
        pointCap: pointCapOf(phantom),
      }, m);
      if (act?.kind === 'attack') s = startAttack(c, s);
      else if (act?.kind === 'buffer') s = { ...s, buffered: true };
      else if (act?.kind === 'drop') s = { ...s, buffered: false };
      else if (act?.kind === 'tech') s = beginTech(c, s, act.tech);
      else if (act?.kind === 'step') s = startStep(c, s, act.dirX, act.dirY);
      else if (act?.kind === 'leap') startKenkiLeap(c);
      m.wasBusy = BR.isBrawlerBusy(s) || c.rt.prep !== null;
    }
  }

  stepMove(c);
  stepKiko(c);
  if (s !== before) c.patch.phantomBrawler = s;
  const leapStarted = c.patch.aiPhase === 'crouch';
  const prepping = c.rt.prep !== null;
  // 予備動作の間は技の出かかり(=技の最中・固まらない・浮かない)と同じ区分。
  const bs = leapStarted || prepping ? 'gp-brawler' : phantomBrawlerBossState(s, t);
  if (phantom.bossState !== bs) c.patch.bossState = bs;
  return leapStarted || prepping || BR.isBrawlerBusy(s) || c.rt.move !== null;
};
