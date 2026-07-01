import { describe, it, expect } from 'vitest';
import { evaluatePhasePerformance, rankFromPerformance, rankAdjustFor } from './directorRank';

describe('directorRank', () => {
  describe('evaluatePhasePerformance', () => {
    it('scores a flawless phase near 1', () => {
      const score = evaluatePhasePerformance({
        durationMs: 60000,
        damageTaken: 0,
        hpFracEnd: 1,
        kills: 60,
        levelGained: 2,
      });
      expect(score).toBeGreaterThan(0.95);
    });

    it('scores a rough phase (heavy damage, low HP, no kills) near 0', () => {
      const score = evaluatePhasePerformance({
        durationMs: 60000,
        damageTaken: 600, // 10/s >> DMG_RATE_BAD
        hpFracEnd: 0,
        kills: 0,
        levelGained: 0,
      });
      expect(score).toBeLessThan(0.05);
    });

    it('never exceeds [0, 1] even with extreme inputs', () => {
      const score = evaluatePhasePerformance({
        durationMs: 1,
        damageTaken: -100, // shouldn't happen upstream, but guard anyway
        hpFracEnd: 5,
        kills: 1000,
        levelGained: 1000,
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('rankFromPerformance', () => {
    it('maps low scores to rank 0 (floor = script baseline, never loosened)', () => {
      expect(rankFromPerformance(0)).toBe(0);
      expect(rankFromPerformance(0.61)).toBe(0);
    });

    it('maps mid scores to rank 1', () => {
      expect(rankFromPerformance(0.62)).toBe(1);
      expect(rankFromPerformance(0.81)).toBe(1);
    });

    it('maps high scores to rank 2', () => {
      expect(rankFromPerformance(0.82)).toBe(2);
      expect(rankFromPerformance(1)).toBe(2);
    });
  });

  describe('rankAdjustFor', () => {
    it('rank 0 is a strict no-op (matches the unranked baseline exactly)', () => {
      expect(rankAdjustFor(0)).toEqual({ escBoost: 0, countCapBonus: 0, rewardMult: 1 });
    });

    it('higher ranks only ever push upward, never below baseline', () => {
      const r1 = rankAdjustFor(1);
      const r2 = rankAdjustFor(2);
      expect(r1.escBoost).toBeGreaterThan(0);
      expect(r1.countCapBonus).toBeGreaterThan(0);
      expect(r1.rewardMult).toBeGreaterThan(1);
      expect(r2.escBoost).toBeGreaterThan(r1.escBoost);
      expect(r2.countCapBonus).toBeGreaterThanOrEqual(r1.countCapBonus);
      expect(r2.rewardMult).toBeGreaterThan(r1.rewardMult);
    });
  });
});
