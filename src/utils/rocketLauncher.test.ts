import { describe, it, expect } from 'vitest';
import { ROCKET_CHARGE_MS, ROCKET_BLAST_RADIUS_MULT, rocketCycleDps } from './rocketLauncher';

describe('定数(UNIQUE_WEAPONS.md §16-1)', () => {
  it('ROCKET_CHARGE_MS=500 / ROCKET_BLAST_RADIUS_MULT=1.2', () => {
    expect(ROCKET_CHARGE_MS).toBe(500);
    expect(ROCKET_BLAST_RADIUS_MULT).toBe(1.2);
  });
});

describe('rocketCycleDps(UNIQUE_WEAPONS.md §5-2/§16-1)', () => {
  it('溜め500msをcooldownに畳んだサイクル実効DPSは31.11(既定glauncher-t1=28.65比+8.6%)', () => {
    const dps = rocketCycleDps(140, 500, 2000);
    expect(dps).toBeCloseTo(31.11, 1);
    const ratio = dps / 28.65;
    expect(ratio).toBeGreaterThan(1); // 狙いは+側
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  });

  it('受け入れ条件8の反証: 溜めを別枠として二重に足すと実効DPSが下がる(表の31.11を割る)', () => {
    const correct = rocketCycleDps(140, 500, 2000);
    const doubledCharge = rocketCycleDps(140, 500 + ROCKET_CHARGE_MS, 2000); // 誤実装の再現
    expect(correct).toBeCloseTo(31.11, 1);
    expect(doubledCharge).toBeLessThan(correct);
  });
});
