import { describe, it, expect } from 'vitest';
import { Bounds } from 'pixi.js';
import { clipMaskFilterBounds, enclosingFilterBounds, installMaskFilterClip, isMaskOnlyFilterList, type FilterSystemLike } from './maskFilterClip';

const fd = (minX: number, minY: number, maxX: number, maxY: number, skip = false, filters: unknown[] = ['mask']) => ({
  skip, filters, bounds: new Bounds(minX, minY, maxX, maxY), resolution: 1,
});
const rect = (d: ReturnType<typeof fd>) => [d.bounds.minX, d.bounds.minY, d.bounds.maxX, d.bounds.maxY];

describe('maskFilterClip(マスクの作業用テクスチャを見える範囲までに切る)', () => {
  it('囲むフィルタが無ければ画面で切る(スマホ 430×932 の画面に 1100×1875 の中身=作業用は画面ぶんに収まる)', () => {
    const d = fd(-300, -500, 800, 1375);
    clipMaskFilterBounds(d, null, 430, 932);
    expect(rect(d)).toEqual([0, 0, 430, 932]);
    expect(d.skip).toBe(false);
  });
  it('囲むフィルタがあればその範囲で切る(画面の外まで読む遠近のフィルタの余白は残す)', () => {
    const outer = fd(0, -120, 430, 1052, false, ['zwarp']);
    const d = fd(-300, -500, 800, 1375);
    clipMaskFilterBounds(d, outer.bounds, 430, 932);
    expect(rect(d)).toEqual([0, -120, 430, 1052]);
  });
  it('重ならなければ描かない(skip)', () => {
    const d = fd(500, 0, 900, 100);
    clipMaskFilterBounds(d, null, 430, 932);
    expect(d.skip).toBe(true);
  });
  it('囲む範囲は skip の段を飛ばし、計算中の最上段は数えない', () => {
    const a = fd(0, 0, 100, 100, false, ['outer']);
    const s = fd(0, 0, 10, 10, true, ['skipped']);
    const cur = fd(0, 0, 1, 1);
    expect(enclosingFilterBounds([a, s, cur], 3)).toBe(a.bounds);
    expect(enclosingFilterBounds([cur], 1)).toBeNull();
  });
  it('切るのはマスクだけのフィルタ列', () => {
    const isMask = (f: unknown) => f === 'mask';
    expect(isMaskOnlyFilterList(['mask'], isMask)).toBe(true);
    expect(isMaskOnlyFilterList(['mask', 'blur'], isMask)).toBe(false);
    expect(isMaskOnlyFilterList([], isMask)).toBe(false);
  });
  it('差し込みは描画器ごとに1回・マスク以外のフィルタの範囲は Pixi のまま', () => {
    const calls: string[] = [];
    const fs: FilterSystemLike = {
      _filterStack: [], _filterStackIndex: 0,
      _calculateFilterBounds: (d) => { calls.push(String(d.filters[0])); },
    };
    const renderer = { filter: fs } as never;
    const isMask = (f: unknown) => f === 'mask';
    expect(installMaskFilterClip(renderer, isMask)).toBe(true);
    expect(installMaskFilterClip(renderer, isMask)).toBe(false);
    const blur = fd(-300, -500, 800, 1375, false, ['blur']);
    fs._filterStack = [blur]; fs._filterStackIndex = 1;
    fs._calculateFilterBounds(blur, { width: 430, height: 932 }, false, 1, 1);
    expect(blur.bounds.maxX).toBe(800); // マスク以外は触らない
    const mask = fd(-300, -500, 800, 1375);
    fs._filterStack = [mask]; fs._filterStackIndex = 1;
    fs._calculateFilterBounds(mask, { width: 860, height: 1864 }, false, 2, 1); // 解像度2の描き先=論理 430×932
    expect(rect(mask)).toEqual([0, 0, 430, 932]);
    expect(calls).toEqual(['blur', 'mask']); // 元の計算は必ず先に通る
  });
});
