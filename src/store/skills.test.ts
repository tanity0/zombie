// Unit tests for the reworked melee skill numbers (knife-master combo mult,
// slasher follow-up decay). Pure functions/constants from the store — see
// CLAUDE.md Testing policy (test the changed logic in the same commit).
import { describe, it, expect } from 'vitest';
import { skillMeleeComboMult, SLASHER_MULTS, SLASHER_MAX_HITS } from './gameStore';
import type { Player } from '../types/game';

// Minimal player shape for skillMeleeComboMult (reads skills + knifeCombo* only).
const knifeMaster = (count: number, until = 10_000): Player =>
  ({ skills: ['knife-master'], knifeComboCount: count, knifeComboUntil: until } as unknown as Player);

describe('knife-master combo damage (+2%/hit, cap +100%)', () => {
  const at = (count: number, until = 10_000) =>
    skillMeleeComboMult(knifeMaster(count, until), 0, 0, 0);

  it('is ×1.0 with no combo and +2% per hit', () => {
    expect(at(0)).toBeCloseTo(1.0);
    expect(at(1)).toBeCloseTo(1.02);
    expect(at(10)).toBeCloseTo(1.20);
  });

  it('caps at +100% (×2.0) — 50 hits to cap', () => {
    expect(at(50)).toBeCloseTo(2.0);
    expect(at(99)).toBeCloseTo(2.0); // clamped, never exceeds ×2
  });

  it('reverts to ×1.0 once the 3s combo window has expired', () => {
    // gameTime (0) >= knifeComboUntil (-1) → window dead
    expect(skillMeleeComboMult(knifeMaster(40, -1), 0, 0, 0)).toBeCloseTo(1.0);
  });

  it('is ×1.0 without the skill', () => {
    const noSkill = { skills: [], knifeComboCount: 40, knifeComboUntil: 10_000 } as unknown as Player;
    expect(skillMeleeComboMult(noSkill, 0, 0, 0)).toBeCloseTo(1.0);
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
