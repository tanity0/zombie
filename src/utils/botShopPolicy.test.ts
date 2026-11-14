import { describe, it, expect } from 'vitest';
import { decideBotShopPurchase, ARMORY_RESERVE_STRAPS } from './botShopPolicy';
import { emptyEquipLoadout } from '../data/equipment';
import type { EquipLoadout } from '../types/game';

const MEDKIT_COST = 50;
const COST_BY_TIER = [40, 80, 120, 160, 200];
// 全スロット最上段=装備区画の②候補が無い状態。既存(①救急のみ)のテストはこれで従来どおりの挙動になる。
const MAXED_LOADOUT: EquipLoadout = {
  body: 'body-protection-5', arms: 'arms-firepower-5', accessory: 'accessory-crit-5',
};

describe('decideBotShopPurchase(§13-2/追補: 乱数なし・決定的・①救急)', () => {
  it('buys a medkit when HP<50% and enough scrap remains after purchase', () => {
    const action = decideBotShopPurchase({
      playerHealth: 40, playerMaxHealth: 100, straps: 200, medkitCost: MEDKIT_COST,
      equipment: MAXED_LOADOUT, equipShopCostByTier: COST_BY_TIER,
    });
    expect(action).toEqual({ kind: 'buy-medkit' });
  });

  it('closes without buying when HP is 50% or above and no equip candidate exists (①②とも条件を満たさない)', () => {
    const action = decideBotShopPurchase({
      playerHealth: 50, playerMaxHealth: 100, straps: 200, medkitCost: MEDKIT_COST,
      equipment: MAXED_LOADOUT, equipShopCostByTier: COST_BY_TIER,
    });
    expect(action).toEqual({ kind: 'close' });
  });

  it('closes without buying when scrap is insufficient for the medkit price', () => {
    const action = decideBotShopPurchase({
      playerHealth: 10, playerMaxHealth: 100, straps: 10, medkitCost: MEDKIT_COST,
      equipment: MAXED_LOADOUT, equipShopCostByTier: COST_BY_TIER,
    });
    expect(action).toEqual({ kind: 'close' });
  });

  it('closes without buying when the purchase would drop scrap below the armory reserve', () => {
    // straps=140, cost=50 → after=90 < ARMORY_RESERVE_STRAPS(100) → 買わない(温存則)
    const action = decideBotShopPurchase({
      playerHealth: 10, playerMaxHealth: 100, straps: MEDKIT_COST + ARMORY_RESERVE_STRAPS - 10, medkitCost: MEDKIT_COST,
      equipment: MAXED_LOADOUT, equipShopCostByTier: COST_BY_TIER,
    });
    expect(action).toEqual({ kind: 'close' });
  });

  it('buys when the purchase leaves exactly the armory reserve (boundary is inclusive)', () => {
    const action = decideBotShopPurchase({
      playerHealth: 10, playerMaxHealth: 100, straps: MEDKIT_COST + ARMORY_RESERVE_STRAPS, medkitCost: MEDKIT_COST,
      equipment: MAXED_LOADOUT, equipShopCostByTier: COST_BY_TIER,
    });
    expect(action).toEqual({ kind: 'buy-medkit' });
  });

  it('treats maxHealth<=0 as full health (no divide-by-zero, no purchase)', () => {
    const action = decideBotShopPurchase({
      playerHealth: 0, playerMaxHealth: 0, straps: 500, medkitCost: MEDKIT_COST,
      equipment: MAXED_LOADOUT, equipShopCostByTier: COST_BY_TIER,
    });
    expect(action).toEqual({ kind: 'close' });
  });

  it('is deterministic: identical input always yields identical output across repeated calls', () => {
    const input = {
      playerHealth: 30, playerMaxHealth: 100, straps: 300, medkitCost: MEDKIT_COST,
      equipment: MAXED_LOADOUT, equipShopCostByTier: COST_BY_TIER,
    };
    const results = Array.from({ length: 5 }, () => decideBotShopPurchase({ ...input }));
    expect(results.every(r => r.kind === 'buy-medkit')).toBe(true);
  });
});

describe('decideBotShopPurchase(§18-1の7: 乱数なし・決定的・②装備区画)', () => {
  it('HP十分・全スロット未装備なら、最安(Tier1)の最初のスロット(body)を系統index0で買う', () => {
    const action = decideBotShopPurchase({
      playerHealth: 100, playerMaxHealth: 100, straps: 500, medkitCost: MEDKIT_COST,
      equipment: emptyEquipLoadout(), equipShopCostByTier: COST_BY_TIER,
    });
    expect(action).toEqual({ kind: 'buy-equip', slot: 'body', defId: 'body-protection-1' });
  });

  it('①HP<50%が優先される(同じ購入余力でも救急が先)', () => {
    const action = decideBotShopPurchase({
      playerHealth: 10, playerMaxHealth: 100, straps: 500, medkitCost: MEDKIT_COST,
      equipment: emptyEquipLoadout(), equipShopCostByTier: COST_BY_TIER,
    });
    expect(action).toEqual({ kind: 'buy-medkit' });
  });

  it('装備済み(Tier<5)スロットは次の一段のみ提示され、それが最安なら買う', () => {
    const loadout: EquipLoadout = { body: 'body-protection-1', arms: null, accessory: null };
    // body: 次はTier2=80s。arms/accessory: 未装備Tier1=40s。armsの方が安い。
    const action = decideBotShopPurchase({
      playerHealth: 100, playerMaxHealth: 100, straps: 500, medkitCost: MEDKIT_COST,
      equipment: loadout, equipShopCostByTier: COST_BY_TIER,
    });
    expect(action).toEqual({ kind: 'buy-equip', slot: 'arms', defId: 'arms-firepower-1' });
  });

  it('特殊装備/最上段スロットは候補から除外される(売り切れ)', () => {
    const loadout: EquipLoadout = { body: 'special-body', arms: 'arms-firepower-5', accessory: null };
    const action = decideBotShopPurchase({
      playerHealth: 100, playerMaxHealth: 100, straps: 500, medkitCost: MEDKIT_COST,
      equipment: loadout, equipShopCostByTier: COST_BY_TIER,
    });
    expect(action).toEqual({ kind: 'buy-equip', slot: 'accessory', defId: 'accessory-crit-1' });
  });

  it('武器庫代の温存則(straps≥100を残す)は②にも適用される', () => {
    // straps=139, 最安候補=40s → after=99 < 100 → 買わない
    const action = decideBotShopPurchase({
      playerHealth: 100, playerMaxHealth: 100, straps: 139, medkitCost: MEDKIT_COST,
      equipment: emptyEquipLoadout(), equipShopCostByTier: COST_BY_TIER,
    });
    expect(action).toEqual({ kind: 'close' });
  });

  it('全スロット売り切れ(特殊×3)ならcloseする', () => {
    const loadout: EquipLoadout = { body: 'special-body', arms: 'special-arms', accessory: 'special-accessory' };
    const action = decideBotShopPurchase({
      playerHealth: 100, playerMaxHealth: 100, straps: 500, medkitCost: MEDKIT_COST,
      equipment: loadout, equipShopCostByTier: COST_BY_TIER,
    });
    expect(action).toEqual({ kind: 'close' });
  });
});
