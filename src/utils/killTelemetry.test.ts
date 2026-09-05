import { describe, it, expect } from 'vitest';
import { bucketForKill, styleFromKillCounts, isInRefractory, PROBLEM_REFRACTORY_MS } from './killTelemetry';

describe('bucketForKill (PACING_REDESIGN.mdバッチ2)', () => {
  it('keeps the 5 problem-child types as their own bucket', () => {
    expect(bucketForKill('pumpkin')).toBe('pumpkin');
    expect(bucketForKill('werewolf')).toBe('werewolf');
    expect(bucketForKill('plant')).toBe('plant');
    expect(bucketForKill('ghost')).toBe('ghost');
    expect(bucketForKill('screamer')).toBe('screamer');
  });

  it('lumps everything else (chaff, bosses, lab enemies) into "chaff"', () => {
    expect(bucketForKill('zombie')).toBe('chaff');
    expect(bucketForKill('bat')).toBe('chaff');
    expect(bucketForKill('skeleton')).toBe('chaff');
    expect(bucketForKill('giantbat')).toBe('chaff');
    expect(bucketForKill('reaper')).toBe('chaff');
    expect(bucketForKill('lab-zombie-1')).toBe('chaff');
  });
});

describe('styleFromKillCounts (PACING_REDESIGN.mdバッチ2)', () => {
  it('defaults to バランス when no kills have happened yet', () => {
    expect(styleFromKillCounts(0, 0)).toBe('バランス');
  });

  it('classifies 近接 when melee rate is above 0.6', () => {
    expect(styleFromKillCounts(2, 8)).toBe('近接'); // 80% melee
    expect(styleFromKillCounts(0, 10)).toBe('近接'); // pure melee
  });

  it('classifies 遠距離 when melee rate is below 0.3', () => {
    expect(styleFromKillCounts(8, 2)).toBe('遠距離'); // 20% melee
    expect(styleFromKillCounts(10, 0)).toBe('遠距離'); // pure gun
  });

  it('classifies バランス in the middle band [0.3, 0.6]', () => {
    expect(styleFromKillCounts(5, 5)).toBe('バランス'); // 50% melee
    expect(styleFromKillCounts(7, 3)).toBe('バランス'); // exactly 0.3 (boundary is exclusive-below on ranged)
    expect(styleFromKillCounts(4, 6)).toBe('バランス'); // exactly 0.6 (boundary is exclusive-above on melee)
  });
});

describe('isInRefractory (PACING_REDESIGN.mdバッチ3.5-Bの追補: 問題児リフラクトリ)', () => {
  it('is never in refractory when never killed (undefined)', () => {
    expect(isInRefractory(undefined, 100000)).toBe(false);
  });
  it('is in refractory for PROBLEM_REFRACTORY_MS(15s) after the last kill', () => {
    expect(isInRefractory(10000, 10000 + PROBLEM_REFRACTORY_MS - 1)).toBe(true);
  });
  it('leaves refractory exactly at the threshold', () => {
    expect(isInRefractory(10000, 10000 + PROBLEM_REFRACTORY_MS)).toBe(false);
  });
  it('PROBLEM_REFRACTORY_MS is 15s (社長指示の叩き台)', () => {
    expect(PROBLEM_REFRACTORY_MS).toBe(15000);
  });
});
