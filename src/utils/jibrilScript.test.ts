import { describe, it, expect } from 'vitest';
import {
  jibrilVolleyMode, jibrilConsecrateEligible, pickJibrilMove, pickJibrilCombo,
  JIBRIL_HANDGUN_DIST, JIBRIL_CONSECRATE_RANGE, JIBRIL_LANTERN_CHANCE, JIBRIL_COMBO_CHANCE,
} from './jibrilScript';

describe('jibrilVolleyMode', () => {
  it('close within handgun distance, snipe beyond', () => {
    expect(jibrilVolleyMode(JIBRIL_HANDGUN_DIST)).toBe('close');
    expect(jibrilVolleyMode(JIBRIL_HANDGUN_DIST + 1)).toBe('snipe');
  });
});

describe('jibrilConsecrateEligible (§6.28-6 #4: Phase2限定・密着帯)', () => {
  it('requires phase 2, in-range, and off cooldown', () => {
    expect(jibrilConsecrateEligible(2, JIBRIL_CONSECRATE_RANGE, true)).toBe(true);
    expect(jibrilConsecrateEligible(1, JIBRIL_CONSECRATE_RANGE, true)).toBe(false);
    expect(jibrilConsecrateEligible(2, JIBRIL_CONSECRATE_RANGE + 1, true)).toBe(false);
    expect(jibrilConsecrateEligible(2, JIBRIL_CONSECRATE_RANGE, false)).toBe(false);
  });
});

describe('pickJibrilMove', () => {
  it('prefers consecrate whenever eligible, regardless of the roll', () => {
    expect(pickJibrilMove(2, 100, true, () => 0.99)).toBe('consecrate');
  });
  it('falls back to the lantern/volley split when consecrate is not eligible', () => {
    expect(pickJibrilMove(1, 100, true, () => 0)).toBe('lantern');
    expect(pickJibrilMove(1, 100, true, () => JIBRIL_LANTERN_CHANCE + 0.01)).toBe('volley');
  });
});

describe('pickJibrilCombo (§6.28-6 Phase2連携)', () => {
  it('only fires in phase 2', () => {
    expect(pickJibrilCombo('lantern', 1, () => 0)).toBeNull();
  });
  it('fires under the shared chance for both lantern and consecrate', () => {
    expect(pickJibrilCombo('lantern', 2, () => JIBRIL_COMBO_CHANCE - 0.01)).toBe('volley');
    expect(pickJibrilCombo('lantern', 2, () => JIBRIL_COMBO_CHANCE + 0.01)).toBeNull();
    expect(pickJibrilCombo('consecrate', 2, () => JIBRIL_COMBO_CHANCE - 0.01)).toBe('volley');
  });
  it('no followup for volley itself', () => {
    expect(pickJibrilCombo('volley', 2, () => 0)).toBeNull();
  });
});
