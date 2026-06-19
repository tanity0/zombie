import type { GameStats } from '../types/game';

export interface ResultScore {
  damageScore: number;
  comboScore: number;
  treasureScore: number;
  strapScore: number;
  timeBonus: number;
  clearBonus: number;
  totalScore: number;
  goldEarned: number;
}

// 研究所(屋内)クリア専用の時間ボーナス。基準タイムからの短縮分を加点する
// (= 残り時間が多い=早くクリアしたほど高得点)。1秒=+150で固定。
export const LAB_PAR_TIME_SEC = 480;        // 基準タイム 8:00
export const LAB_TIME_BONUS_PER_SEC = 150;  // 短縮1秒あたりの加点
export const TREASURE_SCORE_PER_VALUE = 5000; // トレジャー価値1あたりのスコア
export const CLEAR_BONUS = 30000;             // クリア時のフラット加点(旧×3倍を廃止)

export const calculateResultScore = (
  stats: GameStats,
  won: boolean,
  indoor = false
): ResultScore => {
  const damageScore = Math.floor(stats.damageDealt * 0.5);
  const comboScore = stats.maxCombo * 500;
  const treasureScore = stats.treasuresCollected * TREASURE_SCORE_PER_VALUE; // 価値合計×5000
  const strapScore = Math.max(0, stats.strapsCollected - stats.strapsSpent) * 80;
  // 研究所をクリアしたときだけ、基準8分からの短縮分を加点(早いほど高い)。
  const timeBonus = (won && indoor)
    ? Math.max(0, Math.round((LAB_PAR_TIME_SEC - stats.timeAlive) * LAB_TIME_BONUS_PER_SEC))
    : 0;
  const clearBonus = won ? CLEAR_BONUS : 0; // ×3倍を廃止しフラット加算
  const baseScore = damageScore + comboScore + treasureScore + strapScore;
  const totalScore = baseScore + clearBonus + timeBonus;

  return {
    damageScore,
    comboScore,
    treasureScore,
    strapScore,
    timeBonus,
    clearBonus,
    totalScore,
    goldEarned: Math.floor(totalScore / 2000),
  };
};
