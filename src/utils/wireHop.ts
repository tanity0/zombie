// ワイヤーアンカー「スラム後ジャンプ離脱(ホップ)」の着地点計算。
// 仕様の正本: DEVELOPMENT_LOG.md v0.25.2487 / research/COUNTER_CRIT_LEDGER.md §8。
// store非依存の純関数(実装精度の規律4: 配線ロジックは純関数に切り出してテストする)。
//
// 発動条件・「対象が生き残った場合のみ」「既存の着地処理を先に全部やってから」等の判断は
// 呼び出し側(useGameLoop.ts)が行う。ここは「着地点はどこか」だけを計算する。

// 起点(スラム発動時のプレイヤー中心)と対象中心がほぼ同一点とみなす距離(px)。
// これ未満なら方向が定まらないため下向き(+y)にフォールバックする。
export const WIRE_HOP_COLLAPSE_DIST = 12;

export interface WireHopLandingInput {
  targetCenterX: number;  // 斬り下ろし対象(生存)の中心X
  targetCenterY: number;  // 斬り下ろし対象(生存)の中心Y
  targetHalfDiag: number; // 対象AABBの半対角(targetHalfDiagonalで算出)
  playerHalfWidth: number; // プレイヤー幅/2
  margin: number;          // 対象AABB外に追加するマージン(WIRE_HOP_MARGIN)
  fromX: number;           // スラム発動時のプレイヤー中心X(wireSlamFromX)
  fromY: number;           // スラム発動時のプレイヤー中心Y(wireSlamFromY)
}

export interface WireHopLanding {
  x: number;
  y: number;
}

// 対象AABB(width×height)の半対角。ホップ距離(対象中心からの離脱距離)の算出に使う。
export function targetHalfDiagonal(width: number, height: number): number {
  return Math.hypot(width / 2, height / 2);
}

// ホップの着地点。方向=対象中心→スラム起点(=「刺した場所へ戻る」向き)。
// 起点と対象中心がほぼ同一点(距離 < WIRE_HOP_COLLAPSE_DIST)なら下向き(+y)にフォールバックする。
// 距離=対象中心から「対象の半対角 + プレイヤー幅/2 + margin」。
export function computeWireHopLanding(input: WireHopLandingInput): WireHopLanding {
  const { targetCenterX, targetCenterY, targetHalfDiag, playerHalfWidth, margin, fromX, fromY } = input;
  const dx = fromX - targetCenterX;
  const dy = fromY - targetCenterY;
  const dist = Math.hypot(dx, dy);
  const ux = dist < WIRE_HOP_COLLAPSE_DIST ? 0 : dx / dist;
  const uy = dist < WIRE_HOP_COLLAPSE_DIST ? 1 : dy / dist;
  const hopDist = targetHalfDiag + playerHalfWidth + margin;
  return {
    x: targetCenterX + ux * hopDist,
    y: targetCenterY + uy * hopDist,
  };
}
