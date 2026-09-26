import { describe, it, expect } from 'vitest';
import {
  comboMilestoneCrossed, multiHitMilestoneTier, comboMilestoneAmp, milestoneSpring, milestoneTintMix,
  MILESTONE_RISE, multiHitDurationMs, MULTI_HIT_MILESTONE_MS, MULTI_HIT_NORMAL_MS, milestoneAlpha, milestoneSfxRate,
} from './comboMilestone';

describe('コンボの節目(utils/comboMilestone・社長承認2026-09-13・監査反映v0.25.4276)', () => {
  it('COMBO は節目を「跨いだか」で判定: 9→10 / 9→11 / 8→23 は出る、10→11 / 5→9 は出ない、50 で頭打ち', () => {
    expect(comboMilestoneCrossed(9, 10)).toBe(1);
    expect(comboMilestoneCrossed(9, 11)).toBe(1); // 一振りで2フィニッシュ=10を飛び越えても出る(監査A)
    expect(comboMilestoneCrossed(8, 23)).toBe(2);
    expect(comboMilestoneCrossed(10, 11)).toBe(0);
    expect(comboMilestoneCrossed(5, 9)).toBe(0);
    expect(comboMilestoneCrossed(49, 50)).toBe(5);
    expect(comboMilestoneCrossed(59, 60)).toBe(5);
    expect(comboMilestoneCrossed(11, 3)).toBe(0); // 途切れて減った
  });
  it('N HITS は一発の数: 10以上で段1、20以上で段2 … 50以上で5', () => {
    expect([1, 9].map(multiHitMilestoneTier)).toEqual([0, 0]);
    expect([10, 12, 20, 29, 50, 120].map(multiHitMilestoneTier)).toEqual([1, 1, 2, 2, 5, 5]);
    expect(multiHitDurationMs(12)).toBe(MULTI_HIT_MILESTONE_MS);
    expect(multiHitDurationMs(4)).toBe(MULTI_HIT_NORMAL_MS);
  });
  it('振幅は段で単調に増え、段0は0', () => {
    expect(comboMilestoneAmp(0)).toBe(0);
    const a = [1, 2, 3, 4, 5].map(comboMilestoneAmp);
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThan(a[i - 1]);
    expect(comboMilestoneAmp(9)).toBe(comboMilestoneAmp(5));
  });
  it('ばねは 0 から立ち上がって RISE で最大、途中で負(行き過ぎ)、終端で0', () => {
    expect(milestoneSpring(0)).toBe(0);
    expect(milestoneSpring(MILESTONE_RISE / 2)).toBeGreaterThan(0.5);
    expect(milestoneSpring(MILESTONE_RISE)).toBeCloseTo(1, 6);
    expect(milestoneSpring(0.5)).toBeLessThan(0);
    expect(Math.abs(milestoneSpring(0.5))).toBeLessThan(0.15);
    expect(milestoneSpring(1)).toBe(0);
  });
  it('白は最初に急に抜け(15%で75%戻る)、30%で本来の色。α は60%まで満・末尾で落ちる。音は段で上がる', () => {
    expect(milestoneTintMix(0)).toBe(0);
    expect(milestoneTintMix(0.15)).toBeCloseTo(0.75, 9);
    expect(milestoneTintMix(0.5)).toBe(1);
    expect(milestoneAlpha(0.3)).toBe(1);
    expect(milestoneAlpha(0.8)).toBeCloseTo(0.5, 9);
    expect(milestoneSfxRate(1)).toBe(1);
    expect(milestoneSfxRate(5)).toBeGreaterThan(milestoneSfxRate(1));
  });
});

import { milestoneSpring as spring2, milestoneSfxRate as rate2, multiHitDurationMs as dur2, killBannerDurationMs, MAX_TIER_HOLD_MULT, MULTI_HIT_MILESTONE_MS as MH_MS, KILL_BANNER_MS } from './comboMilestone';
describe('性格の分け(社長裁定2026-09-13)と段5の段差', () => {
  it("'hard'(頭上)は 'soft'(左上)より峰が早く減衰が速い", () => {
    expect(spring2(0.07, 'hard')).toBeCloseTo(1, 6);
    expect(spring2(0.07, 'soft')).toBeLessThan(1);
    expect(Math.abs(spring2(0.6, 'hard'))).toBeLessThan(Math.abs(spring2(0.6, 'soft')) + 1e-9);
    expect(spring2(0.5, 'hard')).toBeLessThan(0.05);
  });
  it('段5(50)だけ尺 ×1.4・音が一段高い', () => {
    expect(dur2(50)).toBe(Math.round(MH_MS * MAX_TIER_HOLD_MULT));
    expect(dur2(40)).toBe(MH_MS);
    expect(killBannerDurationMs(5)).toBe(Math.round(KILL_BANNER_MS * MAX_TIER_HOLD_MULT));
    expect(killBannerDurationMs(0)).toBe(KILL_BANNER_MS);
    expect(rate2(5) - rate2(4)).toBeGreaterThan(rate2(4) - rate2(3));
  });
});
