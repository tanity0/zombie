// 視界ポリゴン(src/world/vision.ts)のユニット。表示が「実際に起こされる範囲」と一致することが要件なので、
// 遮蔽の有無・距離の上限・壁の影が実際に短くなることを機械化しておく。
import { describe, it, expect } from 'vitest';
import { rayHitDistance, visibilityPolygon } from './vision';
import { footRect } from './obstacles';

describe('rayHitDistance', () => {
  it('正面の壁までの距離を返す', () => {
    const r = { x: 100, y: -50, width: 20, height: 100 };
    expect(rayHitDistance(0, 0, 1, 0, r)).toBeCloseTo(100);
  });
  it('逆方向の壁には当たらない', () => {
    const r = { x: 100, y: -50, width: 20, height: 100 };
    expect(rayHitDistance(0, 0, -1, 0, r)).toBe(Infinity);
  });
  it('横に外れたレイは当たらない', () => {
    const r = { x: 100, y: -50, width: 20, height: 100 };
    expect(rayHitDistance(0, 200, 1, 0, r)).toBe(Infinity);
  });
});

describe('visibilityPolygon', () => {
  it('壁が無ければ全点が半径ちょうど(=円)', () => {
    const pts = visibilityPolygon(0, 0, 300, [], 32);
    expect(pts.length).toBe(64);
    for (let i = 0; i < pts.length; i += 2) {
      expect(Math.hypot(pts[i], pts[i + 1])).toBeCloseTo(300, 5);
    }
  });

  it('壁の向こう側は短くなる(=影ができる)', () => {
    const wall = { x: 80, y: -60, width: 20, height: 120 }; // 右方向を塞ぐ壁
    const pts = visibilityPolygon(0, 0, 300, [wall], 64);
    // 右(+X)方向の点は壁の手前で止まる
    const right = pts.slice(0, 2);
    expect(Math.hypot(right[0], right[1])).toBeLessThan(100);
    // 左(-X)方向は遮られないので半径いっぱい
    const idx = 32 * 2; // 64本中の半周=180°
    expect(Math.hypot(pts[idx], pts[idx + 1])).toBeCloseTo(300, 5);
  });

  it('どの点も半径を超えない(見えすぎない)', () => {
    const walls = [footRect(120, 40, 176, 22), footRect(-200, -80, 176, 22)];
    const pts = visibilityPolygon(0, 0, 300, walls, 48);
    for (let i = 0; i < pts.length; i += 2) {
      expect(Math.hypot(pts[i], pts[i + 1])).toBeLessThanOrEqual(300 + 1e-6);
    }
  });

  it('射程外の壁は影を作らない', () => {
    const far = { x: 5000, y: -50, width: 20, height: 100 };
    const pts = visibilityPolygon(0, 0, 300, [far], 32);
    for (let i = 0; i < pts.length; i += 2) {
      expect(Math.hypot(pts[i], pts[i + 1])).toBeCloseTo(300, 5);
    }
  });
});
