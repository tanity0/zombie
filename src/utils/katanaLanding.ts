// 守護霊の刀/小烏丸一閃で、斬撃経路を保ちながら安全な着地点を選ぶ純関数。
// 一閃中は無敵だが、着地直後は硬直するため、敵の接触判定内へ着地するとその場で被弾する。
// 方向候補ごとに「対象へ斬撃が届く」「実際の着地点が全敵の接触矩形から離れている」を確認する。
import { clampRectInsideCircle, type Circle } from '../world/arena';

export interface KatanaLandingRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface KatanaDashTarget {
  id: string;
  centerX: number;
  centerY: number;
  /** triggerKatanaDash の経路命中判定と同じ、生の敵幅。 */
  strikeWidth: number;
}

export interface SafeKatanaDashArgs {
  startX: number;
  startY: number;
  actorWidth: number;
  actorHeight: number;
  dashDistance: number;
  hitHalfWidth: number;
  target: KatanaDashTarget;
  enemyRects: readonly KatanaLandingRect[];
  arena?: Circle;
  clearance?: number;
}

export interface KatanaDashDirection {
  x: number;
  y: number;
}

// 正面を最優先し、少しずつ左右へ振る。正面側に安全地帯が無い時だけ背面側まで探す。
const ANGLE_OFFSETS = [
  0,
  Math.PI / 8, -Math.PI / 8,
  Math.PI / 4, -Math.PI / 4,
  3 * Math.PI / 8, -3 * Math.PI / 8,
  Math.PI / 2, -Math.PI / 2,
  5 * Math.PI / 8, -5 * Math.PI / 8,
  3 * Math.PI / 4, -3 * Math.PI / 4,
  7 * Math.PI / 8, -7 * Math.PI / 8,
  Math.PI,
] as const;

export const KATANA_LANDING_CLEARANCE_PX = 16;

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

/** triggerKatanaDash が対象IDを経路へ積む条件と同じ線分カプセル判定。 */
const pathHitsTarget = (
  startX: number,
  startY: number,
  ux: number,
  uy: number,
  distance: number,
  hitHalfWidth: number,
  target: KatanaDashTarget,
): boolean => {
  const ex = target.centerX - startX;
  const ey = target.centerY - startY;
  const along = ex * ux + ey * uy;
  if (along < -target.strikeWidth / 2 || along > distance + target.strikeWidth / 2) return false;
  const perp = Math.abs(ex * uy - ey * ux);
  return perp <= hitHalfWidth + target.strikeWidth / 2;
};

/**
 * 対象へ一閃を当てつつ安全に着地できる方向。候補が無ければ null を返し、呼び出し側は発動を見送る。
 * arena がある場合は実際の移動処理と同じ円内クランプ後の着地点で安全性を判定する。
 */
export const pickSafeKatanaDashDirection = (args: SafeKatanaDashArgs): KatanaDashDirection | null => {
  const baseX = args.target.centerX - args.startX;
  const baseY = args.target.centerY - args.startY;
  const baseLen = Math.hypot(baseX, baseY);
  if (baseLen < 0.001 || args.dashDistance <= 0) return null;
  const baseAngle = Math.atan2(baseY, baseX);
  const clearance = Math.max(0, args.clearance ?? KATANA_LANDING_CLEARANCE_PX);

  for (const offset of ANGLE_OFFSETS) {
    const angle = baseAngle + offset;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    if (!pathHitsTarget(
      args.startX, args.startY, ux, uy,
      args.dashDistance, args.hitHalfWidth, args.target,
    )) continue;

    const rawLanding = {
      x: args.startX + ux * args.dashDistance - args.actorWidth / 2,
      y: args.startY + uy * args.dashDistance - args.actorHeight / 2,
      width: args.actorWidth,
      height: args.actorHeight,
    };
    const landing = args.arena
      ? { ...rawLanding, ...clampRectInsideCircle(rawLanding, args.arena) }
      : rawLanding;
    const paddedLanding = {
      x: landing.x - clearance,
      y: landing.y - clearance,
      width: landing.width + clearance * 2,
      height: landing.height + clearance * 2,
    };
    if (args.enemyRects.some(enemy => overlaps(paddedLanding, enemy))) continue;
    return { x: ux, y: uy };
  }
  return null;
};
