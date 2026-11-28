import { describe, it, expect } from 'vitest';
import { newWalkHeading, stepWalkHeading, walkBiasStrength, pickWalkBiasedSide, sideOfDir, WALK_BIAS_FULL_MS } from './spawnWalkBias';

const walk = (ms: number, vx: number, vy: number, s = newWalkHeading()) => {
  for (let t = 0; t < ms; t += 16) s = stepWalkHeading(s, vx, vy, 100, 16);
  return s;
};

describe('湧く向きを歩き続けている方向へ寄せる(PACING_PUZZLE §20)', () => {
  it('同じ向きに2秒歩き続けると寄せが最大、立ち止まると素早く0へ戻る', () => {
    const s = walk(WALK_BIAS_FULL_MS + 100, 100, 0);
    expect(walkBiasStrength(s)).toBe(1);
    const stopped = walk(800, 0, 0, s);
    expect(walkBiasStrength(stopped)).toBe(0);
  });
  it('小刻みに左右へ動く(向きが変わる)間は寄せが溜まらない=今まで通り', () => {
    let s = newWalkHeading();
    for (let i = 0; i < 20; i++) s = walk(300, i % 2 ? 100 : -100, 0, s);
    expect(walkBiasStrength(s)).toBeLessThan(0.2);
  });
  it('遅い動き(基礎の半分未満)は歩いた事にしない', () => {
    expect(walkBiasStrength(walk(3000, 30, 0))).toBe(0);
  });
  it('寄せ最大時の辺の比率: 進む先70% / 左右 各12.5% / 後ろ5%', () => {
    const s = walk(3000, 100, 0); // 右へ
    expect(sideOfDir(s.hx, s.hy)).toBe(1);
    const count = [0, 0, 0, 0];
    const N = 1000;
    for (let i = 0; i < N; i++) count[pickWalkBiasedSide(s, 1, 0, (i + 0.5) / N)!.side]++;
    expect(count[1] / N).toBeCloseTo(0.7, 2);
    expect(count[0] / N).toBeCloseTo(0.125, 2);
    expect(count[2] / N).toBeCloseTo(0.125, 2);
    expect(count[3] / N).toBeCloseTo(0.05, 2);
  });
  it('寄せが0なら従来の湧き方(null)', () => {
    expect(pickWalkBiasedSide(walk(3000, 100, 0), 0, 0, 0.1)).toBeNull();
    expect(pickWalkBiasedSide(newWalkHeading(), 1, 0, 0.1)).toBeNull();
  });
});
