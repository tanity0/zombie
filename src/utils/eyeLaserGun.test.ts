import { describe, it, expect } from 'vitest';
import { eyeLaserCycleDps, eyeLaserEffectiveReloadMs, EYE_LASER_PULSES_PER_FIRE } from './eyeLaserGun';

describe('eyeLaserGun(アイレーザー・UNIQUE_WEAPONS.md §5-2/§16-1)', () => {
  it('EYE_LASER_PULSES_PER_FIRE = 30(3000ms÷100ms)', () => {
    expect(EYE_LASER_PULSES_PER_FIRE).toBe(30);
  });

  it('実効リロード(raw2500ms)は既存武器と同じ×2規則(effectiveReloadMs)で5000msになる', () => {
    expect(eyeLaserEffectiveReloadMs(2500)).toBe(5000);
  });

  it('1パルス14ダメージのサイクル実効DPSは48.28(既定rifle-t3=45.83比+5.3%)', () => {
    const dps = eyeLaserCycleDps(14);
    expect(dps).toBeCloseTo(48.28, 1);
    const ratio = dps / 45.83;
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  });

  it('旧「1tick8」は帯を大きく割っていた(§16-1の記録どおり)', () => {
    const dps = eyeLaserCycleDps(8);
    const ratio = dps / 45.83;
    expect(ratio).toBeLessThan(0.90); // 枠外(-39.8%相当)
  });
});
