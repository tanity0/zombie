import { describe, it, expect } from 'vitest';
import {
  expectedPower, powerMargin, escalation01, spawnEscalation, gateLiveCorrection, GATE_TARGET_END_HP,
  playerPower, DDA_SKILLCOUNT_COEFF, DDA_SKILLCOUNT_CAP,
} from './difficultyScaler';

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

describe('playerPower — skillCount term (SKILL_BUILD_REDESIGN.md §21-1 point 2, B5 DDA switch)', () => {
  const base = { level: 0, weaponTierSum: 0, maxHealth: 0, equippedCount: 0 };
  // maxHealth=0 makes the equippedCount/maxHealth terms 0 (Math.max(0, 0/120-1)*4 = 0), isolating skillCount.

  it('contributes 0 for an empty runBuild (0 slots)', () => {
    expect(playerPower({ ...base, skillCount: 0 })).toBe(0);
  });

  it('contributes exactly +3.0 (the cap) for a full 6-slot runBuild', () => {
    expect(playerPower({ ...base, skillCount: 6 })).toBeCloseTo(DDA_SKILLCOUNT_CAP, 6);
    expect(6 * DDA_SKILLCOUNT_COEFF).toBeCloseTo(DDA_SKILLCOUNT_CAP, 6); // 6×0.5=3.0(不変条件)
  });

  it('does not overshoot the cap beyond 6 slots (insurance clause, §11-1 B-18)', () => {
    expect(playerPower({ ...base, skillCount: 10 })).toBeCloseTo(DDA_SKILLCOUNT_CAP, 6);
  });

  it('scales linearly below the cap at the new 0.5 coefficient', () => {
    expect(playerPower({ ...base, skillCount: 2 })).toBeCloseTo(1.0, 6);
    expect(playerPower({ ...base, skillCount: 4 })).toBeCloseTo(2.0, 6);
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
