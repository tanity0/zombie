import { describe, expect, it } from 'vitest';
import {
  OBJ_SHADE_CLASS_K, OBJ_SHADE_LIGHT_ALPHA_MAX, OBJ_SHADE_TAU_BRIGHT_MS, OBJ_SHADE_TAU_DARK_MS,
  accumulateMultiply, approachExp, approachRgb, averageRgb, coolShade, mulTintRgb, nearestFirst, objShadeLightAlpha, objShadeStrength,
  parseObjShadeMode, sampleRgba, shadeWithStrength, tilingTexel, wrapMod,
} from './objShade';

describe('objShade (試作 ?objshade)', () => {
  it('URL の値 → 方式(既定は tint=採用・0 で外す)', () => {
    expect(parseObjShadeMode(null)).toBe('tint'); // 既定=採用(社長2026-11-22「影は1で採用」)
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

  it('慣性: 指数で寄せる・暗くなる側は速く、明るくなる側はゆっくり', () => {
    expect(OBJ_SHADE_TAU_DARK_MS).toBeGreaterThanOrEqual(80);
    expect(OBJ_SHADE_TAU_DARK_MS).toBeLessThanOrEqual(120);
    expect(OBJ_SHADE_TAU_BRIGHT_MS).toBeGreaterThanOrEqual(150);
    expect(OBJ_SHADE_TAU_BRIGHT_MS).toBeLessThanOrEqual(250);
    // τ だけ経つと差の 1−1/e ぶん寄る
    expect(approachExp(1, 0.5, OBJ_SHADE_TAU_DARK_MS)).toBeCloseTo(1 - 0.5 * (1 - Math.exp(-1)));
    expect(approachExp(0.5, 1, OBJ_SHADE_TAU_BRIGHT_MS)).toBeCloseTo(0.5 + 0.5 * (1 - Math.exp(-1)));
    // 同じ 16ms でも暗くなる方が大きく動く
    const down = 1 - approachExp(1, 0.5, 16), up = approachExp(0.5, 1, 16) - 0.5;
    expect(down).toBeGreaterThan(up);
    // 1フレームで飛び移らない・dt=0 は動かない・長く経てば着く
    expect(approachExp(1, 0.5, 16)).toBeGreaterThan(0.55);
    expect(approachExp(1, 0.5, 0)).toBe(1);
    let v = 1;
    for (let i = 0; i < 120; i++) v = approachExp(v, 0.5, 16);
    expect(v).toBeCloseTo(0.5, 3);
    const c = { r: 1, g: 1, b: 1 };
    approachRgb(c, { r: 0.5, g: 1, b: 0.5 }, 16);
    expect(c.r).toBeLessThan(1); expect(c.g).toBe(1); expect(c.r).toBeGreaterThan(0.5);
  });

  it('区分ごとの効き: 主人公は浅く・敵と置物は地面と同じ・木は少し浅い', () => {
    expect(OBJ_SHADE_CLASS_K.player).toBeGreaterThanOrEqual(0.55);
    expect(OBJ_SHADE_CLASS_K.player).toBeLessThanOrEqual(0.7);
    expect(OBJ_SHADE_CLASS_K.enemy).toBe(1);
    expect(OBJ_SHADE_CLASS_K.prop).toBe(1);
    expect(OBJ_SHADE_CLASS_K.tree).toBeCloseTo(0.85);
    expect(objShadeStrength('enemy', 80, 80, false)).toBe(1);
    expect(objShadeStrength('player', 80, 80, false)).toBe(OBJ_SHADE_CLASS_K.player);
  });

  it('背の高い物(主人公の2倍超)と空中の物は効きを下げる', () => {
    const tall = objShadeStrength('prop', 170, 80, false);
    expect(tall).toBeGreaterThanOrEqual(0.5);
    expect(tall).toBeLessThanOrEqual(0.6);
    expect(objShadeStrength('prop', 160, 80, false)).toBe(1); // ちょうど2倍は対象外
    expect(objShadeStrength('prop', 60, 80, true)).toBeCloseTo(0.5);
    expect(objShadeStrength('tree', 300, 80, false)).toBeCloseTo(0.85 * tall);
    expect(objShadeStrength('prop', 300, 0, false)).toBe(1); // 体の高さが分からない時は判定しない
  });

  it('色温度: 冷やす時は青の減りが 0.7 倍・冷やさない時は無変化', () => {
    const s = { r: 0.6, g: 0.6, b: 0.6 };
    const c = coolShade(s, true);
    expect(c.r).toBeCloseTo(0.6); expect(c.g).toBeCloseTo(0.6); expect(c.b).toBeCloseTo(1 - 0.4 * 0.7);
    expect(coolShade(s, false)).toEqual(s);
    expect(coolShade({ r: 1, g: 1, b: 1 }, true)).toEqual({ r: 1, g: 1, b: 1 }); // 影の外は変わらない
  });

  it('月明りの写しのαは上限で切る', () => {
    expect(OBJ_SHADE_LIGHT_ALPHA_MAX).toBeGreaterThanOrEqual(0.45);
    expect(OBJ_SHADE_LIGHT_ALPHA_MAX).toBeLessThanOrEqual(0.6);
    expect(objShadeLightAlpha(2, 1)).toBe(OBJ_SHADE_LIGHT_ALPHA_MAX);
    expect(objShadeLightAlpha(0.2, 1)).toBeCloseTo(0.2);
    expect(objShadeLightAlpha(-1, 1)).toBe(0);
  });

  it('上限は画面の中心から近い順に当てる', () => {
    const items = [{ id: 'far', d2: 900 }, { id: 'near', d2: 1 }, { id: 'mid', d2: 100 }];
    expect(nearestFirst(items, 2).map(i => i.id)).toEqual(['near', 'mid']);
    expect(nearestFirst(items, 5).map(i => i.id)).toEqual(['near', 'mid', 'far']);
    expect(items[0].id).toBe('far'); // 元の配列は変えない
  });
});
