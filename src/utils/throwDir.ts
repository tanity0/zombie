// スカベンジャーのクイックマガジン: 投げたマガジンはプレイヤーが拾って回収するので、敵の少ない
// 方面へ投げて安全に取りに行けるようにする(社長指示)。純関数=useGameLoopから呼び出し、テスト可能。
// 「敵の少ない方向」= 16方位を試し、その向きの前方(内積>0)に居る敵の重み(近いほど重い)が
// 最小の向きを選ぶ。近くに敵が居なければ fallback(進行方向/lastDirection)を正規化して返す。

export interface ThrowActorRect { x: number; y: number; width: number; height: number }

export const safeThrowDirection = (
  px: number,
  py: number,
  enemies: readonly ThrowActorRect[],
  fallback: { x: number; y: number },
  radius = 500, // これより遠い敵は無視(投げ先の安全性に無関係)
  samples = 16, // 試す方位数
): { x: number; y: number } => {
  const normFallback = (): { x: number; y: number } => {
    const l = Math.hypot(fallback.x, fallback.y) || 1;
    return { x: fallback.x / l, y: fallback.y / l };
  };

  // 半径内の敵を「単位方向 + 近さ重み(近いほど大)」に変換。
  const near: { ux: number; uy: number; w: number }[] = [];
  for (const e of enemies) {
    const ex = e.x + e.width / 2;
    const ey = e.y + e.height / 2;
    const dx = ex - px;
    const dy = ey - py;
    const d = Math.hypot(dx, dy);
    if (d < 1 || d > radius) continue;
    near.push({ ux: dx / d, uy: dy / d, w: 1 - d / radius });
  }
  if (near.length === 0) return normFallback();

  let best = normFallback();
  let bestPenalty = Infinity;
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    let penalty = 0;
    for (const n of near) {
      const dot = cx * n.ux + cy * n.uy; // この向きに対する敵の前方成分
      if (dot > 0) penalty += dot * n.w; // 前方に居る敵ほど、近いほど、避けたい
    }
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = { x: cx, y: cy };
    }
  }
  return best; // 既に単位ベクトル
};
