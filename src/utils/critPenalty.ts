// 社長決定: レア敵ほどクリが乗りにくい(色階層ペナルティ)。ネームドは対象外(社長決定2b)。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

import type { EnemyColorTier } from '../types/game';

export const CRIT_RATE_FLOOR = 0.05; // 素の初期クリ率(開始ナイフ knife-t1 = 5%)。レア敵でもこれ未満には下げない。

// レア色階層ごとのクリ率ペナルティ(絶対値・pp)。共通敵=0。順番に5%ずつ(社長決定)。
const COLOR_TIER_CRIT_PENALTY: Record<EnemyColorTier, number> = { blue: 0.05, purple: 0.10, red: 0.15 };

// 敵1体のクリ率ペナルティ。ネームドは対象外(社長決定2b)=常に0。
export const enemyCritPenalty = (enemy: { colorTier?: EnemyColorTier; isNamed?: boolean }): number =>
  enemy.isNamed ? 0 : (enemy.colorTier ? COLOR_TIER_CRIT_PENALTY[enemy.colorTier] : 0);

// baseCrit にペナルティを適用: 下限CRIT_RATE_FLOOR。ただし元々floor未満の攻撃にはクリを足さない
// (=baseを超えて増やさない)。→ min(base, max(FLOOR, base - penalty))。
export const applyEnemyCritPenalty = (
  baseCrit: number,
  enemy: { colorTier?: EnemyColorTier; isNamed?: boolean },
): number => Math.min(baseCrit, Math.max(CRIT_RATE_FLOOR, baseCrit - enemyCritPenalty(enemy)));
