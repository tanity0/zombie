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

// 敵1体のクリ率ペナルティ。ネームド or ボス系(isBossType)は色階層を無視して-10%に統一
// (社長決定)。それ以外は色階層ペナルティ、色階層も無ければ0。
export const enemyCritPenalty = (enemy: { type?: EnemyType; colorTier?: EnemyColorTier; isNamed?: boolean }): number => {
  if (enemy.isNamed || (enemy.type && isBossType(enemy.type))) return NAMED_OR_BOSS_CRIT_PENALTY; // ネームド/ボス系は-10%で統一(社長決定)
  if (enemy.colorTier) return COLOR_TIER_CRIT_PENALTY[enemy.colorTier];
  return 0;
};

// baseCrit にペナルティを適用: 下限CRIT_RATE_FLOOR。ただし元々floor未満の攻撃にはクリを足さない
// (=baseを超えて増やさない)。→ min(base, max(FLOOR, base - penalty))。
export const applyEnemyCritPenalty = (
  baseCrit: number,
  enemy: { type?: EnemyType; colorTier?: EnemyColorTier; isNamed?: boolean },
): number => Math.min(baseCrit, Math.max(CRIT_RATE_FLOOR, baseCrit - enemyCritPenalty(enemy)));
