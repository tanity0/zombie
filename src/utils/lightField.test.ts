import { describe, it, expect } from 'vitest';
import { lightAt, lightSmoothLerp, assistLightMult, type PointLight } from './lightField';

const L = (x: number, y: number, reach: number, strength: number): PointLight => ({ x, y, reach, strength });

describe('lightAt: 地点の明るさ', () => {
  it('光が無ければ 0', () => {
    expect(lightAt(0, 0, [])).toBe(0);
  });

  it('中心で strength そのもの、届く距離で 0、その外も 0', () => {
    const lights = [L(0, 0, 100, 0.8)];
    expect(lightAt(0, 0, lights)).toBeCloseTo(0.8, 6);
    expect(lightAt(50, 0, lights)).toBeCloseTo(0.4, 6);
    expect(lightAt(100, 0, lights)).toBe(0);
    expect(lightAt(500, 0, lights)).toBe(0);
  });

  it('距離に対して線形に減る(影の falloff と同じ式)', () => {
    const lights = [L(0, 0, 200, 1)];
    expect(lightAt(0, 0, lights)).toBeCloseTo(1, 6);
    expect(lightAt(50, 0, lights)).toBeCloseTo(0.75, 6);
    expect(lightAt(150, 0, lights)).toBeCloseTo(0.25, 6);
  });

  it('複数の光は合計され、1 でクランプされる', () => {
    const lights = [L(0, 0, 100, 0.7), L(10, 0, 100, 0.7)];
    expect(lightAt(0, 0, lights)).toBe(1);
    expect(lightAt(0, 0, [L(0, 0, 100, 0.3), L(0, 0, 100, 0.3)])).toBeCloseTo(0.6, 6);
  });

  it('斜めの距離もユークリッドで測る', () => {
    expect(lightAt(30, 40, [L(0, 0, 100, 1)])).toBeCloseTo(0.5, 6); // 距離50
  });

  it('reach か strength が 0 以下の光は無視する(壊れた値で NaN を出さない)', () => {
    expect(lightAt(0, 0, [L(0, 0, 0, 1), L(0, 0, -5, 1), L(0, 0, 100, 0), L(0, 0, 100, -1)])).toBe(0);
  });
});

describe('assistLightMult: 補助光に掛ける倍率', () => {
  it('真っ暗なら等倍', () => {
    expect(assistLightMult(0, 0.85)).toBeCloseTo(1, 6);
  });

  it('yield=1 なら明るさ最大で完全に消える', () => {
    expect(assistLightMult(1, 1)).toBe(0);
  });

  it('yield=0.85 なら明るさ最大でも 0.15 残る', () => {
    expect(assistLightMult(1, 0.85)).toBeCloseTo(0.15, 6);
  });

  it('明るさは 0..1 でクランプしてから使う(範囲外でも負にならない)', () => {
    expect(assistLightMult(5, 1)).toBe(0);
    expect(assistLightMult(-3, 0.85)).toBeCloseTo(1, 6);
  });

  it('明るさに対して単調に減る', () => {
    let prev = Infinity;
    for (let b = 0; b <= 1.0001; b += 0.1) {
      const m = assistLightMult(b, 0.9);
      expect(m).toBeLessThanOrEqual(prev);
      prev = m;
    }
  });
});

describe('lightSmoothLerp: 脈動をならす', () => {
  it('時定数 0 以下なら即時(1)', () => {
    expect(lightSmoothLerp(0.016, 0)).toBe(1);
    expect(lightSmoothLerp(0.016, -1)).toBe(1);
  });

  it('0..1 の範囲に収まり、dt が大きいほど 1 へ近づく', () => {
    const a = lightSmoothLerp(0.016, 220);
    const b = lightSmoothLerp(0.5, 220);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThanOrEqual(1);
  });

  it('時定数ぶんの時間が経つと約63%進む(指数平滑の定義)', () => {
    expect(lightSmoothLerp(0.22, 220)).toBeCloseTo(1 - Math.exp(-1), 6);
  });
});
