import { describe, it, expect } from 'vitest';
import {
  fireflyBlink, fireflyActiveFrac, fireflyScatterAcc, FIREFLY_DIM_FLOOR, FIREFLY_WET_FRAC, FIREFLY_SCATTER_R,
  FIREFLY_BLINK_MS_MIN, FIREFLY_RISE_END, FIREFLY_HOLD_END, FIREFLY_S1_COUNT,
} from './stage1Fireflies';
import { RAIN_INTENSITY_LOW_MAX, RAIN_INTENSITY_HIGH_MIN } from './weatherWet';

describe('ステージ1の森の蛍', () => {
  it('数は控えめ(社長指示2026-11-21「蛍が多すぎる」で96から減らした)', () => {
    expect(FIREFLY_S1_COUNT).toBeGreaterThan(0);
    expect(FIREFLY_S1_COUNT).toBeLessThanOrEqual(48);
  });
  it('灯る/消えるは途切れず(1フレームで跳ばない)・暗くても消え切らない・灯ると1', () => {
    const P = FIREFLY_BLINK_MS_MIN;
    let prev = fireflyBlink(0, 0.3, P), max = 0, min = 1;
    for (let t = 16; t < P * 2; t += 16) {
      const v = fireflyBlink(t, 0.3, P);
      expect(Math.abs(v - prev)).toBeLessThan(0.06);
      prev = v; max = Math.max(max, v); min = Math.min(min, v);
    }
    expect(max).toBeCloseTo(1, 5);
    expect(min).toBeCloseTo(FIREFLY_DIM_FLOOR, 5);
    expect(fireflyBlink(P * (FIREFLY_RISE_END + FIREFLY_HOLD_END) / 2, 0, P)).toBe(1);
  });
  it('位相がずれれば同じ時刻でも明るさが違う(一斉に点滅しない)', () => {
    const vals = new Set([0, 0.25, 0.5, 0.75].map(ph => fireflyBlink(1000, ph, 4000).toFixed(3)));
    expect(vals.size).toBeGreaterThan(2);
  });
  it('晴れは全部・雨上がりは減り、本降りで0', () => {
    expect(fireflyActiveFrac(false, 99)).toBe(1);
    expect(fireflyActiveFrac(true, RAIN_INTENSITY_LOW_MAX)).toBeCloseTo(FIREFLY_WET_FRAC, 6);
    expect(fireflyActiveFrac(true, RAIN_INTENSITY_HIGH_MIN)).toBeCloseTo(0, 6);
    const mid = fireflyActiveFrac(true, (RAIN_INTENSITY_LOW_MAX + RAIN_INTENSITY_HIGH_MIN) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(FIREFLY_WET_FRAC);
  });
  it('プレイヤーから離れる向きに散る・半径の外と縁では0(急に弾かれない)', () => {
    const a = fireflyScatterAcc(10, 0);
    expect(a.ax).toBeGreaterThan(0);
    expect(a.ay).toBe(0);
    expect(fireflyScatterAcc(FIREFLY_SCATTER_R + 1, 0)).toEqual({ ax: 0, ay: 0 });
    expect(Math.abs(fireflyScatterAcc(FIREFLY_SCATTER_R - 0.01, 0).ax)).toBeLessThan(1);
  });
});
