import { describe, it, expect } from 'vitest';
import { weaknessCritBonus } from './weaknessCrit';

describe('weaknessCritBonus (PACING_PUZZLE.md §5.6 M7・チャフの武器弱点クリティカル)', () => {
  it('バットは銃で+0.10、近接では0', () => {
    expect(weaknessCritBonus('bat', 'gun')).toBe(0.10);
    expect(weaknessCritBonus('bat', 'melee')).toBe(0);
  });
  it('スケルトンは近接で+0.10、銃では0', () => {
    expect(weaknessCritBonus('skeleton', 'melee')).toBe(0.10);
    expect(weaknessCritBonus('skeleton', 'gun')).toBe(0);
  });
  it('ゾンビは銃で+0.10、近接では0', () => {
    expect(weaknessCritBonus('zombie', 'gun')).toBe(0.10);
    expect(weaknessCritBonus('zombie', 'melee')).toBe(0);
  });
  it('問題児・ボス等(表に無い型)は銃・近接どちらでも0', () => {
    const others = ['pumpkin', 'werewolf', 'plant', 'ghost', 'screamer', 'reaper', 'giantbat', 'thor'] as const;
    for (const type of others) {
      expect(weaknessCritBonus(type, 'gun')).toBe(0);
      expect(weaknessCritBonus(type, 'melee')).toBe(0);
    }
  });
});
