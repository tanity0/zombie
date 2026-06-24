import { describe, it, expect } from 'vitest';
import { areaIndexForPos, isBossType, AREA_COUNT, AREA_MAX_ENEMIES } from './enemyUtils';

describe('areaIndexForPos', () => {
  it('returns area by radial distance from the origin', () => {
    expect(areaIndexForPos(0, 0)).toBe(0);
    expect(areaIndexForPos(1499, 0)).toBe(0);
    expect(areaIndexForPos(1500, 0)).toBe(1);
    expect(areaIndexForPos(0, 3000)).toBe(2);
    expect(areaIndexForPos(5000, 0)).toBe(3);
    expect(areaIndexForPos(7500, 0)).toBe(4);
  });
  it('clamps to the deepest area far out', () => {
    expect(areaIndexForPos(99999, 99999)).toBe(AREA_COUNT - 1);
  });
});

describe('AREA_MAX_ENEMIES', () => {
  it('matches the per-area cap spec (5/7/10/10/10) and covers every area', () => {
    expect(AREA_MAX_ENEMIES).toEqual([5, 7, 10, 10, 10]);
    expect(AREA_MAX_ENEMIES).toHaveLength(AREA_COUNT);
  });
});

describe('isBossType', () => {
  it('flags boss/elite types only', () => {
    expect(isBossType('giantbat')).toBe(true);
    expect(isBossType('pumpkin')).toBe(true);
    expect(isBossType('reaper')).toBe(true);
    expect(isBossType('zombie')).toBe(false);
    expect(isBossType('plant')).toBe(false);
  });
});
