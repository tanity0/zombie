// 視界ポリゴン(社長指示v0.25.2235「m2の敵の視界を薄い赤で範囲表示したい/壁で見えてないところも」)。
// ゲーム側の覚醒条件は「半径 aggroRange 以内 かつ segmentBlocked でない」なので、**同じ矩形リスト**へ
// レイを飛ばして到達点を結べば、表示と実挙動が一致する(見えている範囲=起こされる範囲)。
// RENDERER-AGNOSTIC: PixiJS を import しない(描画側が点列を受け取って塗るだけ)。
import type { Rect } from './obstacles';

// レイ(ox,oy → 方向dx,dy・正規化済み)が矩形に入る距離。当たらなければ Infinity。
// スラブ法。矩形の中から撃つ場合(=敵が壁に埋まっている等)は 0 を返さず素通りさせる
// (視界が完全に消えるより、その1本だけ最大距離まで伸ばす方が破綻が小さいため)。
export const rayHitDistance = (ox: number, oy: number, dx: number, dy: number, r: Rect): number => {
  const inside = ox > r.x && ox < r.x + r.width && oy > r.y && oy < r.y + r.height;
  if (inside) return Infinity;
  let tMin = -Infinity, tMax = Infinity;
  if (dx !== 0) {
    const t1 = (r.x - ox) / dx, t2 = (r.x + r.width - ox) / dx;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  } else if (ox < r.x || ox > r.x + r.width) {
    return Infinity; // 平行かつ範囲外
  }
  if (dy !== 0) {
    const t1 = (r.y - oy) / dy, t2 = (r.y + r.height - oy) / dy;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  } else if (oy < r.y || oy > r.y + r.height) {
    return Infinity;
  }
  if (tMax < 0 || tMin > tMax) return Infinity; // 後ろ側 or すれ違い
  return tMin < 0 ? Infinity : tMin;
};

// 中心から radius の円を rayCount 本のレイで走査し、壁に当たった所で止めた点列(x,y,x,y,…)を返す。
// 返り値は「中心を頂点に持たない扇の外周」=描画側は中心を足して三角扇/多角形として塗る。
export const visibilityPolygon = (
  cx: number, cy: number, radius: number, rects: readonly Rect[], rayCount = 48,
): number[] => {
  const n = Math.max(8, Math.round(rayCount));
  const out: number[] = [];
  // 近くの矩形だけを対象にする(遠い壁は円に届かない=判定するだけ無駄)。
  const near: Rect[] = [];
  for (const r of rects) {
    const nx = Math.max(r.x, Math.min(cx, r.x + r.width));
    const ny = Math.max(r.y, Math.min(cy, r.y + r.height));
    const ddx = cx - nx, ddy = cy - ny;
    if (ddx * ddx + ddy * ddy <= radius * radius) near.push(r);
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    let dist = radius;
    for (const r of near) {
      const t = rayHitDistance(cx, cy, dx, dy, r);
      if (t < dist) dist = t;
    }
    out.push(cx + dx * dist, cy + dy * dist);
  }
  return out;
};
