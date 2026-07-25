// M2の湧き位置(placeLabSpawn)の不変条件。社長指示v0.25.2242「敵は自由移動範囲内でのみスポーン」。
import { describe, it, expect } from 'vitest';
import { placeLabSpawn } from './labSpawn';

const LIMIT = 200;   // LAB_CORRIDOR_Y_LIMIT_PX と同値
const HALF_W = 400;
const MARGIN = 60;

describe('placeLabSpawn', () => {
  it('体がまるごと歩ける帯(±200)の中に収まる', () => {
    for (let i = 0; i < 200; i++) {
      const h = 40 + (i % 5) * 10;
      const p = placeLabSpawn(1000, HALF_W, MARGIN, 30, h, LIMIT, () => (i % 100) / 100);
      expect(p.y).toBeGreaterThanOrEqual(-LIMIT);
      expect(p.y + h).toBeLessThanOrEqual(LIMIT);
    }
  });

  it('Xは必ず画面外(左右いずれか)=湧く瞬間が見えない', () => {
    const left = placeLabSpawn(1000, HALF_W, MARGIN, 30, 60, LIMIT, () => 0.9); // 左から
    const right = placeLabSpawn(1000, HALF_W, MARGIN, 30, 60, LIMIT, () => 0.1); // 右から
    expect(right.x).toBeGreaterThanOrEqual(1000 + HALF_W + MARGIN);
    expect(left.x + 30).toBeLessThanOrEqual(1000 - HALF_W - MARGIN);
  });

  it('帯より背が高い敵でも例外にならない(中央へ置く)', () => {
    const tall = placeLabSpawn(0, HALF_W, MARGIN, 30, 900, LIMIT, () => 0.5);
    expect(Number.isFinite(tall.y)).toBe(true);
    expect(tall.y).toBe(-450); // 帯の中央に中心が来る
  });

  it('乱数を振ると上下に散る(1点に固まらない)', () => {
    const ys = new Set<number>();
    for (let i = 0; i < 20; i++) ys.add(placeLabSpawn(0, HALF_W, MARGIN, 30, 60, LIMIT, () => i / 20).y);
    expect(ys.size).toBeGreaterThan(5);
  });
});
