import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetRunTelemetry, recordBossEntry, recordUpgradeOffered, recordUpgradeSelected,
  recordKnifeTierFromBox, recordScrapIncome, recordScrapExpense, recordMerchantPurchase,
  recordRunFinal, recordDdaCoefficients, ddaSkillCountWouldBeValue, getRunTelemetrySnapshot,
  DDA_OLD_SKILLCOUNT_COEFF, DDA_NEW_SKILLCOUNT_COEFF, DDA_NEW_SKILLCOUNT_CAP,
} from './runTelemetry';
import type { RunTelemetryEquipSnapshot } from './runTelemetry';
import type { SkillKey } from '../types/game';

const EMPTY_EQUIP: RunTelemetryEquipSnapshot = {
  body: { tier: 0, line: null, special: false },
  arms: { tier: 0, line: null, special: false },
  accessory: { tier: 0, line: null, special: false },
};

describe('runTelemetry', () => {
  beforeEach(() => {
    resetRunTelemetry();
  });

  it('starts empty after reset', () => {
    const snap = getRunTelemetrySnapshot();
    expect(snap.bossEntries).toEqual([]);
    expect(snap.upgrades).toEqual({ offered: 0, selectedByType: {} });
    expect(snap.knifeFromBox).toEqual({ grants: 0, maxTier: 0 });
    expect(snap.scrap.income).toEqual({ kill: 0, box: 0, poi: 0, levelup: 0, other: 0 });
    expect(snap.scrap.expenseByItem).toEqual({});
    expect(snap.merchantLog).toEqual([]);
    expect(snap.dda).toEqual([]);
    expect(snap.final).toEqual({ outcome: null, playerLevel: 1, maxAreaReached: 0, runTimeMs: 0 });
    expect(snap.slotFillTiming).toEqual({ filledAt: [], specialEquipAt: [] });
  });

  // 1. ボス突入時スナップショット
  it('records boss entry snapshots and deep-copies them (mutating the input after the call must not change the stored record)', () => {
    const skills = ['crit-up' as const];
    const skillLevels = { 'crit-up': 2 } as const;
    recordBossEntry({
      bossType: 'giantbat', gameTimeMs: 1000, playerLevel: 5,
      skills: [...skills], skillLevels: { ...skillLevels }, equip: EMPTY_EQUIP, straps: 120,
    });
    // 呼び出し元の配列/オブジェクトを後から書き換えても記録済みの1件目には影響しない(参照共有していないこと)。
    const mutableSkills: SkillKey[] = ['sniper'];
    recordBossEntry({
      bossType: 'mimir', gameTimeMs: 2000, playerLevel: 8,
      skills: mutableSkills, skillLevels: {}, equip: EMPTY_EQUIP, straps: 50,
    });
    mutableSkills.push('reaper');
    const snap = getRunTelemetrySnapshot();
    expect(snap.bossEntries).toHaveLength(2);
    expect(snap.bossEntries[0].skills).toEqual(['crit-up']);
    expect(snap.bossEntries[1].skills).toEqual(['sniper']); // 後からのpushが漏れていない
  });

  it('boss entry snapshot readback is a copy (mutating a returned snapshot does not affect the next readback)', () => {
    recordBossEntry({
      bossType: 'giantbat', gameTimeMs: 1000, playerLevel: 5,
      skills: ['crit-up'], skillLevels: { 'crit-up': 2 }, equip: EMPTY_EQUIP, straps: 120,
    });
    const snap1 = getRunTelemetrySnapshot();
    snap1.bossEntries[0].skills.push('sniper');
    snap1.bossEntries[0].equip.body.tier = 99;
    const snap2 = getRunTelemetrySnapshot();
    expect(snap2.bossEntries[0].skills).toEqual(['crit-up']);
    expect(snap2.bossEntries[0].equip.body.tier).toBe(0);
  });

  // 2. レベルアップ提示回数+選択内訳
  it('counts upgrade offers and selections by type', () => {
    recordUpgradeOffered();
    recordUpgradeOffered();
    recordUpgradeSelected('scrap');
    recordUpgradeSelected('scrap');
    recordUpgradeSelected('equipment');
    const snap = getRunTelemetrySnapshot();
    expect(snap.upgrades.offered).toBe(2);
    expect(snap.upgrades.selectedByType).toEqual({ scrap: 2, equipment: 1 });
  });

  // 3. ナイフ到達Tier(箱由来)
  it('tracks max knife tier reached from box grants', () => {
    recordKnifeTierFromBox(2);
    recordKnifeTierFromBox(4);
    recordKnifeTierFromBox(3);
    const snap = getRunTelemetrySnapshot();
    expect(snap.knifeFromBox).toEqual({ grants: 3, maxTier: 4 });
  });

  // 4. scrap収支の流路別
  it('accumulates scrap income per source and ignores zero amounts', () => {
    recordScrapIncome('box', 30);
    recordScrapIncome('box', 20);
    recordScrapIncome('poi', 100);
    recordScrapIncome('kill', 0);
    const snap = getRunTelemetrySnapshot();
    expect(snap.scrap.income).toEqual({ kill: 0, box: 50, poi: 100, levelup: 0, other: 0 });
  });

  it('accumulates scrap expense per item', () => {
    recordScrapExpense('medkit', 50);
    recordScrapExpense('medkit', 50);
    recordScrapExpense('ammo-handgun', 20);
    const snap = getRunTelemetrySnapshot();
    expect(snap.scrap.expenseByItem).toEqual({ medkit: 100, 'ammo-handgun': 20 });
  });

  // 5. 商人購入ログ(+expenseByItemへの反映)
  it('logs merchant purchases and mirrors them into scrap expense (single write path)', () => {
    recordMerchantPurchase('medkit', 50, 450, 12000);
    recordMerchantPurchase('medkit', 50, 400, 15000);
    const snap = getRunTelemetrySnapshot();
    expect(snap.merchantLog).toEqual([
      { item: 'medkit', price: 50, strapsAfter: 450, gameTimeMs: 12000 },
      { item: 'medkit', price: 50, strapsAfter: 400, gameTimeMs: 15000 },
    ]);
    expect(snap.scrap.expenseByItem).toEqual({ medkit: 100 });
  });

  // 6. 最終
  it('records the final run summary', () => {
    recordRunFinal({ outcome: 'death', playerLevel: 12, maxAreaReached: 3, runTimeMs: 620000 });
    expect(getRunTelemetrySnapshot().final).toEqual({
      outcome: 'death', playerLevel: 12, maxAreaReached: 3, runTimeMs: 620000,
    });
  });

  // 7. DDA係数の新旧並記
  it('pairs the old formula value with the new would-be value', () => {
    recordDdaCoefficients(2, 5000);
    const snap = getRunTelemetrySnapshot();
    expect(snap.dda).toEqual([
      { gameTimeMs: 5000, skillCount: 2, oldValue: 2 * DDA_OLD_SKILLCOUNT_COEFF, newValue: 1.0 },
    ]);
  });

  it('caps the new formula would-be value at DDA_NEW_SKILLCOUNT_CAP (6 slots × 0.5 = cap, no overshoot beyond it)', () => {
    expect(ddaSkillCountWouldBeValue(6)).toBe(DDA_NEW_SKILLCOUNT_CAP);
    expect(ddaSkillCountWouldBeValue(10)).toBe(DDA_NEW_SKILLCOUNT_CAP); // 保険条項: 通常は起きないが超過しても頭打ち
    expect(ddaSkillCountWouldBeValue(2)).toBeCloseTo(2 * DDA_NEW_SKILLCOUNT_COEFF);
  });

  // 8. 枠充足タイミング(B0は空のまま)
  it('keeps slot fill timing empty in B0 (fields reserved for B1+)', () => {
    const snap = getRunTelemetrySnapshot();
    expect(snap.slotFillTiming.filledAt).toEqual([]);
    expect(snap.slotFillTiming.specialEquipAt).toEqual([]);
  });

  it('reset clears every bucket back to the empty baseline', () => {
    recordBossEntry({ bossType: 'mimir', gameTimeMs: 1, playerLevel: 1, skills: [], skillLevels: {}, equip: EMPTY_EQUIP, straps: 0 });
    recordUpgradeOffered();
    recordScrapIncome('box', 10);
    recordMerchantPurchase('medkit', 50, 0, 0);
    recordDdaCoefficients(2, 0);
    recordRunFinal({ outcome: 'clear', playerLevel: 9, maxAreaReached: 4, runTimeMs: 1 });
    resetRunTelemetry();
    const snap = getRunTelemetrySnapshot();
    expect(snap.bossEntries).toEqual([]);
    expect(snap.upgrades.offered).toBe(0);
    expect(snap.scrap.income.box).toBe(0);
    expect(snap.merchantLog).toEqual([]);
    expect(snap.dda).toEqual([]);
    expect(snap.final.outcome).toBeNull();
  });
});
