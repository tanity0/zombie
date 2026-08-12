import { describe, it, expect } from 'vitest';
import { decideBotShopPurchase, ARMORY_RESERVE_STRAPS } from './botShopPolicy';

const MEDKIT_COST = 50;

describe('decideBotShopPurchase(§13-2/追補: 乱数なし・決定的)', () => {
  it('buys a medkit when HP<50% and enough scrap remains after purchase', () => {
    const action = decideBotShopPurchase({
      playerHealth: 40, playerMaxHealth: 100, straps: 200, medkitCost: MEDKIT_COST,
    });
    expect(action).toEqual({ kind: 'buy-medkit' });
  });

  it('closes without buying when HP is 50% or above (①条件を満たさない)', () => {
    const action = decideBotShopPurchase({
      playerHealth: 50, playerMaxHealth: 100, straps: 200, medkitCost: MEDKIT_COST,
    });
    expect(action).toEqual({ kind: 'close' });
  });

  it('closes without buying when scrap is insufficient for the medkit price', () => {
    const action = decideBotShopPurchase({
      playerHealth: 10, playerMaxHealth: 100, straps: 10, medkitCost: MEDKIT_COST,
    });
    expect(action).toEqual({ kind: 'close' });
  });

  it('closes without buying when the purchase would drop scrap below the armory reserve', () => {
    // straps=140, cost=50 → after=90 < ARMORY_RESERVE_STRAPS(100) → 買わない(温存則)
    const action = decideBotShopPurchase({
      playerHealth: 10, playerMaxHealth: 100, straps: MEDKIT_COST + ARMORY_RESERVE_STRAPS - 10, medkitCost: MEDKIT_COST,
    });
    expect(action).toEqual({ kind: 'close' });
  });

  it('buys when the purchase leaves exactly the armory reserve (boundary is inclusive)', () => {
    const action = decideBotShopPurchase({
      playerHealth: 10, playerMaxHealth: 100, straps: MEDKIT_COST + ARMORY_RESERVE_STRAPS, medkitCost: MEDKIT_COST,
    });
    expect(action).toEqual({ kind: 'buy-medkit' });
  });

  it('treats maxHealth<=0 as full health (no divide-by-zero, no purchase)', () => {
    const action = decideBotShopPurchase({
      playerHealth: 0, playerMaxHealth: 0, straps: 500, medkitCost: MEDKIT_COST,
    });
    expect(action).toEqual({ kind: 'close' });
  });

  it('is deterministic: identical input always yields identical output across repeated calls', () => {
    const input = { playerHealth: 30, playerMaxHealth: 100, straps: 300, medkitCost: MEDKIT_COST };
    const results = Array.from({ length: 5 }, () => decideBotShopPurchase({ ...input }));
    expect(results.every(r => r.kind === 'buy-medkit')).toBe(true);
  });
});
