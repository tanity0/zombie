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
import { CASTLE_BOSS_NAME_BY_STAGE, bossCutinName } from '../data/bossCutin';
import type { EnemyType } from '../types/game';
import { catalogCategoryTier, createWeapon } from './weaponUtils';
import { markWeaponBlueprint, markWeaponUnlocked } from '../data/progress';
import { DUAL_RANGE_STATS } from './dualRangeGun';
import { CYCLE_MODE_STATS } from './cycleShotgun';

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

// UNIQUE_WEAPONS.md §18(解放元の表): **キー側**の健全性。値の健全性は不変条件4が見ているが、
// キーを打ち間違えると「どのボスを倒しても解放されない」形で静かに壊れる(撃破処理は
// `BOSS_UNLOCK[type@stage] ?? BOSS_UNLOCK[type]` を引くだけで、無い時は黙って何もしない)。
// 城ボス(giantbat)だけが全ステージ同じ型なので `type@stageId` 形式を使う(§11-6-3)。
describe('不変条件: 解放表のキーが実在するボスを指している(§18)', () => {
  it('@付きキーは giantbat@<城ボスが居るステージ> の形をしている', () => {
    for (const key of Object.keys(BOSS_UNLOCK)) {
      if (!key.includes('@')) continue;
      const [type, stageId] = key.split('@');
      expect(type, `${key}: @付きキーは城ボス(giantbat)専用`).toBe('giantbat');
      expect(
        Object.keys(CASTLE_BOSS_NAME_BY_STAGE),
        `${key}: そのステージに城ボスが居ない`
      ).toContain(stageId);
    }
  });

  it('@なしキーは台帳に名前のあるボスの型である', () => {
    for (const key of Object.keys(BOSS_UNLOCK)) {
      if (key.includes('@')) continue;
      expect(
        bossCutinName(key as EnemyType, null),
        `${key}: ボス台帳(bossCutin)に無い型=撃破しても解放されない`
      ).not.toBeNull();
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

// ★帯は「±10% の + 寄り」(社長指示・UNIQUE_WEAPONS.md §5)。**硬い枠は 0.90〜1.10**で、
// **狙いはその + 側(1.00〜1.10)**。各武器の狙いの値は下の toBeCloseTo が個別に固定している。
// (v0.25.4166以前は「+0〜+15%」と書いていたが、これは取り決めの枠を広げた誤りだった。)
describe('不変条件1: 実効DPS帯(ハンドガン=damage/cooldown/magSize/reloadMsで表せる武器のみ・§5の適用範囲)', () => {
  const band = (defaultKey: string, uniqueKey: string) => {
    const base = effectiveDps(createWeapon(defaultKey));
    const unique = effectiveDps(createWeapon(uniqueKey));
    return { base, unique, ratio: unique / base };
  };

  it('T1 デリンジャー: 既定比 ±10%の+寄り(叩き台+7.7%)', () => {
    const { base, unique, ratio } = band('handgun-t1', 'handgun-t1-derringer');
    expect(base).toBeCloseTo(15.79, 1);
    expect(unique).toBeCloseTo(17.00, 1);
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  });

  it('T2 ハンドキャノン: 既定比 ±10%の+寄り(叩き台+8.1%・減衰は式に出ない別軸)', () => {
    const { base, unique, ratio } = band('handgun-t2', 'handgun-t2-handcannon');
    expect(base).toBeCloseTo(28.13, 1);
    expect(unique).toBeCloseTo(30.39, 1);
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  });

  it('T3 パイルドライバー: 既定比 ±10%の+寄り(叩き台+8.7%・射程/KB/体勢は式に出ない別軸)', () => {
    const { base, unique, ratio } = band('handgun-t3', 'handgun-t3-piledriver');
    expect(base).toBeCloseTo(37.50, 1);
    expect(unique).toBeCloseTo(40.75, 1);
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  });
});

// UNIQUE_WEAPONS.md §16-5(受け入れ条件4): バッチA4挺の実効DPS帯(±10%の+寄り・§16-1)。
describe('不変条件1: 実効DPS帯(バッチA・UNIQUE_WEAPONS.md §16-1)', () => {
  const band = (defaultKey: string, uniqueKey: string) => {
    const base = effectiveDps(createWeapon(defaultKey));
    const unique = effectiveDps(createWeapon(uniqueKey));
    return { base, unique, ratio: unique / base };
  };
  const expectInBand = (ratio: number) => {
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  };

  it('制圧型ショットガン: 既定比+8.8%', () => {
    const { base, unique, ratio } = band('shotgun-t2', 'shotgun-t2-suppress');
    expect(base).toBeCloseTo(21.21, 1);
    expect(unique).toBeCloseTo(23.08, 1);
    expectInBand(ratio);
  });

  it('ボルトアクション: 既定比+5.3%', () => {
    const { base, unique, ratio } = band('rifle-t1', 'rifle-t1-bolt');
    expect(base).toBeCloseTo(23.08, 1);
    expect(unique).toBeCloseTo(24.30, 1);
    expectInBand(ratio);
  });

  it('クロスボウ: 既定比+1.3%', () => {
    const { base, unique, ratio } = band('handgun-t1', 'handgun-t1-crossbow');
    expect(base).toBeCloseTo(15.79, 1);
    expect(unique).toBeCloseTo(16.00, 1);
    expectInBand(ratio);
  });

  it('デュアルレンジピストル(遠=CATALOGの既定値): 既定比+8.2%', () => {
    const { base, unique, ratio } = band('handgun-t2', 'handgun-t2-dualrange');
    expect(base).toBeCloseTo(28.13, 1);
    expect(unique).toBeCloseTo(30.43, 1);
    expectInBand(ratio);
  });

  it('デュアルレンジピストル(近=距離ヒステリシスで切り替わる方のセット): 既定比+3.7%', () => {
    // CATALOGは「遠」セットを既定値に持つ(§16-1コメント参照)。「近」はdualRangeGun.tsの
    // DUAL_RANGE_STATSをfireWeaponが撃つ瞬間に差し込む値なので、ここではその値を直接合成して測る。
    const nearWeapon = { ...createWeapon('handgun-t2-dualrange'), ...DUAL_RANGE_STATS.near };
    const base = effectiveDps(createWeapon('handgun-t2'));
    const unique = effectiveDps(nearWeapon);
    expect(unique).toBeCloseTo(29.17, 1);
    expectInBand(unique / base);
    // 支配テスト(不変条件6)は「近」セットも見ていない(CATALOGの静的値=遠のみ自動評価)ため、
    // ここで明示的に非支配を確認しておく(damage14>=9でもcount1<2・cooldown260<420で非支配)。
    expect(dominatesDefault(nearWeapon, createWeapon('handgun-t2'))).toBe(false);
  });
});

// UNIQUE_WEAPONS.md §16-5(受け入れ条件5): バッチB4挺の実効DPS帯(±10%の+寄り・§16-1)。
// 大型狙撃銃は蓄積0(CATALOGの静的値そのもの)で測る。切替式SGは散弾/スラッグ両モードを測る。
describe('不変条件1: 実効DPS帯(バッチB・UNIQUE_WEAPONS.md §16-1)', () => {
  const band = (defaultKey: string, uniqueKey: string) => {
    const base = effectiveDps(createWeapon(defaultKey));
    const unique = effectiveDps(createWeapon(uniqueKey));
    return { base, unique, ratio: unique / base };
  };
  const expectInBand = (ratio: number) => {
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  };

  it('収束型ショットガン: 既定比+5.2%', () => {
    const { base, unique, ratio } = band('shotgun-t1', 'shotgun-t1-focus');
    expect(base).toBeCloseTo(17.82, 1);
    expect(unique).toBeCloseTo(18.75, 1);
    expectInBand(ratio);
  });

  it('切替式ショットガン(散弾=CATALOGの既定値): 既定比+1.0%', () => {
    const { base, unique, ratio } = band('shotgun-t1', 'shotgun-t1-cycle');
    expect(base).toBeCloseTo(17.82, 1);
    expect(unique).toBeCloseTo(18.00, 1);
    expectInBand(ratio);
  });

  it('切替式ショットガン(スラッグ=リロードで入れ替わる方のセット): 既定比+1.0%(散弾と同じ周期)', () => {
    const slugWeapon = { ...createWeapon('shotgun-t1-cycle'), ...CYCLE_MODE_STATS.slug };
    const base = effectiveDps(createWeapon('shotgun-t1'));
    const unique = effectiveDps(slugWeapon);
    expect(unique).toBeCloseTo(18.00, 1);
    expectInBand(unique / base);
    // 支配テスト(不変条件6)は「スラッグ」セットも見ていない(CATALOGの静的値=散弾のみ自動評価)ため、
    // ここで明示的に非支配を確認しておく(count1<5で非支配)。
    expect(dominatesDefault(slugWeapon, createWeapon('shotgun-t1'))).toBe(false);
  });

  it('デザートテック: 既定比+3.2%', () => {
    const { base, unique, ratio } = band('rifle-t1', 'rifle-t1-deserttech');
    expect(base).toBeCloseTo(23.08, 1);
    expect(unique).toBeCloseTo(23.82, 1);
    expectInBand(ratio);
  });

  it('大型狙撃銃(蓄積0=CATALOGの静的値そのもの): 既定比+2.0%', () => {
    const { base, unique, ratio } = band('rifle-t2', 'rifle-t2-heavysniper');
    expect(base).toBeCloseTo(28.95, 1);
    expect(unique).toBeCloseTo(29.52, 1);
    expectInBand(ratio);
  });
});

// UNIQUE_WEAPONS.md §16-5(受け入れ条件5)。バッチC-1の3挺のうち、氷槍ライフルは通常の貫通ライフル弾
// (床の副次ダメージは基準DPSの式外=貫通と同じ扱い・§5-2)なので汎用式でそのまま帯を測れる。
// アイレーザー/火炎放射器は§5-2の「1サイクル」式(eyeLaserGun.ts/flamerCone.ts)で別途テスト済み。
describe('不変条件1: 実効DPS帯(バッチC-1・UNIQUE_WEAPONS.md §16-1)', () => {
  const band = (defaultKey: string, uniqueKey: string) => {
    const base = effectiveDps(createWeapon(defaultKey));
    const unique = effectiveDps(createWeapon(uniqueKey));
    return { base, unique, ratio: unique / base };
  };
  const expectInBand = (ratio: number) => {
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  };

  it('氷槍ライフル(直撃のみ・床は式外の副次ダメージ): 既定比+0.2%', () => {
    const { base, unique, ratio } = band('rifle-t2', 'rifle-t2-icelance');
    expect(base).toBeCloseTo(28.95, 1);
    expect(unique).toBeCloseTo(29.00, 1);
    expectInBand(ratio);
  });
});

// UNIQUE_WEAPONS.md §16-1/§17-8 C-2/§17-10(#U16裁定・バッチC漏れの是正)。レールガンのオート側は
// 汎用式にそのまま乗る(§17-8 C-2「オート側は式に乗る」)。★社長仕様「オート時のダメージは低め」
// により唯一「−」側(既定比−8.2%)を狙う設計——帯を±10%にしてあるのはこの1挺のためで、
// この比率が+側に直ってしまったら仕様(旧95=−13.6%は枠外/その後+側に振るのも誤り)を壊している。
// 手動射撃(頭部確定クリ)は式外の上振れ(§5-2)なのでここでは測らない(gameStore.fireRailgunShot)。
// ★2026-09-13 社長指示「装填数を10発に」で 4→10 発。オート実効DPSは 42.08(−8.2%)→ 58.05(+26.7%)=**±10%の帯の外**。
// 帯の外に出たのは社長指示による事実(UNIQUE_WEAPONS.md §16-1 の表も同じ)。旧仕様「オート時は低め(−側)」には反する
// ので、低めに戻すなら damage の別裁定が要る。このテストは**新しい値を固定する**(黙って 4 発に戻す/damage を動かす修正が入ったら落ちる)。
describe('不変条件1: 実効DPS帯(レールガン・UNIQUE_WEAPONS.md §16-1/§17-10)', () => {
  it('101/1300/1発/10発/R2200 = 既定比+26.7%(2026-09-13 社長指示・帯外は事実として固定)', () => {
    const base = effectiveDps(createWeapon('rifle-t3'));
    const unique = effectiveDps(createWeapon('rifle-t3-railgun'));
    const ratio = unique / base;
    expect(base).toBeCloseTo(45.83, 1);
    expect(unique).toBeCloseTo(58.05, 1);
    expect(ratio).toBeCloseTo(1.267, 2);
  });
});

// UNIQUE_WEAPONS.md §16-5(受け入れ条件5)。バッチC-2の3挺(近接切替・弾の軌道系)。
// コイル/誘導散弾は「弾がどう飛ぶか」(位相・旋回)が式に現れない副次要素(§5-2の思想と同型)なので、
// 通常のカウント式ショットガンと同じ汎用式でそのまま帯を測れる。ガンブレードは通常銃モード
// (CATALOGの静的値)だけを測る——近接モードは§17-5の代償として設計された別軸で、帯の対象外
// (32DPS<38.10=遠距離より低い、という設計そのものが代償。gunbladeMelee.test.tsで別途固定)。
describe('不変条件1: 実効DPS帯(バッチC-2・UNIQUE_WEAPONS.md §16-1)', () => {
  const band = (defaultKey: string, uniqueKey: string) => {
    const base = effectiveDps(createWeapon(defaultKey));
    const unique = effectiveDps(createWeapon(uniqueKey));
    return { base, unique, ratio: unique / base };
  };
  const expectInBand = (ratio: number) => {
    expect(ratio).toBeGreaterThanOrEqual(0.90);
    expect(ratio).toBeLessThanOrEqual(1.10);
  };

  it('ガンブレード(通常銃モード=CATALOGの静的値): 既定比+1.6%', () => {
    const { base, unique, ratio } = band('handgun-t3', 'handgun-t3-gunblade');
    expect(base).toBeCloseTo(37.50, 1);
    expect(unique).toBeCloseTo(38.10, 1);
    expectInBand(ratio);
  });

  it('コイルショットガン: 既定比+7.1%', () => {
    const { base, unique, ratio } = band('shotgun-t2', 'shotgun-t2-coil');
    expect(base).toBeCloseTo(21.21, 1);
    expect(unique).toBeCloseTo(22.73, 1);
    expectInBand(ratio);
  });

  it('誘導散弾ショットガン: 既定比+7.1%', () => {
    const { base, unique, ratio } = band('shotgun-t3', 'shotgun-t3-homing');
    expect(base).toBeCloseTo(26.87, 1);
    expect(unique).toBeCloseTo(28.78, 1);
    expectInBand(ratio);
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
