import { describe, it, expect } from 'vitest';
import {
  berserkerFrameLight, overclockFrameLit, BERSERKER_LIGHT_HP_FRAC, OVERCLOCK_LIGHT_MS,
} from './frameLight';

describe('berserkerFrameLight (SKILL_BUILD_REDESIGN.md §21 B5)', () => {
  it('never lights without the skill, even at 0 HP', () => {
    expect(berserkerFrameLight(false, 0, 100)).toEqual({ lit: false, intensity: 0 });
    expect(berserkerFrameLight(false, 50, 100)).toEqual({ lit: false, intensity: 0 });
  });

  it('does not light at or above the 70% HP threshold', () => {
    expect(berserkerFrameLight(true, 100, 100).lit).toBe(false);
    expect(berserkerFrameLight(true, 70, 100).lit).toBe(false); // ちょうど70%=未満ではない
    expect(berserkerFrameLight(true, 71, 100).lit).toBe(false);
  });

  it('lights below the 70% HP threshold, with intensity proportional to lost HP', () => {
    const just = berserkerFrameLight(true, 69, 100);
    expect(just.lit).toBe(true);
    expect(just.intensity).toBeGreaterThan(0);
    expect(just.intensity).toBeLessThan(0.1);

    const half = berserkerFrameLight(true, 35, 100); // hpFrac=0.35
    expect(half.lit).toBe(true);
    expect(half.intensity).toBeCloseTo((BERSERKER_LIGHT_HP_FRAC - 0.35) / BERSERKER_LIGHT_HP_FRAC, 6);

    const zero = berserkerFrameLight(true, 0, 100);
    expect(zero.lit).toBe(true);
    expect(zero.intensity).toBe(1);
  });

  it('is monotonic: less HP never yields a lower intensity than more HP', () => {
    const higherHp = berserkerFrameLight(true, 60, 100).intensity;
    const lowerHp = berserkerFrameLight(true, 20, 100).intensity;
    expect(lowerHp).toBeGreaterThan(higherHp);
  });

  it('degrades safely for maxHealth<=0 (no divide-by-zero light)', () => {
    expect(berserkerFrameLight(true, 0, 0)).toEqual({ lit: false, intensity: 0 });
  });
});

describe('overclockFrameLit (SKILL_BUILD_REDESIGN.md §21 B5)', () => {
  it('never lights without the skill', () => {
    expect(overclockFrameLit(false, 10_000, 0)).toBe(false);
  });

  it('never lights when no proc has happened yet (lightUntil=0 default)', () => {
    expect(overclockFrameLit(true, 0, 0)).toBe(false);
    expect(overclockFrameLit(true, 0, 100)).toBe(false);
  });

  it('lights for exactly OVERCLOCK_LIGHT_MS after a proc, then turns off', () => {
    const procAt = 5_000;
    const lightUntil = procAt + OVERCLOCK_LIGHT_MS;
    expect(overclockFrameLit(true, lightUntil, procAt)).toBe(true);              // 発火の瞬間
    expect(overclockFrameLit(true, lightUntil, procAt + OVERCLOCK_LIGHT_MS - 1)).toBe(true); // 799ms後
    expect(overclockFrameLit(true, lightUntil, procAt + OVERCLOCK_LIGHT_MS)).toBe(false);     // 800ms後=消灯
    expect(overclockFrameLit(true, lightUntil, procAt + OVERCLOCK_LIGHT_MS + 500)).toBe(false);
  });
});
