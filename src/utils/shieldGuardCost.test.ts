import { describe, it, expect } from 'vitest';
import {
  shieldGuardCostFor, shieldBeamDrainFor, isShieldChipAttacker,
  SHIELD_GUARD_COST_BOSS, SHIELD_BEAM_DRAIN_DT_MAX,
} from './shieldGuardCost';

describe('盾の代償: 区分ごとの耐久(research/SHIELD_BLOCK.md §8)', () => {
  it('ボス級(ステージのボス・裏ボス・死神・賞金首・幻影・城ボス・使者)は1回 10', () => {
    for (const t of ['mimir', 'thor', 'skadi', 'phillboss', 'reaper', 'bounty-ranged', 'bounty-maiko', 'guardian-phantom', 'giantbat', 'hangedman', 'mutant-hero'] as const) {
      expect(shieldGuardCostFor(t), t).toBe(SHIELD_GUARD_COST_BOSS);
      expect(isShieldChipAttacker(t)).toBe(true);
    }
  });
  it('強個体(パンプキン・削岩型・伐採人・研究所3・ハンター)と雑魚は削れない(0)', () => {
    for (const t of ['pumpkin', 'driller', 'logger', 'lab-zombie-3', 'hunter', 'zombie', 'werewolf', 'screamer'] as const) {
      expect(shieldGuardCostFor(t), t).toBe(0);
    }
    expect(shieldGuardCostFor(undefined)).toBe(0);
  });
  it('光線は毎秒 10: 1/60秒で 10/60。dt は上限で切る。ボス級でなければ 0', () => {
    expect(shieldBeamDrainFor('mimir', 1 / 60)).toBeCloseTo(10 / 60);
    expect(shieldBeamDrainFor('mimir', 1)).toBeCloseTo(10 * SHIELD_BEAM_DRAIN_DT_MAX);
    expect(shieldBeamDrainFor('mimir', -1)).toBe(0);
    expect(shieldBeamDrainFor('zombie', 1 / 60)).toBe(0);
  });
});
