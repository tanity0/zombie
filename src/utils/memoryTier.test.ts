import { describe, it, expect } from 'vitest';
import { memoryTierFrom, rimBakeBudgetMb, whiteBakeBudgetMb, resolutionCapFor, canBakeWithin } from './memoryTier';

describe('端末のメモリの格', () => {
  it('uaData.mobile が取れればそれを使い、取れなければ指(粗いポインタ)で決める', () => {
    expect(memoryTierFrom(true, false)).toBe('phone');
    expect(memoryTierFrom(false, true)).toBe('pc');
    expect(memoryTierFrom(undefined, true)).toBe('phone');
    expect(memoryTierFrom(undefined, false)).toBe('pc');
  });
  it('スマホは v0.25.4866 の値のまま動かさない(解像度1・縁32MB・白16MB)', () => {
    expect(resolutionCapFor('phone')).toBe(1);
    expect(rimBakeBudgetMb('phone')).toBe(32);
    expect(whiteBakeBudgetMb('phone')).toBe(16);
  });
  it('PC は余裕を持たせる(解像度2・縁64MB・白32MB)', () => {
    expect(resolutionCapFor('pc')).toBe(2);
    expect(rimBakeBudgetMb('pc')).toBe(64);
    expect(whiteBakeBudgetMb('pc')).toBe(32);
  });
});

describe('canBakeWithin — 焼き置きの天井を本当の上限にする(社長実機 v0.25.4959「変異体対策室で落ちた」)', () => {
  it('焼いた後の合計が天井以下の時だけ焼ける', () => {
    const MB = 1024 * 1024;
    expect(canBakeWithin(30 * MB, 1 * MB, 32 * MB)).toBe(true);
    expect(canBakeWithin(31 * MB, 1 * MB, 32 * MB)).toBe(true);   // ちょうど天井
    expect(canBakeWithin(31 * MB, 2 * MB, 32 * MB)).toBe(false);  // 超える=焼かない
    expect(canBakeWithin(40 * MB, 0, 32 * MB)).toBe(false);       // 既に超えている
  });
});
