import { describe, it, expect } from 'vitest';
import { shouldTriggerGate2, GATE2_BOSS_STRENGTH_MULT } from './gate2';

const baseTrigger = {
  enabled: true,
  wallIdx: 4 as number | null,
  gate2Cleared: false,
  activeEventActive: false,
};

describe('shouldTriggerGate2', () => {
  it('fires when the deep-zone wall (idx 4) is breached and gate2 is not yet cleared', () => {
    expect(shouldTriggerGate2(baseTrigger)).toBe(true);
  });

  it('does not fire for other wall indices', () => {
    expect(shouldTriggerGate2({ ...baseTrigger, wallIdx: 1 })).toBe(false);
    expect(shouldTriggerGate2({ ...baseTrigger, wallIdx: 2 })).toBe(false);
    expect(shouldTriggerGate2({ ...baseTrigger, wallIdx: 3 })).toBe(false);
    expect(shouldTriggerGate2({ ...baseTrigger, wallIdx: null })).toBe(false);
  });

  it('does not fire once gate2 has been permanently cleared for this stage', () => {
    expect(shouldTriggerGate2({ ...baseTrigger, gate2Cleared: true })).toBe(false);
  });

  it('does not fire while another event is already active (exclusive)', () => {
    expect(shouldTriggerGate2({ ...baseTrigger, activeEventActive: true })).toBe(false);
  });

  it('does not fire when disabled via the recovery flag', () => {
    expect(shouldTriggerGate2({ ...baseTrigger, enabled: false })).toBe(false);
  });
});

describe('GATE2_BOSS_STRENGTH_MULT', () => {
  it('is the documented ×2 (red-rare-equivalent) multiplier', () => {
    expect(GATE2_BOSS_STRENGTH_MULT).toBe(2);
  });
});
