import { describe, it, expect } from 'vitest';
import { createWeapon, nextKnifeKey, MELEE_KEYS, MAX_KNIFE_TIER, getWeaponShortName } from './weaponUtils';

describe('knife progression', () => {
  it('MELEE_KEYS is the 5-tier ladder in ascending order', () => {
    expect(MELEE_KEYS).toEqual([
      'knife-t1', 'hatchet-t2', 'machete-t3', 'tactical-knife-t4', 'anti-mutant-knife-t5',
    ]);
    expect(MAX_KNIFE_TIER).toBe(5);
  });

  it('nextKnifeKey returns the tier above the current one', () => {
    expect(nextKnifeKey(1)).toBe('hatchet-t2');
    expect(nextKnifeKey(3)).toBe('tactical-knife-t4');
    expect(nextKnifeKey(4)).toBe('anti-mutant-knife-t5');
  });

  it('nextKnifeKey returns undefined at or above max tier', () => {
    expect(nextKnifeKey(5)).toBeUndefined();
    expect(nextKnifeKey(6)).toBeUndefined();
  });
});

describe('createWeapon', () => {
  it('builds the Tier1 knife to spec (dmg 8 / crit 0.05 / melee)', () => {
    const w = createWeapon('knife-t1');
    expect(w.name).toBe('ナイフ');
    expect(w.damage).toBe(8);
    expect(w.critChance).toBeCloseTo(0.05);
    expect(w.isMelee).toBe(true);
    expect(w.tier).toBe(1);
  });

  it('builds the Tier5 knife to spec (dmg 50 / crit 0.25)', () => {
    const w = createWeapon('anti-mutant-knife-t5');
    expect(w.damage).toBe(50);
    expect(w.critChance).toBeCloseTo(0.25);
    expect(w.tier).toBe(5);
    expect(w.isMelee).toBe(true);
  });

  it('builds a gun fully loaded (magazine == magSize) and not melee', () => {
    const g = createWeapon('handgun-t1');
    expect(g.category).toBe('handgun');
    expect(g.magSize).toBe(12);
    expect(g.magazine).toBe(12);
    expect(g.isMelee).toBeFalsy();
  });

  it('falls back to handgun-t1 for an unknown key', () => {
    const w = createWeapon('does-not-exist');
    expect(w.key).toBe('handgun-t1');
  });
});

describe('getWeaponShortName', () => {
  it('maps the new melee types', () => {
    expect(getWeaponShortName('tactical-knife')).toBe('タクティカルナイフ');
    expect(getWeaponShortName('anti-mutant-knife')).toBe('対変異体ナイフ');
  });
  it('maps gun families and falls back for unknown', () => {
    expect(getWeaponShortName('shotgun')).toBe('ショットガン');
    // @ts-expect-error intentionally unknown type for the fallback branch
    expect(getWeaponShortName('mystery')).toBe('武器');
  });
});
