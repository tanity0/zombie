import { describe, it, expect } from 'vitest';
import { mulberry32, pickUpgrade } from './botUpgradePolicy';

describe('mulberry32 (シード付き決定的乱数)', () => {
  it('同じシードからは同じ数列を返す(再現性=M26-L仕様)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it('異なるシードは異なる数列になる', () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it('値域は[0,1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('pickUpgrade (レベルアップ自動選択・一様ランダム)', () => {
  it('必ずoptions内の要素を返す', () => {
    const opts = ['a', 'b', 'c'];
    const r = mulberry32(3);
    for (let i = 0; i < 50; i++) expect(opts).toContain(pickUpgrade(opts, r));
  });

  it('同じシードなら同じ選択列になる(決定的)', () => {
    const opts = [1, 2, 3, 4];
    const seqA = Array.from({ length: 10 }, () => 0).map(() => pickUpgrade(opts, mulberry32(9)));
    const seqB = Array.from({ length: 10 }, () => 0).map(() => pickUpgrade(opts, mulberry32(9)));
    expect(seqA).toEqual(seqB);
  });

  it('rand()が1.0近傍でも配列外へ出ない(クランプ)', () => {
    expect(pickUpgrade(['x', 'y'], () => 0.9999999)).toBe('y');
    expect(pickUpgrade(['x'], () => 0)).toBe('x');
  });
});
