// 亡霊(変異体)の1フレーム(research/WRAITH_MUTANT.md)。useGameLoop が毎フレーム呼ぶ。
// 移動は宇宙飛行群と同じく行ける帯(clampRectToPlayableArea)だけを通す(`placeAt`・浮いている=障害物は透き通る・§9)。
import type { Enemy } from '../types/game';
import { useGameStore, PLAYER_BASE_SPEED, resolveBountyMove, type PumpkinBlast } from '../store/gameStore';
import { setWraithGraveRects, wraithGraveRects } from '../world/wraithGraves';
import { GAME_SPEED } from '../config/gameSpeed';
import { isCorpse, spawnEnemyAt } from './enemyUtils';
import { isPointInZoomedViewport, zoomedViewportBounds } from './cameraZoom';
import { playSfx } from '../audio/audioManager';
import { npcSfxDistGain } from './npcSfx';
import { bossFaceWant, bossFaceDeadzonePx } from './bossFacing';
import { FRONT_SIGHT_LOSE_PX } from './frontSight';
import { escortKickableState, ESCORT_TOSS_MS } from './escortToss';
import { placeAt, nearestTarget, astroRunPois } from './astroTick';
import { renderedViewRect } from './spawnRefill';
import {
  stepAstroVelocity, astroArriveSpeed, pickAstroPoi, ASTRO_HIT_ALERT_MS, ASTRO_LOSE_MS, ASTRO_ARRIVE_PX,
  ASTRO_STUCK_MS, ASTRO_STUCK_PX, ASTRO_REST_MIN_MS, ASTRO_REST_MAX_MS, ASTRO_STOPPED_FRAC, type AstroPoi,
} from './astroScript';
import {
  WRAITH_PATROL_SPEED, WRAITH_ORBIT_SPEED, WRAITH_REVERSE_MIN_MS, WRAITH_REVERSE_MAX_MS, wraithOrbitTarget, wraithOppositePoint,
  wraithOrbitAngle, wraithOrbitPoint, WRAITH_WARP_CHANCE, WRAITH_WARP_COOLDOWN_MS, WRAITH_WARP_ROLL_GAP_MS, wraithWarpState,
  wraithGrowthStep, wraithGraveSolids, isWraithGrave, type WraithGrowthState, type WraithGrowth, WRAITH_CURSE_MARK_MS,
  WRAITH_SCREAM_WINDUP_MS, WRAITH_SCREAM_HOLD_MS, WRAITH_HEAD_Y_PX, wraithFloatFrame, WRAITH_FLOAT_FRAMES, WRAITH_SCREAM_RADIUS, WRAITH_SCREAM_DAMAGE, WRAITH_SCREAM_GAP_MIN_MS, WRAITH_SCREAM_GAP_MAX_MS,
  pickWraithSkill, type WraithSkill, isWraithPinch, wraithPinchNext, wraithBehindPoint, WRAITH_PINCH_STEP_GAP_MS, WRAITH_POINT_RAISE_MS, WRAITH_POINT_LOWER_MS, WRAITH_FLING_RANGE_PX, WRAITH_FLING_MIN_PLAYER_PX, WRAITH_FLING_MAX_PLAYER_PX, WRAITH_CURSE_GAP_MS, WRAITH_FLING_MIN, WRAITH_FLING_MAX,
  isWraithForced, wraithSummonSpots, WRAITH_SUMMON_SCREEN_MAX, WRAITH_SUMMON_HORIZON_PAD_PX, WRAITH_SUMMON_BOTTOM_PAD_PX, WRAITH_SUMMON_STAGGER_MS, WRAITH_SUMMON_FRESH_MS,
  WRAITH_FLING_HOLD_MS, wraithFlingLandings, pickWraithCurseGraves, wraithCurseLiftAt, WRAITH_CURSE_MAX, WRAITH_CURSE_PRE_MS, WRAITH_CURSE_HOVER_PX, WRAITH_CURSE_TAIL_MS,
} from './wraithScript';

export interface WraithTickState {
  activeId: string | null;
  heading: number; speed: number;
  pois: AstroPoi[]; poiIdx: number | null; prevPoi: number | null;
  resting: boolean; restUntil: number | null;
  stuckAt: number; stuckD: number;
  lostSince: number | null;
  /** 周回の向き(+1=画面で時計回り)と、次に逆へ回り直す時刻。 */
  orbitDir: 1 | -1; nextReverseAt: number;
  /** 次に叫ぶ時刻(null=まだ決めていない)・叫びを当てたか。 */
  nextScreamAt: number | null; screamHit: boolean;
  /** ワープの抽選(実時間 ms・lastHit と同じ時計)・最後のワープ(gameTime)・ワープで体を移したか。 */
  lastRollAt: number; lastWarpAt: number; warpMoved: boolean;
  /** 叫びが当たった時刻(追い打ちの輪を時間をずらして出す)と、出した輪の数。裾の靄を出した時刻。 */
  screamHitAt: number; screamEchoes: number; lastTrailAt: number;
  /** §11 指差しの技: 前に使った技(同じ技を続けない)・指差しで飛ばす雑魚・飛ばしたか・呪いで抜く墓石の数(予定)・抜いた数・最後に抜いた時刻(腕を上げ始めてからの ms)。 */
  lastSkill: WraithSkill | null; flingIds: string[]; flingDone: boolean; curseTotal: number; curseIdx: number; curseLastLift: number;
  /** 合図を出した雑魚の数・印を付けた墓石の番号とid・雑魚が着地する時刻(重い音を1回)。 */
  flingMarked: number; curseMarkFor: number; curseMarkId: string | null; flingLandAt: number | null;
  /** ピンチ用の台本(§13): 次の手・後ろへ回り込むワープの最中か・台本の手で続けるか(次の手まで短く空ける)。 */
  pinchStep: number; warpBehind: boolean; pinchChain: boolean;
  /** 召喚(§15): コウモリを呼んだか(溜め明け)・呼び終えて次の番を指差しにするか。 */
  summonHit: boolean; summonThenFling: boolean;
  /** 召喚の置き場所(溜めの始まりに決め、靄を溜める)。 */
  summonSpots: { x: number; y: number }[];
}
export const createWraithTickState = (): WraithTickState => ({
  activeId: null, heading: 0, speed: 0, pois: [], poiIdx: null, prevPoi: null, resting: false, restUntil: null,
  stuckAt: 0, stuckD: Infinity, lostSince: null, orbitDir: 1, nextReverseAt: 0, nextScreamAt: null, screamHit: false,
  lastRollAt: -1e9, lastWarpAt: -1e9, warpMoved: true, screamHitAt: -1e9, screamEchoes: 0, lastTrailAt: -1e9,
  lastSkill: null, flingIds: [], flingDone: false, curseTotal: 0, curseIdx: 0, curseLastLift: 0,
  flingMarked: 0, curseMarkFor: -1, curseMarkId: null, flingLandAt: null,
  pinchStep: 0, warpBehind: false, pinchChain: false,
  summonHit: false, summonThenFling: false, summonSpots: [],
});

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
/**
 * 亡霊の音の大きさ。見えていれば必ず聞こえる(下限0.4)。npcSfxDistGain は等倍の画面の範囲で切るので、画面を引いている時や
 * 画面の端を回っている時は、見えている亡霊の叫び・指差しの音が0になっていた(社長報告2026-10-30「叫びの時、SE流れてる?」)。
 */
const wraithSfxGain = (x: number, y: number, ppx: number, ppy: number): number => {
  const st = useGameStore.getState();
  const g = npcSfxDistGain(x, y, ppx, ppy, st.camera, st.gameBounds);
  return isPointInZoomedViewport(x, y, st.camera, st.gameBounds, st.viewZoom) ? Math.max(g, 0.4) : g;
};
/** 確認用: `?wraithskill=fling|curse|scream` で、使える時はその技だけを選ぶ(§11)。`summon` は技の番を必ず召喚つきの指差しにする(§15-1)。 */
const FORCE_SKILL: WraithSkill | 'summon' | null = (() => {
  const v = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('wraithskill');
  return v === 'fling' || v === 'curse' || v === 'scream' || v === 'summon' ? v : null;
})();
/** 次の技までの間隔(5〜8秒)。確認用のつまみがある時は短く(すぐ見られる)。 */
const skillGapMs = (): number => (FORCE_SKILL ? 1200 : rand(WRAITH_SCREAM_GAP_MIN_MS, WRAITH_SCREAM_GAP_MAX_MS));

export const pickActiveWraith = (enemies: readonly Enemy[]): Enemy | undefined =>
  enemies.find(e => e.type === 'mutant-wraith' && !isCorpse(e) && e.health > 0);

/** 楕円の上で、居てよい所(行ける帯で押し戻されない所)まで回した点。障害物は透き通る(§9)。 */
const passableOnOrbit = (e: Enemy, cx: number, cy: number, p: { x: number; y: number }): { x: number; y: number } => {
  const a0 = wraithOrbitAngle(cx, cy, p.x, p.y);
  for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6]) {
    const q = wraithOrbitPoint(cx, cy, a0 + da);
    const r = placeAt(e, q.x, q.y);
    if (Math.hypot(r.x + e.width / 2 - q.x, r.y + e.height / 2 - q.y) < 4) return r;
  }
  return placeAt(e, p.x, p.y);
};

/**
 * §11 指差し: 飛ばせる雑魚(兵士の蹴り飛ばしと同じ型・状態の条件)。亡霊から近い順に最大6体。
 * 技の途中(aiPhase・chaffMove)・気絶・打ち上げ・拘束の雑魚は飛ばさない(赤が出ている技を別の所へ持ち込まない・§11-1 A3)。
 * 画面の中で、プレイヤーから 200〜700px(§11-1 A6)。
 */
const flingOk = (m: Enemy, gt: number, nowMs: number, pcx: number, pcy: number, inView: (x: number, y: number) => boolean): boolean => {
  if (m.escortToss || !escortKickableState(m) || m.aiPhase !== undefined || m.chaffMove !== undefined) return false;
  if ((m.stunUntil !== undefined && gt < m.stunUntil) || (m.rootUntil !== undefined && gt < m.rootUntil) || (m.liftUntil !== undefined && nowMs < m.liftUntil)) return false;
  const mx = m.x + m.width / 2, my = m.y + m.height / 2;
  const d = Math.hypot(mx - pcx, my - pcy);
  // 召喚(§15)で呼んだばかりのコウモリは近くても飛ばす(縦長の画面では200px以上の所に置き切れない=呼んだのに指差しで飛ばない、を作らない)。
  const fresh = m.wraithSummoned && m.spawnedAt !== undefined && gt - m.spawnedAt < WRAITH_SUMMON_FRESH_MS;
  return (fresh || d >= WRAITH_FLING_MIN_PLAYER_PX) && d <= WRAITH_FLING_MAX_PLAYER_PX && inView(mx, my);
};
const flingCandidates = (e: Enemy, enemies: readonly Enemy[], pcx: number, pcy: number, gt: number, nowMs: number, inView: (x: number, y: number) => boolean): Enemy[] => {
  const bx = e.x + e.width / 2, by = e.y + e.height / 2;
  return enemies
    .filter(m => m.id !== e.id && flingOk(m, gt, nowMs, pcx, pcy, inView)
      && Math.hypot(m.x + m.width / 2 - bx, m.y + m.height / 2 - by) <= WRAITH_FLING_RANGE_PX)
    .sort((a, b) => Math.hypot(a.x + a.width / 2 - bx, a.y + a.height / 2 - by) - Math.hypot(b.x + b.width / 2 - bx, b.y + b.height / 2 - by))
    .slice(0, WRAITH_FLING_MAX);
};

/**
 * 亡霊1体ぶんの1フレーム。gt=ゲーム時間(ms)・dt=秒・nowMs=実時間(lastHit と同じ時計)。
 * blocked=見失わせる場面(ステージボス戦・カットイン・大きなイベント・屋内・帰還サークル=§8 A5)。
 */
export const runWraithTick = (e: Enemy, s: WraithTickState, gt: number, dt: number, nowMs: number, blocked: boolean): void => {
  if (s.activeId !== e.id) Object.assign(s, createWraithTickState(), { activeId: e.id, stuckAt: gt });
  const st = useGameStore.getState();
  const bx = e.x + e.width / 2, by = e.y + e.height / 2;
  const patch: Partial<Enemy> = {};
  const onScreen = isPointInZoomedViewport(bx, by, st.camera, st.gameBounds, st.viewZoom);
  const collapse = (e.bossFullStunUntil !== undefined && gt < e.bossFullStunUntil) || (e.stunUntil !== undefined && gt < e.stunUntil);
  const held = (e.rootUntil !== undefined && gt < e.rootUntil) || (e.liftUntil !== undefined && nowMs < e.liftUntil);

  // ---- 見つける / 見失う(宇宙飛行群と同じ=前方の扇・殴られたら気づく・遠くで3秒) ----
  const moving = s.speed > 5;
  const faceX = moving ? Math.cos(s.heading) : (e.heroFaceX ?? -1);
  const faceY = moving ? Math.sin(s.heading) : 0;
  const tgt = nearestTarget(bx, by, faceX, faceY);
  const wasAlerted = e.libAlerted === true;
  let alerted = wasAlerted;
  const struck = nowMs - (e.lastHit ?? 0) <= ASTRO_HIT_ALERT_MS;
  if (blocked) { alerted = false; s.lostSince = null; }
  else if (tgt.seen || struck) { alerted = true; s.lostSince = null; }
  else if (wasAlerted) {
    if (tgt.d > FRONT_SIGHT_LOSE_PX) {
      if (s.lostSince === null) s.lostSince = gt;
      if (gt - s.lostSince >= ASTRO_LOSE_MS) { alerted = false; s.lostSince = null; }
    } else s.lostSince = null;
  }
  if (alerted !== wasAlerted) patch.libAlerted = alerted;
  if (alerted && !wasAlerted) {
    s.orbitDir = Math.random() < 0.5 ? 1 : -1;
    s.nextReverseAt = gt + rand(WRAITH_REVERSE_MIN_MS, WRAITH_REVERSE_MAX_MS);
    s.nextScreamAt = gt + skillGapMs();
  }
  if (!alerted && wasAlerted) { s.stuckAt = gt; s.stuckD = Infinity; s.nextScreamAt = null; }

  // ---- ワープ(消える250ms→体を反対側へ→現れる250ms・その間は当たらない・§8 A3) ----
  const ws = wraithWarpState(gt, e.wraithWarpOutAt);
  if (ws.phased !== !!e.wraithPhased) patch.wraithPhased = ws.phased;
  if (ws.moveNow && !s.warpMoved) {
    s.warpMoved = true;
    const pl = st.player;
    const cx = alerted ? tgt.x : pl.x + pl.width / 2, cy = alerted ? tgt.y : pl.y + pl.height / 2;
    // 台本の回り込み(§13)はプレイヤーの後ろ(向いている側の反対)へ。それ以外は今の位置の反対側。
    const face = pl.lastDirection ?? { x: 0, y: 0 };
    const behind = s.warpBehind ? wraithBehindPoint(pl.x + pl.width / 2, pl.y + pl.height / 2, face.x, face.y) : null;
    const q = passableOnOrbit(e, behind ? pl.x + pl.width / 2 : cx, behind ? pl.y + pl.height / 2 : cy, behind ?? wraithOppositePoint(cx, cy, bx, by));
    Object.assign(patch, q, { vx: 0, vy: 0 });
    s.speed = 0;
  }
  if (ws.done && e.wraithWarpOutAt !== undefined) {
    patch.wraithWarpOutAt = undefined;
    // 台本の回り込みが終わった=すぐ次の手(呪い)へ。
    if (s.warpBehind) { s.warpBehind = false; s.nextScreamAt = gt + WRAITH_PINCH_STEP_GAP_MS; }
  }
  let warping = !ws.done;

  // ---- 叫び(紫=弾けない・溜めの始まりに予告が出て、溜め明けの瞬間に当たる・§4) ----
  let screaming = e.wraithScreamAt !== undefined;
  if (screaming) {
    const t = gt - (e.wraithScreamAt as number);
    if ((collapse || held) && !s.screamHit) {
      // 溜めの途中で崩された=叫びは消え、予告も消える(紫が残って当たらない、を作らない)。
      patch.wraithScreamAt = undefined; screaming = false;
      s.nextScreamAt = gt + skillGapMs();
    } else if (t >= WRAITH_SCREAM_WINDUP_MS && !s.screamHit) {
      s.screamHit = true;
      const blast: PumpkinBlast = { x: bx, y: by, radius: WRAITH_SCREAM_RADIUS, damage: WRAITH_SCREAM_DAMAGE, enemyId: e.id, moveKey: 'wraith-scream', noParry: true };
      useGameStore.setState(s2 => ({ pumpkinBlasts: [...s2.pumpkinBlasts, blast] }));
      const pl = st.player;
      const g = wraithSfxGain(bx, by, pl.x + pl.width / 2, pl.y + pl.height / 2);
      // 叫び声はアイドルが倒れる時の声を少し高く(社長指示2026-10-29)。下に低い風を敷くのは今までどおり。
      if (g > 0.01) { playSfx('idol-death', 0.9 * g, undefined, 1.12); playSfx('hurricane', 0.35 * g, undefined, 0.5); }
      if (onScreen) st.triggerShake(700, 16); // カウンターできない範囲技=重く揺らす(クリエイティブ監査#11)
      // 声の出どころ=頭の高さから広がる輪と、影を落とさない淡い光(声は光源ではない=投影影なし・クリエイティブ監査#6/#12)。
      st.spawnRing(bx, by - WRAITH_HEAD_Y_PX, 10, WRAITH_SCREAM_RADIUS * 0.9, 'rgba(226,214,244,0.8)', 8, 520);
      st.spawnGlow(bx, by - WRAITH_HEAD_Y_PX * 0.5, WRAITH_SCREAM_RADIUS * 1.1, 'rgba(176,150,220,', 520, true);
      s.screamHitAt = gt; s.screamEchoes = 0;
    } else if (t >= WRAITH_SCREAM_WINDUP_MS + WRAITH_SCREAM_HOLD_MS) {
      patch.wraithScreamAt = undefined; screaming = false;
      patch.wraithPhase = -gt; // 浮遊へ戻る時は髪のまとまった0コマ目から(でたらめな位相へ跳ばない)
      s.nextScreamAt = gt + skillGapMs();
    }
  }

  // 叫び続けている間の追い打ちの輪(時間をずらす=1つの型を押したように見せない・クリエイティブ監査#10)。
  if (screaming && s.screamHit && s.screamEchoes < 2) {
    const since = gt - s.screamHitAt;
    if (s.screamEchoes === 0 && since >= 90) { s.screamEchoes = 1; st.spawnRing(bx, by, 40, WRAITH_SCREAM_RADIUS * 1.2, 'rgba(214,206,226,0.7)', 5, 860); }
    else if (s.screamEchoes === 1 && since >= 230) { s.screamEchoes = 2; st.spawnRing(bx, by - WRAITH_HEAD_Y_PX * 0.5, 20, WRAITH_SCREAM_RADIUS * 1.05, 'rgba(150,120,200,0.65)', 9, 480); }
  }

  // ---- §17: 指差しで置いた雑魚の「攻撃へ強制で入る」印は、入った(技の相か噛みつきの溜めが立った)ら外す。有効時間を過ぎた物も外す ----
  // 噛みつきの溜めは「印より後に立った」物だけ数える(噛み終わった個体に古い biteAt が残る・監査#1)。
  const forcedDone = (m: Enemy) => m.wraithForcedAt !== undefined
    && (m.aiPhase !== undefined || (m.biteAt !== undefined && m.biteAt >= m.wraithForcedAt) || !isWraithForced(m, gt));
  if (st.enemies.some(forcedDone)) {
    useGameStore.setState(s2 => ({ enemies: s2.enemies.map(m => (forcedDone(m) ? { ...m, wraithForcedAt: undefined } : m)) }));
  }

  // ---- 召喚(§15・§15-1): 叫びと同じモーションで口を開き、開き切った瞬間にコウモリ3体が口元から飛び出す。予告・判定は無い ----
  let summoning = e.wraithSummonAt !== undefined;
  if (summoning) {
    const t = gt - (e.wraithSummonAt as number);
    if (!s.summonHit && (collapse || held || blocked || st.player.health <= 0)) {
      // 溜めの途中で止められた/見失わせる場面に入った=呼ばない・続く指差しもしない。
      patch.wraithSummonAt = undefined; summoning = false;
      s.summonThenFling = false; s.pinchChain = false;
      s.nextScreamAt = gt + skillGapMs();
    } else if (!s.summonHit && t >= WRAITH_SCREAM_WINDUP_MS) {
      s.summonHit = true;
      const pl = st.player;
      const pcx = pl.x + pl.width / 2, pcy = pl.y + pl.height / 2;
      const g = wraithSfxGain(bx, by, pcx, pcy);
      // 叫びと同じ声・同じ揺れ(社長指示「モーションは叫びのモーションで、画面揺れ、叫びSEで発動」)。
      if (g > 0.01) { playSfx('idol-death', 0.9 * g, undefined, 1.12); playSfx('hurricane', 0.35 * g, undefined, 0.5); }
      // 揺れは叫びより短く(何も当てない技=被弾の重さにしない・クリエイティブ監査#8)。
      if (onScreen) st.triggerShake(450, 16);
      // 溜めの間に靄を溜めておいた置き場所(s.summonSpots)の地面から、少しずつずれて這い上がる(滑らせない・クリエイティブ監査#1/#5)。
      const mx = bx + ((e.heroFaceX ?? -1) >= 0 ? 1 : -1) * 8, my = by - WRAITH_HEAD_Y_PX * 0.7;
      if (!s.summonSpots.length) {
        // 置き場所を決める前に状態が作り直された時の保険(溜めの始まりと同じ決め方)。
        const rv = renderedViewRect(st.camera.x, st.camera.y, st.gameBounds.width, st.gameBounds.height, st.viewZoom);
        s.summonSpots = wraithSummonSpots(pcx, pcy, bx, by, { left: rv.left, right: rv.right, top: rv.horizonY + WRAITH_SUMMON_HORIZON_PAD_PX, bottom: rv.bottom - WRAITH_SUMMON_BOTTOM_PAD_PX });
      }
      const bats: Enemy[] = s.summonSpots.map((q, i) => {
        const b = spawnEnemyAt('bat', q.x, q.y, gt);
        const c = resolveBountyMove(q.x - b.width / 2, q.y - b.height / 2, { width: b.width, height: b.height });
        const at = placeAt(b, c.x + b.width / 2, c.y + b.height / 2); // ①障害物 → ②行ける帯
        return { ...b, x: at.x, y: at.y, dormant: false, wraithSummoned: true, spawnedAt: gt + (WRAITH_SUMMON_STAGGER_MS[i] ?? 0) };
      });
      useGameStore.setState(s2 => ({ enemies: [...s2.enemies, ...bats] }));
      // 口元から吐き出される靄と、這い上がる足元の土煙(赤でも紫でもない=当たらない)。
      st.spawnBurst(mx, my, '#c9c2d6', 22, 0, -1);
      for (const b of bats) {
        st.spawnRing(b.x + b.width / 2, b.y + b.height, 18, 80, 'rgba(150,144,160,0.5)', 16, 900);
        st.spawnBurst(b.x + b.width / 2, b.y + b.height, '#8f889c', 12, 0, -1);
      }
      s.summonSpots = [];
    } else if (t >= WRAITH_SCREAM_WINDUP_MS + WRAITH_SCREAM_HOLD_MS) {
      patch.wraithSummonAt = undefined; summoning = false;
      patch.wraithPhase = -gt; // 浮遊の0コマ目へ(叫びと同じ)
      // 呼んだ直後は選び直さずに指差しへ(0.35秒+姿勢が整うまで)。
      s.nextScreamAt = gt + WRAITH_PINCH_STEP_GAP_MS;
    }
  }

  // ---- 指差しの技(指差し=雑魚を吹き飛ばす/呪い=墓石を飛ばす・§11) ----
  let pointing = e.wraithPointAt !== undefined;
  if (pointing) {
    const t = gt - (e.wraithPointAt as number);
    const pl = st.player;
    const pcx = pl.x + pl.width / 2, pcy = pl.y + pl.height / 2;
    const sg = wraithSfxGain(bx, by, pcx, pcy);
    if (e.wraithPointLowerAt !== undefined) {
      if (gt - e.wraithPointLowerAt >= WRAITH_POINT_LOWER_MS) {
        patch.wraithPointAt = undefined; patch.wraithPointLowerAt = undefined; patch.wraithPointKind = undefined; pointing = false;
        patch.wraithPhase = -gt; // 浮遊の0コマ目へ戻る(叫びと同じ)
        // 台本の途中(指差しの後)ならすぐ次の手、締め(呪い)の後は普段の間隔。
        s.nextScreamAt = gt + (s.pinchChain ? WRAITH_PINCH_STEP_GAP_MS : skillGapMs());
      }
    } else if (collapse || held || blocked) {
      // 崩された/見失わせる場面に入った(§11-1 A5): まだ飛んでいない雑魚は飛ばない・まだ抜けていない墓石は抜けない(もう浮いた墓石は予告どおり飛ぶ)。腕を下ろす。
      s.flingIds = []; s.curseTotal = s.curseIdx;
      patch.wraithPointLowerAt = gt;
    } else if (e.wraithPointKind === 'fling') {
      // 「掴まれた」の合図: 亡霊に近い雑魚から順に、少しずつ遅れて足元に靄(亡霊の手が届いていく・クリエイティブ監査#13)。
      while (!s.flingDone && s.flingMarked < s.flingIds.length && t >= s.flingMarked * 45) {
        const m = st.enemies.find(q => q.id === s.flingIds[s.flingMarked]);
        s.flingMarked++;
        if (m) st.spawnRing(m.x + m.width / 2, m.y + m.height, 64, 16, 'rgba(196,188,210,0.6)', 8, Math.max(160, WRAITH_POINT_RAISE_MS - s.flingMarked * 45));
      }
      if (!s.flingDone && t >= WRAITH_POINT_RAISE_MS) {
        s.flingDone = true;
        // 腕が伸び切った瞬間に一斉に飛ぶ(その時に生きていて、まだ飛ばせる物だけ・着地点はその時のプレイヤーの周り)。
        const ids = new Set(s.flingIds);
        const vw = zoomedViewportBounds(st.camera, st.gameBounds, st.viewZoom);
        const mobs = st.enemies.filter(m => ids.has(m.id)
          && flingOk(m, gt, nowMs, pcx, pcy, (x, y) => x >= vw.left && x <= vw.right && y >= vw.top && y <= vw.bottom));
        if (mobs.length > 0) {
          const lands = wraithFlingLandings(mobs.map(m => ({ x: m.x + m.width / 2, y: m.y + m.height / 2 })), pcx, pcy);
          const to = new Map(mobs.map((m, i) => [m.id, lands[i]]));
          const now = Date.now();
          useGameStore.setState(s2 => ({
            enemies: s2.enemies.map(en => {
              const l = to.get(en.id);
              if (!l) return en;
              return {
                ...en,
                escortToss: { fromX: en.x, fromY: en.y, toX: l.x - en.width / 2, toY: l.y - en.height / 2, startAt: gt, endAt: gt + ESCORT_TOSS_MS, free: true },
                escortTossLandedAt: undefined,
                // 押しは今で打ち切る(技の途中の雑魚はそもそも選ばない=flingOk)。
                knockbackUntil: (en.knockbackUntil ?? 0) > now ? now : en.knockbackUntil, knockbackVx: 0, knockbackVy: 0, vx: 0, vy: 0,
              };
            }),
          }));
          for (const m of mobs) st.spawnBurst(m.x + m.width / 2, m.y + m.height, '#b9b2c2', 10, 0, -1);
          // 一斉に動き出す山場: 軽い揺れ(叫びより軽く)と、指先から靄の一吹き。着地で重い音を1回(クリエイティブ監査#15)。
          if (onScreen) st.triggerShake(260, 7);
          const face = (e.heroFaceX ?? -1) >= 0 ? 1 : -1;
          st.spawnBurst(bx + face * 42, by - WRAITH_HEAD_Y_PX * 0.62, '#d6d0de', 14, face, 0);
          if (sg > 0.01) playSfx('reaper-pass', 0.7 * sg, undefined, 0.85); // 霊が横切る音(引きずる音はループ専用の素材なので使わない)
          s.flingLandAt = gt + ESCORT_TOSS_MS;
        }
        s.flingIds = [];
      }
      if (t >= WRAITH_POINT_RAISE_MS + WRAITH_FLING_HOLD_MS) patch.wraithPointLowerAt = gt;
    } else {
      // 呪い: 腕が伸び切った瞬間に1つ目、以後1秒ごとに1つ。その瞬間に飛ばせる墓石を選び直す(沈んだ・近づかれた墓石は使わない)。
      // 1フレームに1つだけ・前の墓石から必ず1秒空ける(止まっていたフレームの後にまとめて抜けない・§11-1 A5)。
      const view = zoomedViewportBounds(st.camera, st.gameBounds, st.viewZoom);
      const inView = (x: number, y: number) => x >= view.left && x <= view.right && y >= view.top && y <= view.bottom;
      const nextLiftT = Math.max(wraithCurseLiftAt(s.curseIdx), s.curseIdx > 0 ? s.curseLastLift + WRAITH_CURSE_GAP_MS : 0);
      const choices = (): WraithGrowth[] => pickWraithCurseGraves(useGameStore.getState().wraithGrowths, { x: bx, y: e.y + e.height }, { x: pcx, y: pl.y + pl.height }, gt, inView);
      // 次に抜く墓石にだけ、抜ける少し前に印(縮む靄)。1秒ごとの「来るぞ」の拍(クリエイティブ監査#10)。
      if (s.curseIdx < s.curseTotal && s.curseMarkFor !== s.curseIdx && t >= nextLiftT - WRAITH_CURSE_MARK_MS) {
        s.curseMarkFor = s.curseIdx;
        const mk = choices()[0];
        s.curseMarkId = mk?.id ?? null;
        if (mk) st.spawnRing(mk.x, mk.y - 4, 60, 14, 'rgba(196,188,210,0.55)', 7, WRAITH_CURSE_MARK_MS);
      }
      if (s.curseIdx < s.curseTotal && t >= nextLiftT) {
        const list = choices();
        const g = list.find(q => q.id === s.curseMarkId) ?? list[0]; // 印を付けた墓石を優先(印が嘘にならない)
        if (!g) s.curseTotal = s.curseIdx;
        else {
        s.curseIdx++; s.curseLastLift = t;
        // 台帳から外す=壁でなくなる(runWraithGrowths が次のフレームで壁を写し直す)。根元に土が散る。
        useGameStore.setState(s2 => ({ wraithGrowths: s2.wraithGrowths.filter(q => q.id !== g.id) }));
        const hx = g.x, hy = g.y - WRAITH_CURSE_HOVER_PX;
        st.spawnSkadiBlade(hx, hy, Math.atan2(pcy - hy, pcx - hx), gt + WRAITH_CURSE_PRE_MS, e.id, 'grave',
          { variant: g.variant, scale: g.scale, flip: g.flip, liftAt: gt, bandPx: Math.hypot(pcx - hx, pcy - hy) + 240 });
        st.spawnBurst(g.x, g.y, '#6b5a48', 16, 0, -1);
        st.spawnRing(g.x, g.y - 6, 10, 46 * g.scale, 'rgba(120,104,88,0.6)', 5, 420);
        // 抜けた跡: 暗い土の穴がしばらく残る(ほとんど広がらず、ゆっくり薄れる・クリエイティブ監査#3)。
        st.spawnRing(g.x, g.y - 3, 15 * g.scale, 19 * g.scale, 'rgba(34,26,20,0.6)', 11, 3200);
        const gg = wraithSfxGain(g.x, g.y, pcx, pcy);
        // 石が地面から抜ける低い音。1つ目から5つ目へ少しずつ高くなる(緊張を積む・クリエイティブ監査#17)。
        if (gg > 0.01) playSfx('anchor-plant', 0.55 * gg, undefined, 0.55 + 0.07 * (s.curseIdx - 1));
        }
      }
      if (s.curseIdx >= s.curseTotal && t >= (s.curseIdx > 0 ? s.curseLastLift + WRAITH_CURSE_PRE_MS + WRAITH_CURSE_TAIL_MS : WRAITH_POINT_RAISE_MS)) {
        patch.wraithPointLowerAt = gt;
      }
    }
  }

  if (s.flingLandAt !== null && gt >= s.flingLandAt) {
    s.flingLandAt = null;
    const pl = st.player;
    const g = wraithSfxGain(bx, by, pl.x + pl.width / 2, pl.y + pl.height / 2);
    if (g > 0.01) playSfx('heavy-impact', 0.6 * g, undefined, 0.8); // 雑魚が囲みに着いた重い音(1回だけ)
  }

  // ワープを始める(消える所と現れる所に霧・低い風の音)。dst=現れる所(霧を先に溜める)。
  const startWarp = (dst: { x: number; y: number }): void => {
    patch.wraithWarpOutAt = gt; patch.wraithPhased = true;
    s.lastWarpAt = gt; s.warpMoved = false;
    const pl = st.player;
    const g = wraithSfxGain(bx, by, pl.x + pl.width / 2, pl.y + pl.height / 2);
    if (g > 0.01) playSfx('hurricane', 0.35 * g, undefined, 0.7); // 低い風が抜ける音
    // 霧(派手さの絵): 消える所に大きく広がる灰の霧。現れる所には先に霧を溜める=背後へ回られたと分かる(クリエイティブ監査#2)。
    for (const [x, y] of [[bx, by - 40], [dst.x, dst.y - 40]] as const) {
      st.spawnRing(x, y, 70, 20, 'rgba(176,170,186,0.45)', 26, 1100);
      st.spawnRing(x, y + 20, 30, 110, 'rgba(150,144,160,0.35)', 18, 1300);
      st.spawnBurst(x, y, '#aaa3b4', 16, 0, -1);
    }
  };

  // ---- ワープの抽選(見つけて回っている時だけ・被弾ごと600msに1回・3割・§8 A4) ----
  if (wasAlerted && alerted && !warping && !screaming && !summoning && !s.summonThenFling && !pointing && !collapse && !held && gt - s.lastWarpAt >= WRAITH_WARP_COOLDOWN_MS
    && nowMs - (e.lastHit ?? 0) <= 120 && nowMs - s.lastRollAt >= WRAITH_WARP_ROLL_GAP_MS) {
    s.lastRollAt = nowMs;
    if (Math.random() < WRAITH_WARP_CHANCE) { startWarp(wraithOppositePoint(tgt.x, tgt.y, bx, by)); warping = true; } // 同じフレームで叫びの溜めに入らない(品質監査 A3)
  }

  // ---- 望む向き・速さ ----
  const pv = Math.hypot(st.player.vx ?? 0, st.player.vy ?? 0);
  let vmax = alerted ? WRAITH_ORBIT_SPEED + Math.min(pv, PLAYER_BASE_SPEED * GAME_SPEED * 1.5) : WRAITH_PATROL_SPEED;
  let wantH = s.heading, wantS = 0;
  if (collapse || held || screaming || summoning || pointing || warping) {
    wantS = 0;
  } else if (alerted) {
    if (gt >= s.nextReverseAt) { s.orbitDir = s.orbitDir === 1 ? -1 : 1; s.nextReverseAt = gt + rand(WRAITH_REVERSE_MIN_MS, WRAITH_REVERSE_MAX_MS); }
    const wantScream = s.nextScreamAt !== null && gt >= s.nextScreamAt && onScreen && st.player.health > 0;
    if (wantScream) {
      // 叫ぶ前に慣性で止まる(円の中心を動かさない)。止まり切ったら溜めに入る。
      wantS = 0;
      // 止まり切って、髪がまとまったコマ(浮遊の0〜1・15)に来たら溜めに入る=浮遊から叫びの0コマ目へ切り替わる時に髪が跳ばない(クリエイティブ監査#9)。
      const ff = wraithFloatFrame(gt, e.wraithPhase ?? 0);
      if (s.speed < vmax * ASTRO_STOPPED_FRAC && (ff <= 1 || ff === WRAITH_FLOAT_FRAMES - 1)) {
        // 今使える技から1つ(同じ技を続けない・§11)。
        const pl0 = st.player;
        const pcx0 = pl0.x + pl0.width / 2, pcy0 = pl0.y + pl0.height / 2;
        const view0 = zoomedViewportBounds(st.camera, st.gameBounds, st.viewZoom);
        const mobs = flingCandidates(e, st.enemies, pcx0, pcy0, gt, nowMs, (x, y) => x >= view0.left && x <= view0.right && y >= view0.top && y <= view0.bottom);
        const graves = pickWraithCurseGraves(st.wraithGrowths, { x: bx, y: e.y + e.height }, { x: pcx0, y: pl0.y + pl0.height }, gt,
          (x, y) => x >= view0.left && x <= view0.right && y >= view0.top && y <= view0.bottom);
        // 召喚(§15): 指差しの番で画面の敵が3体以下なら、先にコウモリを呼ぶ=敵が少なくても指差しを選べる。
        // 呼んだ直後の番(summonThenFling)はもう呼ばない(呼んだのに飛ばせない時は指差しをしない)。
        const thenFling = s.summonThenFling;
        s.summonThenFling = false;
        const screenFoes = st.enemies.filter(m => m.id !== e.id && !isCorpse(m) && m.health > 0 && !m.dormant
          && m.x + m.width / 2 >= view0.left && m.x + m.width / 2 <= view0.right && m.y + m.height / 2 >= view0.top && m.y + m.height / 2 <= view0.bottom).length;
        const canSummon = !thenFling && (FORCE_SKILL === 'summon' || screenFoes <= WRAITH_SUMMON_SCREEN_MAX);
        const flingNow = mobs.length >= WRAITH_FLING_MIN;
        const can = { fling: flingNow || canSummon, curse: graves.length > 0 };
        // ピンチ(体力が半分以下)は台本: 指差し → 後ろへ回り込むワープ → 呪い(§13・社長指示2026-10-30)。それ以外は今使える技から1つ。
        const pinch = !FORCE_SKILL && isWraithPinch(e.health, e.maxHealth);
        let skill: WraithSkill | 'warp' | 'summon' | null;
        if (pinch) {
          const nx = wraithPinchNext(s.pinchStep, can);
          s.pinchStep = nx.next;
          skill = nx.action;
          s.pinchChain = nx.next !== 0; // 締めの手(呪い/叫び)の後は普段の間隔
        } else if (thenFling) {
          // 呼んだ直後: 選び直さずに指差し。飛ばせる雑魚が2体未満なら指差しはせず普段の間隔へ。
          s.pinchChain = false; s.pinchStep = 0;
          skill = flingNow ? 'fling' : null;
        } else {
          s.pinchChain = false; s.pinchStep = 0;
          const force = FORCE_SKILL === 'summon' ? 'fling' : FORCE_SKILL;
          skill = force && (force === 'scream' || can[force]) ? force : pickWraithSkill(can, s.lastSkill, Math.random);
        }
        if (skill === 'fling' && canSummon && (FORCE_SKILL === 'summon' || screenFoes <= WRAITH_SUMMON_SCREEN_MAX)) {
          skill = 'summon';
          if (pinch) { s.pinchStep = 0; s.pinchChain = true; } // 台本の段は指差しが実際に出た時に進む
        }
        if (skill === 'warp' || skill === null) { /* 記録しない */ } else s.lastSkill = skill === 'summon' ? 'fling' : skill;
        if (skill === null) {
          s.nextScreamAt = gt + skillGapMs();
        } else if (skill === 'summon') {
          patch.wraithSummonAt = gt; s.summonHit = false; s.summonThenFling = true; s.nextScreamAt = null;
          // 溜めの始まりは叫びと同じ(冷たい息を吸い込む音と、頭の高さへ縮んでいく靄)。
          const g = wraithSfxGain(bx, by, pcx0, pcy0);
          if (g > 0.01) playSfx('hurricane', 0.3 * g, undefined, 0.45);
          st.spawnRing(bx, by - WRAITH_HEAD_Y_PX, 150, 14, 'rgba(196,186,214,0.5)', 10, WRAITH_SCREAM_WINDUP_MS);
          // 置き場所を今決め、溜めの間そこに灰色の靄を溜める=叫びではなく「呼ぶ」技だと場所ごと分かる(クリエイティブ監査#7)。
          // 置ける所=実際に映る範囲のうち地平線より下・画面の下端の暗がりより上(CLAUDE.md「Y方向」の表の1行目・監査#2)。
          const rv = renderedViewRect(st.camera.x, st.camera.y, st.gameBounds.width, st.gameBounds.height, st.viewZoom);
          const spots = wraithSummonSpots(pcx0, pcy0, bx, by, { left: rv.left, right: rv.right, top: rv.horizonY + WRAITH_SUMMON_HORIZON_PAD_PX, bottom: rv.bottom - WRAITH_SUMMON_BOTTOM_PAD_PX });
          // 揃えない: 半径と角度に少し揺らぎ(横一列に整列しない・監査#4)。
          s.summonSpots = spots.map(q => {
            const dx = q.x - pcx0, dy = q.y - pcy0, d = Math.hypot(dx, dy) + rand(-24, 24), a = Math.atan2(dy, dx) + rand(-0.14, 0.14);
            return { x: pcx0 + Math.cos(a) * d, y: pcy0 + Math.sin(a) * d };
          });
          for (const q of s.summonSpots) {
            st.spawnRing(q.x, q.y + 20, 90, 22, 'rgba(150,144,160,0.4)', 18, WRAITH_SCREAM_WINDUP_MS);
            st.spawnRing(q.x, q.y + 20, 50, 10, 'rgba(120,114,132,0.35)', 12, WRAITH_SCREAM_WINDUP_MS * 0.8);
          }
        } else if (skill === 'warp') {
          // 後ろへ回り込む(現れる所=プレイヤーの向いている側の反対の周回の上)。向きが無ければ今の位置の反対側。
          const face = pl0.lastDirection ?? { x: 0, y: 0 };
          const dst = wraithBehindPoint(pcx0, pcy0, face.x, face.y) ?? wraithOppositePoint(tgt.x, tgt.y, bx, by);
          startWarp(dst);
          s.warpBehind = true; s.nextScreamAt = null;
        } else if (skill !== 'scream') {
          patch.wraithPointAt = gt; patch.wraithPointKind = skill; patch.wraithPointLowerAt = undefined; s.nextScreamAt = null;
          s.flingDone = false; s.flingIds = skill === 'fling' ? mobs.map(m => m.id) : [];
          s.curseTotal = skill === 'curse' ? Math.min(WRAITH_CURSE_MAX, graves.length) : 0; s.curseIdx = 0; s.curseLastLift = 0;
          // 合図(雑魚の足元の靄・次の墓石の印)は指している間に順に出す(上の指差しの処理)。
          s.flingMarked = 0; s.curseMarkFor = -1; s.curseMarkId = null; s.flingLandAt = null;
          // 指差し・呪いの始まりは塊(変異体)の登場の音(社長指示2026-10-29)=叫び・ワープ(風)と耳で分かれる。
          const g0 = wraithSfxGain(bx, by, pcx0, pcy0);
          if (g0 > 0.01) playSfx('crawler-appear', 0.8 * g0);
        } else {
          if (s.pinchChain) s.pinchChain = false;
          patch.wraithScreamAt = gt; s.screamHit = false;
          // 溜めの始まり: 冷たい息を吸い込む音と、頭の高さへ縮んでいく靄(口の開きを見る前に「来る」が分かる・クリエイティブ監査#5/#6)。
          const pl = st.player;
          const g = wraithSfxGain(bx, by, pl.x + pl.width / 2, pl.y + pl.height / 2);
          if (g > 0.01) playSfx('hurricane', 0.3 * g, undefined, 0.45);
          st.spawnRing(bx, by - WRAITH_HEAD_Y_PX, 150, 14, 'rgba(196,186,214,0.5)', 10, WRAITH_SCREAM_WINDUP_MS);
        }
      }
    } else {
      const q = wraithOrbitTarget(tgt.x, tgt.y, bx, by, s.orbitDir, dt * 1000);
      wantH = Math.atan2(q.y - by, q.x - bx);
      wantS = vmax;
    }
  } else if (e.astroRingR !== undefined) {
    // 対策室・ボス戦テスト: 置いた場所を下端にした小さな輪を回る(宇宙飛行群と同じ)。
    const cx = e.astroRingCx ?? bx, cy = e.astroRingCy ?? by, R = e.astroRingR;
    const a = Math.atan2(by - cy, bx - cx) - 0.5;
    wantH = Math.atan2(cy + Math.sin(a) * R - by, cx + Math.cos(a) * R - bx);
    wantS = vmax;
  } else {
    if (s.pois.length === 0) s.pois = astroRunPois();
    if (s.resting) {
      if (s.restUntil === null) s.restUntil = gt + rand(ASTRO_REST_MIN_MS, ASTRO_REST_MAX_MS);
      if (gt >= s.restUntil) {
        s.resting = false; s.restUntil = null;
        s.prevPoi = s.poiIdx; s.poiIdx = pickAstroPoi(s.pois.length, s.prevPoi, Math.random);
        s.stuckAt = gt; s.stuckD = Infinity;
      }
    } else {
      if (s.poiIdx === null) { s.poiIdx = pickAstroPoi(s.pois.length, s.prevPoi, Math.random); s.stuckAt = gt; s.stuckD = Infinity; }
      const p = s.pois[s.poiIdx];
      const d = Math.hypot(p.x - bx, p.y - by);
      if (d <= ASTRO_ARRIVE_PX) { s.resting = true; s.restUntil = null; }
      else {
        wantH = Math.atan2(p.y - by, p.x - bx);
        wantS = astroArriveSpeed(Math.max(0, d - ASTRO_ARRIVE_PX * 0.5), vmax);
        if (s.stuckD === Infinity) { s.stuckD = d; s.stuckAt = gt; }
        else if (gt - s.stuckAt >= ASTRO_STUCK_MS) {
          if (s.stuckD - d < ASTRO_STUCK_PX) { s.prevPoi = s.poiIdx; s.poiIdx = pickAstroPoi(s.pois.length, s.prevPoi, Math.random); s.stuckD = Infinity; }
          else s.stuckD = d;
          s.stuckAt = gt;
        }
      }
    }
  }
  if (collapse || held) { s.speed = Math.max(0, s.speed - vmax * 3 * dt); vmax = Math.max(vmax, 1); }

  // ---- 慣性つきの速さ(宇宙飛行群と同じ式 stepAstroVelocity=最高速までおよそ0.9秒・止まるまでおよそ1.2秒) ----
  const v = stepAstroVelocity({ heading: s.heading, speed: s.speed }, { heading: wantH, speed: wantS }, vmax, dt);
  s.heading = v.heading; s.speed = v.speed;

  // ---- 動く(障害物 → 行ける帯。まっすぐ進めない時は斜めへ逸れる) ----
  if (s.speed > 0.01 && patch.x === undefined) {
    const step = s.speed * dt;
    const ux = Math.cos(s.heading), uy = Math.sin(s.heading);
    let p = placeAt(e, bx + ux * step, by + uy * step);
    const gain = (q: { x: number; y: number }) => (q.x + e.width / 2 - bx) * ux + (q.y + e.height / 2 - by) * uy;
    if (gain(p) < step * 0.35) {
      for (const deg of [40, -40, 75, -75]) {
        const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
        const rx = ux * ca - uy * sa, ry = ux * sa + uy * ca;
        const c = placeAt(e, bx + rx * step, by + ry * step);
        if (Math.hypot(c.x + e.width / 2 - bx, c.y + e.height / 2 - by) > step * 0.6) { p = c; break; }
      }
    }
    Object.assign(patch, p, { vx: ux * s.speed, vy: uy * s.speed });
  } else if (patch.x === undefined && (e.vx !== 0 || e.vy !== 0)) {
    Object.assign(patch, { vx: 0, vy: 0 });
  }

  // 裾から薄い靄の尾(速く回っている間・派手さの絵=判定なし・クリエイティブ監査#16)。
  if (s.speed > 110 && !warping && gt - s.lastTrailAt >= 140 && onScreen) {
    s.lastTrailAt = gt;
    st.spawnBurst(bx - Math.cos(s.heading) * 16, by - 10, '#b9b2c2', 3, 0, -1);
  }

  // ---- 向き(見つけている間は相手の方・巡回中は進む向き) ----
  if (alerted) patch.heroFaceX = bossFaceWant(((e.heroFaceX ?? -1) >= 0 ? 1 : -1), bx, tgt.x, bossFaceDeadzonePx(e.width));
  else if (s.speed > 5 && Math.abs(Math.cos(s.heading)) >= 0.3) patch.heroFaceX = Math.cos(s.heading) >= 0 ? 1 : -1;

  if (Object.keys(patch).length > 0) {
    useGameStore.setState(st2 => ({ enemies: st2.enemies.map(en => (en.id === e.id ? { ...en, ...patch } : en)) }));
  }
};

/** 倒れた/消えた: 制御の記憶を空にする(次の個体を最初から)。 */
export const releaseWraithOwner = (s: WraithTickState): void => {
  if (s.activeId === null) return;
  const e = useGameStore.getState().enemies.find(en => en.id === s.activeId);
  if (e && !isCorpse(e) && e.health > 0) return;
  Object.assign(s, createWraithTickState());
};

// ---- 近づくと地面から生えてくる物(§9) ----
const growthState: WraithGrowthState = { nextAt: 0, seq: 0, lastSinkAt: -1e9 };
let growthLastGt = 0;
/** 亡霊の近くに墓石と花を生やす(毎フレーム)。伸び切った墓石は壁(world/wraithGraves へ写す)。 */
export const runWraithGrowths = (gt: number): void => {
  if (gt < growthLastGt) { growthState.nextAt = 0; growthState.lastSinkAt = -1e9; } // ランを跨いだ
  growthLastGt = gt;
  const st = useGameStore.getState();
  const w = pickActiveWraith(st.enemies);
  if (!w && st.wraithGrowths.length === 0) { if (wraithGraveRects().length > 0) setWraithGraveRects([]); return; }
  const p = st.player;
  const pc = { x: p.x + p.width / 2, y: p.y + p.height };
  const view = zoomedViewportBounds(st.camera, st.gameBounds, st.viewZoom);
  // 生やしてよい所: 立てる所(既存の障害物に埋まらない)・敵の足元の上でない。
  const canPlace = (x: number, y: number): boolean => {
    const r = resolveBountyMove(x - 20, y - 16, { width: 40, height: 16 });
    if (Math.hypot(r.x - (x - 20), r.y - (y - 16)) >= 2) return false;
    return !st.enemies.some(e => !isCorpse(e) && Math.abs(e.x + e.width / 2 - x) < e.width / 2 + 30 && Math.abs(e.y + e.height - y) < 40);
  };
  const next = wraithGrowthStep(st.wraithGrowths, w ? { x: w.x + w.width / 2, y: w.y + w.height } : null, pc, view, canPlace, gt, Math.random, growthState);
  if (next !== st.wraithGrowths) {
    const old = new Set(st.wraithGrowths.map(g => g.id));
    for (const g of next) {
      if (old.has(g.id)) continue;
      // 生えた所に土が散る(派手さの絵・判定なし)。墓石は重いので多め。
      st.spawnBurst(g.x, g.y, '#6b5a48', isWraithGrave(g.variant) ? 14 : 8, 0, -1);
    }
    useGameStore.setState({ wraithGrowths: next });
  }
  const solids = wraithGraveSolids(next, gt);
  const prev = wraithGraveRects();
  if (solids.length !== prev.length || solids.some((r, i) => r.x !== prev[i].x || r.y !== prev[i].y)) setWraithGraveRects(solids);
};

// ---- 呪いの墓石の後始末と飛ぶ間の粒(§11・クリエイティブ監査#6/#18) ----
let graveTrailAt = -1e9;
/**
 * 毎フレーム: 飛んでいる墓石は土くれと苔色の粒を後ろへこぼす(間引き)。
 * 持ち主の亡霊が倒れたら、浮いていた墓石・飛んでいた墓石は落ちて砕ける(1フレームで消さない)。
 */
export const runWraithGraveFx = (gt: number): void => {
  const st = useGameStore.getState();
  const graves = st.skadiIceBlades.filter(b => b.visual === 'grave');
  if (graves.length === 0) return;
  const dead = new Set(st.enemies.filter(en => en.type === 'mutant-wraith' && (isCorpse(en) || !(en.health > 0))).map(en => en.id));
  const gone = graves.filter(b => dead.has(b.enemyId));
  if (gone.length > 0) {
    for (const b of gone) {
      const gy = b.y + WRAITH_CURSE_HOVER_PX;
      st.spawnBurst(b.x, gy - 10, '#a8a29e', 14, 0, 1);
      st.spawnBurst(b.x, gy, '#6b5a48', 10, 0, -1);
      st.spawnRing(b.x, gy - 4, 10, 44, 'rgba(150,140,130,0.6)', 5, 420);
    }
    const ids = new Set(gone.map(b => b.id));
    useGameStore.setState(s2 => ({ skadiIceBlades: s2.skadiIceBlades.filter(b => !ids.has(b.id)) }));
  }
  if (gt - graveTrailAt >= 80 || gt < graveTrailAt) {
    graveTrailAt = gt;
    for (const b of graves) {
      if (!b.launched || dead.has(b.enemyId)) continue;
      const l = Math.hypot(b.vx, b.vy) || 1;
      const tx = b.x - (b.vx / l) * 22, ty = b.y - (b.vy / l) * 22;
      st.spawnBurst(tx, ty, Math.random() < 0.6 ? '#6b5a48' : '#4d5a40', 3 + Math.floor(Math.random() * 3), 0, 1);
    }
  }
};
