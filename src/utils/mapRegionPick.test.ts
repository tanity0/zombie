import { describe, expect, it } from 'vitest';
import { pickNearestSpot, polygonPath, spotRegionPolygon, type RegionSpot } from './mapRegionPick';

const pts: RegionSpot[] = [
  { stageId: 'a', x: 100, y: 100 },
  { stageId: 'b', x: 300, y: 100 },
  { stageId: 'c', x: 200, y: 300 },
];

// 点が多角形の中か(偶奇)。
const inside = (poly: readonly (readonly [number, number])[], x: number, y: number): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

describe('pickNearestSpot(一番近い地点・遠すぎる所は選ばない)', () => {
  it('一番近い地点を返す', () => {
    expect(pickNearestSpot(pts, 190, 100, 500)).toBe('a');
    expect(pickNearestSpot(pts, 210, 100, 500)).toBe('b');
    expect(pickNearestSpot(pts, 200, 280, 500)).toBe('c');
  });
  it('一番近い地点まで maxDist を超えたら null(境目ちょうどは選ぶ)', () => {
    expect(pickNearestSpot(pts, 100, 160, 60)).toBe('a');
    expect(pickNearestSpot(pts, 100, 161, 60)).toBeNull();
  });
  it('同じ距離なら一覧の先', () => {
    expect(pickNearestSpot(pts, 200, 100, 500)).toBe('a');
    expect(pickNearestSpot([{ stageId: 'x', x: 0, y: 0 }, { stageId: 'y', x: 0, y: 0 }], 5, 5, 50)).toBe('x');
  });
  it('地点が無ければ null', () => {
    expect(pickNearestSpot([], 0, 0, 100)).toBeNull();
  });
});

describe('spotRegionPolygon(区画の形=pickNearestSpot と一致)', () => {
  const W = 400, H = 400, R = 150;
  const polys = pts.map((_, i) => spotRegionPolygon(pts, i, W, H, R, 64));
  it('格子の各点で、区画の中=pickNearestSpot がその地点(円の近似の縁と境界線の上は除く)', () => {
    for (let x = 3; x < W; x += 9) for (let y = 3; y < H; y += 9) {
      const id = pickNearestSpot(pts, x, y, R);
      const d = Math.min(...pts.map(p => Math.hypot(x - p.x, y - p.y)));
      if (d > R * 0.99 && d < R * 1.01) continue; // 円を多角形で近似した縁
      const hits = polys.map((p, i) => (inside(p, x, y) ? pts[i].stageId : null)).filter(Boolean);
      // 境界のすぐ上(2地点がほぼ等距離)は除く
      const ds = pts.map(p => Math.hypot(x - p.x, y - p.y)).sort((a, b) => a - b);
      if (ds[1] - ds[0] < 1) continue;
      expect(hits).toEqual(id ? [id] : []);
    }
  });
  it('地図の枠の外へ出ない', () => {
    for (const p of polys) for (const [x, y] of p) {
      expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(W + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeLessThanOrEqual(H + 1e-9);
    }
  });
  it('同じ位置の2つ目の地点は空(先の地点が選ばれる)', () => {
    const dup: RegionSpot[] = [{ stageId: 'x', x: 50, y: 50 }, { stageId: 'y', x: 50, y: 50 }];
    expect(spotRegionPolygon(dup, 0, 100, 100, 40).length).toBeGreaterThan(2);
    expect(spotRegionPolygon(dup, 1, 100, 100, 40)).toEqual([]);
  });
  it('path は閉じた形・空なら空文字', () => {
    expect(polygonPath(polys[0])).toMatch(/^M.* Z$/);
    expect(polygonPath([])).toBe('');
  });
});
