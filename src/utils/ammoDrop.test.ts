import { describe, it, expect } from 'vitest';
import { pickAmmoDropType } from './ammoDrop';

describe('pickAmmoDropType (PACING_PUZZLE.md §5.5 M5・RE4式)', () => {
  it('残弾割合(reserve/max)が最小の弾種を選ぶ', () => {
    const owned = [
      { type: 'handgun' as const, reserve: 60, max: 72 },  // 0.83
      { type: 'shotgun' as const, reserve: 4, max: 24 },   // 0.17 ← 最小
      { type: 'rifle' as const, reserve: 18, max: 36 },    // 0.5
    ];
    expect(pickAmmoDropType(owned, 'handgun')).toBe('shotgun');
  });

  it('同率なら構えている銃の弾種を優先する', () => {
    const owned = [
      { type: 'handgun' as const, reserve: 36, max: 72 },  // 0.5
      { type: 'rifle' as const, reserve: 18, max: 36 },    // 0.5(同率)
    ];
    expect(pickAmmoDropType(owned, 'rifle')).toBe('rifle');
    expect(pickAmmoDropType(owned, 'handgun')).toBe('handgun');
  });

  it('全弾満タン(全て同率1.0)でも構え優先', () => {
    const owned = [
      { type: 'handgun' as const, reserve: 72, max: 72 },
      { type: 'shotgun' as const, reserve: 24, max: 24 },
    ];
    expect(pickAmmoDropType(owned, 'shotgun')).toBe('shotgun');
  });

  it('所持1種なら従来どおりその弾種', () => {
    expect(pickAmmoDropType([{ type: 'handgun', reserve: 0, max: 72 }], 'handgun')).toBe('handgun');
  });

  it('構えの弾種が同率グループに無ければ入力順の先頭', () => {
    const owned = [
      { type: 'shotgun' as const, reserve: 0, max: 24 },   // 0 ← 最小
      { type: 'rifle' as const, reserve: 0, max: 36 },     // 0 ← 同率最小
      { type: 'handgun' as const, reserve: 72, max: 72 },  // 1.0(構えだが最小でない)
    ];
    expect(pickAmmoDropType(owned, 'handgun')).toBe('shotgun');
  });

  it('PHILL弾は候補から除外(phillが最小割合でも選ばない)', () => {
    const owned = [
      { type: 'phill' as const, reserve: 0, max: 48 },
      { type: 'handgun' as const, reserve: 72, max: 72 },
    ];
    expect(pickAmmoDropType(owned, 'phill')).toBe('handgun');
  });

  it('候補が空(phillのみ/所持なし)はnull=呼び出し側の従来フォールバックに委ねる', () => {
    expect(pickAmmoDropType([{ type: 'phill', reserve: 0, max: 48 }], 'phill')).toBeNull();
    expect(pickAmmoDropType([], undefined)).toBeNull();
  });

  it('activeType未指定(銃を構えていない)でも最小割合を選べる', () => {
    const owned = [
      { type: 'handgun' as const, reserve: 72, max: 72 },
      { type: 'rifle' as const, reserve: 9, max: 36 },
    ];
    expect(pickAmmoDropType(owned, undefined)).toBe('rifle');
  });
});
