import { describe, it, expect } from 'vitest';
import {
  createPuzzleClockState, tickPuzzleClock, capForState, cdBasisForRank, cdBasisTightened,
  assessKomaDelta, applyKomaAssessment, createKomaAccumulator, stepKomaAccumulator, finalizeKomaAssessmentInput,
  BASE_CAP, R7_CAP_MIN, R7_CAP_MAX, R7_CAP_STEP, RAMP_INTERVAL_NORMAL_MS, RAMP_INTERVAL_TIGHT_MS,
  RAMP_NO_HIT_HOLD_MS, TIGHTEN_NO_HIT_MS, TIGHTEN_STARVE_MS, clampRank,
} from './rankAssessor';

describe('cdBasisForRank / cdBasisTightened', () => {
  it('matches the rank ladder R1=1.0s .. R6=0.25s', () => {
    expect(cdBasisForRank(1, R7_CAP_MIN)).toBe(1000);
    expect(cdBasisForRank(6, R7_CAP_MIN)).toBe(250);
  });
  it('R7=0.1s normally, but 0 once the R7 cap has grown to the max', () => {
    expect(cdBasisForRank(7, R7_CAP_MIN)).toBe(100);
    expect(cdBasisForRank(7, R7_CAP_MAX - 1)).toBe(100);
    expect(cdBasisForRank(7, R7_CAP_MAX)).toBe(0);
  });
  it('tightened uses one rank up (never below the plain value for R7)', () => {
    expect(cdBasisTightened(1, R7_CAP_MIN)).toBe(cdBasisForRank(2, R7_CAP_MIN));
    expect(cdBasisTightened(6, R7_CAP_MIN)).toBe(cdBasisForRank(7, R7_CAP_MIN));
    expect(cdBasisTightened(7, R7_CAP_MIN)).toBe(cdBasisForRank(7, R7_CAP_MIN));
    expect(cdBasisTightened(7, R7_CAP_MAX)).toBe(0);
  });
});

describe('tickPuzzleClock', () => {
  const base = { dtMs: 1000, msSinceLastHit: 999999, perf: 0.2, boardCount: 0 };

  it('ramps the board target by 1 every 6s while healthy and understocked', () => {
    let s = createPuzzleClockState();
    for (let i = 0; i < 6; i++) s = tickPuzzleClock(s, { ...base, dtMs: 1000, boardCount: 0 }).state;
    expect(s.boardTarget).toBe(2);
  });

  it('does not increase the target within 10s of a hit (held)', () => {
    let s = createPuzzleClockState();
    for (let i = 0; i < 6; i++) s = tickPuzzleClock(s, { ...base, dtMs: 1000, msSinceLastHit: 500, boardCount: 0 }).state;
    expect(s.boardTarget).toBe(1);
  });

  it('never ramps past the cap for the current rank (BASE_CAP for R1-R6)', () => {
    const s = { ...createPuzzleClockState(), boardTarget: BASE_CAP };
    const r = tickPuzzleClock(s, { ...base, dtMs: RAMP_INTERVAL_NORMAL_MS, boardCount: 0 });
    expect(r.state.boardTarget).toBe(BASE_CAP);
  });

  it('belowTargetMs resets to 0 the instant the board catches up to target', () => {
    const s = { ...createPuzzleClockState(), boardTarget: 5 };
    let r = tickPuzzleClock(s, { ...base, dtMs: 5000, boardCount: 2 });
    expect(r.state.belowTargetMs).toBe(5000);
    r = tickPuzzleClock(r.state, { ...base, dtMs: 1000, boardCount: 5 });
    expect(r.state.belowTargetMs).toBe(0);
  });

  it('tightens (real-time cinch) when no-hit >=15s AND perf>=0.6 — steps CD up one rank and speeds the ramp interval', () => {
    const s = createPuzzleClockState();
    const r = tickPuzzleClock(s, { dtMs: 1000, msSinceLastHit: TIGHTEN_NO_HIT_MS, perf: 0.7, boardCount: 0 });
    expect(r.tightened).toBe(true);
    expect(r.cdMs).toBe(cdBasisForRank(2, R7_CAP_MIN)); // R1 tightened -> R2 basis
  });

  it('tightens via the starving path (board understocked for >=15s) even with low perf', () => {
    const s = { ...createPuzzleClockState(), boardTarget: 5, belowTargetMs: TIGHTEN_STARVE_MS };
    const r = tickPuzzleClock(s, { dtMs: 100, msSinceLastHit: TIGHTEN_NO_HIT_MS, perf: 0.1, boardCount: 0 });
    expect(r.tightened).toBe(true);
  });

  it('does NOT tighten with low perf and no starving, even after 15s no-hit', () => {
    const s = createPuzzleClockState();
    const r = tickPuzzleClock(s, { dtMs: 1000, msSinceLastHit: TIGHTEN_NO_HIT_MS, perf: 0.3, boardCount: 5 });
    expect(r.tightened).toBe(false);
    expect(r.cdMs).toBe(cdBasisForRank(1, R7_CAP_MIN));
  });

  it('a hit (msSinceLastHit reset near 0) immediately drops tightening back to the rank baseline', () => {
    const r = tickPuzzleClock(createPuzzleClockState(), { dtMs: 16, msSinceLastHit: 0, perf: 0.9, boardCount: 0 });
    expect(r.tightened).toBe(false);
  });

  it('RAMP_NO_HIT_HOLD_MS < TIGHTEN_NO_HIT_MS (hold-off is shorter than the tighten trigger, as specced)', () => {
    expect(RAMP_NO_HIT_HOLD_MS).toBeLessThan(TIGHTEN_NO_HIT_MS);
  });

  it('tightened ramp interval (4s) is faster than normal (6s)', () => {
    expect(RAMP_INTERVAL_TIGHT_MS).toBeLessThan(RAMP_INTERVAL_NORMAL_MS);
  });
});

describe('capForState', () => {
  it('R1-R6 always use BASE_CAP regardless of r7Cap', () => {
    expect(capForState({ rank: 3, r7Cap: 18, boardTarget: 0, belowTargetMs: 0, msSinceRampMs: 0 })).toBe(BASE_CAP);
  });
  it('R7 uses r7Cap', () => {
    expect(capForState({ rank: 7, r7Cap: 16, boardTarget: 0, belowTargetMs: 0, msSinceRampMs: 0 })).toBe(16);
  });
});

describe('assessKomaDelta', () => {
  const good = { capReached: true, perfAvg: 0.5, intensAvg: 0.3, dmgRatio: 0.1, starveRatio: 0 };
  it('promotes when cap reached, low damage, and good perf', () => {
    expect(assessKomaDelta(good)).toBe(1);
  });
  it('promotes via the starveRatio path even with low perf (processing-speed credit)', () => {
    expect(assessKomaDelta({ ...good, perfAvg: 0.1, starveRatio: 0.5 })).toBe(1);
  });
  it('does not promote without capReached, even if everything else looks great', () => {
    expect(assessKomaDelta({ ...good, capReached: false })).toBe(0);
  });
  it('demotes on high damage ratio', () => {
    expect(assessKomaDelta({ ...good, dmgRatio: 0.6 })).toBe(-1);
  });
  it('demotes on sustained high intensity', () => {
    expect(assessKomaDelta({ ...good, dmgRatio: 0.1, intensAvg: 0.9 })).toBe(-1);
  });
  it('holds (0) otherwise', () => {
    expect(assessKomaDelta({ capReached: false, perfAvg: 0.5, intensAvg: 0.5, dmgRatio: 0.2, starveRatio: 0 })).toBe(0);
  });
});

describe('applyKomaAssessment', () => {
  const good = { capReached: true, perfAvg: 0.5, intensAvg: 0.3, dmgRatio: 0.1, starveRatio: 0 };
  const bad = { capReached: false, perfAvg: 0, intensAvg: 0.9, dmgRatio: 0.7, starveRatio: 0 };
  const hold = { capReached: false, perfAvg: 0.5, intensAvg: 0.5, dmgRatio: 0.2, starveRatio: 0 };

  it('promotes rank 1->2 on a good koma', () => {
    const s = applyKomaAssessment(createPuzzleClockState(), good);
    expect(s.rank).toBe(2);
  });
  it('holds rank on a neutral koma', () => {
    const s = applyKomaAssessment(createPuzzleClockState(), hold);
    expect(s.rank).toBe(1);
  });
  it('clamps at rank 1 (never demotes below it)', () => {
    const s = applyKomaAssessment(createPuzzleClockState(), bad);
    expect(s.rank).toBe(1);
  });
  it('promoting from rank 6 into rank 7 resets r7Cap to the minimum', () => {
    const atR6 = { rank: 6 as const, r7Cap: 18, boardTarget: 10, belowTargetMs: 0, msSinceRampMs: 0 };
    const s = applyKomaAssessment(atR6, good);
    expect(s.rank).toBe(7);
    expect(s.r7Cap).toBe(R7_CAP_MIN);
  });
  it('while at rank 7, a good koma grows r7Cap by R7_CAP_STEP instead of promoting rank (there is no rank 8)', () => {
    const atR7 = { rank: 7 as const, r7Cap: 10, boardTarget: 10, belowTargetMs: 0, msSinceRampMs: 0 };
    const s = applyKomaAssessment(atR7, good);
    expect(s.rank).toBe(7);
    expect(s.r7Cap).toBe(R7_CAP_MIN + R7_CAP_STEP);
  });
  it('r7Cap growth clamps at R7_CAP_MAX', () => {
    const atR7Full = { rank: 7 as const, r7Cap: R7_CAP_MAX, boardTarget: 20, belowTargetMs: 0, msSinceRampMs: 0 };
    const s = applyKomaAssessment(atR7Full, good);
    expect(s.r7Cap).toBe(R7_CAP_MAX);
  });
  it('while at rank 7 above the floor, a bad koma shrinks r7Cap by R7_CAP_STEP and rank stays 7', () => {
    const atR7 = { rank: 7 as const, r7Cap: 14, boardTarget: 14, belowTargetMs: 0, msSinceRampMs: 0 };
    const s = applyKomaAssessment(atR7, bad);
    expect(s.rank).toBe(7);
    expect(s.r7Cap).toBe(12);
  });
  it('at rank 7 with r7Cap already at the floor, a further bad koma actually demotes to rank 6 and resets the cap to 10', () => {
    const atR7Floor = { rank: 7 as const, r7Cap: R7_CAP_MIN, boardTarget: 10, belowTargetMs: 0, msSinceRampMs: 0 };
    const s = applyKomaAssessment(atR7Floor, bad);
    expect(s.rank).toBe(6);
    expect(s.r7Cap).toBe(R7_CAP_MIN);
  });
  it('demoting from rank 7 clamps a grown boardTarget down to BASE_CAP', () => {
    const atR7Floor = { rank: 7 as const, r7Cap: R7_CAP_MIN, boardTarget: 10, belowTargetMs: 0, msSinceRampMs: 0 };
    // Force a scenario where boardTarget somehow exceeds BASE_CAP going into the demotion (defensive clamp check).
    const s = applyKomaAssessment({ ...atR7Floor, boardTarget: 16 }, bad);
    expect(s.rank).toBe(6);
    expect(s.boardTarget).toBeLessThanOrEqual(BASE_CAP);
  });
});

describe('clampRank', () => {
  it('clamps to the 1..7 range', () => {
    expect(clampRank(0)).toBe(1);
    expect(clampRank(-3)).toBe(1);
    expect(clampRank(8)).toBe(7);
    expect(clampRank(4)).toBe(4);
  });
});

describe('koma accumulator (finalizeKomaAssessmentInput)', () => {
  it('produces a time-weighted average for perf/intensity, a damage ratio, and a starve ratio', () => {
    let acc = createKomaAccumulator();
    acc = stepKomaAccumulator(acc, { dtMs: 1000, perf: 0.5, intensity: 0.2, dmgTakenThisFrame: 10, boardCount: 5, boardTarget: 10, cap: 10 });
    acc = stepKomaAccumulator(acc, { dtMs: 1000, perf: 1.0, intensity: 0.4, dmgTakenThisFrame: 0, boardCount: 10, boardTarget: 10, cap: 10 });
    const input = finalizeKomaAssessmentInput(acc, 100);
    expect(input.perfAvg).toBeCloseTo(0.75, 5);
    expect(input.intensAvg).toBeCloseTo(0.3, 5);
    expect(input.dmgRatio).toBeCloseTo(0.1, 5);
    expect(input.starveRatio).toBeCloseTo(0.5, 5); // understocked for 1s out of 2s total
    expect(input.capReached).toBe(true); // boardTarget(10) >= cap(10) on both ticks
  });

  it('capReached stays false if the target never reaches the cap during the koma', () => {
    let acc = createKomaAccumulator();
    acc = stepKomaAccumulator(acc, { dtMs: 1000, perf: 0.5, intensity: 0.2, dmgTakenThisFrame: 0, boardCount: 3, boardTarget: 4, cap: 10 });
    expect(finalizeKomaAssessmentInput(acc, 100).capReached).toBe(false);
  });

  it('an empty koma (zero duration) does not divide by zero', () => {
    const acc = createKomaAccumulator();
    const input = finalizeKomaAssessmentInput(acc, 100);
    expect(Number.isFinite(input.perfAvg)).toBe(true);
    expect(Number.isFinite(input.starveRatio)).toBe(true);
  });
});
