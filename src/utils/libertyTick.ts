// 解放軍群(変異)のコントローラ(research/LIBERTY_HORDE.md)。useGameLoop が毎フレーム1回呼ぶ。
// 流儀は英雄(heroTick)と同じ「store を読んで patch を書く」。旗手と、列に並ぶ/戻るバット男を動かすのはここだけ
// (updateEnemies は旗手と isHordeFollower を素通り)。向かっていく(chase)バット男は通常AIへ任せる。
//
// 掟:
//  - 移動は必ず ①障害物(resolveBountyMove)→ ②行ける帯(clampRectToPlayableArea)の順で通す。
//  - 旗手は自分では攻撃しない。叫ぶのは画面に入っている時だけ(見つける条件に「画面内」を含む)。
import type { Enemy } from '../types/game';
import { useGameStore, resolveBountyMove, SCREAMER_WINDUP_MS, SCREAMER_BUFF_MS, screamerWindupFx, screamerCryFx } from '../store/gameStore';
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import { isCorpse, spawnEnemyAtWithTier } from './enemyUtils';
import { isPointInZoomedViewport } from './cameraZoom';
import { HERO_AGGRO_RANGE, HERO_PATROL_SPEED, heroPatrolNext } from './heroScript';
import { HERO_PATROL_DETOUR_PX, HERO_PATROL_DETOUR_MS } from './heroTick';
import {
  LIB_ESCORTS, LIB_SLOT_GAP_PX, LIB_TRAIL_STEP_PX, LIB_TRAIL_MAX, LIB_LOSE_RANGE_MULT, LIB_LOSE_MS,
  LIB_RETURN_SPEED, LIB_RETURN_ARRIVE_PX, LIB_REFILL_BEHIND_PX, trailPointAt, maleBatId,
} from './libertyScript';

export interface LibertyTickState {
  activeId: string | null;
  trail: { x: number; y: number }[];
  lostSince: number | null;
  stallRefAt: number; stallRefAng: number; stallRefX: number; stallRefY: number;
  detourR: number; detourUntil: number;
}
export const createLibertyTickState = (): LibertyTickState => ({
  activeId: null, trail: [], lostSince: null,
  stallRefAt: -1e9, stallRefAng: 0, stallRefX: 0, stallRefY: 0, detourR: 0, detourUntil: 0,
});

const playCtx = (): PlayableAreaCtx => {
  const st0 = useGameStore.getState();
  return {
    farBackdrop: st0.farBackdrop,
    labTheme: st0.stageTheme === 'lab' && !st0.indoorMode,
    corridorMode: st0.corridorMode,
    m0AdvanceLimitX: st0.m0AdvanceLimitX,
    corridorRunInActive: st0.corridorRunInActive,
  };
};
/** 中心座標を、その体が立てる左上座標へ(①障害物 → ②行ける帯)。 */
const placeAt = (e: Enemy, cx: number, cy: number): { x: number; y: number } => {
  const c = resolveBountyMove(cx - e.width / 2, cy - e.height / 2, { width: e.width, height: e.height });
  return clampRectToPlayableArea(c.x, c.y, e.width, e.height, playCtx());
};

const isFrozen = (e: Enemy, gt: number, nowMs: number): boolean =>
  (e.bossFullStunUntil !== undefined && gt < e.bossFullStunUntil)
  || (e.stunUntil !== undefined && gt < e.stunUntil)
  || (e.rootUntil !== undefined && gt < e.rootUntil)
  || (e.liftUntil !== undefined && nowMs < e.liftUntil)
  || (e.knockbackUntil !== undefined && nowMs < e.knockbackUntil);

/** 旗手のいちばん近い見つける相手(プレイヤー/守護霊)。画面内で、索敵範囲の中にいる者だけ。 */
const sightDist = (bx: number, by: number): number => {
  const st = useGameStore.getState();
  const vis = (x: number, y: number) => isPointInZoomedViewport(x, y, st.camera, st.gameBounds, st.viewZoom);
  let best = Infinity;
  const p = st.player;
  if (p.health > 0) {
    const px = p.x + p.width / 2, py = p.y + p.height / 2;
    if (vis(px, py)) best = Math.min(best, Math.hypot(px - bx, py - by));
  }
  const g = st.summons.find(s => s.kind === 'ghost-ally');
  if (g) {
    const gx = g.x + g.width / 2, gy = g.y + g.height / 2;
    if (vis(gx, gy)) best = Math.min(best, Math.hypot(gx - bx, gy - by));
  }
  return best;
};

/** 取り巻きのバット男を1体作る(赤レア・男の見た目・旗手のIDを持つ)。 */
export const makeHordeBat = (leader: Enemy, slot: number, x: number, y: number, gt: number, refill: boolean, chase: boolean): Enemy => {
  const b = spawnEnemyAtWithTier('bat', 0, 0, gt, 'red');
  const id = maleBatId(b.id);
  return {
    ...b, id,
    x: x - b.width / 2, y: y - b.height / 2,
    dormant: false,
    fixed: true, // 上限の間引き・距離の回収・イベントの一掃で消さない(別カウント・LIBERTY_HORDE §6)
    hordeLeaderId: leader.id, hordeSlot: slot, hordeRefill: refill,
    hordeState: chase ? 'chase' : 'follow',
  };
};

/**
 * 旗手1体ぶんの1フレーム。
 */
export const runLibertyTick = (bearer: Enemy, s: LibertyTickState, gt: number, dt: number, nowMs: number): void => {
  if (s.activeId !== bearer.id) Object.assign(s, createLibertyTickState(), { activeId: bearer.id });
  const st = useGameStore.getState();
  const player = st.player;
  const pcx = player.x + player.width / 2;
  const bx = bearer.x + bearer.width / 2, by = bearer.y + bearer.height / 2;
  const patch: Partial<Enemy> = {};
  const frozen = isFrozen(bearer, gt, nowMs);

  // ---- 足跡(バット男が並ぶ道) ----
  const lastT = s.trail[s.trail.length - 1];
  if (!lastT || Math.hypot(bx - lastT.x, by - lastT.y) >= LIB_TRAIL_STEP_PX) {
    s.trail.push({ x: bx, y: by });
    if (s.trail.length > LIB_TRAIL_MAX) s.trail.shift();
  }

  // ---- 見つける / 見失う ----
  const onScreen = isPointInZoomedViewport(bx, by, st.camera, st.gameBounds, st.viewZoom);
  const d = onScreen ? sightDist(bx, by) : Infinity;
  const wasAlerted = bearer.libAlerted === true;
  let alerted = wasAlerted;
  if (d <= HERO_AGGRO_RANGE) { alerted = true; s.lostSince = null; }
  else if (wasAlerted) {
    if (d > HERO_AGGRO_RANGE * LIB_LOSE_RANGE_MULT || !onScreen) {
      if (s.lostSince === null) s.lostSince = gt;
      if (gt - s.lostSince >= LIB_LOSE_MS) { alerted = false; s.lostSince = null; }
    } else s.lostSince = null;
  }
  if (alerted !== wasAlerted) patch.libAlerted = alerted;

  // ---- 旗手の動き ----
  if (frozen) {
    // 崩し(紫)・気絶の間は止まる。溜めは消える(次の溜めは明けてから=LIBERTY_HORDE §4)。
    Object.assign(patch, { vx: 0, vy: 0 });
    if (bearer.libScreamUntil !== undefined) patch.libScreamUntil = undefined;
  } else if (alerted) {
    // その場に止まり、相手の方を向いて叫ぶ。見つけた瞬間の1回目は無条件で溜めへ(全体で1本のバフに握られない)。
    Object.assign(patch, { vx: 0, vy: 0, heroFaceX: (pcx >= bx ? 1 : -1) as 1 | -1 });
    const screamUntil = bearer.libScreamUntil;
    if (screamUntil !== undefined) {
      if (gt >= screamUntil) {
        patch.libScreamUntil = undefined;
        useGameStore.setState({ screamerBuffUntil: gt + SCREAMER_BUFF_MS });
        screamerCryFx(bx, by - bearer.height);
      }
    } else if (!wasAlerted || gt >= st.screamerBuffUntil) {
      patch.libScreamUntil = gt + SCREAMER_WINDUP_MS;
      screamerWindupFx(bx, by - bearer.height);
    }
  } else {
    if (bearer.libScreamUntil !== undefined) patch.libScreamUntil = undefined;
    if (bearer.libPatrolR !== undefined) {
      // 周回: 英雄と同じ速さ・同じ回り込み(輪の外/内へずらして障害物を抜ける)。
      const R = bearer.libPatrolR;
      const ang = Math.atan2(by, bx);
      const resetRef = () => { s.stallRefAt = gt; s.stallRefAng = ang; s.stallRefX = bx; s.stallRefY = by; };
      if (gt - s.stallRefAt > 2000) resetRef();
      else if (gt - s.stallRefAt >= 800) {
        let adv = s.stallRefAng - ang; adv = Math.atan2(Math.sin(adv), Math.cos(adv));
        const moved = Math.hypot(bx - s.stallRefX, by - s.stallRefY);
        const detouring = gt < s.detourUntil;
        if (detouring ? moved < 10 : adv * R < 15) {
          s.detourR = detouring && s.detourR > 0 ? -HERO_PATROL_DETOUR_PX : HERO_PATROL_DETOUR_PX;
          s.detourUntil = gt + HERO_PATROL_DETOUR_MS;
        }
        resetRef();
      }
      if (gt >= s.detourUntil) s.detourR = 0;
      const nx = heroPatrolNext(bx, by, R + s.detourR, 240);
      const dx = nx.x - bx, dy = nx.y - by, l = Math.hypot(dx, dy) || 1;
      const step = HERO_PATROL_SPEED * dt;
      let p = placeAt(bearer, bx + (dx / l) * step, by + (dy / l) * step);
      // まっすぐ進めない時は斜めへ逸れる(英雄の walkToward と同じ考え方)。
      const gain = (q: { x: number; y: number }) => ((q.x + bearer.width / 2 - bx) * dx + (q.y + bearer.height / 2 - by) * dy) / l;
      if (gain(p) < step * 0.35) {
        for (const deg of [40, -40, 75, -75]) {
          const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
          const rx = (dx / l) * ca - (dy / l) * sa, ry = (dx / l) * sa + (dy / l) * ca;
          const c = placeAt(bearer, bx + rx * step, by + ry * step);
          if (Math.hypot(c.x + bearer.width / 2 - bx, c.y + bearer.height / 2 - by) > step * 0.6) { p = c; break; }
        }
      }
      Object.assign(patch, p, { vx: (dx / l) * HERO_PATROL_SPEED, vy: (dy / l) * HERO_PATROL_SPEED });
      patch.heroFaceX = (dx >= 0 ? 1 : -1) as 1 | -1;
    } else {
      Object.assign(patch, { vx: 0, vy: 0 });
    }
  }

  // ---- 取り巻き(バット男) ----
  const leaderId = bearer.id;
  const faceX = (patch.heroFaceX ?? bearer.heroFaceX ?? -1) as number;
  const headX = (patch.x ?? bearer.x) + bearer.width / 2, headY = (patch.y ?? bearer.y) + bearer.height / 2;
  const mine = st.enemies.filter(e => e.hordeLeaderId === leaderId && !isCorpse(e) && e.health > 0);
  const bySlot = new Map<number, Enemy>();
  for (const e of mine) if (e.hordeSlot !== undefined && !bySlot.has(e.hordeSlot)) bySlot.set(e.hordeSlot, e);
  const updates = new Map<string, Partial<Enemy>>();
  const added: Enemy[] = [];
  // 補充: 欠けた位置へ、旗手の真後ろ(向きの反対側)から出す。見つけている最中なら出た瞬間から向かう。
  for (let slot = 0; slot < LIB_ESCORTS; slot++) {
    if (bySlot.has(slot)) continue;
    added.push(makeHordeBat(bearer, slot, headX - faceX * LIB_REFILL_BEHIND_PX, headY, gt, true, alerted));
  }
  for (const e of mine) {
    const slot = e.hordeSlot ?? 0;
    if (alerted) {
      if (e.hordeState !== 'chase') updates.set(e.id, { hordeState: 'chase' });
      continue;
    }
    const target = trailPointAt(s.trail, { x: headX, y: headY }, (slot + 1) * LIB_SLOT_GAP_PX);
    const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
    if (e.hordeState === 'chase') { updates.set(e.id, { hordeState: 'return' }); continue; }
    if (e.hordeState === 'return') {
      const ddx = target.x - ex, ddy = target.y - ey, dl = Math.hypot(ddx, ddy);
      if (dl <= LIB_RETURN_ARRIVE_PX) { updates.set(e.id, { hordeState: 'follow' }); continue; }
      const step = Math.min(dl, LIB_RETURN_SPEED * dt);
      const p = placeAt(e, ex + (ddx / dl) * step, ey + (ddy / dl) * step);
      updates.set(e.id, { ...p, vx: (ddx / dl) * LIB_RETURN_SPEED, vy: (ddy / dl) * LIB_RETURN_SPEED });
      continue;
    }
    // follow: 足跡の上の自分の位置に立つ(動いた分を速度として持たせ、歩きの絵を送る)。
    const nx = target.x - e.width / 2, ny = target.y - e.height / 2;
    const vx = dt > 0 ? (nx - e.x) / dt : 0, vy = dt > 0 ? (ny - e.y) / dt : 0;
    updates.set(e.id, { x: nx, y: ny, vx, vy });
  }

  useGameStore.setState(stt => ({
    enemies: [
      ...stt.enemies.map(e => (e.id === leaderId ? { ...e, ...patch } : updates.has(e.id) ? { ...e, ...updates.get(e.id)! } : e)),
      ...added,
    ],
  }));
};

/**
 * 旗手が居なくなった(倒れた・消えた)取り巻きを普通の雑魚へ戻す(LIBERTY_HORDE §5)。死体も含めて印を外し、回収・間引きの対象へ戻す。
 * 旗手が生きている間は何もしない(毎フレーム呼んで軽い=取り巻きが居なければ早期に抜ける)。
 */
export const releaseOrphanHorde = (): void => {
  const st = useGameStore.getState();
  let orphan = false;
  const alive = new Set(st.enemies.filter(e => e.type === 'mutant-liberty' && !isCorpse(e) && e.health > 0).map(e => e.id));
  for (const e of st.enemies) if (e.hordeLeaderId !== undefined && !alive.has(e.hordeLeaderId)) { orphan = true; break; }
  if (!orphan) return;
  useGameStore.setState(stt => ({
    enemies: stt.enemies.map(e => (e.hordeLeaderId !== undefined && !alive.has(e.hordeLeaderId)
      ? { ...e, hordeLeaderId: undefined, hordeState: undefined, hordeSlot: undefined, fixed: false }
      : e)),
  }));
};

/** いま場にいる旗手(死体・倒れた個体は除く)。 */
export const pickActiveLiberty = (enemies: readonly Enemy[]): Enemy | undefined =>
  enemies.find(e => e.type === 'mutant-liberty' && !isCorpse(e) && e.health > 0);
