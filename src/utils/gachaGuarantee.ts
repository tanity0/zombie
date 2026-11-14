// ガチャ(強化訓練)の「10回に1回はレベルアップか新規」保証(社長指示2026-11-14)。
// 「昇格しなかった(=返金になった)回」が続いた数(missStreak)を数え、GACHA_GUARANTEE_EVERY-1 回
// 続いた次の1回は必ず新規取得かLv+1にする。昇格した回で数は0へ戻る。
// super の天井(pity)は呼び出し側が抽選したレア度で今どおり数える(保証では変えない)。
import {
  SKILLS, skillMaxLevel, rollSkillLevel, gachaPoolOf, rarityWeightsForPity,
  type SkillRarity,
} from '../data/campaign';
import type { SkillKey } from '../types/game';

/** 何回に1回を保証するか。 */
export const GACHA_GUARANTEE_EVERY = 10;

/** 次の1回が保証の回か。 */
export const isGachaGuaranteedPull = (missStreak: number): boolean =>
  Math.max(0, Math.floor(missStreak)) >= GACHA_GUARANTEE_EVERY - 1;

/** 保証の回まであと何回か(次の1回が保証なら1)。 */
export const gachaGuaranteeRemaining = (missStreak: number): number =>
  Math.max(1, GACHA_GUARANTEE_EVERY - Math.max(0, Math.floor(missStreak)));

/** 1回引いた後の missStreak。 */
export const nextGachaMissStreak = (missStreak: number, promoted: boolean): number =>
  promoted ? 0 : Math.max(0, Math.floor(missStreak)) + 1;

/**
 * 1回引いた後の天井(pity)。普通の抽選は今どおり「抽選したレア度が super なら0・それ以外は+1」。
 * 保証の選び直しで結果が super になった回も0へ戻す(超レアが出たら0)。
 */
export const nextGachaPity = (pity: number, rolledRarity: SkillRarity, finalRarity: SkillRarity): number =>
  rolledRarity === 'super' || finalRarity === 'super' ? 0 : pity + 1;

/** 新規取得か Lv+1 の余地があるか(未所持 or 上限未満)。 */
export const canGachaPromote = (
  key: SkillKey, owned: readonly SkillKey[], levels: Partial<Record<SkillKey, number>>,
): boolean => !owned.includes(key) || (levels[key] ?? 1) < skillMaxLevel(key);

export type GachaForce = 'none' | 'bump' | 'same-rarity' | 'other-rarity';

export interface GachaResolveInput {
  rolledKey: SkillKey;                          // rollGachaSkill が引いたスキル
  owned: readonly SkillKey[];
  levels: Partial<Record<SkillKey, number>>;
  dupes: Partial<Record<SkillKey, number>>;
  missStreak: number;
  pity: number;                                 // ④の選び直しのレア度の重みに使う(現在の率)
  rng?: () => number;
}

export interface GachaResolveOutput {
  key: SkillKey;          // 最終的に出たスキル(選び直しなら rolledKey と違う)
  rarity: SkillRarity;    // key のレア度
  rolledLevel: number;    // key に対する抽選Lv(強制+1なら上げた後のLv)
  prevLevel: number;      // 0=未所持
  newLevel: number;
  dupeCount: number;      // key の今回より前の被り回数
  firstAcquire: boolean;
  promoted: boolean;
  guaranteed: boolean;    // 保証の回だったか
  forced: GachaForce;     // 保証で結果を変えたか・どの段で変えたか
}

const pick = <T,>(xs: readonly T[], rng: () => number): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];

/** key を通常どおり抽選した結果(新規=抽選Lvで付与 / 所持=抽選Lvが上回れば昇格)。 */
const resolveNormally = (
  key: SkillKey, owned: readonly SkillKey[], levels: Partial<Record<SkillKey, number>>,
  dupes: Partial<Record<SkillKey, number>>, rng: () => number,
): Omit<GachaResolveOutput, 'guaranteed' | 'forced'> => {
  const rarity = SKILLS[key].rarity;
  const maxLv = skillMaxLevel(key);
  const prevLevel = owned.includes(key) ? (levels[key] ?? 1) : 0;
  const dupeCount = dupes[key] ?? 0;
  const firstAcquire = prevLevel === 0;
  // Lv1固定で所持済み=抽選しない(従来どおり常に返金側)。
  if (maxLv === 1 && !firstAcquire) {
    return { key, rarity, rolledLevel: 1, prevLevel, newLevel: prevLevel, dupeCount, firstAcquire: false, promoted: false };
  }
  const rolledLevel = rollSkillLevel(rarity, dupeCount, maxLv, rng);
  if (firstAcquire) {
    return { key, rarity, rolledLevel, prevLevel, newLevel: Math.max(1, Math.min(maxLv, rolledLevel)), dupeCount, firstAcquire, promoted: true };
  }
  if (rolledLevel > prevLevel && prevLevel < maxLv) {
    return { key, rarity, rolledLevel, prevLevel, newLevel: Math.min(maxLv, rolledLevel), dupeCount, firstAcquire, promoted: true };
  }
  return { key, rarity, rolledLevel, prevLevel, newLevel: prevLevel, dupeCount, firstAcquire, promoted: false };
};

/** 所持済み・上限未満のスキルを +1 した結果。 */
const bumpOne = (
  key: SkillKey, levels: Partial<Record<SkillKey, number>>, dupes: Partial<Record<SkillKey, number>>,
): Omit<GachaResolveOutput, 'guaranteed' | 'forced'> => {
  const prevLevel = levels[key] ?? 1;
  const newLevel = Math.min(skillMaxLevel(key), prevLevel + 1);
  return { key, rarity: SKILLS[key].rarity, rolledLevel: newLevel, prevLevel, newLevel, dupeCount: dupes[key] ?? 0, firstAcquire: false, promoted: true };
};

/** 選び直したスキルを新規取得(抽選Lv)か +1 にする。 */
const grantOrBump = (
  key: SkillKey, owned: readonly SkillKey[], levels: Partial<Record<SkillKey, number>>,
  dupes: Partial<Record<SkillKey, number>>, rng: () => number,
): Omit<GachaResolveOutput, 'guaranteed' | 'forced'> =>
  owned.includes(key) ? bumpOne(key, levels, dupes) : resolveNormally(key, owned, levels, dupes, rng);

/**
 * 1回ぶんの結果を決める。保証の回で通常の結果が昇格しなかった時だけ、次の順で強制する:
 *  ① 通常どおり抽選して昇格したらそのまま
 *  ② 抽選したスキルが上限未満で所持済みなら Lv+1
 *  ③ 同じレア度で、未所持か上限未満のスキルから選び直して 新規/+1
 *  ④ ほかのレア度から(現在の率の重みでレア度を選び、その中から均等に)
 *  全部上限なら保証は効かない(通常の返金のまま)。
 */
export const resolveGachaPull = (input: GachaResolveInput): GachaResolveOutput => {
  const { rolledKey, owned, levels, dupes, missStreak, pity } = input;
  const rng = input.rng ?? Math.random;
  const guaranteed = isGachaGuaranteedPull(missStreak);
  const normal = resolveNormally(rolledKey, owned, levels, dupes, rng);
  if (normal.promoted || !guaranteed) return { ...normal, guaranteed, forced: 'none' };

  // ②
  if (canGachaPromote(rolledKey, owned, levels)) {
    return { ...bumpOne(rolledKey, levels, dupes), guaranteed, forced: 'bump' };
  }
  // ③
  const rarity = SKILLS[rolledKey].rarity;
  const same = gachaPoolOf(rarity).filter(k => canGachaPromote(k, owned, levels));
  if (same.length) {
    return { ...grantOrBump(pick(same, rng), owned, levels, dupes, rng), guaranteed, forced: 'same-rarity' };
  }
  // ④
  const weights = rarityWeightsForPity(pity);
  const others = (['super', 'rare', 'normal'] as SkillRarity[])
    .filter(r => r !== rarity)
    .map(r => ({ r, pool: gachaPoolOf(r).filter(k => canGachaPromote(k, owned, levels)), w: weights[r] }))
    .filter(o => o.pool.length > 0);
  if (others.length) {
    const total = others.reduce((a, o) => a + Math.max(0, o.w), 0);
    let chosen = others[others.length - 1];
    if (total > 0) {
      let x = rng() * total;
      for (const o of others) { if (x < o.w) { chosen = o; break; } x -= o.w; }
    }
    return { ...grantOrBump(pick(chosen.pool, rng), owned, levels, dupes, rng), guaranteed, forced: 'other-rarity' };
  }
  // 全部上限=保証は効かない
  return { ...normal, guaranteed, forced: 'none' };
};
