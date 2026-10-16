import { describe, it, expect } from 'vitest';
import { cruiseIntervalS, cruiseTotalMs, cruiseStage, cruiseStageBonus, cruiseRampFrac, cruiseDamageMult, equipCruiseTier } from './cruise';

describe('B3 巡航(research/THEONE_ROUND2.md §4b)', () => {
  it('間隔: ランナー無し1.0 / Lv1〜3=0.8/0.7/0.6 / 装備段階ごとに−0.1 / 下限0.1', () => {
    expect(cruiseIntervalS(0, 0)).toBeCloseTo(1.0);
    expect(cruiseIntervalS(1, 0)).toBeCloseTo(0.8);
    expect(cruiseIntervalS(2, 0)).toBeCloseTo(0.7);
    expect(cruiseIntervalS(3, 0)).toBeCloseTo(0.6);
    expect(cruiseIntervalS(0, 3)).toBeCloseTo(0.7);
    expect(cruiseIntervalS(3, 5)).toBeCloseTo(0.1);
    expect(cruiseIntervalS(3, 9)).toBeCloseTo(0.1);
  });
  it('総時間(読み②): 間隔1.0→3秒・0.1→0.1秒(全部積むと0.1秒で最大速)・単調', () => {
    expect(cruiseTotalMs(1.0)).toBeCloseTo(3000);
    expect(cruiseTotalMs(0.1)).toBeCloseTo(100);
    expect(cruiseTotalMs(0.6)).toBeGreaterThan(cruiseTotalMs(0.5));
  });
  it('素の足: 1秒で段1・2秒で段2・3秒で段3(1秒ごとに3段)', () => {
    const T = cruiseTotalMs(cruiseIntervalS(0, 0));
    expect(cruiseStage(999, T)).toBe(0);
    expect(cruiseStage(1000, T)).toBe(1);
    expect(cruiseStage(2000, T)).toBe(2);
    expect(cruiseStage(3000, T)).toBe(3);
    expect(cruiseStage(60000, T)).toBe(3);
  });
  it('段の値は +20/30/40%(累計ではない)・上がる瞬間は寄せ込む(跳ねない)', () => {
    const T = 3000;
    expect(cruiseStageBonus(500, T)).toBe(0);
    expect(cruiseStageBonus(1000, T)).toBeCloseTo(0);           // 段1に入った瞬間=前の段の値(0)
    expect(cruiseStageBonus(1120, T)).toBeCloseTo(0.20);        // 120ms で段1の値
    expect(cruiseStageBonus(1060, T)).toBeGreaterThan(0);
    expect(cruiseStageBonus(1060, T)).toBeLessThan(0.20);
    expect(cruiseStageBonus(2500, T)).toBeCloseTo(0.30);
    expect(cruiseStageBonus(9999, T)).toBeCloseTo(0.40);
  });
  it('全部積んだビルド: 0.1秒で段3', () => {
    const T = cruiseTotalMs(cruiseIntervalS(3, 5));
    expect(cruiseStage(100, T)).toBe(3);
    expect(cruiseStageBonus(200, T)).toBeCloseTo(0.40);
  });
  it('上乗せの立ち上がり割合 = sustain/total', () => {
    expect(cruiseRampFrac(1500, 3000)).toBeCloseTo(0.5);
    expect(cruiseRampFrac(5000, 3000)).toBe(1);
  });
  it('B11: 段1以上で装備段階×4%軽く・段0や装備無しは1', () => {
    expect(cruiseDamageMult(0, 5)).toBe(1);
    expect(cruiseDamageMult(1, 0)).toBe(1);
    expect(cruiseDamageMult(1, 5)).toBeCloseTo(0.8);
    expect(cruiseDamageMult(3, 2)).toBeCloseTo(0.92);
  });
  it('装備段階: 機動系の体だけ・特殊は移動速度から写す・無しは0', () => {
    expect(equipCruiseTier(undefined)).toBe(0);
    expect(equipCruiseTier({ body: null, arms: null, accessory: null })).toBe(0);
    expect(equipCruiseTier({ body: 'body-mobility-4', arms: null, accessory: null })).toBe(4);
    expect(equipCruiseTier({ body: 'body-protection-4', arms: null, accessory: null })).toBe(0);
  });
});
