// ハンターの巡回の移動(research/HUNTER_PATROL.md §1)。useGameLoop のハンターの制御が毎フレーム呼ぶ。
// 移動は必ず ①障害物(resolveBountyMove)→ ②行ける帯(clampRectToPlayableArea)の順で通す(解放軍群・宇宙飛行群と同じ)。
import type { Enemy } from '../types/game';
import { useGameStore, resolveBountyMove } from '../store/gameStore';
import { clampRectToPlayableArea } from '../world/playableArea';
import { heroPatrolNext } from './heroScript';
import { HUNTER_PATROL_SPEED, HUNTER_PATROL_ACCEL_S } from './hunterPatrol';

const placeAt = (e: Enemy, cx: number, cy: number): { x: number; y: number } => {
  const st = useGameStore.getState();
  const c = resolveBountyMove(cx - e.width / 2, cy - e.height / 2, { width: e.width, height: e.height });
  return clampRectToPlayableArea(c.x, c.y, e.width, e.height, {
    farBackdrop: st.farBackdrop,
    labTheme: st.stageTheme === 'lab' && !st.indoorMode,
    corridorMode: st.corridorMode,
    m0AdvanceLimitX: st.m0AdvanceLimitX,
    corridorRunInActive: st.corridorRunInActive,
  });
};

/**
 * 輪に沿って1フレーム進める(画面で見て反時計回り・英雄と同じ)。wantSpeed へ慣性つきで寄せる(0なら止まる)。
 * まっすぐ進めない時は斜めへ逸れる。返り値=速さ(呼び手が持ち越す)と、書き込む位置・速度。
 */
export const stepHunterPatrol = (
  e: Enemy, R: number, speed: number, wantSpeed: number, dt: number,
): { speed: number; patch: Partial<Enemy> } => {
  const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
  const acc = (HUNTER_PATROL_SPEED / HUNTER_PATROL_ACCEL_S) * dt;
  const sp = wantSpeed > speed ? Math.min(wantSpeed, speed + acc) : Math.max(wantSpeed, speed - acc);
  if (sp <= 0.01) return { speed: 0, patch: { vx: 0, vy: 0 } };
  const nx = heroPatrolNext(cx, cy, R, Math.min(240, R * 0.6));
  const dx = nx.x - cx, dy = nx.y - cy, l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  const step = sp * dt;
  let p = placeAt(e, cx + ux * step, cy + uy * step);
  const gain = (q: { x: number; y: number }) => (q.x + e.width / 2 - cx) * ux + (q.y + e.height / 2 - cy) * uy;
  if (gain(p) < step * 0.35) {
    for (const deg of [40, -40, 75, -75]) {
      const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      const rx = ux * ca - uy * sa, ry = ux * sa + uy * ca;
      const c = placeAt(e, cx + rx * step, cy + ry * step);
      if (Math.hypot(c.x + e.width / 2 - cx, c.y + e.height / 2 - cy) > step * 0.6) { p = c; break; }
    }
  }
  return { speed: sp, patch: { x: p.x, y: p.y, vx: ux * sp, vy: uy * sp } };
};
