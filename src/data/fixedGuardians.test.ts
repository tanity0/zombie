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
  strongestGuardian,
  FIXED_GUARDIAN_STRONGEST_ID,
} from './fixedGuardians';
import { sanitizePlayerName } from '../utils/playerName';
import { bossStylePerfScore } from '../utils/playerTraits';
import { BULLET_MOVE_KEYS, MOVE_REACTION_KEYS } from '../utils/moveReaction';
import { createWeapon } from '../utils/weaponUtils';
import { aggregateEquipBonus, equipmentById, equipMaxHealthOf } from './equipment';
import { PLAYER_BASE_HP, PLAYER_BASE_SPEED } from '../store/gameStore';
import { FIXED_GUARDIAN_IDS } from '../../shared/fixedGuardianIds.mjs';

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
    // 小烏丸・賢者の石は通常の装備選択一覧には出ず、条件達成後に解禁される特別サブ。
    const subKeys = new Set([...SUB_WEAPON_KEYS, 'murasame', 'sage-stone']);
    for (const g of FIXED_GUARDIANS) {
      expect(moveKeys.every(key => g.profile.moveReactions[key]?.n === 20), g.name).toBe(true);
      const snap = g.profile.snapshot!;
      const gun = createWeapon(snap.activeGunKey!);
      expect(gun.isMelee, g.name).not.toBe(true);
      expect(gun.tier, `${g.name}:銃Tier`).toBeGreaterThanOrEqual(2);
      expect(gun.key, g.name).not.toBe('phill-revolver');
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
      expect(snap.maxHealth, `${g.name}:最大HP`).toBeGreaterThanOrEqual(240);
      expect(equipment.arms, `${g.name}:腕`).toBe('arms-firepower-5');
      expect(equipment.accessory, `${g.name}:アクセ`).toBe('accessory-crit-5');

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
    expect(byName('早瀬').profile.snapshot?.skills).toEqual(['attack-shooter', 'runner']); // v0.25.3267: warm-up退役に伴う差し替え
    expect(byName('早瀬').profile.snapshot?.skillLevels?.['runner']).toBe(1);
    expect(byName('番匠').profile.subUsesPerMin).toBe(16);
    expect(byName('フィル').profile.snapshot?.activeGunKey).toBe('handgun-t3');
    expect(byName('フィル').profile.snapshot?.phillHeadshotRate).toBeUndefined();
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

  it('承認済みの20人分の主武器・近接・スキル構成を保持する', () => {
    const expected: Record<string, [string, string, string, string]> = {
      '黒鉄': ['shotgun-t3', 'anti-mutant-knife-t5', 'counter-master', 'knife-master'],
      'ししまる': ['handgun-t2', 'anti-mutant-knife-t5', 'knight', 'counter-master'],
      '鴉': ['handgun-t3', 'anti-mutant-knife-t5', 'bomb-counter', 'slasher'],
      'ユキ': ['handgun-t2', 'machete-t3', 'time-keeper', 'attack-shooter'],
      '三日月': ['rifle-t3', 'machete-t3', 'fire-shooter', 'exploder'],
      'ナナシ': ['shotgun-t3', 'tactical-knife-t4', 'time-keeper', 'exploder'],
      '岩本': ['shotgun-t3', 'anti-mutant-knife-t5', 'knight', 'reflex'],
      'どんこ': ['rifle-t3', 'tactical-knife-t4', 'overclock', 'exploder'],
      '千代': ['handgun-t3', 'tactical-knife-t4', 'time-keeper', 'overclock'],
      '遠見': ['rifle-t2', 'machete-t3', 'sniper', 'attack-shooter'],
      '静': ['rifle-t2', 'machete-t3', 'sniper', 'crit-up'],
      'ハツネ': ['rifle-t3', 'machete-t3', 'bomber', 'exploder'],
      '早瀬': ['handgun-t3', 'tactical-knife-t4', 'attack-shooter', 'runner'],
      'ばんび': ['shotgun-t3', 'tactical-knife-t4', 'last-magazine', 'attack-shooter'],
      'クロエ': ['handgun-t2', 'machete-t3', 'crit-up', 'attack-shooter'],
      '番匠': ['rifle-t3', 'tactical-knife-t4', 'overclock', 'attack-shooter'],
      'あかね': ['shotgun-t3', 'tactical-knife-t4', 'knight', 'attack-shooter'],
      '猟犬': ['handgun-t3', 'anti-mutant-knife-t5', 'counter-master', 'exploder'],
      'フィル': ['handgun-t3', 'machete-t3', 'crit-up', 'fire-shooter'],
      '無銘': ['handgun-t2', 'anti-mutant-knife-t5', 'knife-master', 'combo-master'],
    };
    for (const guardian of FIXED_GUARDIANS) {
      const snap = guardian.profile.snapshot!;
      expect([
        snap.activeGunKey,
        snap.meleeKey,
        ...(snap.skills ?? []),
      ], guardian.name).toEqual(expected[guardian.name]);
    }
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

describe('fixed guardian feedback contract', () => {
  it('keeps the Worker allow-list aligned with the fixed guardian data', () => {
    expect(new Set(FIXED_GUARDIAN_IDS)).toEqual(new Set(FIXED_GUARDIANS.map(guardian => guardian.id)));
  });
});

// research/GHOST_BOSS.md(守護霊ボス「幻影」): ボスとして立てる「最強データ」の機械検証。
// 設計の決定は**確定1体を名指し**(抽選ではない)。台帳の数値を動かして順位が変わったら、
// 名指し(FIXED_GUARDIAN_STRONGEST_ID)を手で差し替える——それを忘れたらここで落ちる。
describe('守護霊ボス「幻影」の相手(最強データ)', () => {
  it('strongestGuardian() は名指しの1体(鴉)を返す', () => {
    expect(FIXED_GUARDIAN_STRONGEST_ID).toBe('karasu');
    expect(strongestGuardian().id).toBe('karasu');
    expect(strongestGuardian().name).toBe('鴉');
  });

  it('★その1体が performance.score の最上位である(名指しと台帳がズレたら落ちる)', () => {
    const top = [...FIXED_GUARDIANS].sort((a, b) => b.performance.score - a.performance.score)[0];
    expect(strongestGuardian().id).toBe(top.id);
    // 同点1位が複数居ると「最強」が曖昧になる(名指しの根拠が消える)ので、単独最上位も固定する。
    const tied = FIXED_GUARDIANS.filter(g => g.performance.score === top.performance.score);
    expect(tied).toHaveLength(1);
  });

  it('ボス配線が読む台帳のパスが埋まっている(クラス立ち絵・間合い・反応・銃)', () => {
    const g = strongestGuardian();
    expect(g.classId).toBe('rogue');                      // 立ち絵の出どころ
    expect(g.profile.preferredDist).toBeGreaterThan(0);   // 間合い
    expect(g.profile.counterChance).toBeGreaterThan(0);   // 反応
    expect(g.profile.reactionMs).toBeGreaterThan(0);
    expect(g.profile.snapshot?.activeGunKey).toBeTruthy(); // 銃撃ダメージの基礎値
  });
});
