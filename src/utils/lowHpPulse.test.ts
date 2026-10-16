import { describe, it, expect } from 'vitest';
import { lowHpTier, LOW_HP_PULSE_MS, LOW_HP_HEART_RATE, LOW_HP_THRESHOLD, HEARTBEAT_SAMPLE_MS, lowHpBeatStops, lowHpBeatShape, LOW_HP_BEAT_KEYS } from './lowHpPulse';

describe('lowHpTier(瀕死の段・C3)', () => {
  it('20以下で段1、12以下で段2、6以下で段3。0以下と21以上は0', () => {
    expect(lowHpTier(21)).toBe(0);
    expect(lowHpTier(LOW_HP_THRESHOLD)).toBe(1);
    expect(lowHpTier(13)).toBe(1);
    expect(lowHpTier(12)).toBe(2);
    expect(lowHpTier(7)).toBe(2);
    expect(lowHpTier(6)).toBe(3);
    expect(lowHpTier(1)).toBe(3);
    expect(lowHpTier(0)).toBe(0);
  });
  it('段が上がるほど周期は短く・心音は速い(等間隔ではない)。目の周期=音の1拍÷再生速度', () => {
    expect(LOW_HP_PULSE_MS[1]).toBeGreaterThan(LOW_HP_PULSE_MS[2]);
    expect(LOW_HP_PULSE_MS[2]).toBeGreaterThan(LOW_HP_PULSE_MS[3]);
    expect(LOW_HP_PULSE_MS[1] - LOW_HP_PULSE_MS[2]).not.toBe(LOW_HP_PULSE_MS[2] - LOW_HP_PULSE_MS[3]);
    expect(LOW_HP_HEART_RATE[3]).toBeGreaterThan(LOW_HP_HEART_RATE[2]);
    expect(LOW_HP_HEART_RATE[1]).toBe(1);
    expect(LOW_HP_PULSE_MS[1]).toBe(HEARTBEAT_SAMPLE_MS);
    expect(Math.abs(LOW_HP_PULSE_MS[3] * LOW_HP_HEART_RATE[3] - HEARTBEAT_SAMPLE_MS)).toBeLessThan(1);
  });
  it('拍の形はmsで固定され、段で縮むのは休止だけ(2拍目の山は常に300ms)', () => {
    for (const t of [1, 2, 3] as const) {
      const stops = lowHpBeatStops(LOW_HP_PULSE_MS[t]);
      expect(Math.round(stops[3].p / 100 * LOW_HP_PULSE_MS[t])).toBe(300);
      expect(stops[stops.length - 1].p).toBe(100);
    }
  });
});

describe('lowHpBeatShape(拍の形を光・体の赤が読む用・0..1)', () => {
  it('縁の鼓動と同じ形: 55ms と 300ms が山(1拍目=1・2拍目は弱め)・170ms が谷・休止は 0', () => {
    expect(lowHpBeatShape(0)).toBe(0);
    expect(lowHpBeatShape(55)).toBeCloseTo(1);
    expect(lowHpBeatShape(170)).toBeLessThan(0.2);
    const second = lowHpBeatShape(300);
    expect(second).toBeGreaterThan(0.6);
    expect(second).toBeLessThan(1);
    expect(lowHpBeatShape(440)).toBeCloseTo(0);
    expect(lowHpBeatShape(900)).toBe(0);
  });
  it('キー(LOW_HP_BEAT_KEYS)と lowHpBeatStops が同じ定義を指す(形が二重にならない)', () => {
    const stops = lowHpBeatStops(1000);
    expect(stops.length).toBe(LOW_HP_BEAT_KEYS.length + 1);
    LOW_HP_BEAT_KEYS.forEach((k, i) => expect(stops[i].o).toBe(k.o));
  });
  it('0..1 に収まり、キーの間でなめらか(隣り合う 1ms の差が小さい=折れ線の跳びが無い)', () => {
    let prev = lowHpBeatShape(0);
    for (let t = 1; t < 600; t++) {
      const v = lowHpBeatShape(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1 + 1e-12);
      expect(Math.abs(v - prev)).toBeLessThan(0.05);
      prev = v;
    }
  });
});
