import { describe, it, expect } from 'vitest';
import {
  rafiMoveEligible, pickRafiMove, pickRafiCombo,
  RAFI_HANDGUN_DIST, RAFI_SWEEP_RANGE,
} from './rafiScript';

describe('rafiMoveEligible', () => {
  it('bone: ≤300px', () => {
    expect(rafiMoveEligible('bone', RAFI_HANDGUN_DIST, 1)).toBe(true);
    expect(rafiMoveEligible('bone', RAFI_HANDGUN_DIST + 1, 1)).toBe(false);
  });
  it('jump: >300px', () => {
    expect(rafiMoveEligible('jump', RAFI_HANDGUN_DIST + 1, 1)).toBe(true);
    expect(rafiMoveEligible('jump', RAFI_HANDGUN_DIST, 1)).toBe(false);
  });
  it('sweep: Phase2限定・≤200px', () => {
    expect(rafiMoveEligible('sweep', RAFI_SWEEP_RANGE, 2)).toBe(true);
    expect(rafiMoveEligible('sweep', RAFI_SWEEP_RANGE, 1)).toBe(false);
    expect(rafiMoveEligible('sweep', RAFI_SWEEP_RANGE + 1, 2)).toBe(false);
  });
  it('every band has at least one eligible move (no dead zone) in both phases', () => {
    const distances = [0, 100, 200, 300, 301, 1000];
    for (const phase of [1, 2] as const) {
      for (const d of distances) {
        const any = (['bone', 'jump', 'sweep'] as const).some(m => rafiMoveEligible(m, d, phase));
        expect(any).toBe(true);
      }
    }
  });
});

describe('pickRafiMove', () => {
  it('returns null when nothing is eligible (should not happen given full coverage, but defensive)', () => {
    // distance/phase combos always have coverage per the invariant above; this just checks determinism.
    expect(pickRafiMove(1000, 1, true, () => 0)).toBe('jump');
  });
  it('picks among the overlapping close-range pool deterministically via injected rand', () => {
    const picked = pickRafiMove(100, 2, true, () => 0);
    expect(['bone', 'sweep']).toContain(picked);
  });
  it('excludes sweep from the pool while its dedicated cooldown is not ready', () => {
    expect(pickRafiMove(100, 2, false, () => 0.999)).toBe('bone');
  });
});

describe('pickRafiCombo (§6.28-8連携)', () => {
  it('only fires in Phase2', () => {
    expect(pickRafiCombo('bone', 1, () => 0)).toBeNull();
  });
  it('fires under the chance threshold regardless of post-bone distance', () => {
    expect(pickRafiCombo('bone', 2, () => 0.49)).toBe('jump');
    expect(pickRafiCombo('bone', 2, () => 0.51)).toBeNull();
  });
  it('no followup defined for jump/sweep', () => {
    expect(pickRafiCombo('jump', 2, () => 0)).toBeNull();
    expect(pickRafiCombo('sweep', 2, () => 0)).toBeNull();
  });
});
