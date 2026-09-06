import { describe, it, expect } from 'vitest';
import { SIGNAL_STRIKE_DELAY_MS, SIGNAL_STRIKE_RADIUS_PX, signalCycleDps } from './signalLauncher';

describe('定数(UNIQUE_WEAPONS.md §16-1)', () => {
  it('SIGNAL_STRIKE_DELAY_MS=900 / SIGNAL_STRIKE_RADIUS_PX=160', () => {
    expect(SIGNAL_STRIKE_DELAY_MS).toBe(900);
    expect(SIGNAL_STRIKE_RADIUS_PX).toBe(160);
  });
});

describe('signalCycleDps(UNIQUE_WEAPONS.md §5-2/§16-1)', () => {
  it('遅延900msをcooldownへ畳んだサイクル実効DPSは75.69(既定glauncher-t3=70.00比+8.1%)', () => {
    const dps = signalCycleDps(275, 1400, 900, 3, 2000);
    expect(dps).toBeCloseTo(75.69, 1);
    const ratio = dps / 70.00;
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  });

  it('受け入れ条件(§16-5-5)の反証: 遅延をcooldownへ畳まないと帯を割る', () => {
    const correct = signalCycleDps(275, 1400, 900, 3, 2000);
    const withoutDelay = signalCycleDps(275, 1400, 0, 3, 2000); // 遅延を無視した誤測定
    expect(withoutDelay).toBeGreaterThan(correct);
    expect(withoutDelay / 70.00).toBeGreaterThan(1.10); // 誤測定は帯を超える
  });
});
