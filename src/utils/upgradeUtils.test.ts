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
