import { describe, it, expect } from 'vitest';
import {
  createBoredomState, stepBoredom, boredomBonus,
  BORED_START_MS, BORED_STEP_MS, BORED_BONUS_MAX, BORED_RESET_INTENSITY, BORED_RUN_GRACE_MS,
} from './boredomDirector';

const BORED = { performance: 0.9, intensity: 0.2, dtMs: 1000 };
const DANGEROUS = { performance: 0.9, intensity: 0.7, dtMs: 1000 };

describe('boredomDirector', () => {
  describe('stepBoredom', () => {
    it('accumulates while bored (high performance, low intensity)', () => {
      let s = createBoredomState();
      s = stepBoredom(s, BORED);
      expect(s.boredMs).toBe(1000);
    });

    it('does not accumulate during the run-start grace (gameTimeMs < BORED_RUN_GRACE_MS)', () => {
      let s = createBoredomState();
      s = stepBoredom(s, { ...BORED, gameTimeMs: 0 });
      s = stepBoredom(s, { ...BORED, gameTimeMs: BORED_RUN_GRACE_MS - 1 });
      expect(s.boredMs).toBe(0);
    });

    it('resets any accumulation while still inside the grace window', () => {
      let s = { boredMs: 30000 }; // 仮に溜まっていてもグレース中は0に戻す
      s = stepBoredom(s, { ...BORED, gameTimeMs: 1000 });
      expect(s.boredMs).toBe(0);
    });

    it('accumulates normally once past the grace window', () => {
      let s = createBoredomState();
      s = stepBoredom(s, { ...BORED, gameTimeMs: BORED_RUN_GRACE_MS });
      expect(s.boredMs).toBe(1000);
    });

    it('requires both conditions — low intensity alone or high performance alone does not count', () => {
      let s = createBoredomState();
      s = stepBoredom(s, { ...BORED, performance: 0.3 }); // low performance, low intensity
      expect(s.boredMs).toBe(0);
    });

    it('resets to zero immediately once intensity crosses BORED_RESET_INTENSITY', () => {
      let s = createBoredomState();
      for (let i = 0; i < 30; i++) s = stepBoredom(s, BORED); // 30s bored
      expect(s.boredMs).toBeGreaterThan(0);
      s = stepBoredom(s, { performance: 0.9, intensity: BORED_RESET_INTENSITY, dtMs: 1000 });
      expect(s.boredMs).toBe(0);
    });

    it('decays at 2x speed once the bored condition is no longer met (but below reset threshold)', () => {
      let s = createBoredomState();
      for (let i = 0; i < 9; i++) s = stepBoredom(s, BORED); // 9s accumulated
      s = stepBoredom(s, DANGEROUS); // intensity 0.7 triggers the hard reset, not decay
      expect(s.boredMs).toBe(0);
    });

    it('decays at 2x when merely not-bored (performance drops, intensity still low)', () => {
      let s = createBoredomState();
      for (let i = 0; i < 9; i++) s = stepBoredom(s, BORED); // 9s accumulated
      s = stepBoredom(s, { performance: 0.3, intensity: 0.2, dtMs: 1000 }); // not bored, not dangerous
      expect(s.boredMs).toBe(7000); // 9000 - 2*1000
    });
  });

  describe('boredomBonus', () => {
    it('is zero below BORED_START_MS', () => {
      expect(boredomBonus(0)).toBe(0);
      expect(boredomBonus(BORED_START_MS - 1)).toBe(0);
    });

    it('grants +2 right at BORED_START_MS, then +2 every BORED_STEP_MS after', () => {
      expect(boredomBonus(BORED_START_MS)).toBe(2);
      expect(boredomBonus(BORED_START_MS + BORED_STEP_MS)).toBe(4);
      expect(boredomBonus(BORED_START_MS + BORED_STEP_MS * 2)).toBe(6);
    });

    it('caps at BORED_BONUS_MAX no matter how long boredom persists', () => {
      expect(boredomBonus(BORED_START_MS + BORED_STEP_MS * 100)).toBe(BORED_BONUS_MAX);
    });
  });
});
