// node既定環境にはlocalStorageが無い。resolveSlotKeyNow/unlockedWeaponKeys/shelfWeaponKeysは
// progress.tsのgetWeaponUnlocks/getWeaponBlueprints経由でlocalStorageを読むため、
// progress.test.tsと同じ最小モックを先に差す(importは遅延読みなので呼び出し時に効いていればよい)。
import { describe, it, expect, beforeEach } from 'vitest';

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => { backing[k] = v; },
  removeItem: (k: string) => { delete backing[k]; },
  clear: () => { for (const k of Object.keys(backing)) delete backing[k]; },
  key: () => null,
  get length() { return Object.keys(backing).length; },
} as Storage;

import { resolveSlotKey, resolveSlotKeyNow, unlockedWeaponKeys, shelfWeaponKeys, type SlotLoadout, defaultSlotKeys } from './weaponSlot';
import { SLOT_CATEGORIES, SLOT_TIERS, SLOT_CANDIDATES, BOSS_UNLOCK, STORE_SOLD_KEYS, type SlotTier } from '../data/weaponSlots';
import { catalogCategoryTier, createWeapon } from './weaponUtils';
import { markWeaponBlueprint, markWeaponUnlocked } from '../data/progress';

beforeEach(() => { for (const k of Object.keys(backing)) delete backing[k]; });

// ─────────────────────────────────────────────────────────────────────────
// resolveSlotKey(純関数・UNIQUE_WEAPONS.md §4)
// ─────────────────────────────────────────────────────────────────────────
describe('resolveSlotKey', () => {
  it('未設定なら入力キーをそのまま返す(恒等)', () => {
    expect(resolveSlotKey('handgun-t1', {}, new Set())).toBe('handgun-t1');
  });

  it('設定済み+解放済みなら設定キーへ解決する', () => {
    const loadout: SlotLoadout = { handgun: { 1: 'handgun-t1-derringer' } };
    const unlocked = new Set(['handgun-t1-derringer']);
    expect(resolveSlotKey('handgun-t1', loadout, unlocked)).toBe('handgun-t1-derringer');
  });

  it('冪等: 一度解決したキーへ再度通しても同じ結果になる', () => {
    const loadout: SlotLoadout = { handgun: { 2: 'handgun-t2-handcannon' } };
    const unlocked = new Set(['handgun-t2-handcannon']);
    const once = resolveSlotKey('handgun-t2', loadout, unlocked);
    const twice = resolveSlotKey(once, loadout, unlocked);
    expect(twice).toBe(once);
    expect(once).toBe('handgun-t2-handcannon');
  });

  it('未解放なら入力キーをそのまま返す(壊れたセーブで詰まない)', () => {
    const loadout: SlotLoadout = { handgun: { 3: 'handgun-t3-piledriver' } };
    expect(resolveSlotKey('handgun-t3', loadout, new Set())).toBe('handgun-t3');
  });

  it('スロット外(候補配列に無い)キーが設定されていたら入力キーをそのまま返す', () => {
    const loadout = { handgun: { 1: 'not-a-real-candidate' } } as unknown as SlotLoadout;
    expect(resolveSlotKey('handgun-t1', loadout, new Set(['not-a-real-candidate']))).toBe('handgun-t1');
  });

  it('近接(category無し)は横の対象外=常に恒等', () => {
    const loadout: SlotLoadout = { handgun: { 1: 'handgun-t1-derringer' } };
    expect(resolveSlotKey('knife-t1', loadout, new Set(['handgun-t1-derringer']))).toBe('knife-t1');
  });

  it('未知のキーは恒等', () => {
    expect(resolveSlotKey('does-not-exist', {}, new Set())).toBe('does-not-exist');
  });

  it('候補が1つしかないスロット(第1弾では横がハンドガン以外)は常に恒等', () => {
    expect(resolveSlotKey('shotgun-t1', { shotgun: { 1: 'shotgun-t1' } }, new Set(['shotgun-t1']))).toBe('shotgun-t1');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 不変条件2〜6(UNIQUE_WEAPONS.md §5)
// ─────────────────────────────────────────────────────────────────────────
const ALL_TIERS: SlotTier[] = [...SLOT_TIERS];

describe('不変条件2: スロット整合', () => {
  it('候補キーは全てCATALOGに存在し、category/tierがスロットと一致する', () => {
    for (const cat of SLOT_CATEGORIES) {
      for (const tier of ALL_TIERS) {
        for (const key of SLOT_CANDIDATES[cat][tier]) {
          const { category, tier: catTier } = catalogCategoryTier(key);
          expect(category, key).toBe(cat);
          expect(catTier, key).toBe(tier);
        }
      }
    }
  });
});

describe('不変条件3: 既定の先頭', () => {
  it('各スロットの先頭は既存キー <category>-t<tier>', () => {
    for (const cat of SLOT_CATEGORIES) {
      for (const tier of ALL_TIERS) {
        expect(SLOT_CANDIDATES[cat][tier][0]).toBe(`${cat}-t${tier}`);
      }
    }
  });
});

describe('不変条件4: 解放表(BOSS_UNLOCK)の健全性', () => {
  it('値は全て候補配列のどれかに含まれ、既定候補ではない', () => {
    const allCandidates = SLOT_CATEGORIES.flatMap(cat => ALL_TIERS.flatMap(t => SLOT_CANDIDATES[cat][t]));
    const defaults = defaultSlotKeys();
    for (const weaponKey of Object.values(BOSS_UNLOCK)) {
      expect(allCandidates).toContain(weaponKey);
      expect(defaults.has(weaponKey)).toBe(false);
    }
  });
});

// UNIQUE_WEAPONS.md §11-6-2(監査A-2の是正): 「BOSS_UNLOCKに無い=店売り」と実装してはいけないので、
// 排反(両方に入っていない)かつ網羅(どちらか一方には必ず入っている)をテストで機械化する。
// 入れ忘れた武器は永久に入手不能になるため必須。
describe('不変条件: 解放元の排反・網羅(BOSS_UNLOCK ∪ STORE_SOLD_KEYS = 全ユニーク候補・§11-6-2)', () => {
  const uniqueCandidates = SLOT_CATEGORIES.flatMap(cat => ALL_TIERS.flatMap(t => SLOT_CANDIDATES[cat][t].slice(1)));

  it('全ユニーク候補はBOSS_UNLOCKの値かSTORE_SOLD_KEYSのどちらか一方に属する(排反かつ網羅)', () => {
    const bossValues = new Set(Object.values(BOSS_UNLOCK));
    const storeSold = new Set(STORE_SOLD_KEYS);
    for (const key of uniqueCandidates) {
      const inBoss = bossValues.has(key);
      const inStore = storeSold.has(key);
      expect(inBoss || inStore, `${key} はどちらの表にも無い(永久に入手不能)`).toBe(true);
      expect(inBoss && inStore, `${key} は両方の表に入っている(排反違反)`).toBe(false);
    }
  });

  it('BOSS_UNLOCK/STORE_SOLD_KEYSの側に、ユニーク候補ではないキーが紛れ込んでいない', () => {
    for (const key of Object.values(BOSS_UNLOCK)) expect(uniqueCandidates).toContain(key);
    for (const key of STORE_SOLD_KEYS) expect(uniqueCandidates).toContain(key);
  });
});

describe('不変条件5: フォールバック', () => {
  it('未解放キーを設定したloadoutを渡しても、resolveSlotKeyは必ず解放済みのキーを返す', () => {
    const defaultsOnly = defaultSlotKeys(); // 既定候補だけが解放済み、という最も厳しい状況
    for (const cat of SLOT_CATEGORIES) {
      for (const tier of ALL_TIERS) {
        for (const configured of SLOT_CANDIDATES[cat][tier]) {
          const loadout: SlotLoadout = { [cat]: { [tier]: configured } } as SlotLoadout;
          const inputKey = SLOT_CANDIDATES[cat][tier][0]; // 生成点は常に既定キーを渡す
          const resolved = resolveSlotKey(inputKey, loadout, defaultsOnly);
          expect(defaultsOnly.has(resolved), `${cat}${tier} configured=${configured}`).toBe(true);
        }
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 不変条件6(支配の禁止・全12スロット共通)+ 不変条件1(実効DPS帯・ハンドガンのみ§5適用範囲)
// ─────────────────────────────────────────────────────────────────────────
interface StatLike {
  damage: number; count?: number; critChance?: number; magSize?: number;
  cooldown: number; reloadMs?: number; passthrough?: boolean; pierce?: number;
}

// 候補が既定に対し全軸で≧(damage/count/critChance/magSize、cooldown/reloadMsは≦、passthrough/pierceは既定以上)
// になっていたら「支配」= 不合格。
const dominatesDefault = (candidate: StatLike, base: StatLike): boolean =>
  candidate.damage >= base.damage
  && (candidate.count ?? 1) >= (base.count ?? 1)
  && (candidate.critChance ?? 0) >= (base.critChance ?? 0)
  && (candidate.magSize ?? 0) >= (base.magSize ?? 0)
  && candidate.cooldown <= base.cooldown
  && (candidate.reloadMs ?? 0) <= (base.reloadMs ?? 0)
  && (candidate.passthrough ? 1 : 0) >= (base.passthrough ? 1 : 0)
  && (candidate.pierce ?? 0) >= (base.pierce ?? 0);

// UNIQUE_WEAPONS.md §5: 実効DPS = damage*count*magSize / (magSize*cooldown + max(250, reloadMs*2)) * 1000
const effectiveDps = (w: StatLike): number => {
  const count = w.count ?? 1;
  const magSize = w.magSize ?? 1;
  const effReload = Math.max(250, (w.reloadMs ?? 0) * 2);
  return (w.damage * count * magSize) / (magSize * w.cooldown + effReload) * 1000;
};

describe('不変条件6: 支配の禁止(全スロット共通)', () => {
  for (const cat of SLOT_CATEGORIES) {
    for (const tier of ALL_TIERS) {
      const candidates = SLOT_CANDIDATES[cat][tier];
      if (candidates.length <= 1) continue; // 横が無いスロットは対象外
      const base = createWeapon(candidates[0]);
      for (const key of candidates.slice(1)) {
        it(`${key} は既定(${candidates[0]})を全軸支配しない`, () => {
          const candidate = createWeapon(key);
          expect(dominatesDefault(candidate, base)).toBe(false);
        });
      }
    }
  }
});

describe('不変条件1: 実効DPS帯(ハンドガン=damage/cooldown/magSize/reloadMsで表せる武器のみ・§5の適用範囲)', () => {
  const band = (defaultKey: string, uniqueKey: string) => {
    const base = effectiveDps(createWeapon(defaultKey));
    const unique = effectiveDps(createWeapon(uniqueKey));
    return { base, unique, ratio: unique / base };
  };

  it('T1 デリンジャー: 既定比 +0%〜+15%(叩き台+7.7%)', () => {
    const { base, unique, ratio } = band('handgun-t1', 'handgun-t1-derringer');
    expect(base).toBeCloseTo(15.79, 1);
    expect(unique).toBeCloseTo(17.00, 1);
    expect(ratio).toBeGreaterThanOrEqual(1.0);
    expect(ratio).toBeLessThanOrEqual(1.15);
  });

  it('T2 ハンドキャノン: 既定比 +0%〜+15%(叩き台+10.2%・減衰は式に出ない別軸)', () => {
    const { base, unique, ratio } = band('handgun-t2', 'handgun-t2-handcannon');
    expect(base).toBeCloseTo(28.13, 1);
    expect(unique).toBeCloseTo(31.00, 1);
    expect(ratio).toBeGreaterThanOrEqual(1.0);
    expect(ratio).toBeLessThanOrEqual(1.15);
  });

  it('T3 パイルドライバー: 既定比 +0%〜+15%(叩き台+8.7%・射程/KB/体勢は式に出ない別軸)', () => {
    const { base, unique, ratio } = band('handgun-t3', 'handgun-t3-piledriver');
    expect(base).toBeCloseTo(37.50, 1);
    expect(unique).toBeCloseTo(40.75, 1);
    expect(ratio).toBeGreaterThanOrEqual(1.0);
    expect(ratio).toBeLessThanOrEqual(1.15);
  });
});

describe('パイルドライバーの射程(UNIQUE_WEAPONS.md §13-1)', () => {
  it('rangeOverride = MELEE_RADIUS(74) + HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL[3](34) = 108 を導出する', () => {
    const w = createWeapon('handgun-t3-piledriver');
    expect(w.rangeOverride).toBe(108);
  });
});

// UNIQUE_WEAPONS.md §11-6-1: 「設計図あり」だけでは使えない(=装備/生成点は購入済みしか読まない)。
// 「購入済み」になって初めて resolveSlotKeyNow が解決する。この2状態の分離を機械化する。
describe('設計図と購入済みの分離(UNIQUE_WEAPONS.md §11-6-1・生成点はresolveSlotKeyNow)', () => {
  it('設計図だけでは装備/生成点は解決しない(恒等のまま)', () => {
    markWeaponBlueprint('handgun-t1-derringer');
    // 装備設定にデリンジャーを選んでいても、購入していない間は既定キーへ恒等で落ちる。
    const loadout: SlotLoadout = { handgun: { 1: 'handgun-t1-derringer' } };
    const unlocked = unlockedWeaponKeys();
    expect(unlocked.has('handgun-t1-derringer')).toBe(false);
    expect(resolveSlotKey('handgun-t1', loadout, unlocked)).toBe('handgun-t1');
  });

  it('購入済みになって初めて解決される', () => {
    markWeaponBlueprint('handgun-t1-derringer');
    markWeaponUnlocked('handgun-t1-derringer');
    const loadout: SlotLoadout = { handgun: { 1: 'handgun-t1-derringer' } };
    const unlocked = unlockedWeaponKeys();
    expect(unlocked.has('handgun-t1-derringer')).toBe(true);
    expect(resolveSlotKey('handgun-t1', loadout, unlocked)).toBe('handgun-t1-derringer');
  });

  it('resolveSlotKeyNow(生成点の合成版)も同じ挙動: 設計図のみでは恒等、購入済みで解決', () => {
    markWeaponBlueprint('handgun-t2-handcannon');
    expect(resolveSlotKeyNow('handgun-t2')).toBe('handgun-t2'); // まだ選択もしていないので恒等
  });

  it('shelfWeaponKeys(棚): 設計図があれば並ぶ、購入済みになると消える', () => {
    expect(shelfWeaponKeys().has('handgun-t1-derringer')).toBe(false); // 設計図なし=棚に無い
    markWeaponBlueprint('handgun-t1-derringer');
    expect(shelfWeaponKeys().has('handgun-t1-derringer')).toBe(true); // 設計図あり=棚に並ぶ
    markWeaponUnlocked('handgun-t1-derringer');
    expect(shelfWeaponKeys().has('handgun-t1-derringer')).toBe(false); // 購入済み=棚から消える
  });

  it('shelfWeaponKeys: 店売り(STORE_SOLD_KEYS)は設計図が無くても最初から棚に並ぶ', () => {
    // 第1弾の現状はSTORE_SOLD_KEYSが空なので、この不変条件だけを直接確認する
    // (STORE_SOLD_KEYSに何か入った時、設計図の有無を問わず並ぶことを保証する)。
    for (const key of STORE_SOLD_KEYS) {
      expect(shelfWeaponKeys().has(key)).toBe(true);
    }
  });
});
