// 永続育成「強化」の純関数+保存(research/GROWTH.md v4)の不変条件。
// ★このファイルが守るのは「台帳と段数の算術」だけ。**適用点(store/焼き込み)側の不変条件は
//   src/store/playerUpgrades.test.ts** が持つ(層を混ぜない)。
//
// localStorage は node 環境に無いので、モジュールを読む**前に**スタブを差す
// (practiceGuard.test.ts / subquestProgress.test.ts と同じ流儀)。
import { describe, it, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => { mem.clear(); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;

const {
  PLAYER_UPGRADES_KEY, activeUpgradeLevel, effectiveAmmoMax, effectiveAmmoMaxMap, emptyPlayerUpgrades,
  growthAttackMult, growthGoldMult, growthMaxHpBonus, growthScoreMult, loadPlayerUpgrades,
  normalizePlayerUpgrades, playerUpgradeCost, savePlayerUpgrades,
} = await import('./playerUpgrades');
const { PLAYER_UPGRADE_COSTS, PLAYER_UPGRADE_IDS, PLAYER_UPGRADE_MAX_LEVEL } = await import('../data/playerUpgrades');

beforeEach(() => { mem.clear(); });

describe('★最重要の不変条件: 全メーター0 = 育成機能が無かった時と完全に一致する', () => {
  it('0段は 加算0 / 倍率1.0 / 弾上限は素値そのまま', () => {
    expect(growthMaxHpBonus(0)).toBe(0);
    expect(growthAttackMult(0)).toBe(1);
    expect(growthGoldMult(0)).toBe(1);
    // 素値は引数で渡す(AMMO_MAX を import しない=循環import回避)。どの素値でも素通し。
    for (const base of [72, 24, 36, 48, 0, 1, 7]) expect(effectiveAmmoMax(base, 0)).toBe(base);
  });

  it('初期状態(何も買っていない)は全系統 bought=0 / active=0', () => {
    const empty = emptyPlayerUpgrades();
    for (const id of PLAYER_UPGRADE_IDS) {
      expect(empty[id]).toEqual({ bought: 0, active: 0 });
      expect(activeUpgradeLevel(empty, id)).toBe(0);
    }
  });

  it('保存が無い/壊れていても0段(=育成なし)へ落ちる', () => {
    expect(loadPlayerUpgrades()).toEqual(emptyPlayerUpgrades());
    mem.set(PLAYER_UPGRADES_KEY, '{ not json');
    expect(loadPlayerUpgrades()).toEqual(emptyPlayerUpgrades());
    mem.set(PLAYER_UPGRADES_KEY, JSON.stringify({ health: 'x', bogus: 1 }));
    expect(loadPlayerUpgrades()).toEqual(emptyPlayerUpgrades());
  });
});

describe('段数 → 効果値(発注文の表そのもの)', () => {
  it('体力 +20/段(5段で+100)', () => {
    expect([0, 1, 2, 3, 4, 5].map(growthMaxHpBonus)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('攻撃力 +4%/段(5段で+20%)', () => {
    expect(growthAttackMult(1)).toBeCloseTo(1.04, 10);
    expect(growthAttackMult(PLAYER_UPGRADE_MAX_LEVEL)).toBeCloseTo(1.2, 10);
  });

  it('ゴールド獲得 +10%/段(5段で+50%)', () => {
    expect(growthGoldMult(1)).toBeCloseTo(1.1, 10);
    expect(growthGoldMult(PLAYER_UPGRADE_MAX_LEVEL)).toBeCloseTo(1.5, 10);
  });

  it('弾数 +5%/段: 5段で handgun 72→90 / shotgun 24→30 / rifle 36→45 / phill 48→60', () => {
    expect(effectiveAmmoMax(72, 5)).toBe(90);
    expect(effectiveAmmoMax(24, 5)).toBe(30);
    expect(effectiveAmmoMax(36, 5)).toBe(45);
    expect(effectiveAmmoMax(48, 5)).toBe(60);
  });

  it('弾数はテーブル丸ごとでも同じ(glauncher=rifleと同値のまま追従する)', () => {
    const base = { handgun: 72, shotgun: 24, rifle: 36, phill: 48, glauncher: 36 };
    expect(effectiveAmmoMaxMap(base, 0)).toEqual(base);
    const maxed = effectiveAmmoMaxMap(base, 5);
    expect(maxed).toEqual({ handgun: 90, shotgun: 30, rifle: 45, phill: 60, glauncher: 45 });
    expect(maxed.glauncher).toBe(maxed.rifle); // 同ティア武器拾得の弾変換がここを引く
  });

  it('上限を超える段数を渡しても5段ぶんで頭打ち(保険条項)', () => {
    expect(growthMaxHpBonus(99)).toBe(growthMaxHpBonus(PLAYER_UPGRADE_MAX_LEVEL));
    expect(growthAttackMult(-3)).toBe(1);
  });
});

describe('メーターの不変条件: 常に 0 ≦ active ≦ bought ≦ 5', () => {
  it('active > bought は書けない(必ず bought まで畳まれる)', () => {
    const n = normalizePlayerUpgrades({ health: { bought: 2, active: 5 }, attack: { bought: 0, active: 3 } });
    expect(n.health).toEqual({ bought: 2, active: 2 });
    expect(n.attack).toEqual({ bought: 0, active: 0 });
  });

  it('負値・小数・上限超えも畳まれる', () => {
    const n = normalizePlayerUpgrades({
      health: { bought: 99, active: 99 },
      attack: { bought: -4, active: -9 },
      ammo: { bought: 3.9, active: 2.7 },
    });
    expect(n.health).toEqual({ bought: 5, active: 5 });
    expect(n.attack).toEqual({ bought: 0, active: 0 });
    expect(n.ammo).toEqual({ bought: 3, active: 2 });
  });

  it('保存→読み出しでも不変条件は保たれる(保存キーは進行名前空間)', () => {
    savePlayerUpgrades(normalizePlayerUpgrades({ gold: { bought: 4, active: 9 } }));
    expect(mem.has('zombie.progress.playerUpgrades')).toBe(true);
    expect(PLAYER_UPGRADES_KEY).toBe('zombie.progress.playerUpgrades');
    expect(loadPlayerUpgrades().gold).toEqual({ bought: 4, active: 4 });
  });
});

describe('スコア倍率(社長裁定2026-08-20: メーター1本フルで−0.2・ゴールド系統は数えない)', () => {
  it('0段=1.0(スコア不変)', () => {
    expect(growthScoreMult(emptyPlayerUpgrades())).toBe(1);
    expect(growthScoreMult(undefined)).toBe(1);
  });
  it('1段=−0.02、1系統フル=−0.1、3系統(体力/攻撃/弾数)フルでちょうど0.7(社長指示v0.25.3667)', () => {
    const one = normalizePlayerUpgrades({ attack: { bought: 1, active: 1 } });
    expect(growthScoreMult(one)).toBeCloseTo(0.98, 10);
    const full = normalizePlayerUpgrades({ health: { bought: 5, active: 5 } });
    expect(growthScoreMult(full)).toBeCloseTo(0.9, 10);
    const all = normalizePlayerUpgrades({
      health: { bought: 5, active: 5 }, attack: { bought: 5, active: 5 }, ammo: { bought: 5, active: 5 },
    });
    expect(growthScoreMult(all)).toBeCloseTo(0.7, 10);
  });
  it('ゴールド獲得の段数はスコアに影響しない(社長裁定「ゴールド強化はスコア対象外」)', () => {
    const goldOnly = normalizePlayerUpgrades({ gold: { bought: 5, active: 5 } });
    expect(growthScoreMult(goldOnly)).toBe(1);
  });
  it('効くのは有効段数(メーター)——下げれば戻る', () => {
    const lowered = normalizePlayerUpgrades({ attack: { bought: 5, active: 0 } });
    expect(growthScoreMult(lowered)).toBe(1);
  });
});

describe('価格表', () => {
  it('5段ぶんあり、単調増加する', () => {
    expect(PLAYER_UPGRADE_COSTS).toHaveLength(PLAYER_UPGRADE_MAX_LEVEL);
    expect(PLAYER_UPGRADE_COSTS.every((c, i, all) => i === 0 || c > all[i - 1])).toBe(true);
  });

  it('次の1段の価格は購入済み段数で決まり、上限まで買うと0(=買えない)', () => {
    expect([0, 1, 2, 3, 4].map(playerUpgradeCost)).toEqual([...PLAYER_UPGRADE_COSTS]);
    expect(playerUpgradeCost(PLAYER_UPGRADE_MAX_LEVEL)).toBe(0);
  });
});
