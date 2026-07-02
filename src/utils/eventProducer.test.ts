import { describe, it, expect } from 'vitest';
import {
  eventGateOk, redNightPhaseGateOk, screamerPhaseGateOk, hunterBoredomReady, eventSizeMult,
  PITY_EVENT_BLOCK_TAIL_MS,
} from './eventProducer';
import { BORED_BONUS_MAX } from './boredomDirector';

describe('eventProducer (PACING_REDESIGN.mdバッチ7 憲法第5条)', () => {
  describe('eventGateOk', () => {
    it('blocks while another big event is active', () => {
      expect(eventGateOk({ bigEventActive: true, gameTime: 100000, pityBlockUntilMs: 0 })).toBe(false);
    });
    it('blocks during the pity tail window', () => {
      expect(eventGateOk({ bigEventActive: false, gameTime: 5000, pityBlockUntilMs: 6000 })).toBe(false);
    });
    it('allows firing once no big event is active and pity window has passed', () => {
      expect(eventGateOk({ bigEventActive: false, gameTime: 6000, pityBlockUntilMs: 6000 })).toBe(true);
    });
    it('PITY_EVENT_BLOCK_TAIL_MS is 10s (社長指示: 解除後10秒)', () => {
      expect(PITY_EVENT_BLOCK_TAIL_MS).toBe(10000);
    });
  });

  describe('redNightPhaseGateOk', () => {
    it('opens during buildup/boss (緩フェーズ)', () => {
      expect(redNightPhaseGateOk('buildup')).toBe(true);
      expect(redNightPhaseGateOk('boss')).toBe(true);
    });
    it('stays closed during gate (山に重ねない)', () => {
      expect(redNightPhaseGateOk('gate')).toBe(false);
    });
  });

  describe('screamerPhaseGateOk', () => {
    it('opens only during gate', () => {
      expect(screamerPhaseGateOk('gate')).toBe(true);
      expect(screamerPhaseGateOk('buildup')).toBe(false);
      expect(screamerPhaseGateOk('boss')).toBe(false);
    });
  });

  describe('hunterBoredomReady', () => {
    it('is not ready below the boredom bonus ceiling', () => {
      expect(hunterBoredomReady(0)).toBe(false);
      expect(hunterBoredomReady(BORED_BONUS_MAX - 2)).toBe(false);
    });
    it('is ready once the upswing bonus has maxed out (量では足りない余裕)', () => {
      expect(hunterBoredomReady(BORED_BONUS_MAX)).toBe(true);
    });
  });

  describe('eventSizeMult', () => {
    it('is 1.0 with no modifiers', () => {
      expect(eventSizeMult({ rank: 0, boredomBonusValue: 0, pityRecentlyActive: false })).toBe(1);
    });
    it('scales up for high rank and maxed-out boredom', () => {
      const m = eventSizeMult({ rank: 2, boredomBonusValue: BORED_BONUS_MAX, pityRecentlyActive: false });
      expect(m).toBeCloseTo(1.25 * 1.15, 5);
    });
    it('scales down after a recent pity rescue', () => {
      expect(eventSizeMult({ rank: 0, boredomBonusValue: 0, pityRecentlyActive: true })).toBeCloseTo(0.7, 5);
    });
  });
});
