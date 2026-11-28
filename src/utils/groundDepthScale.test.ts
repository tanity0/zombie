import { describe, expect, it } from 'vitest';
import { groundConvAt, groundMatchedDepthScale, groundRowTAt, parseObjDepthMode } from './groundDepthScale';
import { groundRowTileScaleX } from './groundScroll';

const P = { trapFar: 0.10, trapCurve: 1, trapezoid: 1 };

describe('groundDepthScale(?objdepth の試作)', () => {
  it('既定(ツマミ無し)は 0=今のまま', () => {
    expect(parseObjDepthMode(0)).toBe(0);
    expect(parseObjDepthMode(NaN)).toBe(0);
    expect(parseObjDepthMode(3)).toBe(0);
    expect(parseObjDepthMode(1)).toBe(1);
    expect(parseObjDepthMode(2)).toBe(2);
  });

  it('conv は床の横の縮み(groundScroll の tileScale.x / GROUND_TILE_SCALE_X)と同じ式', () => {
    const gp = { tileScaleX: 0.82, trapFar: 0.1, trapCurve: 1, trapezoid: 1, farScale: 0.055, nearScale: 0.82, curve: 2.6 };
    for (const t of [0, 0.25, 0.5, 1, 1.8]) {
      expect(groundConvAt(t, P)).toBeCloseTo(groundRowTileScaleX(t, gp) / 0.82, 10);
    }
  });

  it('主人公の足元の行で厳密に等倍', () => {
    for (const ref of [10, 300, 650, 900]) {
      expect(groundMatchedDepthScale(ref, ref, 10, 72, P, 0.45, 1.85)).toBe(1);
    }
  });

  it('奥ほど小さく・手前ほど大きく(単調)・[min,max] に丸める', () => {
    const ref = 400;
    let prev = 0;
    for (let y = -200; y <= 2000; y += 50) {
      const s = groundMatchedDepthScale(y, ref, 10, 72, P, 0.45, 1.85);
      expect(s).toBeGreaterThanOrEqual(prev);
      expect(s).toBeGreaterThanOrEqual(0.45);
      expect(s).toBeLessThanOrEqual(1.85);
      prev = s;
    }
  });

  it('行位置は groundStripT(i)=i/(n-1) の連続版', () => {
    expect(groundRowTAt(0, 10, 72)).toBe(0);
    expect(groundRowTAt(710, 10, 72)).toBeCloseTo(1, 10);
  });

  it('地面を奥へ倒す(trapFar を下げる)ほど、手前は大きく奥は小さく', () => {
    const ref = 400, near = 700, far = 100;
    const tilt = { ...P, trapFar: 0.05 };
    expect(groundMatchedDepthScale(near, ref, 10, 72, tilt, 0, 9)).toBeGreaterThan(groundMatchedDepthScale(near, ref, 10, 72, P, 0, 9));
    expect(groundMatchedDepthScale(far, ref, 10, 72, tilt, 0, 9)).toBeLessThan(groundMatchedDepthScale(far, ref, 10, 72, P, 0, 9));
  });
});
