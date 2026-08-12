// SKILL_BUILD_REDESIGN.md §17(B1発注文): スキルドラフト+レベルアップ専業化の純関数。
// PixiJS import 禁止(renderer非依存)。gameStore/upgradeUtils/playtestDriver/botUpgradePolicy から
// この薄いAPIだけを呼ぶ。乱数は必ず引数注入(Math.random直呼び禁止=botUpgradePolicyと同じ掟)。
//
// 仕様の出どころ: §1-1(枠)/§1-2b(進行曲線)/§11-0(ハイブリッド=新規∪Lv+1)/§12-1(スキル専業3択)/
// §12-2#1・#2(候補定義・抽選手順)/§16-9(pity優先・引き直し規則・畳み)/§16-10 ★A〜★C(持ち込み0・
// 覚醒・リロール/バニッシュ)。矛盾する記述は §16(監査8巡目)側が最終。

import type { SkillKey } from '../types/game';
import { SKILLS, type SkillRarity, skillMaxLevel, FLASHY_SKILLS, NEW_SLEEPING_SKILLS } from '../data/campaign';

// ---- 1. 枠(§1-1・社長指定・確定) -------------------------------------------------------
export const RUN_BUILD_CAPACITY: Record<SkillRarity, number> = { super: 1, rare: 2, normal: 3 };
export const runBuildCapacity = (rarity: SkillRarity): number => RUN_BUILD_CAPACITY[rarity];

// ---- 2. 持ち込み(§16-10 ★A・確定=0。定数は復活可能な形で残す) ---------------------------
export const MAX_CARRY_SKILLS = 0;

// ---- 3. B-19全数洗い(§11-1 B-19・§9点6)の受け皿 ------------------------------------------
// 「ラン中に取ると即機能しない/説明文が嘘になる」スキルは提示除外(受け皿=この専用定数)。
// - guardian-spirit/ghost-helper/ghost-slayer: 同行者枠(§1-3の「枠外」)。player.skillsには入るが
//   runBuild(=このドラフトの対象)には入れない=最初からドラフト候補にならない。
// - poi-bombing/poi-guard/poi-thrall: 施設報酬専任(§1-3「枠外」・警察署アリーナでのみ直接付与)。
// - scrap-builder: 「出撃開始時の初期スクラップ+50/100/150」が効果の柱だが、ラン内ドラフトは
//   Lv2以降にしか発生しない=出撃開始の瞬間は必ず過ぎている。取得しても柱が永久に発火しない
//   (取得量%側は生きるが、説明文の前半が常に嘘になる)ため除外。
// - warm-up: 「出撃から60秒間」の効果窓が gameTime(出撃時刻起点)に固定されており、取得時点で
//   窓の大半〜全部が経過済みになりやすい(Lv2以降にしか出せない)。取得しても実質0〜わずかしか
//   効かない=説明文が嘘になりやすいため除外。
// - NEW_SLEEPING_SKILLS(SKILL_BUILD_REDESIGN.md §14の新9種): B3=台帳掲載のみで効果配線が無い
//   (B7待ち)。取っても何も起きない=完全に眠らせる(§19-1点4)。
export const RUN_DRAFT_EXCLUDED_SKILLS: SkillKey[] = [
  'guardian-spirit', 'ghost-helper', 'ghost-slayer',
  'poi-bombing', 'poi-guard', 'poi-thrall',
  'scrap-builder', 'warm-up',
  ...NEW_SLEEPING_SKILLS,
];

// ---- 4. 枠判定(§2-1「唯一の出どころ」) -----------------------------------------------------
/** レア度カウントが枠に収まっているか(重複は見ない=枠判定のみ)。 */
export const canAcquireRarity = (runSkills: readonly SkillKey[], rarity: SkillRarity): boolean =>
  runSkills.filter(k => SKILLS[k].rarity === rarity).length < runBuildCapacity(rarity);

/** そのスキルを新規取得できるか(未所持枠+未重複)。UI/抽選/持ち込み検証が全てこれを通る。 */
export const canAcquireRunSkill = (runSkills: readonly SkillKey[], key: SkillKey): boolean =>
  !runSkills.includes(key) && canAcquireRarity(runSkills, SKILLS[key].rarity);

// ---- 5. 進行曲線(§1-2b・叩き台=実機調整前提) -------------------------------------------------
export interface RarityWeights { normal: number; rare: number; super: number }

/** プレイヤーLvからノーマル/レア/超レアの抽選重みを返す(§1-2bの表)。 */
export const rarityWeightsForPlayerLevel = (playerLevel: number): RarityWeights => {
  const lv = Math.max(2, Math.floor(playerLevel));
  if (lv <= 4) return { normal: 85, rare: 15, super: 0 };
  if (lv <= 7) return { normal: 60, rare: 32, super: 8 };
  return { normal: 45, rare: 38, super: 17 };
};

// ---- 6. 超レアpity(§1-2b・§16-9点8「カテゴリロールに優先」) --------------------------------
/** Lv8以降、超レア枠がまだ空なら次のスキル提示で超レアを1枚確定混入させる(状態は呼び出し側=
 * gameStoreの1フラグではなく、ここでは毎回 playerLevel/runBuild から再判定する純粋関数として持つ
 * (「足したがリセット忘れ」の再発余地を無くす=常に現在状態から導出)。 */
export const isSuperPityArmed = (playerLevel: number, runSkills: readonly SkillKey[]): boolean =>
  Math.floor(playerLevel) >= 8 && runSkills.filter(k => SKILLS[k].rarity === 'super').length === 0;

// ---- 7. 抽選プール(§12-2#1: 新規取得候補 / Lv+1候補) -----------------------------------------
export interface RunSkillDraftInput {
  /** ownedSkills(入手経路は問わない。除外はRUN_DRAFT_EXCLUDED_SKILLSのみ)。 */
  owned: readonly SkillKey[];
  /** 所持スキルのLv(ガチャ等で確定した「取得時に付くLv」の出どころ)。 */
  ownedLevels: Partial<Record<SkillKey, number>>;
  /** 現在のrunBuild(=このランでドラフト取得済みのスキル。枠判定の対象そのもの)。 */
  runSkills: readonly SkillKey[];
  /** runSkills内スキルの現在Lv(未設定=1)。 */
  runSkillLevels: Partial<Record<SkillKey, number>>;
  playerLevel: number;
  /** バニッシュ済み(ラン中の抽選除外)。 */
  excluded?: readonly SkillKey[];
  /** dog-runの発動条件(§1-2④・犬サブウェポン装備中のみ提示。出撃時に確定=ラン中不変)。 */
  dogEquipped?: boolean;
}

const isDraftEligible = (input: RunSkillDraftInput, key: SkillKey): boolean => {
  if (RUN_DRAFT_EXCLUDED_SKILLS.includes(key)) return false;
  if ((input.excluded ?? []).includes(key)) return false;
  if (key === 'dog-run' && !input.dogEquipped) return false; // §1-2④「発動条件を満たせる」の実対象
  return true;
};

/** 新規取得候補(§12-2#1: 所持済み・未取得・枠空き・除外に当たらない、以外を出さない)。 */
export const newSkillCandidates = (
  input: RunSkillDraftInput, dealtThisDraft: readonly SkillKey[] = [],
): SkillKey[] =>
  input.owned.filter(k =>
    !input.runSkills.includes(k) &&
    !dealtThisDraft.includes(k) &&
    isDraftEligible(input, k) &&
    canAcquireRarity(input.runSkills, SKILLS[k].rarity),
  );

/** Lv+1候補(§12-2#1: runBuild内・現Lv<skillMaxLevel、以外を出さない)。
 * バニッシュ(excluded)は新規側だけでなくLv+1側からも外す(「ラン中の抽選から除外」を全面適用)。 */
export const levelUpCandidates = (
  input: RunSkillDraftInput, dealtThisDraft: readonly SkillKey[] = [],
): SkillKey[] =>
  input.runSkills.filter(k =>
    !dealtThisDraft.includes(k) &&
    !(input.excluded ?? []).includes(k) &&
    (input.runSkillLevels[k] ?? 1) < skillMaxLevel(k),
  );

// ---- 8. レア度ロール(§12-2#2「枠の空いたレア度のみ・枯渇は下位方向へ流す」) -------------------
const RARITY_ORDER: SkillRarity[] = ['super', 'rare', 'normal'];

/** weightsで1つ選んだ後、isViableでなければ下位(super→rare→normal)へ流す。全滅ならnull。 */
const rollRarityCascade = (
  weights: RarityWeights, isViable: (r: SkillRarity) => boolean, rng: () => number,
): SkillRarity | null => {
  const w = [weights.super, weights.rare, weights.normal];
  const total = w[0] + w[1] + w[2];
  let startIdx = 0;
  if (total > 0) {
    let r = rng() * total;
    for (let i = 0; i < w.length; i++) {
      if (r < w[i]) { startIdx = i; break; }
      r -= w[i];
    }
  }
  for (let i = startIdx; i < RARITY_ORDER.length; i++) {
    if (isViable(RARITY_ORDER[i])) return RARITY_ORDER[i];
  }
  return null;
};

// ---- 8b. ノーマル抽選のflashy重み(§4/§19-1点2「ノーマル抽選でflashyタグ持ちの重みを2倍」) -------
// flashy以外(super/rare含む全て)は重み1=既存の一様抽選と完全に同じ挙動。flashyはSKILL_KEYS中
// ノーマルの3種のみ(FLASHY_SKILLS)なので、実際に2倍が効くのは新規カードのノーマル抽選時だけ。
const skillDraftWeight = (key: SkillKey): number => (FLASHY_SKILLS.includes(key) ? 2 : 1);

/** 候補プールから重み付きで1件選ぶ(flashy×2)。プールが空の呼び出しは想定しない(呼び出し側で長さ確認済み)。 */
const pickWeightedSkill = (pool: readonly SkillKey[], rng: () => number): SkillKey => {
  const weights = pool.map(skillDraftWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    if (r < weights[i]) return pool[i];
    r -= weights[i];
  }
  return pool[pool.length - 1];
};

// ---- 9. ドラフト結果(1カード) ---------------------------------------------------------------
export interface DraftedSkillCard {
  key: SkillKey;
  cardKind: 'new' | 'levelup';
  rarity: SkillRarity;
  /** 表示用の遷移元Lv(新規=0、Lv+1=現在Lv)。 */
  fromLevel: number;
  /** このカードを取ると到達するLv(新規=ownedLevelsのクランプ値、Lv+1=現在Lv+1)。 */
  toLevel: number;
  /** pity発火による確定混入カードか(表示用)。 */
  pity: boolean;
}

/** 所持Lv(取得時に付くLv)。既存出撃経路(gameStore.ts resetGame)と同じクランプ式(§10点12①)。 */
const clampedOwnedLevel = (key: SkillKey, ownedLevels: Partial<Record<SkillKey, number>>): number =>
  Math.max(1, Math.min(skillMaxLevel(key), ownedLevels[key] ?? 1));

/**
 * count枚のスキルカードをドラフトする(§12-2#2の手順)。
 * ①カード1枚ごとにカテゴリロール(新規:Lv+1=50:50。片方枯渇なら他方100%、両方枯渇ならそこで打ち切り
 *   =残り枠は呼び出し側が常設スクラップ+50で埋める・§16-9点6「1枚に畳んで残りは空表示」)。
 * ②新規側は進行曲線のレア度ロール(枠の空いたレア度のみ・枯渇は下位方向へ流す)/Lv+1側は等確率。
 * ③3枚は重複なし(同一スキルを2枚並べない)。
 * pityは1ドラフトにつき最大1回、カード0枚目でカテゴリロールより優先して判定する(§16-9点8)。
 */
export const draftRunSkillCards = (
  input: RunSkillDraftInput, count: number, rng: () => number = Math.random,
): DraftedSkillCard[] => {
  const cards: DraftedSkillCard[] = [];
  const dealt: SkillKey[] = [];
  let pityPending = isSuperPityArmed(input.playerLevel, input.runSkills);

  for (let i = 0; i < count; i++) {
    if (pityPending) {
      pityPending = false; // 1ドラフトにつき1回だけ試みる(成立可否によらず以降は通常ロール)
      const superPool = newSkillCandidates(input, dealt).filter(k => SKILLS[k].rarity === 'super');
      if (superPool.length > 0) {
        const key = pickWeightedSkill(superPool, rng);
        cards.push({ key, cardKind: 'new', rarity: 'super', fromLevel: 0, toLevel: clampedOwnedLevel(key, input.ownedLevels), pity: true });
        dealt.push(key);
        continue;
      }
    }

    const newPool = newSkillCandidates(input, dealt);
    const lvPool = levelUpCandidates(input, dealt);
    if (newPool.length === 0 && lvPool.length === 0) break; // 両方枯渇=このドラフトはここで打ち切り

    const category: 'new' | 'levelup' =
      newPool.length === 0 ? 'levelup' :
      lvPool.length === 0 ? 'new' :
      rng() < 0.5 ? 'new' : 'levelup';

    if (category === 'levelup') {
      const key = lvPool[Math.floor(rng() * lvPool.length)];
      const from = input.runSkillLevels[key] ?? 1;
      cards.push({ key, cardKind: 'levelup', rarity: SKILLS[key].rarity, fromLevel: from, toLevel: from + 1, pity: false });
      dealt.push(key);
      continue;
    }

    const weights = rarityWeightsForPlayerLevel(input.playerLevel);
    const rarityPool = (r: SkillRarity) => newPool.filter(k => SKILLS[k].rarity === r);
    const isViable = (r: SkillRarity) => canAcquireRarity(input.runSkills, r) && rarityPool(r).length > 0;
    const rarity = rollRarityCascade(weights, isViable, rng);
    if (!rarity) {
      // newPoolは非空のはずなので通常到達しない防御分岐。念のためLv+1へ逃がす。
      if (lvPool.length > 0) {
        const key = lvPool[Math.floor(rng() * lvPool.length)];
        const from = input.runSkillLevels[key] ?? 1;
        cards.push({ key, cardKind: 'levelup', rarity: SKILLS[key].rarity, fromLevel: from, toLevel: from + 1, pity: false });
        dealt.push(key);
      }
      continue;
    }
    const pool = rarityPool(rarity);
    const key = pickWeightedSkill(pool, rng);
    cards.push({ key, cardKind: 'new', rarity, fromLevel: 0, toLevel: clampedOwnedLevel(key, input.ownedLevels), pity: false });
    dealt.push(key);
  }

  return cards;
};

/** バニッシュ/1枠差し替え用: 既にdealt済みの他カードを避けつつ1枚だけ引く(pityは掛けない=
 * ドラフトイベント単位の仕組みであり、1枚差し替えのたびに掛け直すと実質無料リロールになるため)。 */
export const draftReplacementSkillCard = (
  input: RunSkillDraftInput, dealtSeed: readonly SkillKey[], rng: () => number = Math.random,
): DraftedSkillCard | null => {
  const dealt = [...dealtSeed];
  const newPool = newSkillCandidates(input, dealt);
  const lvPool = levelUpCandidates(input, dealt);
  if (newPool.length === 0 && lvPool.length === 0) return null;
  const category: 'new' | 'levelup' =
    newPool.length === 0 ? 'levelup' :
    lvPool.length === 0 ? 'new' :
    rng() < 0.5 ? 'new' : 'levelup';
  if (category === 'levelup') {
    const key = lvPool[Math.floor(rng() * lvPool.length)];
    const from = input.runSkillLevels[key] ?? 1;
    return { key, cardKind: 'levelup', rarity: SKILLS[key].rarity, fromLevel: from, toLevel: from + 1, pity: false };
  }
  const weights = rarityWeightsForPlayerLevel(input.playerLevel);
  const rarityPool = (r: SkillRarity) => newPool.filter(k => SKILLS[k].rarity === r);
  const isViable = (r: SkillRarity) => canAcquireRarity(input.runSkills, r) && rarityPool(r).length > 0;
  const rarity = rollRarityCascade(weights, isViable, rng);
  if (!rarity) return null;
  const pool = rarityPool(rarity);
  const key = pickWeightedSkill(pool, rng);
  return { key, cardKind: 'new', rarity, fromLevel: 0, toLevel: clampedOwnedLevel(key, input.ownedLevels), pity: false };
};

// ---- 10. リロール価格(§16-10 ★C・叩き台) ----------------------------------------------------
export const REROLL_BASE_PRICE = 50;
export const REROLL_PRICE_STEP = 50;
/** rerollsUsedThisRun回目までリロール済みの人が「次の1回」に払う額(初回50/以後+50ずつ・回数無制限)。 */
export const rerollPrice = (rerollsUsedThisRun: number): number =>
  REROLL_BASE_PRICE + REROLL_PRICE_STEP * Math.max(0, Math.floor(rerollsUsedThisRun));

// ---- 11. バニッシュ上限(§16-10 ★C) ----------------------------------------------------------
export const MAX_BANISH_PER_RUN = 2;
