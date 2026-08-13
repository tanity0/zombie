// SKILL_BUILD_REDESIGN.md §17(B1発注文): スキルドラフト+レベルアップ専業化の純関数。
// PixiJS import 禁止(renderer非依存)。gameStore/upgradeUtils/playtestDriver/botUpgradePolicy から
// この薄いAPIだけを呼ぶ。乱数は必ず引数注入(Math.random直呼び禁止=botUpgradePolicyと同じ掟)。
//
// 仕様の出どころ: §1-1(枠)/§11-0(ハイブリッド=新規∪Lv+1)/§12-1(スキル専業3択)/
// §12-2#1・#2(候補定義・抽選手順)/§16-9(引き直し規則・畳み)/§16-10 ★A〜★C(持ち込み0・
// 覚醒・リロール/バニッシュ)/§22(中立デッキ裁定・確定=新規側の抽選は完全均等。旧§1-2b進行曲線・
// pity・flashy重みは§22で廃止)。矛盾する記述は §22 側が最終。

import type { SkillKey } from '../types/game';
import { SKILLS, type SkillRarity, skillMaxLevel, NEW_SLEEPING_SKILLS } from '../data/campaign';

// ---- 1. 枠(§1-1・社長指定・確定) -------------------------------------------------------
export const RUN_BUILD_CAPACITY: Record<SkillRarity, number> = { super: 1, rare: 2, normal: 3 };
export const runBuildCapacity = (rarity: SkillRarity): number => RUN_BUILD_CAPACITY[rarity];

// ---- 2. 持ち込み(§16-10 ★A・確定=0。定数は復活可能な形で残す) ---------------------------
export const MAX_CARRY_SKILLS = 0;

// ---- 3. B-19全数洗い(§11-1 B-19・§9点6)の受け皿 ------------------------------------------
// 「ラン中に取ると即機能しない/説明文が嘘になる」スキルは提示除外(受け皿=この専用定数)。
// - guardian-spirit/ghost-helper/ghost-slayer: 同行者枠(§1-3の「枠外」)。B4でgameStore.companionSkill
//   (単一選択の専用フィールド)へ正式化済み=player.skillsにもrunBuild(=このドラフトの対象)にも
//   入らない。最初からドラフト候補にならない(=念のための二重の守り)。
// - poi-bombing/poi-guard/poi-thrall: 施設報酬専任(§1-3「枠外」・警察署アリーナでのみ直接付与)。
// - scrap-builder: 「出撃開始時の初期スクラップ+50/100/150」が効果の柱だが、ラン内ドラフトは
//   Lv2以降にしか発生しない=出撃開始の瞬間は必ず過ぎている。取得しても取得量%側は生きるが、
//   説明文の前半が常に嘘になるため除外。
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

// ---- 5. 抽選プール(§12-2#1: 新規取得候補 / Lv+1候補) -----------------------------------------
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

/** 新規取得候補(§12-2#1: 所持済み・未取得・枠空き・除外に当たらない、以外を出さない)。
 * §22裁定: この候補プールが「デッキ」そのもの。ここに乗った時点でレア度に関わらず等確率(§6参照)。 */
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

// ---- 6. 新規側の抽選(§22-1「完全中立(デッキ式)」・§22-2#1) -----------------------------------
// 対象(所持済み・未取得・枠に空きがある・除外/バニッシュされていない=newSkillCandidatesそのもの)から
// 均等に1件選ぶ。レア度重み・プレイヤーLv曲線・確定混入・タグ別の重み付けは§22裁定により全廃(旧実装の
// 専用関数群は削除済み)。レア度枠フィルタ自体はnewSkillCandidates内のcanAcquireRarityが引き続き担う
// (§22-1「枠判定は不変」)。
const pickUniform = (pool: readonly SkillKey[], rng: () => number): SkillKey =>
  pool[Math.floor(rng() * pool.length)];

// ---- 7. ドラフト結果(1カード) ---------------------------------------------------------------
export interface DraftedSkillCard {
  key: SkillKey;
  cardKind: 'new' | 'levelup';
  rarity: SkillRarity;
  /** 表示用の遷移元Lv(新規=0、Lv+1=現在Lv)。 */
  fromLevel: number;
  /** このカードを取ると到達するLv(新規=ownedLevelsのクランプ値、Lv+1=現在Lv+1)。 */
  toLevel: number;
}

/** 所持Lv(取得時に付くLv)。既存出撃経路(gameStore.ts resetGame)と同じクランプ式(§10点12①)。 */
const clampedOwnedLevel = (key: SkillKey, ownedLevels: Partial<Record<SkillKey, number>>): number =>
  Math.max(1, Math.min(skillMaxLevel(key), ownedLevels[key] ?? 1));

/**
 * count枚のスキルカードをドラフトする(§12-2#2の手順・§22裁定で新規側の抽選を均等化)。
 * ①カード1枚ごとにカテゴリロール(新規:Lv+1=50:50。片方枯渇なら他方100%、両方枯渇ならそこで打ち切り
 *   =残り枠は呼び出し側が常設スクラップ+50で埋める・§16-9点6「1枚に畳んで残りは空表示」)。
 * ②新規側は適格候補(newSkillCandidates=レア度枠フィルタ済み)から均等抽選/Lv+1側も等確率。
 * ③3枚は重複なし(同一スキルを2枚並べない)。
 */
export const draftRunSkillCards = (
  input: RunSkillDraftInput, count: number, rng: () => number = Math.random,
): DraftedSkillCard[] => {
  const cards: DraftedSkillCard[] = [];
  const dealt: SkillKey[] = [];

  for (let i = 0; i < count; i++) {
    const newPool = newSkillCandidates(input, dealt);
    const lvPool = levelUpCandidates(input, dealt);
    if (newPool.length === 0 && lvPool.length === 0) break; // 両方枯渇=このドラフトはここで打ち切り

    const category: 'new' | 'levelup' =
      newPool.length === 0 ? 'levelup' :
      lvPool.length === 0 ? 'new' :
      rng() < 0.5 ? 'new' : 'levelup';

    if (category === 'levelup') {
      const key = pickUniform(lvPool, rng);
      const from = input.runSkillLevels[key] ?? 1;
      cards.push({ key, cardKind: 'levelup', rarity: SKILLS[key].rarity, fromLevel: from, toLevel: from + 1 });
      dealt.push(key);
      continue;
    }

    const key = pickUniform(newPool, rng);
    cards.push({ key, cardKind: 'new', rarity: SKILLS[key].rarity, fromLevel: 0, toLevel: clampedOwnedLevel(key, input.ownedLevels) });
    dealt.push(key);
  }

  return cards;
};

/** バニッシュ/1枠差し替え用: 既にdealt済みの他カードを避けつつ1枚だけ引く。 */
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
    const key = pickUniform(lvPool, rng);
    const from = input.runSkillLevels[key] ?? 1;
    return { key, cardKind: 'levelup', rarity: SKILLS[key].rarity, fromLevel: from, toLevel: from + 1 };
  }
  const key = pickUniform(newPool, rng);
  return { key, cardKind: 'new', rarity: SKILLS[key].rarity, fromLevel: 0, toLevel: clampedOwnedLevel(key, input.ownedLevels) };
};

// ---- 8. リロール価格(§16-10 ★C・叩き台) ----------------------------------------------------
export const REROLL_BASE_PRICE = 50;
export const REROLL_PRICE_STEP = 50;
/** rerollsUsedThisRun回目までリロール済みの人が「次の1回」に払う額(初回50/以後+50ずつ・回数無制限)。 */
export const rerollPrice = (rerollsUsedThisRun: number): number =>
  REROLL_BASE_PRICE + REROLL_PRICE_STEP * Math.max(0, Math.floor(rerollsUsedThisRun));

// ---- 9. バニッシュ上限(§16-10 ★C) ----------------------------------------------------------
export const MAX_BANISH_PER_RUN = 2;
