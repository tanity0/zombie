import { describe, it, expect } from 'vitest';
import {
  acrasielPhaseForHealth, acrasielSpikeGapCount, pickSpikeGapMask, isSpikeGapSector,
  pickAcrasielMove, pickAcrasielCombo, ACRASIEL_SECTOR_COUNT,
} from './acrasielScript';

describe('acrasielPhaseForHealth (§6.28-19: 60%/30%の3段)', () => {
  it('phase transitions at the documented thresholds', () => {
    expect(acrasielPhaseForHealth(1)).toBe(1);
    expect(acrasielPhaseForHealth(0.6)).toBe(2);
    expect(acrasielPhaseForHealth(0.3)).toBe(3);
    expect(acrasielPhaseForHealth(0)).toBe(3);
  });
});

describe('acrasielSpikeGapCount', () => {
  it('2 gaps in phase1, 1 gap from phase2 onward', () => {
    expect(acrasielSpikeGapCount(1)).toBe(2);
    expect(acrasielSpikeGapCount(2)).toBe(1);
    expect(acrasielSpikeGapCount(3)).toBe(1);
  });
});

describe('pickSpikeGapMask / isSpikeGapSector', () => {
  it('selects the requested number of distinct sectors', () => {
    const mask = pickSpikeGapMask(2, () => 0);
    let count = 0;
    for (let i = 0; i < ACRASIEL_SECTOR_COUNT; i++) if (isSpikeGapSector(mask, i)) count++;
    expect(count).toBe(2);
  });
  it('is deterministic given an injected rand', () => {
    const a = pickSpikeGapMask(1, () => 0);
    const b = pickSpikeGapMask(1, () => 0);
    expect(a).toBe(b);
  });
  it('clamps gapCount to the sector count', () => {
    const mask = pickSpikeGapMask(99, () => 0);
    let count = 0;
    for (let i = 0; i < ACRASIEL_SECTOR_COUNT; i++) if (isSpikeGapSector(mask, i)) count++;
    expect(count).toBe(ACRASIEL_SECTOR_COUNT);
  });
});

describe('pickAcrasielMove', () => {
  it('距離帯の重みから5技を選び、密着ではburst、遠距離ではspearを生かす', () => {
    expect(pickAcrasielMove(60, 1, () => 0)).toBe('spike');
    expect(pickAcrasielMove(60, 1, () => 0.99)).toBe('gaze');
    const nearPicks = Array.from({ length: 100 }, (_, i) => pickAcrasielMove(60, 1, () => i / 100));
    const farPicks = Array.from({ length: 100 }, (_, i) => pickAcrasielMove(900, 1, () => i / 100));
    expect(nearPicks).toContain('burst');
    expect(farPicks).toContain('spear');
  });
});

describe('pickAcrasielCombo (§6.28-19 Phase3: spike→spear同時)', () => {
  it('only fires in phase 3', () => {
    expect(pickAcrasielCombo('spike', 1, () => 0)).toBeNull();
    expect(pickAcrasielCombo('spike', 2, () => 0)).toBeNull();
  });
  it('fires deterministically (100%) in phase 3', () => {
    expect(pickAcrasielCombo('spike', 3, () => 0.999)).toBe('spear');
    expect(pickAcrasielCombo('spear', 3, () => 0.999)).toBe('warp');
  });
  it('no followup defined for other moves', () => {
    expect(pickAcrasielCombo('gaze', 3, () => 0)).toBeNull();
  });
});
