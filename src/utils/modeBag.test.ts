// BOT_AND_GHOST.md §2.18追補(バッチGHOST-CMD-2A): 汎用2モード袋の純関数+袋の寿命を検証する。
import { describe, it, expect, beforeEach } from 'vitest';
import { deriveModeCounts, drawFromModeBag, peekModeBag, resetModeBags } from './modeBag';

beforeEach(() => resetModeBags());

// 引きの並びを固定する rand(呼ばれた回数も数える)。
const seq = (values: number[]) => {
  let i = 0;
  const fn = () => values[i++ % values.length];
  return { fn, calls: () => i };
};

describe('deriveModeCounts: {n, rate} → 2種札の枚数導出(丸め規則・clamp)', () => {
  it('primary = round(n×rate) / other = 残り(合計は常にn)', () => {
    expect(deriveModeCounts({ n: 10, rate: 0.7 })).toEqual({ primary: 7, other: 3 });
    expect(deriveModeCounts({ n: 3, rate: 0.5 })).toEqual({ primary: 2, other: 1 }); // round(1.5)=2
    expect(deriveModeCounts({ n: 1, rate: 1 })).toEqual({ primary: 1, other: 0 });
    expect(deriveModeCounts({ n: 1, rate: 0 })).toEqual({ primary: 0, other: 1 });
  });

  it('rateは0..1へclamp・nは負/非有限を0扱い', () => {
    expect(deriveModeCounts({ n: 4, rate: 5 })).toEqual({ primary: 4, other: 0 });
    expect(deriveModeCounts({ n: 4, rate: -1 })).toEqual({ primary: 0, other: 4 });
    expect(deriveModeCounts({ n: -3, rate: 0.5 })).toEqual({ primary: 0, other: 0 });
    expect(deriveModeCounts({ n: Number.NaN, rate: 0.5 })).toEqual({ primary: 0, other: 0 });
  });
});

describe('drawFromModeBag: 一様引き/引き切りで詰め直し/デフォルト', () => {
  it('記録なし(undefined)・n=0 はフォールバックを返し、randを1回も消費しない', () => {
    const r = seq([0]);
    expect(drawFromModeBag('k', undefined, r.fn, true)).toBe(true);
    expect(drawFromModeBag('k', { n: 0, rate: 1 }, r.fn, true)).toBe(true);
    expect(drawFromModeBag('k', undefined, r.fn, false)).toBe(false);
    expect(r.calls()).toBe(0);
  });

  it('記録がある時は1引きにつきrandをちょうど1回消費する', () => {
    const r = seq([0.1, 0.9, 0.5]);
    drawFromModeBag('k', { n: 4, rate: 0.5 }, r.fn, true);
    expect(r.calls()).toBe(1);
    drawFromModeBag('k', { n: 4, rate: 0.5 }, r.fn, true);
    expect(r.calls()).toBe(2);
  });

  it('rate=1の袋は常にprimary / rate=0の袋は常にother(記録が決めつけに勝つ)', () => {
    const r = seq([0, 0.25, 0.5, 0.75, 0.99]);
    for (let i = 0; i < 8; i++) expect(drawFromModeBag('all', { n: 3, rate: 1 }, r.fn, false)).toBe(true);
    for (let i = 0; i < 8; i++) expect(drawFromModeBag('none', { n: 3, rate: 0 }, r.fn, true)).toBe(false);
  });

  it('引き切ると割合は記録どおり(n=10・rate=0.7 → 10引きでprimary7/other3)、その後は詰め直される', () => {
    const stat = { n: 10, rate: 0.7 };
    const r = seq([0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]);
    const first: boolean[] = [];
    for (let i = 0; i < 10; i++) first.push(drawFromModeBag('bag', stat, r.fn, true));
    expect(first.filter(Boolean).length).toBe(7);
    expect(peekModeBag('bag')).toEqual({ primary: 0, other: 0 });
    // 11引き目=詰め直し後の1枚目(袋がまた10枚に戻っている)。
    drawFromModeBag('bag', stat, r.fn, true);
    const left = peekModeBag('bag')!;
    expect(left.primary + left.other).toBe(9);
  });

  it('キーごとに独立した袋(別文脈の引きが混ざらない)', () => {
    const r = seq([0]);
    drawFromModeBag('a', { n: 2, rate: 1 }, r.fn, true);
    expect(peekModeBag('a')).toEqual({ primary: 1, other: 0 });
    expect(peekModeBag('b')).toBeNull();
  });
});

describe('resetModeBags: ラン境界リセット(引きかけの残枚数を持ち越さない)', () => {
  it('リセット後は袋が消えて詰め直しから始まる', () => {
    const r = seq([0]);
    drawFromModeBag('bag', { n: 4, rate: 0.5 }, r.fn, true);
    expect(peekModeBag('bag')).not.toBeNull();
    resetModeBags();
    expect(peekModeBag('bag')).toBeNull();
  });
});
