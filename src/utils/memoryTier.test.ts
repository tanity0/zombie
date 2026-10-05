import { describe, it, expect } from 'vitest';
import { memoryTierFrom, rimBakeBudgetMb, whiteBakeBudgetMb, resolutionCapFor } from './memoryTier';

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
