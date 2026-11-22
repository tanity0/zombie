import { describe, expect, it } from 'vitest';
import { OBJ_SHADE_OVERLAY_K_DEFAULT, overlayAlphas, parseObjShadeOverlayK, solveBaseAlpha, stackedMultiply } from './objShadeOverlay';

describe('parseObjShadeOverlayK', () => {
  it('既定は0.4・3段の一番近い段へ寄せる', () => {
    expect(parseObjShadeOverlayK(null)).toBe(OBJ_SHADE_OVERLAY_K_DEFAULT);
    expect(parseObjShadeOverlayK('')).toBe(0.4);
    expect(parseObjShadeOverlayK('abc')).toBe(0.4);
    expect(parseObjShadeOverlayK('0.25')).toBe(0.25);
    expect(parseObjShadeOverlayK('0.55')).toBe(0.55);
    expect(parseObjShadeOverlayK('0.3')).toBe(0.25);
    expect(parseObjShadeOverlayK('0.5')).toBe(0.55);
    expect(parseObjShadeOverlayK('9')).toBe(0.55);
    expect(parseObjShadeOverlayK('0')).toBe(0.25);
  });
});

describe('solveBaseAlpha', () => {
  it('代表の暗さ x では2枚の合成が元の1枚と一致する', () => {
    for (const a of [0.3, 0.7, 1]) for (const k of [0.25, 0.4, 0.55]) for (const x of [0.2, 0.5, 0.8]) {
      const a2 = a * k;
      const a1 = solveBaseAlpha(a, a2, x);
      expect(stackedMultiply(a1, a2, x)).toBeCloseTo(1 - a * x, 9);
    }
  });
  it('x がずれても差は小さい(0.7・k0.4・代表0.5 で x 0..1 の差 < 0.075)', () => {
    const a = 0.7, a2 = a * 0.4, a1 = solveBaseAlpha(a, a2, 0.5);
    for (let x = 0; x <= 1; x += 0.05) expect(Math.abs(stackedMultiply(a1, a2, x) - (1 - a * x))).toBeLessThan(0.075);
  });
  it('2枚目が元以上なら1枚目は0・範囲外は丸める', () => {
    expect(solveBaseAlpha(0.5, 0.6, 0.5)).toBe(0);
    expect(solveBaseAlpha(2, 0.4, 0.5)).toBeLessThanOrEqual(1);
  });
});

describe('overlayAlphas', () => {
  it('2枚目=元×k', () => {
    expect(overlayAlphas(0.7, 0.4, 0.5, false).a2).toBeCloseTo(0.28, 9);
  });
  it('2枚目が地面へ届かない置き方なら1枚目は元のまま(地面の見え方は不変)', () => {
    expect(overlayAlphas(0.7, 0.4, 0.5, false).a1).toBe(0.7);
  });
  it('地面にも重なる置き方なら1枚目を薄くして合成を元に合わせる', () => {
    const { a1, a2 } = overlayAlphas(0.7, 0.4, 0.5, true);
    expect(a1).toBeLessThan(0.7);
    expect(stackedMultiply(a1, a2, 0.5)).toBeCloseTo(1 - 0.7 * 0.5, 9);
  });
});
