import { describe, it, expect } from 'vitest';
import {
  stepHeavySniperStillMs, heavySniperChargeFrac, heavySniperRangePx, heavySniperCooldownMs,
  HEAVY_SNIPER_CHARGE_FULL_MS, HEAVY_SNIPER_RANGE_MIN_PX, HEAVY_SNIPER_RANGE_MAX_PX,
  HEAVY_SNIPER_BASE_COOLDOWN_MS,
} from './heavySniperCharge';

describe('stepHeavySniperStillMs', () => {
  it('移動していれば即0へリセット', () => {
    expect(stepHeavySniperStillMs(2500, 16, true)).toBe(0);
  });

  it('静止していれば蓄積が進む', () => {
    expect(stepHeavySniperStillMs(1000, 500, false)).toBe(1500);
  });

  it('満額(3000ms)で頭打ちになる', () => {
    expect(stepHeavySniperStillMs(2900, 500, false)).toBe(HEAVY_SNIPER_CHARGE_FULL_MS);
  });
});

describe('heavySniperChargeFrac / heavySniperRangePx / heavySniperCooldownMs', () => {
  it('蓄積0=射程250(カテゴリ既定と同じ)・連射間隔は基準値そのまま(×1.0)', () => {
    expect(heavySniperChargeFrac(0)).toBe(0);
    expect(heavySniperRangePx(0)).toBe(HEAVY_SNIPER_RANGE_MIN_PX);
    expect(heavySniperCooldownMs(0)).toBe(HEAVY_SNIPER_BASE_COOLDOWN_MS);
  });

  it('蓄積満額(3秒)=射程400・連射間隔×0.6', () => {
    const frac = heavySniperChargeFrac(HEAVY_SNIPER_CHARGE_FULL_MS);
    expect(frac).toBe(1);
    expect(heavySniperRangePx(frac)).toBe(HEAVY_SNIPER_RANGE_MAX_PX);
    expect(heavySniperCooldownMs(frac)).toBeCloseTo(HEAVY_SNIPER_BASE_COOLDOWN_MS * 0.6, 5);
  });

  it('中間(1.5秒=frac0.5)は線形補間', () => {
    const frac = heavySniperChargeFrac(1500);
    expect(frac).toBeCloseTo(0.5, 5);
    expect(heavySniperRangePx(frac)).toBeCloseTo(325, 5);
    expect(heavySniperCooldownMs(frac)).toBeCloseTo(HEAVY_SNIPER_BASE_COOLDOWN_MS * 0.8, 5);
  });
});
