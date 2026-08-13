import { describe, it, expect } from 'vitest';
import {
  runBuildCapacity, canAcquireRunSkill, canAcquireRarity,
  newSkillCandidates, levelUpCandidates, consumableCandidates,
  draftRunSkillCards, draftReplacementSkillCard,
  rerollPrice, MAX_BANISH_PER_RUN, MAX_CARRY_SKILLS,
  RUN_DRAFT_EXCLUDED_SKILLS, RUN_BUILD_CAPACITY,
  type RunSkillDraftInput,
} from './runSkillDraft';
import { SKILLS, NEW_SLEEPING_SKILLS, RETIRED_SKILLS, retiredSkillsRefundTotal, GACHA_REFUND_BY_RARITY, type SkillRarity } from '../data/campaign';
import { CONSUMABLE_KEYS } from '../data/consumables';
import type { SkillKey, ConsumableKey } from '../types/game';

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
    const trials = 8000;
    let newDraws = 0;
    for (let seed = 0; seed < trials; seed++) {
      const cards = draftRunSkillCards(input, 1, mulberry32(seed));
      if (cards.length === 0) continue;
      const c = cards[0];
      // §23でカテゴリロールに「消費」が加わったため、ここでは新規側(cardKind==='new')の一様性だけを
      // 抽出して見る(カテゴリの出現比率そのものは§23-2条件3の専用describeで検証)。
      if (c.cardKind !== 'new') continue;
      newDraws++;
      counts[c.key]++;
    }
    expect(newDraws).toBeGreaterThan(trials * 0.2); // カテゴリロールが機能していること自体の健全性チェック
    const expected = newDraws / pool.length;
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
    const trials = 10000;
    let newDraws = 0;
    for (let seed = 0; seed < trials; seed++) {
      const cards = draftRunSkillCards(input, 1, mulberry32(seed));
      if (cards.length === 0) continue;
      const c = cards[0];
      if (c.cardKind !== 'new') continue; // §23: カテゴリ比率自体は別describeで検証。ここはレア度非依存の一様性だけ。
      newDraws++;
      counts[c.key]++;
    }
    expect(newDraws).toBeGreaterThan(trials * 0.2);
    const expected = newDraws / 3;
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
      if (cards.some(c => c.cardKind !== 'consumable' && c.rarity === 'super')) sawSuper = true;
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
        if (c.cardKind === 'consumable') continue; // §23: このテストはSkillKey枠会計だけを見る(対象外)
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

  it('新規候補が0件・消費カードも枯渇させればLv+1のみになる', () => {
    // §23: 新規0件でも消費カードの枠が空いていれば30%はconsumableが出る(仕様どおり)。
    // この確定挙動テストでは消費カードを全て発動中にして中立化する(比率自体は別describeで検証)。
    const input = baseInput({
      owned: [], runSkills: RARE_SKILLS.slice(0, 1), runSkillLevels: { [RARE_SKILLS[0]]: 1 },
      activeConsumables: CONSUMABLE_KEYS,
    });
    const cards = draftRunSkillCards(input, 3, mulberry32(3));
    expect(cards.every(c => c.cardKind === 'levelup')).toBe(true);
  });

  it('§23: 新規候補が0件でも消費カードに空きがあればconsumableで埋まる(スクラップ落ちにならない)', () => {
    const input = baseInput({ owned: [], runSkills: RARE_SKILLS.slice(0, 1), runSkillLevels: { [RARE_SKILLS[0]]: 1 } });
    const cards = draftRunSkillCards(input, 3, mulberry32(3));
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) expect(['levelup', 'consumable']).toContain(c.cardKind);
  });

  it('新規・Lv+1・消費カードの全て0件なら空配列(常設スクラップのみになる=呼び出し側の責務)', () => {
    const input = baseInput({ owned: [], runSkills: [], activeConsumables: CONSUMABLE_KEYS });
    expect(draftRunSkillCards(input, 3, mulberry32(3))).toEqual([]);
  });

  it('RUN_DRAFT_EXCLUDED_SKILLSは所持していても一切ドラフトされない', () => {
    const input = baseInput({ owned: [...NORMAL_SKILLS, ...RUN_DRAFT_EXCLUDED_SKILLS] });
    for (let seed = 0; seed < 30; seed++) {
      const cards = draftRunSkillCards(input, 3, mulberry32(seed));
      for (const c of cards) expect(RUN_DRAFT_EXCLUDED_SKILLS).not.toContain(c.key);
    }
  });

  it('v0.25.3307「スキルは全てレベル1からの取得」: 新規カードの取得Lvは所持Lvに関わらず常に1', () => {
    const key = NORMAL_SKILLS[0];
    const input = baseInput({ owned: [key], ownedLevels: { [key]: 3 } }); // 所持Lv3でも取得はLv1
    const cards = draftRunSkillCards(input, 1, () => 0); // rng=0固定 → rollCategoryは常に'new'(重みnew>0が先頭)
    const c0 = cards[0];
    if (c0.cardKind === 'consumable') throw new Error('unexpected consumable card (rng=0 should pick new)');
    expect(c0.toLevel).toBe(1);
    expect(c0.fromLevel).toBe(0);
  });
});

describe('draftReplacementSkillCard(バニッシュ/1枠差し替え)', () => {
  it('dealtSeedに含めたキーは差し替え候補から除外される', () => {
    const other = NORMAL_SKILLS[0];
    const input = baseInput({ owned: [other, NORMAL_SKILLS[1], NORMAL_SKILLS[2]] });
    for (let seed = 0; seed < 20; seed++) {
      const card = draftReplacementSkillCard(input, [other], [], mulberry32(seed));
      if (card) expect(card.key).not.toBe(other);
    }
  });
});

describe('リロール価格(rerollPrice・社長裁定2026-08-13=一律20)', () => {
  it('何回目でも一律20(値上がりしない)', () => {
    expect(rerollPrice(0)).toBe(20);
    expect(rerollPrice(1)).toBe(20);
    expect(rerollPrice(5)).toBe(20);
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

// SKILL_BUILD_REDESIGN.md §28(B7発注文): 眠り9種は効果配線+スターター入りが完了し、
// NEW_SLEEPING_SKILLSが空になったことでドラフトにも解禁されている(§28-3受け入れ条件2)。
describe('新スキル9種はB7でドラフトに解禁されている(NEW_SLEEPING_SKILLSが空)', () => {
  // v0.25.3297: big-bulletはattack-shooterへ統合(RETIRED)=この検証群から除外。
  const NEW_SKILLS: SkillKey[] = [
    'ice-shot', 'vampire', 'incendiary-round', 'execution-shock',
    'gravity-shot', 'echo-shot', 'barrage-king', 'blood-treads',
  ];

  it('NEW_SLEEPING_SKILLSは空配列でRUN_DRAFT_EXCLUDED_SKILLSからも外れている', () => {
    expect(NEW_SLEEPING_SKILLS).toEqual([]);
    for (const k of NEW_SKILLS) expect(RUN_DRAFT_EXCLUDED_SKILLS).not.toContain(k);
  });

  it('所持していればnewSkillCandidates/draftRunSkillCardsのどちらからも出る', () => {
    const input = baseInput({ owned: NEW_SKILLS });
    const pool = newSkillCandidates(input);
    for (const k of NEW_SKILLS) expect(pool).toContain(k);
    let seenAny = false;
    for (let seed = 0; seed < 200 && !seenAny; seed++) {
      const cards = draftRunSkillCards(input, 3, mulberry32(seed));
      if (cards.some(c => c.cardKind !== 'consumable' && NEW_SKILLS.includes(c.key as SkillKey))) seenAny = true;
    }
    expect(seenAny).toBe(true);
  });
});

// SKILL_BUILD_REDESIGN.md §23(消費カード裁定と発注文・社長裁定2026-08-13「案B・30%60秒・
// あとは推薦で」)。§23-2の6条件のうち、純関数(runSkillDraft.ts/campaign.ts)側で検証できる
// 1〜4をここに置く(5=UI表示/6=typecheck・lintは実装報告側)。
describe('§23-1 退役(RETIRED_SKILLS=旧scrap-builder/warm-up)', () => {
  it('RUN_DRAFT_EXCLUDED_SKILLSに両方含まれる(ドラフトから絶対に出ない)', () => {
    expect(RETIRED_SKILLS).toEqual(['scrap-builder', 'warm-up', 'big-bullet']); // v0.25.3297: 統合により退役
    for (const k of RETIRED_SKILLS) expect(RUN_DRAFT_EXCLUDED_SKILLS).toContain(k);
  });

  it('所持していてもnewSkillCandidates/draftRunSkillCardsのどちらからも出ない', () => {
    const input = baseInput({ owned: [...NORMAL_SKILLS, ...RARE_SKILLS, ...SUPER_SKILLS, ...RETIRED_SKILLS] });
    expect(newSkillCandidates(input).some(k => RETIRED_SKILLS.includes(k))).toBe(false);
    for (let seed = 0; seed < 30; seed++) {
      const cards = draftRunSkillCards(input, 3, mulberry32(seed));
      for (const c of cards) expect(RETIRED_SKILLS).not.toContain(c.key as SkillKey);
    }
  });
});

describe('§23-2条件4 retiredSkillsRefundTotal(所持者への一括返却・ガチャの被り返金と同額)', () => {
  it('両方とも normal rarity なので返金は 10+10=20', () => {
    for (const k of RETIRED_SKILLS) expect(SKILLS[k].rarity).toBe('normal');
    expect(retiredSkillsRefundTotal(['scrap-builder', 'warm-up'])).toBe(20);
  });
  it('片方だけ所持なら10、どちらも未所持なら0', () => {
    expect(retiredSkillsRefundTotal(['scrap-builder'])).toBe(GACHA_REFUND_BY_RARITY.normal);
    expect(retiredSkillsRefundTotal(['warm-up'])).toBe(GACHA_REFUND_BY_RARITY.normal);
    expect(retiredSkillsRefundTotal([])).toBe(0);
    expect(retiredSkillsRefundTotal(NORMAL_SKILLS)).toBe(0); // 退役2種を含まないリストは無関係
  });
});

describe('§23-2条件1 枠会計(消費中バフがノーマル枠を占有し、期限切れで枠が空く)', () => {
  it('canAcquireRarity: extraNormalOccupiedはnormal枠にだけ加算される', () => {
    // ノーマル枠cap=3。実スキル2つ+消費中バフ1つ=3=満杯 → 4つ目は不可。
    const twoNormals = NORMAL_SKILLS.slice(0, 2);
    expect(canAcquireRarity(twoNormals, 'normal', 1)).toBe(false);
    expect(canAcquireRarity(twoNormals, 'normal', 0)).toBe(true);
    // rare/superにはextraNormalOccupiedを適用しない(消費カードは常にノーマル枠専用のため)。
    const oneRare = [RARE_SKILLS[0]];
    expect(canAcquireRarity(oneRare, 'rare', 5)).toBe(true); // rare cap=2、まだ1つ
  });

  it('consumableCandidates: ノーマル枠が満杯なら空配列(=提示されない)', () => {
    const twoNormals = NORMAL_SKILLS.slice(0, 2);
    const inputFull = baseInput({ runSkills: twoNormals, activeConsumables: ['scrap-boost'] });
    expect(consumableCandidates(inputFull)).toEqual([]);
    const inputRoom = baseInput({ runSkills: twoNormals, activeConsumables: [] });
    expect(consumableCandidates(inputRoom).length).toBeGreaterThan(0);
  });

  it('newSkillCandidates(normal)もアクティブな消費カード数だけ枠が狭まる', () => {
    const twoNormals = NORMAL_SKILLS.slice(0, 2);
    const withoutBuff = baseInput({ runSkills: twoNormals, runSkillLevels: {}, activeConsumables: [] });
    const withBuff = baseInput({ runSkills: twoNormals, runSkillLevels: {}, activeConsumables: ['scrap-boost'] });
    // 枠がまだ1つ空いている(実2+消費0<3)ので通常のnormal候補が出る。
    expect(newSkillCandidates(withoutBuff).some(k => SKILLS[k].rarity === 'normal')).toBe(true);
    // 実2+消費1=3=満杯なのでnormal候補は一切出ない。
    expect(newSkillCandidates(withBuff).some(k => SKILLS[k].rarity === 'normal')).toBe(false);
  });
});

describe('§23-2条件3 カテゴリロール比率(新規40:Lv+1 40:消費20・新規枯渇時はLv+1 70:消費30)', () => {
  it('新規候補が豊富な時、約40:40:20(±25%許容・seed固定)', () => {
    const input = baseInput({ runSkills: [RARE_SKILLS[0]], runSkillLevels: { [RARE_SKILLS[0]]: 1 } });
    const counts = { new: 0, levelup: 0, consumable: 0 };
    const trials = 6000;
    for (let seed = 0; seed < trials; seed++) {
      const cards = draftRunSkillCards(input, 1, mulberry32(seed));
      expect(cards).toHaveLength(1);
      counts[cards[0].cardKind]++;
    }
    expect(counts.new).toBeGreaterThan(trials * 0.4 * 0.75);
    expect(counts.new).toBeLessThan(trials * 0.4 * 1.25);
    expect(counts.levelup).toBeGreaterThan(trials * 0.4 * 0.75);
    expect(counts.levelup).toBeLessThan(trials * 0.4 * 1.25);
    expect(counts.consumable).toBeGreaterThan(trials * 0.2 * 0.75);
    expect(counts.consumable).toBeLessThan(trials * 0.2 * 1.25);
  });

  it('新規候補が枯渇(owned=[])している時、約70:30(Lv+1:消費)でnewは出ない', () => {
    const input = baseInput({ owned: [], runSkills: [RARE_SKILLS[0]], runSkillLevels: { [RARE_SKILLS[0]]: 1 } });
    const counts = { new: 0, levelup: 0, consumable: 0 };
    const trials = 6000;
    for (let seed = 0; seed < trials; seed++) {
      const cards = draftRunSkillCards(input, 1, mulberry32(seed));
      expect(cards).toHaveLength(1);
      counts[cards[0].cardKind]++;
    }
    expect(counts.new).toBe(0);
    expect(counts.levelup).toBeGreaterThan(trials * 0.7 * 0.8);
    expect(counts.levelup).toBeLessThan(trials * 0.7 * 1.2);
    expect(counts.consumable).toBeGreaterThan(trials * 0.3 * 0.8);
    expect(counts.consumable).toBeLessThan(trials * 0.3 * 1.2);
  });

  it('同種バフ発動中はその消費カードを再提示しない(異種は候補に残る)', () => {
    const active: ConsumableKey[] = ['scrap-boost', 'attack-doping'];
    const input = baseInput({ activeConsumables: active });
    const pool = consumableCandidates(input);
    for (const k of active) expect(pool).not.toContain(k);
    expect(pool.length).toBe(CONSUMABLE_KEYS.length - active.length);
    for (let seed = 0; seed < 200; seed++) {
      const cards = draftRunSkillCards(input, 3, mulberry32(seed));
      for (const c of cards) {
        if (c.cardKind === 'consumable') expect(active).not.toContain(c.key);
      }
    }
  });

  it('1ドラフト内で同じ消費カードが2枚並ばない', () => {
    // 新規/Lv+1候補を枯渇させ、消費カードだけが出るようにして重複チェックしやすくする。
    const input = baseInput({ owned: [], runSkills: [] });
    for (let seed = 0; seed < 30; seed++) {
      const cards = draftRunSkillCards(input, 3, mulberry32(seed));
      const consumableKeys = cards.filter(c => c.cardKind === 'consumable').map(c => c.key);
      expect(new Set(consumableKeys).size).toBe(consumableKeys.length);
    }
  });
});

// 社長裁定v0.25.3256: 1ドラフトに消費カードは1枚まで(スキル側が枯渇していれば例外)。
import { MAX_CONSUMABLES_PER_DRAFT } from './runSkillDraft';
describe('消費カードの1ドラフト上限(v0.25.3256)', () => {
  it('スキル候補が残っている限り、3枚中の消費カードは常に1枚以下', () => {
    const input = baseInput({});
    for (let seed = 0; seed < 500; seed++) {
      const rng = mulberry32(seed);
      const cards = draftRunSkillCards(input, 3, rng);
      const consumables = cards.filter(c => c.cardKind === 'consumable').length;
      expect(consumables).toBeLessThanOrEqual(MAX_CONSUMABLES_PER_DRAFT);
    }
  });
  it('スキル側が完全枯渇(全取得+全Lv3)なら消費カードが複数並べる(カンスト後の例外)', () => {
    // 所持=取得済み5種のみ・全てLv3(新規プールもLv+1プールも空)。ノーマル枠は2/3=1つ空けておく
    // (案Bの枠会計: ノーマル満杯だと消費カード自体が出ないため、例外が観測できる盤面にする)。
    const owned: SkillKey[] = ['sharpshooter', 'ricochet', 'fire-shooter', 'bomb-counter', 'crit-up'];
    const runLevels = Object.fromEntries(owned.map(k => [k, 3])) as Partial<Record<SkillKey, number>>;
    const input = baseInput({ owned, runSkills: owned, runSkillLevels: runLevels, ownedLevels: runLevels });
    let sawMulti = false;
    for (let seed = 0; seed < 200 && !sawMulti; seed++) {
      const cards = draftRunSkillCards(input, 3, mulberry32(seed));
      if (cards.filter(c => c.cardKind === 'consumable').length >= 2) sawMulti = true;
    }
    expect(sawMulti).toBe(true);
  });
});
