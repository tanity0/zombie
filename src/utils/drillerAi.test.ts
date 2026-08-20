import { describe, expect, it } from 'vitest';
import {
  resolvePumpkinTier, allowDrillerForRun, drillerZoneFor, drillerCanThrust,
  isDrillerRetreating, DRILLER_APPROACH_DIST, DRILLER_BACKOFF_DIST, DRILLER_THRUST_RANGE,
} from './drillerAi';

describe('resolvePumpkinTier', () => {
  it('always returns pumpkin when allowDriller is false', () => {
    expect(resolvePumpkinTier(false, () => 0)).toBe('pumpkin');
    expect(resolvePumpkinTier(false, () => 0.999)).toBe('pumpkin');
  });

  it('returns driller when allowDriller and rand<0.5', () => {
    expect(resolvePumpkinTier(true, () => 0)).toBe('driller');
    expect(resolvePumpkinTier(true, () => 0.49)).toBe('driller');
  });

  it('returns pumpkin when allowDriller and rand>=0.5', () => {
    expect(resolvePumpkinTier(true, () => 0.5)).toBe('pumpkin');
    expect(resolvePumpkinTier(true, () => 0.99)).toBe('pumpkin');
  });
});

describe('allowDrillerForRun', () => {
  it('gates on stage-4..7', () => {
    expect(allowDrillerForRun('stage-4', false)).toBe(true);
    expect(allowDrillerForRun('stage-5', false)).toBe(true);
    expect(allowDrillerForRun('stage-6', false)).toBe(true);
    expect(allowDrillerForRun('stage-7', false)).toBe(true);
    expect(allowDrillerForRun('stage-1', false)).toBe(false);
    expect(allowDrillerForRun('stage-3', false)).toBe(false);
    expect(allowDrillerForRun(null, false)).toBe(false);
    expect(allowDrillerForRun(undefined, false)).toBe(false);
  });

  it('is always false on a measurement run (boss maker / gauntlet), even in stage-4..7', () => {
    expect(allowDrillerForRun('stage-4', true)).toBe(false);
    expect(allowDrillerForRun('stage-7', true)).toBe(false);
  });
});

describe('drillerZoneFor (§9-4 間合い3分岐)', () => {
  it('approaches when farther than 190px', () => {
    expect(drillerZoneFor(191)).toBe('approach');
    expect(drillerZoneFor(500)).toBe('approach');
  });

  it('backs off when closer than 130px', () => {
    expect(drillerZoneFor(129)).toBe('backoff');
    expect(drillerZoneFor(0)).toBe('backoff');
  });

  it('holds inside the 130-190px band (inclusive)', () => {
    expect(drillerZoneFor(DRILLER_BACKOFF_DIST)).toBe('hold');
    expect(drillerZoneFor(160)).toBe('hold');
    expect(drillerZoneFor(DRILLER_APPROACH_DIST)).toBe('hold');
  });
});

describe('drillerCanThrust', () => {
  it('true at or under 200px, false beyond', () => {
    expect(drillerCanThrust(0)).toBe(true);
    expect(drillerCanThrust(DRILLER_THRUST_RANGE)).toBe(true);
    expect(drillerCanThrust(DRILLER_THRUST_RANGE + 0.1)).toBe(false);
  });
});

describe('isDrillerRetreating', () => {
  it('false when undefined or expired', () => {
    expect(isDrillerRetreating(undefined, 1000)).toBe(false);
    expect(isDrillerRetreating(900, 1000)).toBe(false);
    expect(isDrillerRetreating(1000, 1000)).toBe(false);
  });

  it('true while within the window', () => {
    expect(isDrillerRetreating(1001, 1000)).toBe(true);
    expect(isDrillerRetreating(3000, 1000)).toBe(true);
  });
});
