import { describe, it, expect } from 'vitest';
import { ROCKET_CHARGE_MS, ROCKET_BLAST_RADIUS_MULT, rocketCycleDps, ROCKET_LAUNCH_EASE_MS, rocketLaunchSpeedMult } from './rocketLauncher';
import { createWeapon, ROCKET_WEAPON_KEY } from './weaponUtils';

// UNIQUE_WEAPONS.md §5: 汎用の実効DPS式(既定武器の比較基準。weaponSlot.test.tsのeffectiveDpsと
// 同じ式=「実効DPS = damage*count*magSize / (magSize*cooldown + max(250, reloadMs*2)) * 1000」)。
// ★UNIQUE_WEAPONS.md §16-5検収B-8是正: 数値はここでリテラル直書きせず、必ずCATALOG
// (createWeapon経由)から読む——CATALOGの値を変えたらこのテストも追従して落ちること。
const defaultCycleDps = (w: { damage: number; cooldown: number; count?: number; magSize?: number; reloadMs?: number }): number => {
  const count = w.count ?? 1;
  const magSize = w.magSize ?? 1;
  const effReload = Math.max(250, (w.reloadMs ?? 0) * 2);
  return (w.damage * count * magSize) / (magSize * w.cooldown + effReload) * 1000;
};

describe('定数(UNIQUE_WEAPONS.md §16-1)', () => {
  it('ROCKET_CHARGE_MS=500 / ROCKET_BLAST_RADIUS_MULT=1.2', () => {
    expect(ROCKET_CHARGE_MS).toBe(500);
    expect(ROCKET_BLAST_RADIUS_MULT).toBe(1.2);
  });

  it('ROCKET_CHARGE_MSはCATALOGのcooldownと同値(受け入れ条件8: 溜めを別枠として持たない)', () => {
    expect(createWeapon(ROCKET_WEAPON_KEY).cooldown).toBe(ROCKET_CHARGE_MS);
  });
});

describe('rocketCycleDps(UNIQUE_WEAPONS.md §5-2/§16-1)', () => {
  it('溜め500msをcooldownに畳んだサイクル実効DPSは既定glauncher-t1比+8.6%の帯に入る(CATALOG読み)', () => {
    const w = createWeapon(ROCKET_WEAPON_KEY);
    const dps = rocketCycleDps(w.damage, w.cooldown, w.reloadMs ?? 0);
    const base = defaultCycleDps(createWeapon('glauncher-t1'));
    expect(dps).toBeCloseTo(31.11, 1);
    expect(base).toBeCloseTo(28.65, 1);
    const ratio = dps / base;
    expect(ratio).toBeGreaterThan(1); // 狙いは+側
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  });

  it('受け入れ条件8の反証: 溜めを別枠として二重に足すと実効DPSが下がる(表の31.11を割る)', () => {
    const w = createWeapon(ROCKET_WEAPON_KEY);
    const correct = rocketCycleDps(w.damage, w.cooldown, w.reloadMs ?? 0);
    const doubledCharge = rocketCycleDps(w.damage, w.cooldown + ROCKET_CHARGE_MS, w.reloadMs ?? 0); // 誤実装の再現
    expect(correct).toBeCloseTo(31.11, 1);
    expect(doubledCharge).toBeLessThan(correct);
  });
});

// UNIQUE_WEAPONS.md §16-5c(バッチD検収A-9是正): 発射(溜め終わり)からROCKET_LAUNCH_EASE_MSを
// ease-in(2乗)で0→本来速度にする。0→本来速度の瞬間加速はCLAUDE.md「動きの絶対ルール: 慣性」違反。
describe('rocketLaunchSpeedMult(UNIQUE_WEAPONS.md §16-5c A-9是正)', () => {
  it('0(発射直後)→1(ease完了)。中間は0.5未満(ease-inは序盤が遅い=瞬間加速ではない)', () => {
    expect(rocketLaunchSpeedMult(0)).toBe(0);
    expect(rocketLaunchSpeedMult(1)).toBe(1);
    expect(rocketLaunchSpeedMult(0.5)).toBeLessThan(0.5);
    expect(ROCKET_LAUNCH_EASE_MS).toBe(150);
  });

  it('範囲外(負値/1超)はクランプする', () => {
    expect(rocketLaunchSpeedMult(-1)).toBe(0);
    expect(rocketLaunchSpeedMult(2)).toBe(1);
  });
});
