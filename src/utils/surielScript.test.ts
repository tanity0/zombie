import { describe, it, expect } from 'vitest';
import { surielMoveEligible, pickSurielMove, pickSurielCombo, surielRingCount, SURIEL_RINGSPIN_RANGE } from './surielScript';

describe('surielMoveEligible', () => {
  it('ringshot and gaze are always eligible (no dead zone)', () => {
    for (const d of [0, 140, 500, 2000]) {
      expect(surielMoveEligible('ringshot', d, false)).toBe(true);
      expect(surielMoveEligible('gaze', d, false)).toBe(true);
    }
  });
  it('ringspin only within the melee-reject range', () => {
    expect(surielMoveEligible('ringspin', SURIEL_RINGSPIN_RANGE, false)).toBe(true);
    expect(surielMoveEligible('ringspin', SURIEL_RINGSPIN_RANGE + 1, false)).toBe(false);
  });
  it('sweep only while the ring is deployed away from the body', () => {
    expect(surielMoveEligible('sweep', 300, true)).toBe(true);
    expect(surielMoveEligible('sweep', 300, false)).toBe(false);
  });
});

describe('surielRingCount (§6.28-18 Phase2: 1→2)', () => {
  it('doubles the ring count in phase 2', () => {
    expect(surielRingCount(1)).toBe(1);
    expect(surielRingCount(2)).toBe(2);
  });
});

describe('pickSurielMove', () => {
  it('falls back to always-eligible moves in the dead zone (deployed=false, mid distance)', () => {
    const picked = pickSurielMove(500, false, () => 0);
    expect(['ringshot', 'gaze']).toContain(picked);
  });
});

describe('pickSurielCombo', () => {
  it('only follows ringshot, at the configured chance', () => {
    expect(pickSurielCombo('gaze', () => 0)).toBeNull();
    expect(pickSurielCombo('ringshot', () => 0.69)).toBe('sweep');
    expect(pickSurielCombo('ringshot', () => 0.71)).toBeNull();
  });
});
