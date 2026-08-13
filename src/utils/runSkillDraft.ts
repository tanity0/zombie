// SKILL_BUILD_REDESIGN.md §17(B1発注文): スキルドラフト+レベルアップ専業化の純関数。
// PixiJS import 禁止(renderer非依存)。gameStore/upgradeUtils/playtestDriver/botUpgradePolicy から
// この薄いAPIだけを呼ぶ。乱数は必ず引数注入(Math.random直呼び禁止=botUpgradePolicyと同じ掟)。
//
// 仕様の出どころ: §1-1(枠)/§11-0(ハイブリッド=新規∪Lv+1)/§12-1(スキル専業3択)/
// §12-2#1・#2(候補定義・抽選手順)/§16-9(引き直し規則・畳み)/§16-10 ★A〜★C(持ち込み0・
// 覚醒・リロール/バニッシュ)/§22(中立デッキ裁定・確定=新規側の抽選は完全均等。旧§1-2b進行曲線・
// pity・flashy重みは§22で廃止)。矛盾する記述は §22 側が最終。

import type { SkillKey, ConsumableKey } from '../types/game';
import { SKILLS, type SkillRarity, skillMaxLevel, NEW_SLEEPING_SKILLS, RETIRED_SKILLS } from '../data/campaign';
import { CONSUMABLE_KEYS } from '../data/consumables';

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
// - RETIRED_SKILLS(旧scrap-builder/warm-up・§23-1で消費カードへ転生し完全退役): scrap-builderは
//   「出撃開始時の初期スクラップ+50/100/150」が効果の柱だが、ラン内ドラフトはLv2以降にしか発生
//   しない=出撃開始の瞬間は必ず過ぎている。warm-upは「出撃から60秒間」の効果窓が gameTime(出撃
//   時刻起点)に固定されており、取得時点で窓の大半〜全部が経過済みになりやすい。取得しても実質
//   0〜わずかしか効かない=説明文が嘘になりやすいため除外(§19-1点5)。§23で効果コード自体も削除済み。
// - NEW_SLEEPING_SKILLS(SKILL_BUILD_REDESIGN.md §14の新9種): B3=台帳掲載のみで効果配線が無い
//   (B7待ち)。取っても何も起きない=完全に眠らせる(§19-1点4)。
export const RUN_DRAFT_EXCLUDED_SKILLS: SkillKey[] = [
  'guardian-spirit', 'ghost-helper', 'ghost-slayer',
  'poi-bombing', 'poi-guard', 'poi-thrall',
  ...RETIRED_SKILLS,
  ...NEW_SLEEPING_SKILLS,
];

// ---- 4. 枠判定(§2-1「唯一の出どころ」) -----------------------------------------------------
/** レア度カウントが枠に収まっているか(重複は見ない=枠判定のみ)。
 * extraNormalOccupied(§23-2条件1): 消費カード(アクティブなバフ数)をノーマル枠の占有分として
 * 加算する。rarity!=='normal' の時は無視する(消費カードは常にノーマル枠を占有する仕様のため)。 */
export const canAcquireRarity = (
  runSkills: readonly SkillKey[], rarity: SkillRarity, extraNormalOccupied = 0,
): boolean => {
  const occupied = runSkills.filter(k => SKILLS[k].rarity === rarity).length
    + (rarity === 'normal' ? Math.max(0, extraNormalOccupied) : 0);
  return occupied < runBuildCapacity(rarity);
};

/** そのスキルを新規取得できるか(未所持枠+未重複)。UI/抽選/持ち込み検証が全てこれを通る。 */
export const canAcquireRunSkill = (
  runSkills: readonly SkillKey[], key: SkillKey, extraNormalOccupied = 0,
): boolean =>
  !runSkills.includes(key) && canAcquireRarity(runSkills, SKILLS[key].rarity, extraNormalOccupied);

// ---- 5. 抽選プール(§12-2#1: 新規取得候補 / Lv+1候補 / §23: 消費カード候補) --------------------
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
  /** §23: 現在アクティブな消費カードのキー(同種は再提示しない・§23-1「同種バフ発動中は提示しない」)。
   * 個数はそのままノーマル枠の占有分(canAcquireRarityのextraNormalOccupied)としても使う。 */
  activeConsumables?: readonly ConsumableKey[];
}

const isDraftEligible = (input: RunSkillDraftInput, key: SkillKey): boolean => {
  if (RUN_DRAFT_EXCLUDED_SKILLS.includes(key)) return false;
  if ((input.excluded ?? []).includes(key)) return false;
  if (key === 'dog-run' && !input.dogEquipped) return false; // §1-2④「発動条件を満たせる」の実対象
  return true;
};

/** 新規取得候補(§12-2#1: 所持済み・未取得・枠空き・除外に当たらない、以外を出さない)。
 * §22裁定: この候補プールが「デッキ」そのもの。ここに乗った時点でレア度に関わらず等確率(§6参照)。
 * §23-2条件1: ノーマル枠の空き判定にはアクティブな消費カード数を含める(canAcquireRarityへ委譲)。 */
export const newSkillCandidates = (
  input: RunSkillDraftInput, dealtThisDraft: readonly SkillKey[] = [],
): SkillKey[] => {
  const activeConsumableCount = (input.activeConsumables ?? []).length;
  return input.owned.filter(k =>
    !input.runSkills.includes(k) &&
    !dealtThisDraft.includes(k) &&
    isDraftEligible(input, k) &&
    canAcquireRarity(input.runSkills, SKILLS[k].rarity, activeConsumableCount),
  );
};

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

/** 消費カード候補(§23-1/§23-2条件1・条件3): ノーマル枠に空きがあり(実スキル+アクティブな消費カード
 * <cap)、かつ同種が現在発動中でなく、この1回のドラフト内で既に出していないもの全て。 */
export const consumableCandidates = (
  input: RunSkillDraftInput, dealtThisDraft: readonly ConsumableKey[] = [],
): ConsumableKey[] => {
  const active = input.activeConsumables ?? [];
  if (!canAcquireRarity(input.runSkills, 'normal', active.length)) return []; // 枠会計(条件1「満杯時は提示されない」)
  return CONSUMABLE_KEYS.filter(k => !active.includes(k) && !dealtThisDraft.includes(k));
};

// ---- 6. 新規側の抽選(§22-1「完全中立(デッキ式)」・§22-2#1) -----------------------------------
// 対象(所持済み・未取得・枠に空きがある・除外/バニッシュされていない=newSkillCandidatesそのもの)から
// 均等に1件選ぶ。レア度重み・プレイヤーLv曲線・確定混入・タグ別の重み付けは§22裁定により全廃(旧実装の
// 専用関数群は削除済み)。レア度枠フィルタ自体はnewSkillCandidates内のcanAcquireRarityが引き続き担う
// (§22-1「枠判定は不変」)。消費カード(§23)も同じ均等抽選で1件選ぶ(5種間の重み付けは指定なし=
// デッキ式と同じ思想で均等とした)。
const pickUniform = <T,>(pool: readonly T[], rng: () => number): T =>
  pool[Math.floor(rng() * pool.length)];

// §23-1: カテゴリロールを新規40%:Lv+1 40%:消費20%へ(新規枯渇時はLv+1 70%:消費30%)。空プールは
// 重み0にして残りへ按分する(旧実装の「片方枯渇なら他方100%」の3択版・一般化しただけで新しい仕様の
// 発明はしていない)。全プール枯渇はnull(呼び出し側がドラフト打ち切り=既存挙動と同じ)。
type DraftCategory = 'new' | 'levelup' | 'consumable';
// 社長裁定v0.25.3256「出てくる消費アイテム枠は一枠まで。あとは必ずスキル(カンスト後は別だが)」
export const MAX_CONSUMABLES_PER_DRAFT = 1;
const rollCategory = (
  newLen: number, lvLen: number, consumableLen: number, rng: () => number,
): DraftCategory | null => {
  const base = newLen > 0
    ? { new: 40, levelup: 40, consumable: 20 }
    : { new: 0, levelup: 70, consumable: 30 };
  const w = {
    new: newLen > 0 ? base.new : 0,
    levelup: lvLen > 0 ? base.levelup : 0,
    consumable: consumableLen > 0 ? base.consumable : 0,
  };
  const total = w.new + w.levelup + w.consumable;
  if (total <= 0) return null;
  let r = rng() * total;
  if (r < w.new) return 'new';
  r -= w.new;
  if (r < w.levelup) return 'levelup';
  return 'consumable';
};

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

/** §23: 消費カード1枚(取得で即発動・60秒・温存不可=fromLevel/toLevelの概念が無い)。 */
export interface DraftedConsumableCard {
  key: ConsumableKey;
  cardKind: 'consumable';
}

export type DraftedCard = DraftedSkillCard | DraftedConsumableCard;

/** 所持Lv(取得時に付くLv)。既存出撃経路(gameStore.ts resetGame)と同じクランプ式(§10点12①)。 */
const clampedOwnedLevel = (key: SkillKey, ownedLevels: Partial<Record<SkillKey, number>>): number =>
  Math.max(1, Math.min(skillMaxLevel(key), ownedLevels[key] ?? 1));

const newCard = (key: SkillKey, input: RunSkillDraftInput): DraftedSkillCard =>
  ({ key, cardKind: 'new', rarity: SKILLS[key].rarity, fromLevel: 0, toLevel: clampedOwnedLevel(key, input.ownedLevels) });
const levelUpCard = (key: SkillKey, input: RunSkillDraftInput): DraftedSkillCard => {
  const from = input.runSkillLevels[key] ?? 1;
  return { key, cardKind: 'levelup', rarity: SKILLS[key].rarity, fromLevel: from, toLevel: from + 1 };
};
const consumableCard = (key: ConsumableKey): DraftedConsumableCard => ({ key, cardKind: 'consumable' });

/**
 * count枚のカードをドラフトする(§12-2#2の手順・§22裁定で新規側の抽選を均等化・§23-1で消費カードを追加)。
 * ①カード1枚ごとにカテゴリロール(新規40%:Lv+1 40%:消費20%。新規枯渇時はLv+1 70%:消費30%。
 *   空プールは重み0で残りへ按分し、全プール枯渇ならそこで打ち切り=残り枠は呼び出し側が常設
 *   スクラップ+50で埋める・§16-9点6「1枚に畳んで残りは空表示」)。
 * ②新規側は適格候補(newSkillCandidates=レア度枠フィルタ済み)から均等抽選/Lv+1側も等確率/
 *   消費カード側(consumableCandidates)も均等抽選。
 * ③3枚は重複なし(同一スキル/同一消費カードを2枚並べない)。
 */
export const draftRunSkillCards = (
  input: RunSkillDraftInput, count: number, rng: () => number = Math.random,
): DraftedCard[] => {
  const cards: DraftedCard[] = [];
  const dealt: SkillKey[] = [];
  const dealtConsumables: ConsumableKey[] = [];

  for (let i = 0; i < count; i++) {
    const newPool = newSkillCandidates(input, dealt);
    const lvPool = levelUpCandidates(input, dealt);
    const cPool = consumableCandidates(input, dealtConsumables);
    // 社長裁定v0.25.3256「出てくる消費アイテム枠は一枠まで。あとは必ずスキル(カンスト後は別)」:
    // 同一ドラフト内の消費カードは1枚まで。スキル側(新規+Lv+1)が両方枯渇している時だけ例外的に
    // 2枚目以降の消費カードを許す。
    const consumableCapped = dealtConsumables.length >= MAX_CONSUMABLES_PER_DRAFT && (newPool.length + lvPool.length > 0);
    const category = rollCategory(newPool.length, lvPool.length, consumableCapped ? 0 : cPool.length, rng);
    if (category === null) break; // 全プール枯渇=このドラフトはここで打ち切り

    if (category === 'levelup') {
      const key = pickUniform(lvPool, rng);
      cards.push(levelUpCard(key, input));
      dealt.push(key);
    } else if (category === 'consumable') {
      const key = pickUniform(cPool, rng);
      cards.push(consumableCard(key));
      dealtConsumables.push(key);
    } else {
      const key = pickUniform(newPool, rng);
      cards.push(newCard(key, input));
      dealt.push(key);
    }
  }

  return cards;
};

/** バニッシュ/1枠差し替え用: 既にdealt済みの他カードを避けつつ1枚だけ引く。 */
export const draftReplacementSkillCard = (
  input: RunSkillDraftInput,
  dealtSeed: readonly SkillKey[],
  dealtConsumableSeed: readonly ConsumableKey[] = [],
  rng: () => number = Math.random,
): DraftedCard | null => {
  const dealt = [...dealtSeed];
  const dealtConsumables = [...dealtConsumableSeed];
  const newPool = newSkillCandidates(input, dealt);
  const lvPool = levelUpCandidates(input, dealt);
  const cPool = consumableCandidates(input, dealtConsumables);
  // 1ドラフト消費1枚まで(v0.25.3256)は差し替えでも守る(場に残る消費カードを数えて上限判定)。
  const consumableCapped = dealtConsumables.length >= MAX_CONSUMABLES_PER_DRAFT && (newPool.length + lvPool.length > 0);
  const category = rollCategory(newPool.length, lvPool.length, consumableCapped ? 0 : cPool.length, rng);
  if (category === null) return null;
  if (category === 'levelup') return levelUpCard(pickUniform(lvPool, rng), input);
  if (category === 'consumable') return consumableCard(pickUniform(cPool, rng));
  return newCard(pickUniform(newPool, rng), input);
};

// ---- 8. リロール価格(社長裁定2026-08-13「20にして」=一律20・値上がり廃止) --------------------
export const REROLL_BASE_PRICE = 20;
/** 1回のリロールに払う額(一律・回数無制限)。旧: 初回50+50ずつ値上がり(§16-10 ★C叩き台)。 */
export const rerollPrice = (_rerollsUsedThisRun: number): number => REROLL_BASE_PRICE;

// ---- 9. バニッシュ上限(§16-10 ★C) ----------------------------------------------------------
export const MAX_BANISH_PER_RUN = 2;
