import { describe, it, expect } from 'vitest';
import { normalizeChaffMix, excitedChaffMix, pickChaffMix, type ChaffMix } from './chaffMix';

describe('chaffMix (PACING_REDESIGN.mdバッチ3.5-A チャフ配合)', () => {
  describe('normalizeChaffMix', () => {
    it('normalizes an arbitrary ratio to sum to 1', () => {
      const n = normalizeChaffMix({ bat: 70, skeleton: 25, zombie: 5 });
      expect(n.bat + n.skeleton + n.zombie).toBeCloseTo(1, 5);
      expect(n.bat).toBeCloseTo(0.7, 5);
    });
    it('falls back to all-bat when the mix sums to zero', () => {
      expect(normalizeChaffMix({ bat: 0, skeleton: 0, zombie: 0 })).toEqual({ bat: 1, skeleton: 0, zombie: 0 });
    });
  });

  describe('excitedChaffMix', () => {
    it('boosts bat share and cuts zombie share relative to the base mix', () => {
      const base = normalizeChaffMix({ bat: 30, skeleton: 45, zombie: 25 });
      const excited = excitedChaffMix({ bat: 30, skeleton: 45, zombie: 25 });
      expect(excited.bat).toBeGreaterThan(base.bat);
      expect(excited.zombie).toBeLessThan(base.zombie);
    });
  });

  describe('pickChaffMix', () => {
    const sceneMix: ChaffMix = { bat: 30, skeleton: 45, zombie: 25 };

    it('returns the scene mix unchanged when pressure is null (緩フェーズ・関所外)', () => {
      expect(pickChaffMix(sceneMix, null)).toEqual(normalizeChaffMix(sceneMix));
    });

    it('is the excited variant at pressure=0 (入りはバット多めで走らせる)', () => {
      expect(pickChaffMix(sceneMix, 0)).toEqual(excitedChaffMix(sceneMix));
    });

    it('is the scene base mix at pressure=1 (捌けているほど骨→壁へ)', () => {
      const atOne = pickChaffMix(sceneMix, 1);
      const base = normalizeChaffMix(sceneMix);
      expect(atOne.bat).toBeCloseTo(base.bat, 5);
      expect(atOne.skeleton).toBeCloseTo(base.skeleton, 5);
      expect(atOne.zombie).toBeCloseTo(base.zombie, 5);
    });

    it('shifts monotonically: bat share decreases and zombie share increases as pressure rises', () => {
      const p0 = pickChaffMix(sceneMix, 0);
      const p50 = pickChaffMix(sceneMix, 0.5);
      const p100 = pickChaffMix(sceneMix, 1);
      expect(p0.bat).toBeGreaterThanOrEqual(p50.bat);
      expect(p50.bat).toBeGreaterThanOrEqual(p100.bat);
      expect(p0.zombie).toBeLessThanOrEqual(p50.zombie);
      expect(p50.zombie).toBeLessThanOrEqual(p100.zombie);
    });

    it('clamps out-of-range pressure to [0,1]', () => {
      expect(pickChaffMix(sceneMix, -5)).toEqual(pickChaffMix(sceneMix, 0));
      expect(pickChaffMix(sceneMix, 5)).toEqual(pickChaffMix(sceneMix, 1));
    });

    it('always sums to 1 across the pressure range', () => {
      for (const p of [0, 0.2, 0.5, 0.8, 1]) {
        const m = pickChaffMix(sceneMix, p);
        expect(m.bat + m.skeleton + m.zombie).toBeCloseTo(1, 5);
      }
    });
  });
});
