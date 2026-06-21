import type { GameStats } from '../types/game';

// スコアは2系統(社長指示):
//  - totalScore = 青天井(cap無し)。ハイスコア表示/順位に使う。
//  - goldScore  = 各項目を換金MAXでクランプした合計。ゴールド = floor(goldScore / 2000)。
// 結果別の扱い: clearBonus は won のみ / speedBonus はラボ勝利のみ / その他(survival含む)は常に計上
//   = 死亡してもクリアボーナス以外は全部計算する。
export interface ResultScore {
  clearBonus: number;
  treasureScore: number;
  damageScore: number;    // 与ダメ(青天井表示値)
  finisherScore: number;  // KILL!(近接フィニッシュ)
  comboScore: number;     // 最大コンボ(50でゴールドMAX)
  eliteBossScore: number; // pumpkin/giantbat 撃破
  scrapScore: number;     // 残スクラップ(net)
  survivalScore: number;  // 被弾の少なさ
  speedBonus: number;     // ラボ勝利のみ
  totalScore: number;     // 青天井(ハイスコア用)
  goldScore: number;      // cap適用合計(換金用)
  goldEarned: number;     // floor(goldScore / 2000)
}

export const LAB_PAR_TIME_SEC = 480;          // ラボ基準タイム 8:00
export const SPEED_BONUS_PER_SEC = 100;       // 短縮1秒あたりの加点(ラボのみ)
export const TREASURE_SCORE_PER_VALUE = 5000; // トレジャー価値1あたり
export const CLEAR_BONUS = 30000;             // クリア時のフラット加点

// 換金MAX(ゴールド化のときだけ効く上限。スコアは青天井)。treasure/eliteBoss は cap 無し。
const GOLD_CAP_DAMAGE = 25000;
const GOLD_CAP_FINISHER = 25000;
const GOLD_CAP_COMBO = 15000;   // maxCombo*300 → 50コンボでMAX
const GOLD_CAP_SCRAP = 8000;

export const calculateResultScore = (
  stats: GameStats,
  won: boolean,
  isLab = false
): ResultScore => {
  const netScrap = Math.max(0, stats.strapsCollected - stats.strapsSpent);

  const clearBonus = won ? CLEAR_BONUS : 0;                       // won のみ
  const treasureScore = stats.treasuresCollected * TREASURE_SCORE_PER_VALUE;
  const damageScore = Math.floor(stats.damageDealt * 0.25);
  const finisherScore = stats.meleeFinishers * 800;
  const comboScore = stats.maxCombo * 300;
  const eliteBossScore = stats.eliteKills * 3000 + stats.bossKills * 8000;
  const scrapScore = netScrap * 20;
  const survivalScore = Math.max(0, 20000 - stats.damageTaken * 80); // 常に計上(死亡でも)
  const speedBonus = (won && isLab)
    ? Math.min(Math.max(0, LAB_PAR_TIME_SEC - stats.timeAlive) * SPEED_BONUS_PER_SEC, 20000)
    : 0;

  // 青天井(ハイスコア/表示)
  const totalScore =
    clearBonus + treasureScore + damageScore + finisherScore +
    comboScore + eliteBossScore + scrapScore + survivalScore + speedBonus;

  // 換金(各項目をMAXでクランプ。treasure/eliteBoss は cap 無し)
  const goldScore =
    clearBonus + treasureScore +
    Math.min(damageScore, GOLD_CAP_DAMAGE) +
    Math.min(finisherScore, GOLD_CAP_FINISHER) +
    Math.min(comboScore, GOLD_CAP_COMBO) +
    eliteBossScore +
    Math.min(scrapScore, GOLD_CAP_SCRAP) +
    survivalScore + speedBonus;

  return {
    clearBonus, treasureScore, damageScore, finisherScore, comboScore,
    eliteBossScore, scrapScore, survivalScore, speedBonus,
    totalScore, goldScore,
    goldEarned: Math.floor(goldScore / 2000),
  };
};
