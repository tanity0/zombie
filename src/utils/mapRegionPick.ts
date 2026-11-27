// 作戦室の地図の「見えない区画」(社長 2026-11-27「地域を選択するの、小さすぎるな」→ 見えない区画でタップを受ける)。
// 地図を「どの地点に一番近いか」で分け(ボロノイ)、地図のどこを押しても一番近い地点を選ぶ。ただし一番近い地点まで
// maxDist より遠い所(余白・海)は選ばない。区画の形は押した瞬間の薄い光(DsStoryMap)のためだけに使う。
// 描画にも React にも依存しない純関数(座標の単位は呼び手の物=地図の原画の単位)。

export interface RegionSpot { stageId: string; x: number; y: number }

/**
 * 押した点に一番近い地点のステージ。一番近い地点まで maxDist を超えたら null。同じ距離なら一覧の先の地点。
 */
export const pickNearestSpot = (points: readonly RegionSpot[], px: number, py: number, maxDist: number): string | null => {
  let best: string | null = null, bd = maxDist * maxDist;
  for (const p of points) {
    const d = (px - p.x) ** 2 + (py - p.y) ** 2;
    if (d < bd || (best === null && d === bd)) { bd = d; best = p.stageId; }
  }
  return best;
};

type Pt = readonly [number, number];

// 多角形を半平面 a·x + b·y <= c で切る(Sutherland–Hodgman の1辺ぶん)。
const clipHalf = (poly: readonly Pt[], a: number, b: number, c: number): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const fp = a * p[0] + b * p[1] - c, fq = a * q[0] + b * q[1] - c;
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
};

/**
 * i 番目の地点の区画(pickNearestSpot がその地点を返す範囲)の外形。地図の枠 [0,w]×[0,h] と、地点を中心に maxDist の円
 * (segs 角形で近似・円に外接させない=光が判定より少し内側)で切る。同じ位置に先の地点がある時は空(そちらが選ばれる)。
 */
export const spotRegionPolygon = (points: readonly RegionSpot[], i: number, w: number, h: number, maxDist: number, segs = 40): Pt[] => {
  const s = points[i];
  let poly: Pt[] = [];
  for (let k = 0; k < segs; k++) {
    const a = (k / segs) * Math.PI * 2;
    poly.push([s.x + Math.cos(a) * maxDist, s.y + Math.sin(a) * maxDist]);
  }
  poly = clipHalf(poly, -1, 0, 0);
  poly = clipHalf(poly, 1, 0, w);
  poly = clipHalf(poly, 0, -1, 0);
  poly = clipHalf(poly, 0, 1, h);
  for (let j = 0; j < points.length && poly.length; j++) {
    if (j === i) continue;
    const o = points[j];
    const dx = o.x - s.x, dy = o.y - s.y;
    if (dx === 0 && dy === 0) { if (j < i) return []; continue; }
    // |x-s|² <= |x-o|²  ⇔  2(o-s)·x <= |o|² - |s|²
    poly = clipHalf(poly, 2 * dx, 2 * dy, o.x * o.x + o.y * o.y - s.x * s.x - s.y * s.y);
  }
  return poly;
};

/** 多角形を SVG の path の d へ(空なら '')。 */
export const polygonPath = (poly: readonly Pt[]): string =>
  poly.length < 3 ? '' : `M${poly.map(p => `${Math.round(p[0] * 10) / 10},${Math.round(p[1] * 10) / 10}`).join(' L')} Z`;
