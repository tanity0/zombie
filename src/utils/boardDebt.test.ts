import { describe, it, expect } from 'vitest';
import { debtFor, debtTempoEaseMult, EVENT_DEBT_MAX, CAST_DEBT_MAX, RISE_DEBT_MAX } from './boardDebt';

const mk = (type: string, health: number, maxHealth: number) => ({ type, health, maxHealth }) as never;

describe('boardDebt (PACING_REDESIGN.mdバッチ3.5-B 盤面在庫)', () => {
  describe('debtFor', () => {
    it('is 0 for an empty board', () => {
      expect(debtFor([])).toBe(0);
    });
    it('weighs a full-health enemy at its full type weight', () => {
      expect(debtFor([mk('pumpkin', 100, 100)])).toBeCloseTo(6, 5);
      expect(debtFor([mk('bat', 100, 100)])).toBeCloseTo(0.5, 5);
    });
    it('scales down with remaining HP fraction (半分削ったパンプキン=在庫3)', () => {
      expect(debtFor([mk('pumpkin', 50, 100)])).toBeCloseTo(3, 5);
    });
    it('excludes types not in the weight table (boss/hunter/lab types etc.)', () => {
      expect(debtFor([mk('mimir', 100, 100), mk('hunter', 100, 100), mk('giantbat', 100, 100)])).toBe(0);
    });
    it('sums across a mixed board', () => {
      const total = debtFor([mk('bat', 100, 100), mk('zombie', 100, 100), mk('pumpkin', 50, 100)]);
      expect(total).toBeCloseTo(0.5 + 2.5 + 3, 5);
    });
    it('treats a dead-but-not-yet-removed enemy (health=0) as zero debt', () => {
      expect(debtFor([mk('pumpkin', 0, 100)])).toBe(0);
    });
  });

  describe('debtTempoEaseMult', () => {
    it('is 1 (no ease) at or below the floor (8)', () => {
      expect(debtTempoEaseMult(0)).toBe(1);
      expect(debtTempoEaseMult(8)).toBe(1);
    });
    it('increases monotonically above the floor', () => {
      expect(debtTempoEaseMult(10)).toBeGreaterThan(debtTempoEaseMult(9));
      expect(debtTempoEaseMult(9)).toBeGreaterThan(debtTempoEaseMult(8));
    });
    it('matches the documented formula: 1 + 0.05*(debt-8)', () => {
      expect(debtTempoEaseMult(12)).toBeCloseTo(1 + 0.05 * 4, 5);
    });
    it('caps at 1.6', () => {
      expect(debtTempoEaseMult(100)).toBe(1.6);
      expect(debtTempoEaseMult(1000)).toBe(1.6);
    });
  });

  it('exposes the documented threshold constants', () => {
    expect(EVENT_DEBT_MAX).toBe(12);
    expect(CAST_DEBT_MAX).toBe(10);
    expect(RISE_DEBT_MAX).toBe(10);
  });
});
