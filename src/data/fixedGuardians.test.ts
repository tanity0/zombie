import { describe, expect, it } from 'vitest';
import { SUB_WEAPON_KEYS } from './campaign';
import { FIXED_GUARDIANS } from './fixedGuardians';
import { sanitizePlayerName } from '../utils/playerName';
import { bossStylePerfScore } from '../utils/playerTraits';
import { BULLET_MOVE_KEYS, MOVE_REACTION_KEYS } from '../utils/moveReaction';
import { createWeapon } from '../utils/weaponUtils';

describe('固定の先人守護霊20体', () => {
  it('20体のIDと日本語名が重複せず、名前は浄化しても変わらない', () => {
    expect(FIXED_GUARDIANS).toHaveLength(20);
    expect(new Set(FIXED_GUARDIANS.map(g => g.id)).size).toBe(20);
    expect(new Set(FIXED_GUARDIANS.map(g => g.name)).size).toBe(20);
    for (const g of FIXED_GUARDIANS) {
      expect(sanitizePlayerName(g.name)).toBe(g.name);
      expect(g.profile.srcName).toBe(g.name);
      expect(g.profile.srcClass).toBe(g.classId);
    }
  });

  it('全員のスコアが3/-2式と戦績から再計算できる', () => {
    for (const g of FIXED_GUARDIANS) {
      const p = g.performance;
      const score = bossStylePerfScore({
        'g-jump': { exposures: p.exposures, counters: p.counters, hits: p.hits },
      }, p.clearSeconds * 1000);
      expect(score, g.name).toBe(p.score);
    }
  });

  it('全技に斬/舞/岩の反応データが入り、武器とサブウェポンが実在する', () => {
    const moveKeys = [...MOVE_REACTION_KEYS, ...BULLET_MOVE_KEYS];
    const subKeys = new Set(SUB_WEAPON_KEYS);
    for (const g of FIXED_GUARDIANS) {
      expect(moveKeys.every(key => g.profile.moveReactions[key]?.n === 20), g.name).toBe(true);
      const snap = g.profile.snapshot!;
      expect(createWeapon(snap.activeGunKey!).isMelee, g.name).toBe(false);
      expect(createWeapon(snap.meleeKey!).isMelee, g.name).toBe(true);
      expect(snap.subWeapons!.every(key => subKeys.has(key)), g.name).toBe(true);
      expect(snap.equipBonus!.damageMult, g.name).toBeGreaterThanOrEqual(3);
      expect(snap.equipBonus!.damageMult, g.name).toBeLessThanOrEqual(4);
    }
  });

  it('個性の核になる特殊値を保持する', () => {
    const byName = (name: string) => FIXED_GUARDIANS.find(g => g.name === name)!;
    expect(byName('黒鉄').profile.snapshot?.maxHealth).toBe(320);
    expect(byName('ユキ').profile.mobility).toBe(1);
    expect(byName('遠見').profile.preferredDist).toBe(420);
    expect(byName('早瀬').profile.snapshot?.equipBonus?.fireRateMult).toBe(1.9);
    expect(byName('番匠').profile.subUsesPerMin).toBe(16);
    expect(byName('フィル').profile.snapshot?.phillHeadshotRate).toBe(1);
    expect(byName('無銘').profile.snapshot?.subWeapons).toContain('katana');
  });
});

