import { describe, expect, it } from 'vitest';
import { accumulateMultiply, averageRgb, mulTintRgb, parseObjShadeMode, sampleRgba, shadeWithStrength, tilingTexel, wrapMod } from './objShade';

describe('objShade (試作 ?objshade)', () => {
  it('URL の値 → 方式(既定は off=何もしない)', () => {
    expect(parseObjShadeMode(null)).toBe('off');
    expect(parseObjShadeMode('0')).toBe('off');
    expect(parseObjShadeMode('1')).toBe('tint');
    expect(parseObjShadeMode('2')).toBe('overlay');
  });

  it('乗算の層: 白・α0 は無変化、灰色は地面と同じ倍率', () => {
    const acc = { r: 1, g: 1, b: 1 };
    accumulateMultiply(acc, [1, 1, 1, 1], 0.7);
    expect(acc).toEqual({ r: 1, g: 1, b: 1 });
    accumulateMultiply(acc, [0.2, 0.2, 0.2, 0], 1);
    expect(acc).toEqual({ r: 1, g: 1, b: 1 });
    accumulateMultiply(acc, [0.5, 0.5, 0.5, 1], 0.5);
    expect(acc.r).toBeCloseTo(0.75);
    accumulateMultiply(acc, [0.5, 1, 1, 1], 1);
    expect(acc.r).toBeCloseTo(0.375);
    expect(acc.g).toBeCloseTo(0.75);
  });

  it('tint への掛け込みと効き具合', () => {
    expect(mulTintRgb(0xffffff, { r: 1, g: 1, b: 1 })).toBe(0xffffff);
    expect(mulTintRgb(0xffffff, { r: 0.5, g: 0.5, b: 0.5 })).toBe(0x808080);
    expect(mulTintRgb(0x804020, { r: 0.5, g: 1, b: 1 })).toBe(0x404020);
    expect(shadeWithStrength({ r: 0.5, g: 0.5, b: 0.5 }, 0)).toEqual({ r: 1, g: 1, b: 1 });
    expect(averageRgb([{ r: 0, g: 1, b: 1 }, { r: 1, g: 1, b: 0 }])).toEqual({ r: 0.5, g: 1, b: 0.5 });
  });

  it('タイルの画素座標は繰り返す', () => {
    expect(wrapMod(-1, 256)).toBe(255);
    const t = tilingTexel(110, 20, 10, -20, 2, 0.5);
    expect(t).toEqual({ x: 50, y: 80 });
    const data = new Uint8ClampedArray(2 * 2 * 4).fill(255);
    data[(1 * 2 + 1) * 4] = 0; // (1,1) の赤だけ 0
    const out: [number, number, number, number] = [0, 0, 0, 0];
    expect(sampleRgba(data, 2, 2, -1, -1, true, out)[0]).toBe(0);
    expect(sampleRgba(data, 2, 2, 5, 5, false, out)[3]).toBe(0);
  });
});
