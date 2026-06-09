import type { GameStats } from '../types/game';

export interface ResultScore {
  damageScore: number;
  comboScore: number;
  treasureScore: number;
  strapScore: number;
  clearMultiplier: number;
  totalScore: number;
  goldEarned: number;
}

export const calculateResultScore = (stats: GameStats, won: boolean): ResultScore => {
  const damageScore = Math.floor(stats.damageDealt * 0.5);
  const comboScore = stats.maxCombo * 500;
  const treasureScore = stats.treasuresCollected * 10000;
  const strapScore = Math.max(0, stats.strapsCollected - stats.strapsSpent) * 80;
  const clearMultiplier = won ? 3 : 1;
  const baseScore = damageScore + comboScore + treasureScore + strapScore;
  const totalScore = baseScore * clearMultiplier;

  return {
    damageScore,
    comboScore,
    treasureScore,
    strapScore,
    clearMultiplier,
    totalScore,
    goldEarned: Math.floor(totalScore / 3000),
  };
};
