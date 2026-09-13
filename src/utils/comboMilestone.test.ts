import { describe, it, expect } from 'vitest';
import { comboMilestoneTier, comboMilestoneAmp, milestoneSpring, milestoneTintMix } from './comboMilestone';

describe('コンボの節目(utils/comboMilestone・社長承認2026-09-13)', () => {
  it('10の倍数だけ段が立ち、50で頭打ち', () => {
    expect([0, 1, 9, 11, 15].map(comboMilestoneTier)).toEqual([0, 0, 0, 0, 0]);
    expect([10, 20, 30, 40, 50, 60, 120].map(comboMilestoneTier)).toEqual([1, 2, 3, 4, 5, 5, 5]);
  });
  it('振幅は段で単調に増え、段0は0', () => {
    expect(comboMilestoneAmp(0)).toBe(0);
    const a = [1, 2, 3, 4, 5].map(comboMilestoneAmp);
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThan(a[i - 1]);
    expect(a[0]).toBeCloseTo(0.8, 9);
    expect(comboMilestoneAmp(9)).toBe(comboMilestoneAmp(5));
  });
  it('ばねは最初が最大で、途中で負(行き過ぎ)になり、終端で0', () => {
    expect(milestoneSpring(0)).toBe(1);
    expect(milestoneSpring(0.45)).toBeLessThan(0);
    expect(Math.abs(milestoneSpring(0.45))).toBeLessThan(0.15);
    expect(milestoneSpring(1)).toBe(0);
  });
  it('色は最初の30%で白から本来の色へ', () => {
    expect(milestoneTintMix(0)).toBe(0);
    expect(milestoneTintMix(0.15)).toBeCloseTo(0.5, 9);
    expect(milestoneTintMix(0.5)).toBe(1);
  });
});
