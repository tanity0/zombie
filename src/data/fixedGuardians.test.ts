import { describe, expect, it } from 'vitest';
import {
  CHARACTER_SUBWEAPON_KEYS, MAX_EQUIPPED_SKILLS, SUB_WEAPON_KEYS, classSubWeaponFor, skillMaxLevel,
} from './campaign';
import {
  FIXED_GUARDIANS,
  FIXED_GUARDIAN_BOSS_SLOT_ORDER,
  fixedGuardianLeadersForBoss,
  pickFixedGuardianForGhostMode,
  shouldPickFixedGuardian,
} from './fixedGuardians';
import { sanitizePlayerName } from '../utils/playerName';
import { bossStylePerfScore } from '../utils/playerTraits';
import { BULLET_MOVE_KEYS, MOVE_REACTION_KEYS } from '../utils/moveReaction';
import { createWeapon } from '../utils/weaponUtils';
import { aggregateEquipBonus, equipmentById, equipMaxHealthOf } from './equipment';
import { PLAYER_BASE_HP, PLAYER_BASE_SPEED } from '../store/gameStore';

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
      expect(score, g.name).toBeCloseTo(p.score, 10);
    }
  });

  it('全技に斬/舞/岩の反応データが入り、武器とサブウェポンが実在する', () => {
    const moveKeys = [...MOVE_REACTION_KEYS, ...BULLET_MOVE_KEYS];
    const subKeys = new Set(SUB_WEAPON_KEYS);
    for (const g of FIXED_GUARDIANS) {
      expect(moveKeys.every(key => g.profile.moveReactions[key]?.n === 20), g.name).toBe(true);
      const snap = g.profile.snapshot!;
      expect(createWeapon(snap.activeGunKey!).isMelee, g.name).not.toBe(true);
      expect(createWeapon(snap.meleeKey!).isMelee, g.name).toBe(true);
      expect(snap.subWeapons!.every(key => subKeys.has(key)), g.name).toBe(true);
    }
  });

  it('全員が実在する装備3部位と最大2スキルだけで、全ステータスを再計算できる', () => {
    for (const g of FIXED_GUARDIANS) {
      const snap = g.profile.snapshot!;
      const equipment = snap.equipment!;
      for (const slot of ['body', 'arms', 'accessory'] as const) {
        expect(equipment[slot], `${g.name}:${slot}`).not.toBeNull();
        expect(equipmentById(equipment[slot])?.slot, `${g.name}:${slot}`).toBe(slot);
      }
      expect(snap.equipBonus, g.name).toEqual(aggregateEquipBonus(equipment));
      expect(snap.maxHealth, g.name).toBe(PLAYER_BASE_HP + equipMaxHealthOf(equipment));
      expect(snap.speed, g.name).toBe(PLAYER_BASE_SPEED);
      expect(snap.critChance, g.name).toBe(0);
      expect(snap.magBonus, g.name).toBe(0);
      expect(snap.reloadMult, g.name).toBe(1);

      const skills = snap.skills ?? [];
      expect(skills.length, g.name).toBeLessThanOrEqual(MAX_EQUIPPED_SKILLS);
      expect(new Set(skills).size, g.name).toBe(skills.length);
      for (const skill of skills) {
        const level = snap.skillLevels?.[skill] ?? 1;
        expect(level, `${g.name}:${skill}`).toBeGreaterThanOrEqual(1);
        expect(level, `${g.name}:${skill}`).toBeLessThanOrEqual(skillMaxLevel(skill));
      }
      expect(snap.equipBonus!.damageMult, g.name).toBeLessThanOrEqual(2);
      expect(snap.equipBonus!.fireRateMult, g.name).toBeLessThanOrEqual(1.1);
    }
  });

  it('全員が職業固有1枠と本人向け汎用1枠のちょうど2枠だけを持つ', () => {
    for (const g of FIXED_GUARDIANS) {
      const subWeapons = g.profile.snapshot?.subWeapons ?? [];
      const classSubWeapon = classSubWeaponFor(g.classId);
      expect(subWeapons, g.name).toHaveLength(2);
      expect(subWeapons[0], g.name).toBe(classSubWeapon);
      expect(subWeapons.filter(key => CHARACTER_SUBWEAPON_KEYS.includes(key)), g.name)
        .toEqual([classSubWeapon]);
      expect(CHARACTER_SUBWEAPON_KEYS, g.name).not.toContain(subWeapons[1]);
    }
  });

  it('個性の核になる特殊値を保持する', () => {
    const byName = (name: string) => FIXED_GUARDIANS.find(g => g.name === name)!;
    expect(byName('黒鉄').profile.snapshot?.maxHealth).toBe(330);
    expect(byName('ユキ').profile.mobility).toBe(1);
    expect(byName('遠見').profile.preferredDist).toBe(420);
    expect(byName('早瀬').profile.snapshot?.equipBonus?.fireRateMult).toBe(1.1);
    expect(byName('早瀬').profile.snapshot?.skills).toEqual(['attack-shooter', 'last-magazine']);
    expect(byName('番匠').profile.subUsesPerMin).toBe(16);
    expect(byName('フィル').profile.snapshot?.phillHeadshotRate).toBe(1);
    expect(byName('無銘').profile.snapshot?.subWeapons).toEqual(['striker-quick-mag', 'murasame']);
    expect(byName('無銘').profile.snapshot?.subWeaponLevels?.murasame).toBe(3);
    expect(byName('黒鉄').profile.snapshot?.subWeapons).toEqual(['heavy-grenade', 'wire-anchor']);
    expect(byName('千代').profile.snapshot?.subWeapons).toEqual(['striker-quick-mag', 'sensor-mine']);
    expect(byName('静').profile.snapshot?.subWeapons).toEqual(['marksman-trap', 'turret']);
    expect(byName('ハツネ').profile.snapshot?.subWeapons).toEqual(['striker-quick-mag', 'homing']);
    expect(byName('早瀬').profile.snapshot?.subWeapons).toEqual(['striker-hunting', 'shadow-clone']);
    expect(byName('番匠').profile.snapshot?.subWeapons).toEqual(['heavy-grenade', 'turret']);
    expect(byName('あかね').profile.snapshot?.subWeapons).toEqual(['striker-quick-mag', 'shield']);
  });

  it('ステージ1〜5は上位4人が重複せず、20人全員へ分散する', () => {
    const groups = [1, 2, 3, 4, 5].map(stage =>
      fixedGuardianLeadersForBoss(`giantbat@stage-${stage}`));
    expect(groups.every(group => group.length === 4)).toBe(true);
    expect(new Set(groups.flat().map(guardian => guardian.id)).size).toBe(20);
    expect(groups[0].map(guardian => guardian.name)).toEqual(['鴉', '黒鉄', 'ししまる', 'ユキ']);
    expect(new Set(groups[1].map(guardian => guardian.name))).toEqual(new Set(['三日月', 'ナナシ', '岩本', 'どんこ']));
  });

  it('全ボススロットで4人と作成済み評点を安定して返す', () => {
    for (const slotKey of FIXED_GUARDIAN_BOSS_SLOT_ORDER) {
      const first = fixedGuardianLeadersForBoss(slotKey);
      const second = fixedGuardianLeadersForBoss(slotKey);
      expect(first).toHaveLength(4);
      expect(second.map(guardian => guardian.id)).toEqual(first.map(guardian => guardian.id));
      expect(first.every(guardian => Number.isFinite(guardian.performance.score))).toBe(true);
    }
  });

  it('助っ人は20人全体、討伐者はボス担当の上位4人から選ぶ', () => {
    expect(pickFixedGuardianForGhostMode('giantbat@stage-1', 'random', () => 0).name).toBe('黒鉄');
    expect(pickFixedGuardianForGhostMode('giantbat@stage-1', 'random', () => 0.999).name).toBe('無銘');

    const leaders = fixedGuardianLeadersForBoss('giantbat@stage-2');
    const topFirst = pickFixedGuardianForGhostMode('giantbat@stage-2', 'top', () => 0);
    const topLast = pickFixedGuardianForGhostMode('giantbat@stage-2', 'top', () => 0.999);
    expect(topFirst.id).toBe(leaders[0].id);
    expect(topLast.id).toBe(leaders[3].id);
  });

  it('固定候補と実プレイヤー候補を人数比で同じ抽選プールへ混ぜる', () => {
    expect(shouldPickFixedGuardian('random', 0, () => 0.999)).toBe(true);
    // 固定20 + 実プレイヤー20なら境界は50%。
    expect(shouldPickFixedGuardian('random', 20, () => 0.499)).toBe(true);
    expect(shouldPickFixedGuardian('random', 20, () => 0.5)).toBe(false);
    // 討伐者は固定上位4 + 実プレイヤー側の上位候補4なら同じく50%。
    expect(shouldPickFixedGuardian('top', 4, () => 0.499)).toBe(true);
    expect(shouldPickFixedGuardian('top', 4, () => 0.5)).toBe(false);
  });
});
