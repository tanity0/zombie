// Unit tests for the reworked melee skill numbers (knife-master combo mult,
// slasher follow-up decay). Pure functions/constants from the store — see
// CLAUDE.md Testing policy (test the changed logic in the same commit).
import { describe, it, expect } from 'vitest';
import { skillMeleeComboMult, SLASHER_MULTS, SLASHER_MAX_HITS } from './gameStore';
import { rollSkillLevel, skillMaxLevel } from '../data/campaign';
import type { Player } from '../types/game';

// Minimal player shape for skillMeleeComboMult (reads skills + skillLevels + knifeCombo* only).
const knifeMaster = (count: number, level = 1, until = 10_000): Player =>
  ({ skills: ['knife-master'], skillLevels: { 'knife-master': level }, knifeComboCount: count, knifeComboUntil: until } as unknown as Player);

describe('knife-master combo damage (leveled +2%/+2%/+4% per hit, cap +50%/+70%/+100%)', () => {
  const at = (count: number, level = 1, until = 10_000) =>
    skillMeleeComboMult(knifeMaster(count, level, until), 0, 0, 0);

  it('Lv1: +2%/hit, caps at +50% (×1.5)', () => {
    expect(at(0, 1)).toBeCloseTo(1.0);
    expect(at(1, 1)).toBeCloseTo(1.02);
    expect(at(10, 1)).toBeCloseTo(1.20);
    expect(at(25, 1)).toBeCloseTo(1.5);
    expect(at(99, 1)).toBeCloseTo(1.5); // clamped
  });

  it('Lv2: +2%/hit, caps at +70% (×1.7)', () => {
    expect(at(10, 2)).toBeCloseTo(1.20);
    expect(at(35, 2)).toBeCloseTo(1.7);
    expect(at(99, 2)).toBeCloseTo(1.7); // clamped
  });

  it('Lv3: +4%/hit, caps at +100% (×2.0)', () => {
    expect(at(10, 3)).toBeCloseTo(1.40);
    expect(at(25, 3)).toBeCloseTo(2.0);
    expect(at(99, 3)).toBeCloseTo(2.0); // clamped
  });

  it('reverts to ×1.0 once the 3s combo window has expired', () => {
    // gameTime (0) >= knifeComboUntil (-1) → window dead
    expect(skillMeleeComboMult(knifeMaster(40, 3, -1), 0, 0, 0)).toBeCloseTo(1.0);
  });

  it('is ×1.0 without the skill', () => {
    const noSkill = { skills: [], knifeComboCount: 40, knifeComboUntil: 10_000 } as unknown as Player;
    expect(skillMeleeComboMult(noSkill, 0, 0, 0)).toBeCloseTo(1.0);
  });
});

describe('skill level gacha roll', () => {
  it('reaper/bomber are Lv1-only; others cap at Lv3', () => {
    expect(skillMaxLevel('reaper')).toBe(1);
    expect(skillMaxLevel('bomber')).toBe(1);
    expect(skillMaxLevel('knife-master')).toBe(3);
  });

  it('a Lv1-only skill always rolls Lv1 regardless of rng', () => {
    expect(rollSkillLevel('normal', 1, () => 0)).toBe(1);
    expect(rollSkillLevel('normal', 1, () => 0.999)).toBe(1);
  });

  it('rolls within 1..maxLv and is weighted toward Lv1', () => {
    // rng=0 hits the first bucket (Lv1); rng near 1 hits the rarest top level.
    expect(rollSkillLevel('normal', 3, () => 0)).toBe(1);
    expect(rollSkillLevel('normal', 3, () => 0.999)).toBe(3);
    // super rarity makes higher levels even rarer, but still bounded to maxLv.
    const lv = rollSkillLevel('super', 3, () => 0.5);
    expect(lv).toBeGreaterThanOrEqual(1);
    expect(lv).toBeLessThanOrEqual(3);
  });
});

describe('slasher follow-up multipliers', () => {
  it('is a 3-hit ladder decaying ×2/3 each (1.0 / 0.667 / 0.444)', () => {
    expect(SLASHER_MULTS).toHaveLength(SLASHER_MAX_HITS);
    expect(SLASHER_MULTS[0]).toBeCloseTo(1.0);
    expect(SLASHER_MULTS[1]).toBeCloseTo(0.6667, 3);
    expect(SLASHER_MULTS[2]).toBeCloseTo(0.4444, 3);
  });
});
