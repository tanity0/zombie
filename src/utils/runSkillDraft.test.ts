import { describe, it, expect } from 'vitest';
import {
  runBuildCapacity, canAcquireRunSkill, canAcquireRarity,
  newSkillCandidates, levelUpCandidates,
  draftRunSkillCards, draftReplacementSkillCard,
  rerollPrice, MAX_BANISH_PER_RUN, MAX_CARRY_SKILLS,
  RUN_DRAFT_EXCLUDED_SKILLS, RUN_BUILD_CAPACITY,
  type RunSkillDraftInput,
} from './runSkillDraft';
import { SKILLS, NEW_SLEEPING_SKILLS, type SkillRarity } from '../data/campaign';
import type { SkillKey } from '../types/game';

// 決定的な疑似乱数(mulberry32と同型。draftRunSkillCards等はrng引数を必ず注入するのでテストにも使える)。
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const notExcluded = (k: SkillKey): boolean => !RUN_DRAFT_EXCLUDED_SKILLS.includes(k);
const NORMAL_SKILLS = (Object.keys(SKILLS) as SkillKey[]).filter(k => SKILLS[k].rarity === 'normal' && notExcluded(k));
const RARE_SKILLS = (Object.keys(SKILLS) as SkillKey[]).filter(k => SKILLS[k].rarity === 'rare' && notExcluded(k));
const SUPER_SKILLS = (Object.keys(SKILLS) as SkillKey[]).filter(k => SKILLS[k].rarity === 'super' && notExcluded(k));

const baseInput = (over: Partial<RunSkillDraftInput> = {}): RunSkillDraftInput => ({
  owned: [...NORMAL_SKILLS, ...RARE_SKILLS, ...SUPER_SKILLS],
  ownedLevels: {},
  runSkills: [],
  runSkillLevels: {},
  playerLevel: 2,
  excluded: [],
  dogEquipped: false,
  ...over,
});

describe('§1-1 枠(runBuildCapacity/canAcquireRunSkill)', () => {
  it('枠は超1/レア2/ノーマル3', () => {
    expect(runBuildCapacity('super')).toBe(1);
    expect(runBuildCapacity('rare')).toBe(2);
    expect(runBuildCapacity('normal')).toBe(3);
    expect(RUN_BUILD_CAPACITY).toEqual({ super: 1, rare: 2, normal: 3 });
  });

  it('枠が空いていれば取得可、埋まっていれば不可', () => {
    const rareA = RARE_SKILLS[0], rareB = RARE_SKILLS[1], rareC = RARE_SKILLS[2];
    expect(canAcquireRunSkill([], rareA)).toBe(true);
    expect(canAcquireRunSkill([rareA], rareB)).toBe(true);
    expect(canAcquireRunSkill([rareA, rareB], rareC)).toBe(false); // レア枠2は埋まっている
    expect(canAcquireRarity([rareA, rareB], 'rare')).toBe(false);
  });

  it('同じスキルの重複取得は不可(既に持っている)', () => {
    const key = NORMAL_SKILLS[0];
    expect(canAcquireRunSkill([key], key)).toBe(false);
  });
});

describe('MAX_CARRY_SKILLS(§16-10 ★A: 持ち込み廃止)', () => {
  it('0である(復活可能な形で定数だけ残す)', () => {
    expect(MAX_CARRY_SKILLS).toBe(0);
  });
});

// SKILL_BUILD_REDESIGN.md §22(社長裁定「デッキで採用」2026-08-13): ラン中ドラフトの新規スキル抽選は
// レア度重み・プレイヤーLv曲線・pity・flashy重みを全廃し、適格候補(newSkillCandidates)から完全均等に
// 引く「中立デッキ」方式へ書き換え。旧§1-2b進行曲線テスト/pityテストはこの節に置き換える。
describe('§22-1 新規側の抽選は完全均等(中立デッキ・レア度重み/pity/flashy廃止)', () => {
  it('同一レア度・複数種の候補から出現頻度が統計的に均等になる(seed固定)', () => {
    const pool = NORMAL_SKILLS.slice(0, 5);
    const input = baseInput({ owned: pool, runSkills: [], runSkillLevels: {}, playerLevel: 2 });
    const counts: Record<string, number> = Object.fromEntries(pool.map(k => [k, 0]));
    const trials = 5000;
    for (let seed = 0; seed < trials; seed++) {
      const cards = draftRunSkillCards(input, 1, mulberry32(seed));
      expect(cards).toHaveLength(1);
      expect(cards[0].cardKind).toBe('new');
      counts[cards[0].key]++;
    }
    const expected = trials / pool.length;
    for (const k of pool) {
      // 統計的均等性の検証(±25%の許容)。厳密な一様性の数学的証明ではない。
      expect(counts[k]).toBeGreaterThan(expected * 0.75);
      expect(counts[k]).toBeLessThan(expected * 1.25);
    }
  });

  it('超/レア/ノーマルが1種ずつ混在していてもレア度で重みがつかない(playerLevel=2でも約1/3ずつ)', () => {
    // 旧仕様なら playerLevel=2 は超レア0%/ノーマル85%で大きく偏っていたはず。§22裁定後は
    // 3種とも同じ「デッキの1枚」として扱われ、出現確率は種数に対してのみ均等になる。
    const superKey = SUPER_SKILLS[0], rareKey = RARE_SKILLS[0], normalKey = NORMAL_SKILLS[0];
    const input = baseInput({ owned: [superKey, rareKey, normalKey], runSkills: [], runSkillLevels: {}, playerLevel: 2 });
    const counts: Record<string, number> = { [superKey]: 0, [rareKey]: 0, [normalKey]: 0 };
    const trials = 6000;
    for (let seed = 0; seed < trials; seed++) {
      const cards = draftRunSkillCards(input, 1, mulberry32(seed));
      expect(cards).toHaveLength(1);
      counts[cards[0].key]++;
    }
    const expected = trials / 3;
    for (const k of [superKey, rareKey, normalKey]) {
      expect(counts[k]).toBeGreaterThan(expected * 0.8);
      expect(counts[k]).toBeLessThan(expected * 1.2);
    }
  });
});

// §22-3受け入れ条件2: レア度枠フィルタ(canAcquireRarity)は§22裁定でも不変(触っていない)。
describe('§22-3#2 レア度枠フィルタの回帰(枠が埋まったレア度は出ない)', () => {
  it('レア枠2が埋まっていれば、新規カードにレアは出ない', () => {
    const rareA = RARE_SKILLS[0], rareB = RARE_SKILLS[1];
    const input = baseInput({ runSkills: [rareA, rareB], runSkillLevels: { [rareA]: 1, [rareB]: 1 } });
    for (let seed = 0; seed < 50; seed++) {
      const cards = draftRunSkillCards(input, 3, mulberry32(seed));
      for (const c of cards) {
        if (c.cardKind === 'new') expect(c.rarity).not.toBe('rare');
      }
    }
  });

  it('超レア枠1が埋まっていれば、新規カードに超レアは出ない', () => {
    const input = baseInput({ runSkills: [SUPER_SKILLS[0]], runSkillLevels: { [SUPER_SKILLS[0]]: 1 } });
    for (let seed = 0; seed < 50; seed++) {
      const cards = draftRunSkillCards(input, 3, mulberry32(seed));
      for (const c of cards) {
        if (c.cardKind === 'new') expect(c.rarity).not.toBe('super');
      }
    }
  });
});

// §22-3受け入れ条件3: 裁定6(序盤=超レア0%)は§22で撤回。超レア所持デッキはLv2初ドラフトから出うる。
describe('§22-3#3 超レア所持デッキはLv2初ドラフトから超レアが出うる(裁定6の撤回)', () => {
  it('playerLevel=2でも超レア所持ならdraftRunSkillCardsから出うる', () => {
    const superKey = SUPER_SKILLS[0];
    const input = baseInput({ owned: [superKey], runSkills: [], runSkillLevels: {}, playerLevel: 2 });
    let sawSuper = false;
    for (let seed = 0; seed < 50 && !sawSuper; seed++) {
      const cards = draftRunSkillCards(input, 3, mulberry32(seed));
      if (cards.some(c => c.rarity === 'super')) sawSuper = true;
    }
    expect(sawSuper).toBe(true);
  });
});

describe('候補プール(newSkillCandidates/levelUpCandidates・§12-2#1)', () => {
  it('新規候補は所持済み・未取得・枠空きのみ(RUN_DRAFT_EXCLUDED_SKILLSは絶対に出ない)', () => {
    const input = baseInput({ owned: [...NORMAL_SKILLS, 'guardian-spirit', 'poi-bombing'] });
    const pool = newSkillCandidates(input);
    for (const k of RUN_DRAFT_EXCLUDED_SKILLS) expect(pool).not.toContain(k);
  });

  it('dog-runは犬装備時のみ候補に入る', () => {
    const withoutDog = baseInput({ owned: ['dog-run' as SkillKey, ...NORMAL_SKILLS], dogEquipped: false });
    expect(newSkillCandidates(withoutDog)).not.toContain('dog-run');
    const withDog = baseInput({ owned: ['dog-run' as SkillKey, ...NORMAL_SKILLS], dogEquipped: true });
    expect(newSkillCandidates(withDog)).toContain('dog-run');
  });

  it('Lv+1候補はrunSkills内・現Lv<maxのみ(バニッシュも外す)', () => {
    const key = RARE_SKILLS[0]; // rareはskillMaxLevel=3が既定
    const input = baseInput({ runSkills: [key], runSkillLevels: { [key]: 3 } });
    expect(levelUpCandidates(input)).not.toContain(key); // 既にMAX
    const input2 = baseInput({ runSkills: [key], runSkillLevels: { [key]: 1 } });
    expect(levelUpCandidates(input2)).toContain(key);
    const input3 = baseInput({ runSkills: [key], runSkillLevels: { [key]: 1 }, excluded: [key] });
    expect(levelUpCandidates(input3)).not.toContain(key); // バニッシュ除外
  });
});

describe('draftRunSkillCards(§12-2#2 抽選手順)', () => {
  // §4でcrit-up/sniperが同時に超レアへ昇格したことで、超レア枠(cap=1)を巡って2枚が同じ
  // 1回の3択(draftRunSkillCards(input, 3, ...))に同時に候補として出ることがあり得る(意図どおり=
  // 「crit-upかsniperか」を選ばせる画面。他レア度も同様に3枚が"offer"であって"全取得"ではない)。
  // 実際のプレイでは3択のうち1枚だけを選ぶ(upgradeUtils.generateSkillUpgradeChoices→
  // gameStore.ts selectUpgrade)。選択のガードは `canAcquireRunSkill(state.runBuild, key)` が
  // 唯一の出どころ(§2-1)で、埋まった枠のカードを選んでも無効(no-op)になるだけで枠は超えない
  // (gameStore.ts:7872と同じ形をここでも模す)。よってこのテストは「3枚を全部順番に取得できる」
  // ことではなく、「そのガードを通して適用し続けても枠を一度も超えない」ことを検証する。
  it('枠を一度も超えない(大量ドラフトの反復でも。gameStore.selectUpgradeの実ガードを模して適用)', () => {
    const rng = mulberry32(1);
    let runSkills: SkillKey[] = [];
    let runSkillLevels: Partial<Record<SkillKey, number>> = {};
    for (let i = 0; i < 40; i++) {
      const input = baseInput({ runSkills, runSkillLevels, playerLevel: 2 + i });
      const cards = draftRunSkillCards(input, 3, rng);
      for (const c of cards) {
        if (c.cardKind === 'new') {
          if (!canAcquireRunSkill(runSkills, c.key)) continue; // gameStore.ts:7872と同じガード=no-op
          runSkills = [...runSkills, c.key];
          runSkillLevels = { ...runSkillLevels, [c.key]: c.toLevel };
        } else {
          runSkillLevels = { ...runSkillLevels, [c.key]: c.toLevel };
        }
      }
      for (const r of ['super', 'rare', 'normal'] as SkillRarity[]) {
        expect(runSkills.filter(k => SKILLS[k].rarity === r).length).toBeLessThanOrEqual(runBuildCapacity(r));
      }
    }
  });

  it('1ドラフト内で同じスキルが2枚並ばない', () => {
    for (let i = 0; i < 20; i++) {
      const cards = draftRunSkillCards(baseInput({ playerLevel: 8 }), 3, mulberry32(i));
      const keys = cards.map(c => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('新規候補が0件ならLv+1のみになる', () => {
    const input = baseInput({
      owned: [], runSkills: RARE_SKILLS.slice(0, 1), runSkillLevels: { [RARE_SKILLS[0]]: 1 },
    });
    const cards = draftRunSkillCards(input, 3, mulberry32(3));
    expect(cards.every(c => c.cardKind === 'levelup')).toBe(true);
  });

  it('新規・Lv+1とも0件なら空配列(常設スクラップのみになる=呼び出し側の責務)', () => {
    const input = baseInput({ owned: [], runSkills: [] });
    expect(draftRunSkillCards(input, 3, mulberry32(3))).toEqual([]);
  });

  it('RUN_DRAFT_EXCLUDED_SKILLSは所持していても一切ドラフトされない', () => {
    const input = baseInput({ owned: [...NORMAL_SKILLS, ...RUN_DRAFT_EXCLUDED_SKILLS] });
    for (let seed = 0; seed < 30; seed++) {
      const cards = draftRunSkillCards(input, 3, mulberry32(seed));
      for (const c of cards) expect(RUN_DRAFT_EXCLUDED_SKILLS).not.toContain(c.key);
    }
  });

  it('取得Lvは所持Lv(ownedLevels)にクランプされる(§10点12①のクランプ式)', () => {
    const key = NORMAL_SKILLS[0];
    const input = baseInput({ owned: [key], ownedLevels: { [key]: 9 } }); // 異常値でも上限クランプ
    const cards = draftRunSkillCards(input, 1, () => 0);
    expect(cards[0].toLevel).toBeLessThanOrEqual(3);
  });
});

describe('draftReplacementSkillCard(バニッシュ/1枠差し替え)', () => {
  it('dealtSeedに含めたキーは差し替え候補から除外される', () => {
    const other = NORMAL_SKILLS[0];
    const input = baseInput({ owned: [other, NORMAL_SKILLS[1], NORMAL_SKILLS[2]] });
    for (let seed = 0; seed < 20; seed++) {
      const card = draftReplacementSkillCard(input, [other], mulberry32(seed));
      if (card) expect(card.key).not.toBe(other);
    }
  });
});

describe('リロール価格(rerollPrice・§16-10 ★C)', () => {
  it('初回50・以後50ずつ値上がり', () => {
    expect(rerollPrice(0)).toBe(50);
    expect(rerollPrice(1)).toBe(100);
    expect(rerollPrice(2)).toBe(150);
    expect(rerollPrice(5)).toBe(300);
  });
});

describe('バニッシュ上限(MAX_BANISH_PER_RUN)', () => {
  it('2である', () => {
    expect(MAX_BANISH_PER_RUN).toBe(2);
  });
});

// SKILL_BUILD_REDESIGN.md §4/§19-1点2・3で導入されたノーマル抽選のタグ別2倍重みは§22裁定(中立
// デッキ化)で廃止され、専用の重みタグ定数ごと削除済み(campaign.tsにこの種の識別子は存在しない)。
// 均等抽選の検証は上の「§22-1 新規側の抽選は完全均等」節に統合した。

// SKILL_BUILD_REDESIGN.md §14/§19-1点4: 新スキル9種はB3時点で台帳掲載のみ。ドラフトからは
// RUN_DRAFT_EXCLUDED_SKILLS経由で完全に除外される(効果配線はB7)。
describe('NEW_SLEEPING_SKILLS(§14新9種)はドラフトから絶対に出ない(§19-2点4)', () => {
  it('RUN_DRAFT_EXCLUDED_SKILLSに9種すべてが含まれる', () => {
    for (const k of NEW_SLEEPING_SKILLS) expect(RUN_DRAFT_EXCLUDED_SKILLS).toContain(k);
    expect(NEW_SLEEPING_SKILLS).toHaveLength(9);
  });

  it('所持していてもnewSkillCandidates/draftRunSkillCardsのどちらからも出ない', () => {
    const input = baseInput({ owned: [...NORMAL_SKILLS, ...RARE_SKILLS, ...SUPER_SKILLS, ...NEW_SLEEPING_SKILLS] });
    expect(newSkillCandidates(input).some(k => NEW_SLEEPING_SKILLS.includes(k))).toBe(false);
    for (let seed = 0; seed < 30; seed++) {
      const cards = draftRunSkillCards(input, 3, mulberry32(seed));
      for (const c of cards) expect(NEW_SLEEPING_SKILLS).not.toContain(c.key);
    }
  });
});
