// ハンターの巡回の移動(research/HUNTER_PATROL.md §1)。useGameLoop のハンターの制御が毎フレーム呼ぶ。
// 移動は必ず ①障害物(resolveBountyMove)→ ②行ける帯(clampRectToPlayableArea)の順で通す(解放軍群・宇宙飛行群と同じ)。
import type { Enemy } from '../types/game';
import { useGameStore, resolveBountyMove } from '../store/gameStore';
import { clampRectToPlayableArea } from '../world/playableArea';
import { heroPatrolNext } from './heroScript';
import { HUNTER_PATROL_SPEED, HUNTER_PATROL_ACCEL_S, HUNTER_PATROL_DIR } from './hunterPatrol';

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
 * 輪に沿って1フレーム進める(画面で見て時計回り=英雄と逆・社長指示2026-10-29)。wantSpeed へ慣性つきで寄せる(0なら止まる)。
 * まっすぐ進めない時は斜めへ逸れる。返り値=速さ(呼び手が持ち越す)と、書き込む位置・速度。
 * `towards` を渡すと、輪の巡回ではなくその点へ向かう(拠点解放前の急接近=`hunterRushNext` の点)。
 * ★慣性は**速度の向きごと**に効かせる(監査2026-11-01): 今の速度(vx, vy)から目標の速度へ、1秒あたり
 * 「速い方の速さ ÷ HUNTER_PATROL_ACCEL_S」までしか変えない=向きの反転も、加速・減速と同じ時間をかけて回り込む。
 * 向かう点がある時は、止まり切れる速さまで手前から落とす(着いた瞬間にパッと止まらない)。
 * `speed` は互換のための引数(今の速さは e.vx/e.vy から読む)。
 */
export const stepHunterPatrol = (
  e: Enemy, R: number, _speed: number, wantSpeed: number, dt: number, towards?: { x: number; y: number },
): { speed: number; patch: Partial<Enemy> } => {
  const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
  const vx0 = e.vx ?? 0, vy0 = e.vy ?? 0, v0 = Math.hypot(vx0, vy0);
  const accel = Math.max(HUNTER_PATROL_SPEED, wantSpeed, v0) / HUNTER_PATROL_ACCEL_S; // px/s²
  const nx = towards ?? heroPatrolNext(cx, cy, R, -HUNTER_PATROL_DIR * Math.min(240, R * 0.6)); // 英雄の式は反時計回り=先読みの符号を逆にして時計回り
  const dx = nx.x - cx, dy = nx.y - cy, l = Math.hypot(dx, dy);
  let want = wantSpeed;
  if (towards) want = Math.min(want, Math.sqrt(2 * accel * Math.max(0, l - 1))); // 着く点で止まり切れる速さ
  const ux = l > 1e-6 ? dx / l : 0, uy = l > 1e-6 ? dy / l : 0;
  let dvx = ux * want - vx0, dvy = uy * want - vy0;
  const dv = Math.hypot(dvx, dvy), dvMax = accel * dt;
  if (dv > dvMax) { dvx *= dvMax / dv; dvy *= dvMax / dv; }
  const vx = vx0 + dvx, vy = vy0 + dvy, sp = Math.hypot(vx, vy);
  if (sp < 0.5 && want < 0.5) return { speed: 0, patch: { vx: 0, vy: 0 } };
  const mx = sp > 1e-6 ? vx / sp : 0, my = sp > 1e-6 ? vy / sp : 0;
  const step = sp * dt;
  let p = placeAt(e, cx + vx * dt, cy + vy * dt);
  const gain = (q: { x: number; y: number }) => (q.x + e.width / 2 - cx) * mx + (q.y + e.height / 2 - cy) * my;
  if (gain(p) < step * 0.35) {
    for (const deg of [40, -40, 75, -75]) {
      const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      const rx = mx * ca - my * sa, ry = mx * sa + my * ca;
      const c = placeAt(e, cx + rx * step, cy + ry * step);
      if (Math.hypot(c.x + e.width / 2 - cx, c.y + e.height / 2 - cy) > step * 0.6) { p = c; break; }
    }
  }
  return { speed: sp, patch: { x: p.x, y: p.y, vx, vy } };
};
