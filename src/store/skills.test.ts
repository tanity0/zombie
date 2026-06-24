// Unit tests for the reworked melee skill numbers (knife-master combo mult,
// slasher follow-up decay). Pure functions/constants from the store — see
// CLAUDE.md Testing policy (test the changed logic in the same commit).
import { describe, it, expect } from 'vitest';
import { skillMeleeComboMult, SLASHER_MULTS, SLASHER_MAX_HITS,
  skillAttackShooterGunMult, skillRunnerSpeedMult, skillSeekerProcChance, isSeekerActive } from './gameStore';
import { rollSkillLevel, skillMaxLevel, rarityWeightsForPity, levelWeightsFor,
  gachaSuperPercent, gachaPityRemaining, gachaPromotePercent } from '../data/campaign';
import type { Player, SkillKey } from '../types/game';

// Minimal player carrying one leveled skill (for the simple multiplier skills).
const withSkill = (key: SkillKey, level: number): Player =>
  ({ skills: [key], skillLevels: { [key]: level } } as unknown as Player);

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

describe('rarity soft-pity weights', () => {
  it('base weights at pity 0 = 70/25/5', () => {
    expect(rarityWeightsForPity(0)).toEqual({ normal: 70, rare: 25, super: 5 });
  });
  it('each non-super pull shifts normal −5 / rare +4 / super +1', () => {
    expect(rarityWeightsForPity(1)).toEqual({ normal: 65, rare: 29, super: 6 });
    expect(rarityWeightsForPity(10)).toEqual({ normal: 20, rare: 65, super: 15 });
  });
  it('caps at pity 14: normal 0 / rare 81 / super 19, and clamps beyond', () => {
    expect(rarityWeightsForPity(14)).toEqual({ normal: 0, rare: 81, super: 19 });
    expect(rarityWeightsForPity(20)).toEqual({ normal: 0, rare: 81, super: 19 });
    expect(gachaSuperPercent(14)).toBe(19);
    expect(gachaPityRemaining(0)).toBe(14);
    expect(gachaPityRemaining(14)).toBe(0);
  });
});

describe('skill level table (per-skill dupe count)', () => {
  it('reaper/bomber are Lv1-only; others cap at Lv3', () => {
    expect(skillMaxLevel('reaper')).toBe(1);
    expect(skillMaxLevel('bomber')).toBe(1);
    expect(skillMaxLevel('knife-master')).toBe(3);
  });

  it('level weights follow the confirmed table', () => {
    expect(levelWeightsFor('normal', 0)).toEqual([80, 15, 5]);
    expect(levelWeightsFor('normal', 2)).toEqual([70, 20, 10]);
    expect(levelWeightsFor('normal', 5)).toEqual([50, 40, 10]);
    expect(levelWeightsFor('normal', 6)).toEqual([20, 40, 40]);
    expect(levelWeightsFor('rare', 1)).toEqual([70, 20, 10]);
    expect(levelWeightsFor('rare', 3)).toEqual([20, 40, 40]);
    expect(levelWeightsFor('super', 0)).toEqual([70, 20, 10]);
    expect(levelWeightsFor('super', 2)).toEqual([10, 30, 60]);
  });

  it('rolls within 1..maxLv; Lv1-only always returns Lv1', () => {
    expect(rollSkillLevel('normal', 0, 1, () => 0)).toBe(1);
    expect(rollSkillLevel('normal', 0, 1, () => 0.999)).toBe(1);
    expect(rollSkillLevel('normal', 0, 3, () => 0)).toBe(1);   // first bucket
    expect(rollSkillLevel('normal', 6, 3, () => 0.999)).toBe(3); // top bucket
  });

  it('gachaPromotePercent = chance the next roll exceeds current Lv', () => {
    // normal dupe6 = [20,40,40]; from Lv1 → chance of Lv2 or Lv3 = 80%.
    expect(gachaPromotePercent('normal', 1, 6, 3)).toBe(80);
    // from Lv2 → only Lv3 = 40%.
    expect(gachaPromotePercent('normal', 2, 6, 3)).toBe(40);
    // at max Lv → 0.
    expect(gachaPromotePercent('normal', 3, 6, 3)).toBe(0);
  });
});

describe('attack-shooter gun damage bonus (+10/20/30%)', () => {
  it('scales by level and is ×1.0 without the skill', () => {
    expect(skillAttackShooterGunMult({ skills: [], skillLevels: {} } as unknown as Player)).toBeCloseTo(1.0);
    expect(skillAttackShooterGunMult(withSkill('attack-shooter', 1))).toBeCloseTo(1.10);
    expect(skillAttackShooterGunMult(withSkill('attack-shooter', 2))).toBeCloseTo(1.20);
    expect(skillAttackShooterGunMult(withSkill('attack-shooter', 3))).toBeCloseTo(1.30);
  });
});

describe('runner move speed bonus (+10/15/20%)', () => {
  it('scales by level and is ×1.0 without the skill', () => {
    expect(skillRunnerSpeedMult({ skills: [], skillLevels: {} } as unknown as Player)).toBeCloseTo(1.0);
    expect(skillRunnerSpeedMult(withSkill('runner', 1))).toBeCloseTo(1.10);
    expect(skillRunnerSpeedMult(withSkill('runner', 2))).toBeCloseTo(1.15);
    expect(skillRunnerSpeedMult(withSkill('runner', 3))).toBeCloseTo(1.20);
  });
});

describe('seeker proc chance (30/40/50%) + active window', () => {
  it('proc chance scales by level, 0 without the skill', () => {
    expect(skillSeekerProcChance({ skills: [], skillLevels: {} } as unknown as Player)).toBe(0);
    expect(skillSeekerProcChance(withSkill('seeker', 1))).toBeCloseTo(0.30);
    expect(skillSeekerProcChance(withSkill('seeker', 2))).toBeCloseTo(0.40);
    expect(skillSeekerProcChance(withSkill('seeker', 3))).toBeCloseTo(0.50);
  });
  it('isSeekerActive compares seekerUntil against gameTime', () => {
    expect(isSeekerActive({ seekerUntil: 5000 } as unknown as Player, 4000)).toBe(true);
    expect(isSeekerActive({ seekerUntil: 5000 } as unknown as Player, 5000)).toBe(false);
    expect(isSeekerActive({ seekerUntil: 0 } as unknown as Player, 1000)).toBe(false);
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
