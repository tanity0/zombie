import { describe, it, expect } from 'vitest';
import { resolveSlotKey, defaultSlotKeys, type SlotLoadout } from './weaponSlot';
import { SLOT_CATEGORIES, SLOT_TIERS, SLOT_CANDIDATES, BOSS_UNLOCK, type SlotTier } from '../data/weaponSlots';
import { catalogCategoryTier, createWeapon } from './weaponUtils';

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
  it('値は全て候補配列のどれかに含まれ、既定候補ではない(★現状は空=空なら自明に成立)', () => {
    const allCandidates = SLOT_CATEGORIES.flatMap(cat => ALL_TIERS.flatMap(t => SLOT_CANDIDATES[cat][t]));
    const defaults = defaultSlotKeys();
    for (const weaponKey of Object.values(BOSS_UNLOCK)) {
      expect(allCandidates).toContain(weaponKey);
      expect(defaults.has(weaponKey)).toBe(false);
    }
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
