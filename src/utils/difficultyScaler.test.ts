import { describe, it, expect } from 'vitest';
import { expectedPower, powerMargin, escalation01, spawnEscalation, gateLiveCorrection, GATE_TARGET_END_HP } from './difficultyScaler';

describe('difficultyScaler — power margin & escalation (step 3)', () => {
  it('escalation is 0 for on-track / under-built players (floor preserved)', () => {
    expect(escalation01(1.0, true)).toBe(0);
    expect(escalation01(1.1, true)).toBe(0); // deadband
    expect(escalation01(0.7, true)).toBe(0);
    expect(escalation01(0.7, false)).toBe(0);
  });

  it('escalation rises for over-built players and is stronger at gates', () => {
    const gate = escalation01(2.0, true);
    const buildup = escalation01(2.0, false);
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThanOrEqual(1);
    expect(gate).toBeGreaterThan(buildup); // 関所は強め・余裕は弱め
    expect(buildup).toBeGreaterThan(0);    // 余裕でも難易度差はつく
  });

  it('escalation is monotonic in margin', () => {
    expect(escalation01(1.5, true)).toBeGreaterThan(escalation01(1.2, true));
    expect(escalation01(2.5, true)).toBeGreaterThan(escalation01(1.5, true));
  });

  it('margin ~1 when actual power matches the expected curve at that time', () => {
    const t = 180_000; // 3:00 → expected 4 + 4.2*3 = 16.6
    const m = powerMargin({ level: 14, weaponTierSum: 2, maxHealth: 120, equippedCount: 0, skillCount: 0 }, t);
    expect(m).toBeGreaterThan(0.85);
    expect(m).toBeLessThan(1.15);
    expect(escalation01(m, true)).toBe(0); // on-track → no escalation
  });

  it('a fresh start produces zero escalation (no change to early game)', () => {
    expect(expectedPower(0)).toBeGreaterThan(0);
    expect(spawnEscalation({ level: 1, weaponTierSum: 1, maxHealth: 120, equippedCount: 0, skillCount: 0 }, 0, true)).toBe(0);
  });

  it('an over-built player past the curve escalates (>0)', () => {
    const esc = spawnEscalation({ level: 25, weaponTierSum: 6, maxHealth: 200, equippedCount: 3, skillCount: 2 }, 180_000, true);
    expect(esc).toBeGreaterThan(0.3);
    expect(esc).toBeLessThanOrEqual(1);
  });
});

describe('gateLiveCorrection (step 4)', () => {
  it('adds pressure (>0) when HP is above the target curve (cruising)', () => {
    expect(gateLiveCorrection(0.9, 0.9, 0.5)).toBeGreaterThan(0);
  });

  it('eases (<0) when HP is below the target curve (struggling), with a floor', () => {
    const c = gateLiveCorrection(0.1, 0.9, 0.5);
    expect(c).toBeLessThan(0);
    expect(c).toBeGreaterThanOrEqual(-0.4); // 緩めの下限
  });

  it('is ~0 when HP tracks the target curve', () => {
    const target = 0.9 + (GATE_TARGET_END_HP - 0.9) * 0.5;
    expect(gateLiveCorrection(target, 0.9, 0.5)).toBeCloseTo(0, 6);
  });

  it('pressure side has more range than the ease side (anti-rubber-band bias)', () => {
    const press = gateLiveCorrection(1, 0, 0); // capped press
    const ease = gateLiveCorrection(0, 1, 0);  // capped ease
    expect(press).toBeGreaterThan(Math.abs(ease)); // 0.6 > 0.4
  });
});
