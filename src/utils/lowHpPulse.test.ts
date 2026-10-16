import { describe, it, expect } from 'vitest';
import { lowHpTier, LOW_HP_PULSE_MS, LOW_HP_HEART_RATE, LOW_HP_THRESHOLD, HEARTBEAT_SAMPLE_MS, lowHpBeatStops } from './lowHpPulse';

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
