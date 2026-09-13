import { describe, it, expect } from 'vitest';
import {
  forestFlowersInRegion, FLOWER_VARIANTS, FLOWER_SAFE_RADIUS,
} from './forestDecor';

describe('forestFlowersInRegion', () => {
  it('scatters flowers on stage-1', () => {
    const f = forestFlowersInRegion('stage-1', 0, 0, 2000, 2000);
    expect(f.length).toBeGreaterThan(0);
  });

  it('returns nothing on non-stage-1 stages (scoped)', () => {
    for (const id of ['stage-2', 'stage-3', 'stage-4', 'stage-ex1', '']) {
      expect(forestFlowersInRegion(id, 0, 0, 2000, 2000)).toEqual([]);
    }
  });

  it('is deterministic for the same region', () => {
    const a = forestFlowersInRegion('stage-1', 500, 500, 1500, 1500);
    const b = forestFlowersInRegion('stage-1', 500, 500, 1500, 1500);
    expect(b).toEqual(a);
  });

  it('keeps the spawn origin clear (safe radius)', () => {
    const f = forestFlowersInRegion('stage-1', -1000, -1000, 1000, 1000);
    for (const fl of f) {
      expect(Math.hypot(fl.footX, fl.footY)).toBeGreaterThanOrEqual(FLOWER_SAFE_RADIUS);
    }
  });

  it('only emits valid variant indices', () => {
    const f = forestFlowersInRegion('stage-1', 0, 0, 3000, 3000);
    for (const fl of f) {
      expect(fl.variant).toBeGreaterThanOrEqual(0);
      expect(fl.variant).toBeLessThan(FLOWER_VARIANTS);
      expect(Number.isInteger(fl.variant)).toBe(true);
    }
  });
});
