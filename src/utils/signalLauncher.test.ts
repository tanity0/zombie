import { describe, it, expect } from 'vitest';
import { SIGNAL_STRIKE_DELAY_MS, SIGNAL_STRIKE_RADIUS_PX, SIGNAL_POSTURE_MULT, signalCycleDps } from './signalLauncher';
import { createWeapon, SIGNAL_WEAPON_KEY } from './weaponUtils';

// UNIQUE_WEAPONS.md §5: 汎用の実効DPS式(既定武器の比較基準。weaponSlot.test.tsのeffectiveDpsと
// 同じ式)。★検収B-8是正: リテラル直書きせず、必ずCATALOG(createWeapon経由)から読む。
const defaultCycleDps = (w: { damage: number; cooldown: number; count?: number; magSize?: number; reloadMs?: number }): number => {
  const count = w.count ?? 1;
  const magSize = w.magSize ?? 1;
  const effReload = Math.max(250, (w.reloadMs ?? 0) * 2);
  return (w.damage * count * magSize) / (magSize * w.cooldown + effReload) * 1000;
};

describe('定数(UNIQUE_WEAPONS.md §16-1/§16-5c)', () => {
  it('SIGNAL_STRIKE_DELAY_MS=900 / SIGNAL_STRIKE_RADIUS_PX=160', () => {
    expect(SIGNAL_STRIKE_DELAY_MS).toBe(900);
    expect(SIGNAL_STRIKE_RADIUS_PX).toBe(160);
  });

  // UNIQUE_WEAPONS.md §16-5c(バッチD検収A-2是正): 社長仕様「高い体勢値削り」。
  it('SIGNAL_POSTURE_MULT=1.5(パイルドライバーのheavyより高い意味)', () => {
    expect(SIGNAL_POSTURE_MULT).toBe(1.5);
    expect(SIGNAL_POSTURE_MULT).toBeGreaterThan(1);
  });
});

describe('signalCycleDps(UNIQUE_WEAPONS.md §5-2/§16-1)', () => {
  it('遅延900msをcooldownへ畳んだサイクル実効DPSは既定glauncher-t3比+8.1%の帯に入る(CATALOG読み)', () => {
    const w = createWeapon(SIGNAL_WEAPON_KEY);
    const dps = signalCycleDps(w.damage, w.cooldown, SIGNAL_STRIKE_DELAY_MS, w.magSize ?? 1, w.reloadMs ?? 0);
    const base = defaultCycleDps(createWeapon('glauncher-t3'));
    expect(dps).toBeCloseTo(75.69, 1);
    expect(base).toBeCloseTo(70.00, 1);
    const ratio = dps / base;
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  });

  it('受け入れ条件(§16-5-5)の反証: 遅延をcooldownへ畳まないと帯を割る', () => {
    const w = createWeapon(SIGNAL_WEAPON_KEY);
    const base = defaultCycleDps(createWeapon('glauncher-t3'));
    const correct = signalCycleDps(w.damage, w.cooldown, SIGNAL_STRIKE_DELAY_MS, w.magSize ?? 1, w.reloadMs ?? 0);
    const withoutDelay = signalCycleDps(w.damage, w.cooldown, 0, w.magSize ?? 1, w.reloadMs ?? 0); // 遅延を無視した誤測定
    expect(withoutDelay).toBeGreaterThan(correct);
    expect(withoutDelay / base).toBeGreaterThan(1.10); // 誤測定は帯を超える
  });
});
