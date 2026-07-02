import { describe, it, expect } from 'vitest';
import {
  createGatePressureState, stepGatePressure, startPressureForRank,
  intervalMultForPressure, capBonusForPressure, rareBoostActiveForPressure,
  allowedProblemChildren, specialCastOrder, ceilingForMaxRung, ceilingForZone,
} from './gatePressure';

const GOOD = { msSinceLastHit: 20000, killRateEma: 1, hitImpulse: false, intensity: 0.2, ceiling: 1, dtMs: 1000 };

describe('stepGatePressure', () => {
  it('rises monotonically under sustained no-hit + good kill pace', () => {
    let s = createGatePressureState(0);
    let last = 0;
    for (let i = 0; i < 20; i++) {
      const r = stepGatePressure(s, GOOD);
      expect(r.state.pressure).toBeGreaterThanOrEqual(last);
      last = r.state.pressure;
      s = r.state;
    }
    expect(last).toBeGreaterThan(0.5);
  });

  it('down-tau is faster than up-tau: the same perf/pressure gap closes faster on the way down', () => {
    // Rising from 0 toward perf=1 for 1s vs falling from 1 toward perf=0 for 1s — same 1.0 gap.
    const rising = stepGatePressure(createGatePressureState(0), { ...GOOD, dtMs: 1000 });
    const falling = stepGatePressure(createGatePressureState(1), { msSinceLastHit: 0, killRateEma: 0, hitImpulse: false, intensity: 0, ceiling: 1, dtMs: 1000 });
    const risenBy = rising.state.pressure - 0;
    const fellBy = 1 - falling.state.pressure;
    expect(fellBy).toBeGreaterThan(risenBy);
  });

  it('a hit impulse steps pressure down by exactly 0.15 (before any tau-based movement further adjusts it)', () => {
    const start = createGatePressureState(0.5);
    // Use a zero-perf, zero-dt-effective step isolated: dtMs=0 means alpha=0 so tau movement is skipped.
    const r = stepGatePressure(start, { msSinceLastHit: 0, killRateEma: 0, hitImpulse: true, intensity: 0, ceiling: 1, dtMs: 0 });
    expect(r.state.pressure).toBeCloseTo(0.35, 5);
  });

  it('threshold hysteresis: oscillating around 0.50 only fires the cast event once until it drops below 0.45', () => {
    let s = createGatePressureState(0.48);
    // Cross up through 0.50.
    let r = stepGatePressure(s, { msSinceLastHit: 999999, killRateEma: 999, hitImpulse: false, intensity: 0, ceiling: 1, dtMs: 50000 });
    s = r.state;
    expect(r.castFirstNow).toBe(true);
    expect(s.pressure).toBeGreaterThanOrEqual(0.5);
    // Wobble down slightly (still above 0.45) and back up — must NOT re-fire.
    r = stepGatePressure(s, { msSinceLastHit: 0, killRateEma: 0, hitImpulse: false, intensity: 0, ceiling: 1, dtMs: 50 });
    s = r.state;
    expect(r.castFirstNow).toBe(false);
    r = stepGatePressure(s, GOOD);
    expect(r.castFirstNow).toBe(false);
  });

  it('threshold hysteresis: dropping below 0.45 re-arms the cast event for the next up-crossing', () => {
    let s: { pressure: number; crossed50: boolean; crossed65: boolean } = { pressure: 0.5, crossed50: true, crossed65: false };
    // Drop hard below 0.45.
    let r = stepGatePressure(s, { msSinceLastHit: 0, killRateEma: 0, hitImpulse: false, intensity: 0, ceiling: 1, dtMs: 30000 });
    s = r.state;
    expect(s.pressure).toBeLessThan(0.45);
    expect(s.crossed50).toBe(false);
    // Rise back up through 0.50 — should fire again.
    r = stepGatePressure(s, { msSinceLastHit: 999999, killRateEma: 999, hitImpulse: false, intensity: 0, ceiling: 1, dtMs: 50000 });
    expect(r.castFirstNow).toBe(true);
  });

  it('clamps to the ceiling and never exceeds it', () => {
    let s = createGatePressureState(0);
    for (let i = 0; i < 50; i++) s = stepGatePressure(s, { ...GOOD, ceiling: 0.5, dtMs: 2000 }).state;
    expect(s.pressure).toBeLessThanOrEqual(0.5);
  });

  it('stops rising while Intensity >= 0.75 (only decay is allowed)', () => {
    const start = createGatePressureState(0.3);
    const r = stepGatePressure(start, { ...GOOD, intensity: 0.9, dtMs: 5000 });
    expect(r.state.pressure).toBeLessThanOrEqual(0.3);
  });

  it('バッチ3.5-B: stops rising while boardDebt exceeds RISE_DEBT_MAX, even with low Intensity', () => {
    const start = createGatePressureState(0.3);
    const r = stepGatePressure(start, { ...GOOD, boardDebt: 11 });
    expect(r.state.pressure).toBeLessThanOrEqual(0.3);
  });

  it('バッチ3.5-B: boardDebt omitted (undefined) behaves exactly like debt=0 (no regression)', () => {
    const withZero = stepGatePressure(createGatePressureState(0.3), { ...GOOD, boardDebt: 0 });
    const omitted = stepGatePressure(createGatePressureState(0.3), GOOD);
    expect(omitted.state.pressure).toBeCloseTo(withZero.state.pressure, 10);
  });

  it('バッチ3.5-B: rises normally when boardDebt is at or below RISE_DEBT_MAX', () => {
    const start = createGatePressureState(0);
    const r = stepGatePressure(start, { ...GOOD, boardDebt: 10 });
    expect(r.state.pressure).toBeGreaterThan(0);
  });
});

describe('startPressureForRank', () => {
  it('rank0=0, rank1=+0.1, rank2=+0.2 (DirectorRank folded into the gate-entry bonus)', () => {
    expect(startPressureForRank(0)).toBe(0);
    expect(startPressureForRank(1)).toBe(0.1);
    expect(startPressureForRank(2)).toBe(0.2);
  });
});

describe('lever conversions', () => {
  it('intervalMultForPressure runs from 1.0 (pressure=0) to 0.55 (pressure=1)', () => {
    expect(intervalMultForPressure(0)).toBeCloseTo(1.0, 5);
    expect(intervalMultForPressure(1)).toBeCloseTo(0.55, 5);
    expect(intervalMultForPressure(0.5)).toBeCloseTo(0.775, 5);
  });

  it('capBonusForPressure is 0 below 0.55 and 2 at/above it — a single step, not a ramp', () => {
    expect(capBonusForPressure(0.54)).toBe(0);
    expect(capBonusForPressure(0.55)).toBe(2);
    expect(capBonusForPressure(1)).toBe(2);
  });

  it('rareBoostActiveForPressure flips at 0.80', () => {
    expect(rareBoostActiveForPressure(0.79)).toBe(false);
    expect(rareBoostActiveForPressure(0.80)).toBe(true);
  });
});

describe('specialCastOrder', () => {
  it('ranged style casts pumpkin first, then werewolf', () => {
    expect(specialCastOrder('遠距離', 0)).toEqual(['pumpkin', 'werewolf']);
  });
  it('melee style casts werewolf first, then pumpkin', () => {
    expect(specialCastOrder('近接', 0)).toEqual(['werewolf', 'pumpkin']);
  });
  it('balanced style uses the tie-break draw, and is otherwise deterministic for a given draw', () => {
    expect(specialCastOrder('バランス', 0.2)).toEqual(['pumpkin', 'werewolf']);
    expect(specialCastOrder('バランス', 0.8)).toEqual(['werewolf', 'pumpkin']);
  });
});

describe('allowedProblemChildren', () => {
  const cast: ['pumpkin', 'werewolf'] = ['pumpkin', 'werewolf'];
  it('nothing is allowed below 0.35', () => {
    expect(allowedProblemChildren(0.34, cast)).toEqual([]);
  });
  it('unlocks accumulate: plant → first special → second special → screamer → ghost', () => {
    expect(allowedProblemChildren(0.35, cast)).toEqual(['plant']);
    expect(allowedProblemChildren(0.50, cast)).toEqual(['plant', 'pumpkin']);
    expect(allowedProblemChildren(0.65, cast)).toEqual(['plant', 'pumpkin', 'werewolf']);
    expect(allowedProblemChildren(0.80, cast)).toEqual(['plant', 'pumpkin', 'werewolf', 'screamer']);
    expect(allowedProblemChildren(0.95, cast)).toEqual(['plant', 'pumpkin', 'werewolf', 'screamer', 'ghost']);
  });
});

describe('ceilingForMaxRung / ceilingForZone', () => {
  it('maps the legacy discrete rungs (2-7) to their pressure ceilings', () => {
    expect(ceilingForMaxRung(3)).toBeCloseTo(0.49, 5);
    expect(ceilingForMaxRung(7)).toBeCloseTo(1.0, 5);
  });
  it('zone ceilings match the 憲法第4条 table (areas 0-1 capped hardest)', () => {
    expect(ceilingForZone(0)).toBeCloseTo(0.34, 5);
    expect(ceilingForZone(1)).toBeCloseTo(0.34, 5);
    expect(ceilingForZone(2)).toBeCloseTo(0.79, 5);
    expect(ceilingForZone(4)).toBeCloseTo(1.0, 5);
  });
});
