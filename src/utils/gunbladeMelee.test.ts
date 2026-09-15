import { describe, it, expect } from 'vitest';
import {
  resolveGunbladeMode, GUNBLADE_MELEE_RANGE_PX, GUNBLADE_MODE_STATS,
  GUNBLADE_MELEE_DAMAGE, GUNBLADE_MELEE_COOLDOWN_MS, GUNBLADE_MELEE_KNOCKBACK_MULT,
  GUNBLADE_RANGED_DAMAGE, GUNBLADE_RANGED_COOLDOWN_MS,
} from './gunbladeMelee';

describe('resolveGunbladeMode', () => {
  it('90px以下は近接(melee)', () => {
    expect(resolveGunbladeMode(0)).toBe('melee');
    expect(resolveGunbladeMode(89)).toBe('melee');
    expect(resolveGunbladeMode(GUNBLADE_MELEE_RANGE_PX)).toBe('melee'); // 境界=90はmelee側(仕様「≤90px」)
  });

  it('90pxを超えると通常銃(ranged)', () => {
    expect(resolveGunbladeMode(91)).toBe('ranged');
    expect(resolveGunbladeMode(200)).toBe('ranged');
  });
});

describe('GUNBLADE_MODE_STATS', () => {
  it('rangedはCATALOGの静的値と一致し、knockbackMultを持たない', () => {
    expect(GUNBLADE_MODE_STATS.ranged.damage).toBe(GUNBLADE_RANGED_DAMAGE);
    expect(GUNBLADE_MODE_STATS.ranged.cooldown).toBe(GUNBLADE_RANGED_COOLDOWN_MS);
    expect(GUNBLADE_MODE_STATS.ranged.knockbackMult).toBeUndefined();
  });

  it('meleeはダメージ×1.6・間隔400ms・ノックバック×1.5(UNIQUE_WEAPONS.md §16-2/§17-5)', () => {
    expect(GUNBLADE_MODE_STATS.melee.damage).toBeCloseTo(GUNBLADE_RANGED_DAMAGE * 1.6, 6);
    expect(GUNBLADE_MODE_STATS.melee.damage).toBeCloseTo(12.8, 6);
    expect(GUNBLADE_MODE_STATS.melee.cooldown).toBe(400);
    expect(GUNBLADE_MODE_STATS.melee.knockbackMult).toBe(1.5);
  });

  it('近接モードの瞬間レート(damage/cooldown)は32DPS(§17-5の代償値と一致・遠距離38.10より低い)', () => {
    const instantDps = (GUNBLADE_MELEE_DAMAGE / GUNBLADE_MELEE_COOLDOWN_MS) * 1000;
    expect(instantDps).toBeCloseTo(32, 6);
  });

  it('定数の再エクスポートが値と一致する', () => {
    expect(GUNBLADE_MELEE_KNOCKBACK_MULT).toBe(1.5);
  });
});
