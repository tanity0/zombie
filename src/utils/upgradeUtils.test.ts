// SKILL_BUILD_REDESIGN.md §16-2/§18-1の3(受け入れ条件9): ボスドロップ宝箱(generateEquipmentChoices)
// から特殊装備が出ないことの回帰テスト。特殊はPOI専任(§12冒頭の裁定)。
import { describe, it, expect } from 'vitest';
import { generateEquipmentChoices } from './upgradeUtils';
import { emptyEquipLoadout, equipmentById } from '../data/equipment';
import type { EquipLoadout, Player } from '../types/game';

// generateEquipmentChoicesはplayer.equipmentしか読まないため、最小フィクスチャで足りる。
const makePlayer = (equipment: EquipLoadout): Player => ({ equipment } as unknown as Player);

const assertNoSpecialEquipment = (options: ReturnType<typeof generateEquipmentChoices>) => {
  for (const o of options) {
    if (o.type !== 'equipment') continue;
    const def = equipmentById(o.equipDefId);
    expect(def?.special).toBe(false);
  }
};

describe('generateEquipmentChoices(§16-2/§18-1: 特殊装備混入の撤去・宝箱経路)', () => {
  it('空きスロットがある状態(旧: 空きあり5%特殊)で200回生成しても特殊装備は出ない', () => {
    const player = makePlayer(emptyEquipLoadout());
    for (let i = 0; i < 200; i++) assertNoSpecialEquipment(generateEquipmentChoices(player));
  });

  it('空きスロットが無い状態(旧: 空きなし10%特殊)で200回生成しても特殊装備は出ない', () => {
    const loadout: EquipLoadout = {
      body: 'body-protection-4', arms: 'arms-firepower-4', accessory: 'accessory-crit-4',
    };
    const player = makePlayer(loadout);
    for (let i = 0; i < 200; i++) assertNoSpecialEquipment(generateEquipmentChoices(player));
  });

  it('既に特殊装備を装備しているスロットがあっても新規の特殊混入は起きない', () => {
    const loadout: EquipLoadout = { body: 'special-body', arms: null, accessory: null };
    const player = makePlayer(loadout);
    for (let i = 0; i < 200; i++) assertNoSpecialEquipment(generateEquipmentChoices(player));
  });

  it('基礎3択の構成自体は維持される(①②③のtypeはequipment/scrap/healのみ)', () => {
    const player = makePlayer(emptyEquipLoadout());
    const options = generateEquipmentChoices(player);
    expect(options.length).toBeGreaterThanOrEqual(2); // 空きありなら①②は必ず出る + ③スクラップ
    expect(options.every(o => ['equipment', 'scrap', 'heal'].includes(o.type))).toBe(true);
    expect(options.some(o => o.type === 'scrap')).toBe(true); // ③は常設
  });

  it('①②両方カンスト(全スロット最上段)時はHP30%回復が代わりに出る', () => {
    const loadout: EquipLoadout = {
      body: 'body-protection-5', arms: 'arms-firepower-5', accessory: 'accessory-crit-5',
    };
    const player = makePlayer(loadout);
    const options = generateEquipmentChoices(player);
    expect(options.some(o => o.type === 'heal')).toBe(true);
    expect(options.some(o => o.type === 'equipment')).toBe(false);
  });
});

// research/LEVEL_GROWTH.md §11 代替a(社長裁定2026-09-13「a」): スキル候補が枯れて3枚に足りない時だけ
// 「体力 +10 / 攻撃力 +6%」のカードで空き枠を埋める。候補が足りている時は1枚も出ない。
import { generateSkillUpgradeChoices, statOption, statBadge } from './upgradeUtils';
import { CONSUMABLE_KEYS } from '../data/consumables';
import { SKILLS } from '../data/campaign';
import type { RunSkillDraftInput } from './runSkillDraft';
import type { SkillKey } from '../types/game';

describe('generateSkillUpgradeChoices: 候補が枯れた時のステータスカード(LEVEL_GROWTH.md §11 代替a)', () => {
  const exhausted = (): RunSkillDraftInput => ({
    owned: [], ownedLevels: {}, runSkills: [], runSkillLevels: {}, playerLevel: 5, excluded: [], dogEquipped: false,
    activeConsumables: CONSUMABLE_KEYS, // 消費カードも全部アクティブ=候補ゼロ
  });
  it('スキル/消費が両方枯れていると 体力・攻撃力 の2枚(重複なし・3枚目は空)+常設スクラップ。先頭はLvの偶奇で交互', () => {
    const opts = generateSkillUpgradeChoices(exhausted(), 3, () => 0.5);
    expect(opts.map(o => o.type)).toEqual(['stat', 'stat', 'scrap']);
    expect(opts.map(o => o.statKind)).toEqual(['hp', 'atk', undefined]);
    expect(new Set(opts.map(o => o.id)).size).toBe(opts.length);
    const even = generateSkillUpgradeChoices({ ...exhausted(), playerLevel: 6 }, 3, () => 0.5);
    expect(even.map(o => o.statKind)).toEqual(['atk', 'hp', undefined]);
  });
  it('候補が足りている時はステータスカードを出さない(従来どおり)', () => {
    const keys = Object.keys(SKILLS) as SkillKey[];
    const lv3 = Object.fromEntries(keys.map(k => [k, 3])) as Partial<Record<SkillKey, number>>;
    const opts = generateSkillUpgradeChoices({ owned: keys, ownedLevels: lv3, runSkills: [], runSkillLevels: {}, playerLevel: 5, excluded: [], dogEquipped: false }, 3, () => 0.5);
    expect(opts.length).toBe(4);
    expect(opts.some(o => o.type === 'stat')).toBe(false);
  });
  it('カードの中身: 名前は言葉(体力/攻撃力)・数字はバッジ(+10 / +6%)', () => {
    expect(statOption('hp').name).toBe('体力');
    expect(statOption('atk').name).toBe('攻撃力');
    expect(statBadge('hp')).toBe('+10');
    expect(statBadge('atk')).toBe('+6%');
    expect(statOption('hp').statKind).toBe('hp');
  });
});
