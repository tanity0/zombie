// 社長決定: レア敵ほどクリが乗りにくい(色階層ペナルティ)。ネームド/ボス系は色階層を無視して
// 一律-10%に統一(社長決定・旧「ネームドは対象外」から変更)。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

import type { EnemyColorTier, EnemyType } from '../types/game';
import { isBossType } from './enemyUtils';

export const CRIT_RATE_FLOOR = 0.05; // 素の初期クリ率(開始ナイフ knife-t1 = 5%)。レア敵でもこれ未満には下げない。

// レア色階層ごとのクリ率ペナルティ(絶対値・pp)。共通敵=0。順番に3%ずつ(社長決定)。
const COLOR_TIER_CRIT_PENALTY: Record<EnemyColorTier, number> = { blue: 0.03, purple: 0.06, red: 0.09 };

// ネームド/ボス系の一律ペナルティ(色階層は無視)。
const NAMED_OR_BOSS_CRIT_PENALTY = 0.10;

// 敵1体のクリ率ペナルティ(pt減算方式)。ネームド or ボス系(isBossType)は色階層を無視して-10%に統一
// (社長決定)。それ以外は色階層ペナルティ、色階層も無ければ0。
// 【CRIT-UNIFY §9.1裁定③後の注意】ボス系の実際の適用は下のapplyEnemyCritPenaltyが先取りして
// ×0.5+下限5%へ切り替えた(このpt減算方式のままでは表現できないため)。この関数自体はネームド判定に
// 使われ続けるので、ボス分岐の戻り値(0.10)は「isNamedとの後方互換」目的で残置=挙動に影響しない
// (applyEnemyCritPenaltyがボスをここへ渡す前に分岐で処理するため、実際には呼ばれない)。
export const enemyCritPenalty = (enemy: { type?: EnemyType; colorTier?: EnemyColorTier; isNamed?: boolean }): number => {
  if (enemy.isNamed || (enemy.type && isBossType(enemy.type))) return NAMED_OR_BOSS_CRIT_PENALTY; // ネームド/ボス系は-10%で統一(社長決定)
  if (enemy.colorTier) return COLOR_TIER_CRIT_PENALTY[enemy.colorTier];
  return 0;
};

// CRIT-UNIFY §9.1(社長裁定③「クリティカル率減衰は1/2で」): ボスのクリ率は一律-10pt(旧方式)ではなく
// ×0.5+下限5%へ変更。ネームド(非ボス)/色階層の非ボス分岐は不変(裁定D)。
export const BOSS_CRIT_CHANCE_MULT = 0.5;

// baseCrit にペナルティを適用: 下限CRIT_RATE_FLOOR。ただし元々floor未満の攻撃にはクリを足さない
// (=baseを超えて増やさない)。→ min(base, max(FLOOR, base - penalty))。
// ボス(isBossType)だけは減算ではなく×BOSS_CRIT_CHANCE_MULT(半減)+同じ下限(CRIT-UNIFY §9.1)。
export const applyEnemyCritPenalty = (
  baseCrit: number,
  enemy: { type?: EnemyType; colorTier?: EnemyColorTier; isNamed?: boolean },
): number => {
  if (enemy.type && isBossType(enemy.type)) {
    return Math.min(baseCrit, Math.max(CRIT_RATE_FLOOR, baseCrit * BOSS_CRIT_CHANCE_MULT));
  }
  return Math.min(baseCrit, Math.max(CRIT_RATE_FLOOR, baseCrit - enemyCritPenalty(enemy)));
};

// CRIT-UNIFY §9.1(弾のクリ率化): Projectileはもう生成時にcrit(boolean)を抽選しない。代わりに
// critChance(数値)を運び、命中時にこの純関数で対象別の実効クリ率を求めて呼び出し側が
// `Math.random() < 実効クリ率` する。
// - 対象がボス(isBossType): applyEnemyCritPenaltyのボス分岐(×0.5+下限5%)をそのまま流用。
//   ネームド/色階層は渡さない=銃には掛けない(現状維持)。
// - 対象が通常敵: critChanceそのまま(=従来の生成時抽選と統計的に同一・挙動不変)。
export const projectileHitCritChance = (
  critChance: number,
  enemy: { type?: EnemyType },
): number => (enemy.type && isBossType(enemy.type))
  ? applyEnemyCritPenalty(critChance, { type: enemy.type })
  : critChance;
