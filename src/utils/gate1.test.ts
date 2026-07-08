import { describe, it, expect } from 'vitest';
import { shouldTriggerGate1, entersGate1Penalty, effectiveReaperRiskFloor, GATE1_FORMATION_STRENGTH_MULT } from './gate1';

const baseTrigger = {
  enabled: true,
  wallIdx: 3 as number | null,
  gate1Cleared: false,
  activeEventActive: false,
  doneThisRun: false,
};

describe('shouldTriggerGate1', () => {
  it('fires when the unconfirmed-zone wall (idx 3) is breached and gate1 is not yet cleared', () => {
    expect(shouldTriggerGate1(baseTrigger)).toBe(true);
  });

  it('does not fire for other wall indices (1500/3000/7500 boundaries)', () => {
    expect(shouldTriggerGate1({ ...baseTrigger, wallIdx: 1 })).toBe(false);
    expect(shouldTriggerGate1({ ...baseTrigger, wallIdx: 2 })).toBe(false);
    expect(shouldTriggerGate1({ ...baseTrigger, wallIdx: 4 })).toBe(false);
    expect(shouldTriggerGate1({ ...baseTrigger, wallIdx: null })).toBe(false);
  });

  it('does not fire once gate1 has been permanently cleared for this stage', () => {
    expect(shouldTriggerGate1({ ...baseTrigger, gate1Cleared: true })).toBe(false);
  });

  it('does not fire while another event is already active (exclusive)', () => {
    expect(shouldTriggerGate1({ ...baseTrigger, activeEventActive: true })).toBe(false);
  });

  it('does not fire when disabled via the recovery flag', () => {
    expect(shouldTriggerGate1({ ...baseTrigger, enabled: false })).toBe(false);
  });

  it('does not fire again in the same run once the in-run doneThisRun guard is set, even if gate1Cleared has not been committed yet', () => {
    expect(shouldTriggerGate1({ ...baseTrigger, gate1Cleared: false, doneThisRun: true })).toBe(false);
  });
});

describe('entersGate1Penalty', () => {
  it('enters penalty when crossing into the unconfirmed zone without clearing gate1', () => {
    expect(entersGate1Penalty(3, false)).toBe(true);
  });

  it('does not enter penalty if gate1 is already cleared', () => {
    expect(entersGate1Penalty(3, true)).toBe(false);
  });

  it('does not enter penalty for unrelated wall crossings', () => {
    expect(entersGate1Penalty(2, false)).toBe(false);
    expect(entersGate1Penalty(4, false)).toBe(false);
    expect(entersGate1Penalty(null, false)).toBe(false);
  });
});

describe('effectiveReaperRiskFloor', () => {
  it('returns the base floor when the penalty is not active', () => {
    expect(effectiveReaperRiskFloor(14600, false, 5000)).toBe(14600);
  });

  it('front-loads to the lower (frontloaded) floor when the penalty is active', () => {
    expect(effectiveReaperRiskFloor(14600, true, 5000)).toBe(5000);
  });

  it('never relaxes the threshold even if frontloadedFloor is somehow higher than base', () => {
    expect(effectiveReaperRiskFloor(14600, true, 20000)).toBe(14600);
  });
});

describe('GATE1_FORMATION_STRENGTH_MULT', () => {
  it('is the documented ×5 strength multiplier (§5.21-追補4)', () => {
    expect(GATE1_FORMATION_STRENGTH_MULT).toBe(5);
  });
});
