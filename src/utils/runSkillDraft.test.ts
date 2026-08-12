import { describe, it, expect } from 'vitest';
import {
  runBuildCapacity, canAcquireRunSkill, canAcquireRarity,
  rarityWeightsForPlayerLevel, isSuperPityArmed,
  newSkillCandidates, levelUpCandidates,
  draftRunSkillCards, draftReplacementSkillCard,
  rerollPrice, MAX_BANISH_PER_RUN, MAX_CARRY_SKILLS,
  RUN_DRAFT_EXCLUDED_SKILLS, RUN_BUILD_CAPACITY,
  type RunSkillDraftInput,
} from './runSkillDraft';
import { SKILLS, type SkillRarity } from '../data/campaign';
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

describe('§1-2b 進行曲線(rarityWeightsForPlayerLevel)', () => {
  it('Lv2〜4: 超レア0%', () => {
    expect(rarityWeightsForPlayerLevel(2)).toEqual({ normal: 85, rare: 15, super: 0 });
    expect(rarityWeightsForPlayerLevel(4)).toEqual({ normal: 85, rare: 15, super: 0 });
  });
  it('Lv5〜7', () => {
    expect(rarityWeightsForPlayerLevel(5)).toEqual({ normal: 60, rare: 32, super: 8 });
    expect(rarityWeightsForPlayerLevel(7)).toEqual({ normal: 60, rare: 32, super: 8 });
  });
  it('Lv8以降', () => {
    expect(rarityWeightsForPlayerLevel(8)).toEqual({ normal: 45, rare: 38, super: 17 });
    expect(rarityWeightsForPlayerLevel(99)).toEqual({ normal: 45, rare: 38, super: 17 });
  });
});

describe('§1-2b 超レアpity(isSuperPityArmed)', () => {
  it('Lv8未満は常に不成立', () => {
    expect(isSuperPityArmed(7, [])).toBe(false);
  });
  it('Lv8以降・超レア枠が空なら成立', () => {
    expect(isSuperPityArmed(8, [])).toBe(true);
    expect(isSuperPityArmed(20, NORMAL_SKILLS.slice(0, 3))).toBe(true);
  });
  it('Lv8以降でも超レア枠が既に埋まっていれば不成立', () => {
    expect(isSuperPityArmed(8, [SUPER_SKILLS[0]])).toBe(false);
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
  it('枠を一度も超えない(大量ドラフトの反復でも)', () => {
    const rng = mulberry32(1);
    let runSkills: SkillKey[] = [];
    let runSkillLevels: Partial<Record<SkillKey, number>> = {};
    for (let i = 0; i < 40; i++) {
      const input = baseInput({ runSkills, runSkillLevels, playerLevel: 2 + i });
      const cards = draftRunSkillCards(input, 3, rng);
      for (const c of cards) {
        if (c.cardKind === 'new') {
          expect(canAcquireRunSkill(runSkills, c.key)).toBe(true);
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

  it('Lv8以降・超レア未所持ならpity発火で確定混入する(超レア候補がある場合)', () => {
    const input = baseInput({ playerLevel: 8 });
    const cards = draftRunSkillCards(input, 3, mulberry32(42));
    expect(cards.some(c => c.pity && c.rarity === 'super')).toBe(true);
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
