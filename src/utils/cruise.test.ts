import { describe, it, expect } from 'vitest';
import { cruiseTotalMsFor, cruiseStage, cruiseStageBonus, cruiseRampFrac, cruiseDamageMult, equipCruiseTier, cruiseSoftCap, cruiseSpeedMult } from './cruise';

describe('B3 巡航(research/THEONE_ROUND2.md §4b)', () => {
  it('総時間(v0.25.5083・掛け算): 3秒 × ランナー 0.8/0.7/0.6 × 0.9^装備段階 / 全部揃えても約1.06秒', () => {
    expect(cruiseTotalMsFor(0, 0)).toBeCloseTo(3000);
    expect(cruiseTotalMsFor(3, 0)).toBeCloseTo(1800);
    expect(cruiseTotalMsFor(0, 5)).toBeCloseTo(3000 * Math.pow(0.9, 5));
    expect(cruiseTotalMsFor(3, 5)).toBeCloseTo(1800 * Math.pow(0.9, 5));
    expect(cruiseTotalMsFor(3, 5)).toBeGreaterThan(1000);
    expect(cruiseTotalMsFor(2, 0)).toBeLessThan(cruiseTotalMsFor(1, 0));
  });
  it('速度(v0.25.5083・足し算+頭打ち): +60%までは素直・超えた分は鈍り +100%の手前で止まる', () => {
    expect(cruiseSoftCap(0.4)).toBeCloseTo(0.4);
    expect(cruiseSoftCap(0.6)).toBeCloseTo(0.6);
    expect(cruiseSoftCap(1.0)).toBeCloseTo(0.6 + 0.4 * (1 - Math.exp(-1)));
    expect(cruiseSoftCap(1.3)).toBeLessThan(1.0);
    expect(cruiseSoftCap(9)).toBeLessThan(1.0);
    expect(cruiseSoftCap(1.3)).toBeGreaterThan(cruiseSoftCap(1.0)); // 単調
    // 段3+ランナーLv3(+20%)=×1.60 / +最上位の靴(+40%)=約×1.85 / +英雄(+30%)=約×1.93
    expect(cruiseSpeedMult(0.4, 0.2, 1)).toBeCloseTo(1.6);
    expect(cruiseSpeedMult(0.4, 0.6, 1)).toBeCloseTo(1.853, 2);
    expect(cruiseSpeedMult(0.4, 0.9, 1)).toBeCloseTo(1.930, 2);
    expect(cruiseSpeedMult(0, 0.2, 0.5)).toBeCloseTo(1.1); // 上乗せは立ち上がり割合で
  });
  it('素の足: 1秒で段1・2秒で段2・3秒で段3(1秒ごとに3段)', () => {
    const T = cruiseTotalMsFor(0, 0);
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
  it('全部積んだビルド: 約1.06秒で段3', () => {
    const T = cruiseTotalMsFor(3, 5);
    expect(cruiseStage(T, T)).toBe(3);
    expect(cruiseStage(T * 0.9, T)).toBe(2);
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
