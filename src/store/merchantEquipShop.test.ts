// SKILL_BUILD_REDESIGN.md §13-1+§16-7+§18-1: 商人の装備区画(gameStore.buyEquipmentFromShop)。
// 受け入れ条件1(次の一段だけ提示・購入で1段進む)/3(最上段売り切れ)/4(scrap不足で購入不可)/
// 11(ボット購買が装備を買い、購入がrunTelemetryに載る)をこのファイルで機械化する。
import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore, EQUIP_SHOP_COST_BY_TIER } from './gameStore';
import { emptyEquipLoadout } from '../data/equipment';
import { decideBotShopPurchase } from '../utils/botShopPolicy';
import { getRunTelemetrySnapshot } from '../utils/runTelemetry';
import type { EquipLoadout } from '../types/game';

const setStraps = (straps: number) => {
  useGameStore.setState(state => ({ player: { ...state.player, straps } }));
};

const setEquipment = (equipment: EquipLoadout) => {
  useGameStore.setState(state => ({ player: { ...state.player, equipment } }));
};

describe('buyEquipmentFromShop', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
    setEquipment(emptyEquipLoadout());
  });

  it('未装備スロットは提示された2択のどちらでも買え、購入後はそのスロットにTier1が付く', () => {
    setStraps(1000);
    const ok = useGameStore.getState().buyEquipmentFromShop('body', 'body-mobility-1');
    expect(ok).toBe(true);
    expect(useGameStore.getState().player.equipment.body).toBe('body-mobility-1');
    expect(useGameStore.getState().player.straps).toBe(1000 - EQUIP_SHOP_COST_BY_TIER[0]);
  });

  it('装備済みスロットは次の一段だけが買え、買うと1段進む(棚は自動で次の段へ)', () => {
    setEquipment({ body: 'body-protection-2', arms: null, accessory: null });
    setStraps(1000);
    const ok = useGameStore.getState().buyEquipmentFromShop('body', 'body-protection-3');
    expect(ok).toBe(true);
    expect(useGameStore.getState().player.equipment.body).toBe('body-protection-3');
    expect(useGameStore.getState().player.straps).toBe(1000 - EQUIP_SHOP_COST_BY_TIER[2]);
  });

  it('棚に無いdefId(古いUI表示・系統違い等)を渡すと拒否される(既に進んだ後の1個前の段など)', () => {
    setEquipment({ body: 'body-protection-2', arms: null, accessory: null });
    setStraps(1000);
    // 現在の棚は body-protection-3 のみ。系統違い(mobility)は拒否。
    const ok = useGameStore.getState().buyEquipmentFromShop('body', 'body-mobility-3');
    expect(ok).toBe(false);
    expect(useGameStore.getState().player.equipment.body).toBe('body-protection-2');
  });

  it('最上段(Tier5)スロットは売り切れで購入不可', () => {
    setEquipment({ body: 'body-protection-5', arms: null, accessory: null });
    setStraps(1000);
    const ok = useGameStore.getState().buyEquipmentFromShop('body', 'body-protection-5');
    expect(ok).toBe(false);
    expect(useGameStore.getState().player.equipment.body).toBe('body-protection-5');
  });

  it('特殊装備スロットは売り切れで購入不可(商人は武将装備を上書きしない)', () => {
    setEquipment({ body: 'special-body', arms: null, accessory: null });
    setStraps(1000);
    const ok = useGameStore.getState().buyEquipmentFromShop('body', 'body-protection-1');
    expect(ok).toBe(false);
    expect(useGameStore.getState().player.equipment.body).toBe('special-body');
  });

  it('scrap不足なら購入は成立しない(状態=straps未変化で分かる)', () => {
    setStraps(EQUIP_SHOP_COST_BY_TIER[0] - 1);
    const ok = useGameStore.getState().buyEquipmentFromShop('body', 'body-protection-1');
    expect(ok).toBe(false);
    expect(useGameStore.getState().player.equipment.body).toBeNull();
  });

  it('購入成立時にrunTelemetryの商人購入ログへ記録される(受け入れ条件11の店側半分)', () => {
    setStraps(1000);
    const before = getRunTelemetrySnapshot().merchantLog.length;
    useGameStore.getState().buyEquipmentFromShop('body', 'body-protection-1');
    const snap = getRunTelemetrySnapshot();
    expect(snap.merchantLog.length).toBe(before + 1);
    const entry = snap.merchantLog[snap.merchantLog.length - 1];
    expect(entry.item).toBe('body-protection-1');
    expect(entry.price).toBe(EQUIP_SHOP_COST_BY_TIER[0]);
  });

  it('受け入れ条件11: ボット購買ポリシー(decideBotShopPurchase)→buyEquipmentFromShopの実配線で購入がtelemetryに載る', () => {
    setStraps(500);
    // HP満タンを明示(①救急分岐を確実に避け、②装備分岐が試験対象になるようにする)。
    useGameStore.setState(state => ({ player: { ...state.player, health: state.player.maxHealth } }));
    const s = useGameStore.getState();
    const action = decideBotShopPurchase({
      playerHealth: s.player.health, playerMaxHealth: s.player.maxHealth,
      straps: s.player.straps, medkitCost: 50,
      equipment: s.player.equipment, equipShopCostByTier: EQUIP_SHOP_COST_BY_TIER,
    });
    expect(action.kind).toBe('buy-equip');
    if (action.kind !== 'buy-equip') return;
    const before = getRunTelemetrySnapshot().merchantLog.length;
    const ok = useGameStore.getState().buyEquipmentFromShop(action.slot, action.defId);
    expect(ok).toBe(true);
    expect(useGameStore.getState().player.equipment[action.slot]).toBe(action.defId);
    expect(getRunTelemetrySnapshot().merchantLog.length).toBe(before + 1);
  });
});
