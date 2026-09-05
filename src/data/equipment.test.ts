// PACING_PUZZLE.md §6.24 M48(武器庫)E2の配置ロジック: 「空きスロット優先→全部埋まっていれば
// いちばんTierが低い部位を置換」。純関数 armoryTargetSlot の不変条件を機械化する。
// SKILL_BUILD_REDESIGN.md §16-3/§18-1の4(特殊装備は置換候補から除外)の反映も含む。
import { describe, it, expect } from 'vitest';
import { armoryTargetSlot, emptyEquipLoadout, merchantEquipShelf, merchantEquipStepForSlot } from './equipment';
import type { EquipLoadout } from '../types/game';

const rngSeq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

describe('armoryTargetSlot(空きスロット優先)', () => {
  it('全部空きなら空きスロットのどれかを返す(乱数で選ぶ)', () => {
    const loadout = emptyEquipLoadout();
    expect(['body', 'arms', 'accessory']).toContain(armoryTargetSlot(loadout, rngSeq(0)));
    expect(armoryTargetSlot(loadout, rngSeq(0))).toBe('body');
    expect(armoryTargetSlot(loadout, rngSeq(0.99))).toBe('accessory');
  });

  it('1つだけ空きがあれば、その空きスロットを返す(乱数に依らない)', () => {
    const loadout: EquipLoadout = { body: 'body-protection-3', arms: null, accessory: 'accessory-crit-2' };
    expect(armoryTargetSlot(loadout, rngSeq(0))).toBe('arms');
    expect(armoryTargetSlot(loadout, rngSeq(0.99))).toBe('arms');
  });
});

describe('armoryTargetSlot(全部埋まっている時=最もTierが低い部位を置換)', () => {
  it('通常装備同士なら最低Tierのスロットを返す', () => {
    const loadout: EquipLoadout = {
      body: 'body-protection-4',   // tier4
      arms: 'arms-firepower-1',    // tier1 ← 最低
      accessory: 'accessory-crit-3', // tier3
    };
    expect(armoryTargetSlot(loadout)).toBe('arms');
  });

  it('特殊装備が入ったスロットは置換候補から除外される(§16-3/§18-1の4)', () => {
    const loadout: EquipLoadout = {
      body: 'special-body',        // 特殊=除外
      arms: 'arms-firepower-5',    // tier5
      accessory: 'accessory-crit-5', // tier5
    };
    expect(armoryTargetSlot(loadout)).toBe('arms'); // bodyは除外されるので次点(先頭)のarmsが対象
  });

  it('全スロットが特殊ならnull(売り切れ)を返す', () => {
    const loadout: EquipLoadout = {
      body: 'special-body', arms: 'special-arms', accessory: 'special-accessory',
    };
    expect(armoryTargetSlot(loadout)).toBeNull();
  });

  it('特殊と通常が混在するなら、通常側スロットのうち最低Tierを返す(特殊は無視)', () => {
    const loadout: EquipLoadout = {
      body: 'special-body',
      arms: 'special-arms',
      accessory: 'accessory-crit-2', // 通常はここだけ
    };
    expect(armoryTargetSlot(loadout)).toBe('accessory');
  });

  it('全スロットが同Tierなら先頭(body)から順に見つかったものを返す(決定的)', () => {
    const loadout: EquipLoadout = {
      body: 'body-protection-2',
      arms: 'arms-firepower-2',
      accessory: 'accessory-crit-2',
    };
    expect(armoryTargetSlot(loadout)).toBe('body');
  });
});

describe('merchantEquipStepForSlot / merchantEquipShelf(§13-1+§16-7: 商人の装備区画=指名買いカタログ)', () => {
  it('未装備スロットは両系統のTier1を2枚並べる(choose)', () => {
    const step = merchantEquipStepForSlot(emptyEquipLoadout(), 'body');
    expect(step.kind).toBe('choose');
    if (step.kind === 'choose') {
      expect(step.options.map(o => o.id)).toEqual(['body-protection-1', 'body-mobility-1']);
    }
  });

  it('装備済み(Tier<5)は現在系統の次の一段のみ(next)', () => {
    const loadout: EquipLoadout = { body: 'body-protection-3', arms: null, accessory: null };
    const step = merchantEquipStepForSlot(loadout, 'body');
    expect(step).toEqual({ kind: 'next', slot: 'body', def: expect.objectContaining({ id: 'body-protection-4' }) });
  });

  it('系統乗り換えは提示しない(next側は同一系統のみ)', () => {
    const loadout: EquipLoadout = { body: 'body-mobility-2', arms: null, accessory: null };
    const step = merchantEquipStepForSlot(loadout, 'body');
    expect(step.kind).toBe('next');
    if (step.kind === 'next') expect(step.def.id).toBe('body-mobility-3');
  });

  it('最上段(Tier5)到達スロットは売り切れ', () => {
    const loadout: EquipLoadout = { body: 'body-protection-5', arms: null, accessory: null };
    expect(merchantEquipStepForSlot(loadout, 'body')).toEqual({ kind: 'sold-out', slot: 'body' });
  });

  it('特殊装備が入ったスロットは売り切れ(商人は武将装備を上書きしない)', () => {
    const loadout: EquipLoadout = { body: 'special-body', arms: null, accessory: null };
    expect(merchantEquipStepForSlot(loadout, 'body')).toEqual({ kind: 'sold-out', slot: 'body' });
  });

  it('merchantEquipShelfは3スロット分をEQUIP_SLOTS順で返す', () => {
    const shelf = merchantEquipShelf(emptyEquipLoadout());
    expect(shelf.map(s => s.slot)).toEqual(['body', 'arms', 'accessory']);
    expect(shelf.every(s => s.kind === 'choose')).toBe(true);
  });

  it('§18-2の受け入れ条件5(リロール不可の回帰): 同じロードアウトなら何度呼んでも同じ棚を返す(棚は生成しない=乱数を持たない)', () => {
    const loadout: EquipLoadout = { body: 'body-protection-2', arms: null, accessory: 'special-accessory' };
    const first = merchantEquipShelf(loadout);
    for (let i = 0; i < 20; i++) expect(merchantEquipShelf(loadout)).toEqual(first);
  });
});
