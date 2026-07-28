// PACING_PUZZLE.md §6.24 M48(武器庫)E2の配置ロジック: 「空きスロット優先→全部埋まっていれば
// いちばんTierが低い部位を置換」。純関数 armoryTargetSlot の不変条件を機械化する。
import { describe, it, expect } from 'vitest';
import { armoryTargetSlot, emptyEquipLoadout } from './equipment';
import type { EquipLoadout } from '../types/game';

const rngSeq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

describe('armoryTargetSlot(空きスロット優先)', () => {
  it('全部空きなら空きスロットのどれかを返す(乱数で選ぶ)', () => {
    const loadout = emptyEquipLoadout();
    expect(['body', 'arms', 'accessory']).toContain(armoryTargetSlot(loadout, rngSeq(0)));
    expect(armoryTargetSlot(loadout, rngSeq(0))).toBe('body');
    expect(armoryTargetSlot(loadout, rngSeq(0.99))).toBe('accessory');
  });

  it('1つだけ空きがあれば、その空きスロットを返す(乱数に依らない)', () => {
    const loadout: EquipLoadout = { body: 'body-protection-3', arms: null, accessory: 'accessory-crit-2' };
    expect(armoryTargetSlot(loadout, rngSeq(0))).toBe('arms');
    expect(armoryTargetSlot(loadout, rngSeq(0.99))).toBe('arms');
  });
});

describe('armoryTargetSlot(全部埋まっている時=最もTierが低い部位を置換)', () => {
  it('通常装備同士なら最低Tierのスロットを返す', () => {
    const loadout: EquipLoadout = {
      body: 'body-protection-4',   // tier4
      arms: 'arms-firepower-1',    // tier1 ← 最低
      accessory: 'accessory-crit-3', // tier3
    };
    expect(armoryTargetSlot(loadout)).toBe('arms');
  });

  it('特殊装備(tier0扱い)は真っ先に置換対象になる', () => {
    const loadout: EquipLoadout = {
      body: 'special-body',        // 特殊=tier0
      arms: 'arms-firepower-5',    // tier5
      accessory: 'accessory-crit-5', // tier5
    };
    expect(armoryTargetSlot(loadout)).toBe('body');
  });

  it('全スロットが同Tierなら先頭(body)から順に見つかったものを返す(決定的)', () => {
    const loadout: EquipLoadout = {
      body: 'body-protection-2',
      arms: 'arms-firepower-2',
      accessory: 'accessory-crit-2',
    };
    expect(armoryTargetSlot(loadout)).toBe('body');
  });
});
