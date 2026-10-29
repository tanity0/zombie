// 亡霊(変異体)の1フレーム(research/WRAITH_MUTANT.md)。useGameLoop が毎フレーム呼ぶ。
// 移動は宇宙飛行群と同じく行ける帯(clampRectToPlayableArea)だけを通す(`placeAt`・浮いている=障害物は透き通る・§9)。
import type { Enemy } from '../types/game';
import { useGameStore, PLAYER_BASE_SPEED, resolveBountyMove, type PumpkinBlast } from '../store/gameStore';
import { setWraithGraveRects, wraithGraveRects } from '../world/wraithGraves';
import { GAME_SPEED } from '../config/gameSpeed';
import { isCorpse } from './enemyUtils';
import { isPointInZoomedViewport, zoomedViewportBounds } from './cameraZoom';
import { playSfx } from '../audio/audioManager';
import { npcSfxDistGain } from './npcSfx';
import { bossFaceWant, bossFaceDeadzonePx } from './bossFacing';
import { FRONT_SIGHT_LOSE_PX } from './frontSight';
import { placeAt, nearestTarget, astroRunPois } from './astroTick';
import {
  stepAstroVelocity, astroArriveSpeed, pickAstroPoi, ASTRO_HIT_ALERT_MS, ASTRO_LOSE_MS, ASTRO_ARRIVE_PX,
  ASTRO_STUCK_MS, ASTRO_STUCK_PX, ASTRO_REST_MIN_MS, ASTRO_REST_MAX_MS, ASTRO_STOPPED_FRAC, type AstroPoi,
} from './astroScript';
import {
  WRAITH_PATROL_SPEED, WRAITH_ORBIT_SPEED, WRAITH_REVERSE_MIN_MS, WRAITH_REVERSE_MAX_MS, wraithOrbitTarget, wraithOppositePoint,
  wraithOrbitAngle, wraithOrbitPoint, WRAITH_WARP_CHANCE, WRAITH_WARP_COOLDOWN_MS, WRAITH_WARP_ROLL_GAP_MS, wraithWarpState,
  wraithGrowthStep, wraithGraveSolids, isWraithGrave, type WraithGrowthState,
  WRAITH_SCREAM_WINDUP_MS, WRAITH_SCREAM_HOLD_MS, WRAITH_HEAD_Y_PX, wraithFloatFrame, WRAITH_FLOAT_FRAMES, WRAITH_SCREAM_RADIUS, WRAITH_SCREAM_DAMAGE, WRAITH_SCREAM_GAP_MIN_MS, WRAITH_SCREAM_GAP_MAX_MS,
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
}
export const createWraithTickState = (): WraithTickState => ({
  activeId: null, heading: 0, speed: 0, pois: [], poiIdx: null, prevPoi: null, resting: false, restUntil: null,
  stuckAt: 0, stuckD: Infinity, lostSince: null, orbitDir: 1, nextReverseAt: 0, nextScreamAt: null, screamHit: false,
  lastRollAt: -1e9, lastWarpAt: -1e9, warpMoved: true, screamHitAt: -1e9, screamEchoes: 0, lastTrailAt: -1e9,
});

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

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
    s.nextScreamAt = gt + rand(WRAITH_SCREAM_GAP_MIN_MS, WRAITH_SCREAM_GAP_MAX_MS);
  }
  if (!alerted && wasAlerted) { s.stuckAt = gt; s.stuckD = Infinity; s.nextScreamAt = null; }

  // ---- ワープ(消える250ms→体を反対側へ→現れる250ms・その間は当たらない・§8 A3) ----
  const ws = wraithWarpState(gt, e.wraithWarpOutAt);
  if (ws.phased !== !!e.wraithPhased) patch.wraithPhased = ws.phased;
  if (ws.moveNow && !s.warpMoved) {
    s.warpMoved = true;
    const pl = st.player;
    const cx = alerted ? tgt.x : pl.x + pl.width / 2, cy = alerted ? tgt.y : pl.y + pl.height / 2;
    const q = passableOnOrbit(e, cx, cy, wraithOppositePoint(cx, cy, bx, by));
    Object.assign(patch, q, { vx: 0, vy: 0 });
    s.speed = 0;
  }
  if (ws.done && e.wraithWarpOutAt !== undefined) patch.wraithWarpOutAt = undefined;
  let warping = !ws.done;

  // ---- 叫び(紫=弾けない・溜めの始まりに予告が出て、溜め明けの瞬間に当たる・§4) ----
  let screaming = e.wraithScreamAt !== undefined;
  if (screaming) {
    const t = gt - (e.wraithScreamAt as number);
    if ((collapse || held) && !s.screamHit) {
      // 溜めの途中で崩された=叫びは消え、予告も消える(紫が残って当たらない、を作らない)。
      patch.wraithScreamAt = undefined; screaming = false;
      s.nextScreamAt = gt + rand(WRAITH_SCREAM_GAP_MIN_MS, WRAITH_SCREAM_GAP_MAX_MS);
    } else if (t >= WRAITH_SCREAM_WINDUP_MS && !s.screamHit) {
      s.screamHit = true;
      const blast: PumpkinBlast = { x: bx, y: by, radius: WRAITH_SCREAM_RADIUS, damage: WRAITH_SCREAM_DAMAGE, enemyId: e.id, moveKey: 'wraith-scream', noParry: true };
      useGameStore.setState(s2 => ({ pumpkinBlasts: [...s2.pumpkinBlasts, blast] }));
      const pl = st.player;
      const g = npcSfxDistGain(bx, by, pl.x + pl.width / 2, pl.y + pl.height / 2, st.camera, st.gameBounds);
      if (g > 0.01) { playSfx('screamer-cry', 0.9 * g, undefined, 0.72); playSfx('hurricane', 0.35 * g, undefined, 0.5); }
      if (onScreen) st.triggerShake(700, 16); // カウンターできない範囲技=重く揺らす(クリエイティブ監査#11)
      // 声の出どころ=頭の高さから広がる輪と、影を落とさない淡い光(声は光源ではない=投影影なし・クリエイティブ監査#6/#12)。
      st.spawnRing(bx, by - WRAITH_HEAD_Y_PX, 10, WRAITH_SCREAM_RADIUS * 0.9, 'rgba(226,214,244,0.8)', 8, 520);
      st.spawnGlow(bx, by - WRAITH_HEAD_Y_PX * 0.5, WRAITH_SCREAM_RADIUS * 1.1, 'rgba(176,150,220,', 520, true);
      s.screamHitAt = gt; s.screamEchoes = 0;
    } else if (t >= WRAITH_SCREAM_WINDUP_MS + WRAITH_SCREAM_HOLD_MS) {
      patch.wraithScreamAt = undefined; screaming = false;
      patch.wraithPhase = -gt; // 浮遊へ戻る時は髪のまとまった0コマ目から(でたらめな位相へ跳ばない)
      s.nextScreamAt = gt + rand(WRAITH_SCREAM_GAP_MIN_MS, WRAITH_SCREAM_GAP_MAX_MS);
    }
  }

  // 叫び続けている間の追い打ちの輪(時間をずらす=1つの型を押したように見せない・クリエイティブ監査#10)。
  if (screaming && s.screamHit && s.screamEchoes < 2) {
    const since = gt - s.screamHitAt;
    if (s.screamEchoes === 0 && since >= 90) { s.screamEchoes = 1; st.spawnRing(bx, by, 40, WRAITH_SCREAM_RADIUS * 1.2, 'rgba(214,206,226,0.7)', 5, 860); }
    else if (s.screamEchoes === 1 && since >= 230) { s.screamEchoes = 2; st.spawnRing(bx, by - WRAITH_HEAD_Y_PX * 0.5, 20, WRAITH_SCREAM_RADIUS * 1.05, 'rgba(150,120,200,0.65)', 9, 480); }
  }

  // ---- ワープの抽選(見つけて回っている時だけ・被弾ごと600msに1回・3割・§8 A4) ----
  if (wasAlerted && alerted && !warping && !screaming && !collapse && !held && gt - s.lastWarpAt >= WRAITH_WARP_COOLDOWN_MS
    && nowMs - (e.lastHit ?? 0) <= 120 && nowMs - s.lastRollAt >= WRAITH_WARP_ROLL_GAP_MS) {
    s.lastRollAt = nowMs;
    if (Math.random() < WRAITH_WARP_CHANCE) {
      patch.wraithWarpOutAt = gt; patch.wraithPhased = true;
      s.lastWarpAt = gt; s.warpMoved = false;
      warping = true; // 同じフレームで叫びの溜めに入らない(品質監査 A3)
      const pl = st.player;
      const g = npcSfxDistGain(bx, by, pl.x + pl.width / 2, pl.y + pl.height / 2, st.camera, st.gameBounds);
      if (g > 0.01) playSfx('hurricane', 0.35 * g, undefined, 0.7); // 低い風が抜ける音
      // 霧(派手さの絵): 消える所に大きく広がる灰の霧。現れる所には先に霧を溜める=背後へ回られたと分かる(クリエイティブ監査#2)。
      const cx = tgt.x, cy = tgt.y;
      const dst = wraithOppositePoint(cx, cy, bx, by);
      for (const [x, y] of [[bx, by - 40], [dst.x, dst.y - 40]] as const) {
        st.spawnRing(x, y, 70, 20, 'rgba(176,170,186,0.45)', 26, 1100);
        st.spawnRing(x, y + 20, 30, 110, 'rgba(150,144,160,0.35)', 18, 1300);
        st.spawnBurst(x, y, '#aaa3b4', 16, 0, -1);
      }
    }
  }

  // ---- 望む向き・速さ ----
  const pv = Math.hypot(st.player.vx ?? 0, st.player.vy ?? 0);
  let vmax = alerted ? WRAITH_ORBIT_SPEED + Math.min(pv, PLAYER_BASE_SPEED * GAME_SPEED * 1.5) : WRAITH_PATROL_SPEED;
  let wantH = s.heading, wantS = 0;
  if (collapse || held || screaming || warping) {
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
        patch.wraithScreamAt = gt; s.screamHit = false;
        // 溜めの始まり: 冷たい息を吸い込む音と、頭の高さへ縮んでいく靄(口の開きを見る前に「来る」が分かる・クリエイティブ監査#5/#6)。
        const pl = st.player;
        const g = npcSfxDistGain(bx, by, pl.x + pl.width / 2, pl.y + pl.height / 2, st.camera, st.gameBounds);
        if (g > 0.01) playSfx('hurricane', 0.3 * g, undefined, 0.45);
        st.spawnRing(bx, by - WRAITH_HEAD_Y_PX, 150, 14, 'rgba(196,186,214,0.5)', 10, WRAITH_SCREAM_WINDUP_MS);
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
