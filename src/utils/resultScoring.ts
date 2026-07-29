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
// 被弾スコア(survivalScore)が満額になるまでの生存時間(社長決定v0.25.1992)。開始60秒は0→満額へ線形ランプ。
// 狙い: 「何もしない超短時間ラン(被弾0=満額20000→10G)」の穴を塞ぐ。survivalScore自体を時間スケールするので
// totalScore(ハイスコア)・goldScore(換金)の両方に等しく効く。
export const SURVIVAL_RAMP_SEC = 60;
export const TREASURE_SCORE_PER_VALUE = 5000; // トレジャー価値1あたり
export const CLEAR_BONUS = 30000;             // クリア時のフラット加点
// BOT_AND_GHOST.md §2.7 制約2(G3): 守護霊(ゴースト)が一度でも実際に召喚されたランはスコア1/2
// (倍率は叩き台・社長調整)。対象は **totalScore(ハイスコア表示/順位)のみ**——狙いが
// 「誇りを差し出す/スコアランキングを汚染しない」なので、換金(goldScore/goldEarned)には掛けない。
export const GHOST_SCORE_MULT = 0.5;

// 換金MAX(ゴールド化のときだけ効く上限。スコアは青天井)。treasure/eliteBoss は cap 無し。
const GOLD_CAP_DAMAGE = 25000;
const GOLD_CAP_FINISHER = 25000;
const GOLD_CAP_COMBO = 15000;   // maxCombo*300 → 50コンボでMAX
const GOLD_CAP_SCRAP = 8000;

export const calculateResultScore = (
  stats: GameStats,
  won: boolean,
  isLab = false,
  // G3: このランで守護霊(ゴースト)が一度でも召喚されたか(store.ghostSummonedThisRun)。
  // スコアの合流点はこの関数1箇所なので、×0.5もここでだけ掛ける(散在させない)。
  ghostSummoned = false
): ResultScore => {
  const netScrap = Math.max(0, stats.strapsCollected - stats.strapsSpent);

  // すべて整数化(damageTaken/timeAlive は小数なので、丸めないと総スコアに小数が9桁出る=社長報告)。
  const clearBonus = won ? CLEAR_BONUS : 0;                       // won のみ
  const treasureScore = stats.treasuresCollected * TREASURE_SCORE_PER_VALUE;
  const damageScore = Math.floor(stats.damageDealt * 0.25);
  const finisherScore = stats.meleeFinishers * 800;
  const comboScore = stats.maxCombo * 300;
  const eliteBossScore = stats.eliteKills * 3000 + stats.bossKills * 8000;
  const scrapScore = Math.floor(netScrap) * 20;
  // 被弾の少なさ(常に計上・死亡でも)。ただし開始60秒は0→満額へランプ=何もしない超短時間ランで満額入る穴を塞ぐ(社長決定v0.25.1992)。
  const survivalBase = Math.max(0, 20000 - stats.damageTaken * 80);
  const survivalRamp = Math.max(0, Math.min(1, stats.timeAlive / SURVIVAL_RAMP_SEC));
  const survivalScore = Math.round(survivalBase * survivalRamp);
  const speedBonus = (won && isLab)
    ? Math.round(Math.min(Math.max(0, LAB_PAR_TIME_SEC - stats.timeAlive) * SPEED_BONUS_PER_SEC, 20000))
    : 0;

  // 青天井(ハイスコア/表示)。全項目が整数なので整数になるが、念のため丸める(小数表示の再発防止)。
  // G3(§2.7 制約2): 守護霊が発動したランは×0.5(発動していなければ完全不変)。
  const totalScore = Math.round(
    (clearBonus + treasureScore + damageScore + finisherScore +
    comboScore + eliteBossScore + scrapScore + survivalScore + speedBonus)
    * (ghostSummoned ? GHOST_SCORE_MULT : 1));

  // 換金(各項目をMAXでクランプ。treasure/eliteBoss は cap 無し)
  const goldScore = Math.round(
    clearBonus + treasureScore +
    Math.min(damageScore, GOLD_CAP_DAMAGE) +
    Math.min(finisherScore, GOLD_CAP_FINISHER) +
    Math.min(comboScore, GOLD_CAP_COMBO) +
    eliteBossScore +
    Math.min(scrapScore, GOLD_CAP_SCRAP) +
    survivalScore + speedBonus);

  return {
    clearBonus, treasureScore, damageScore, finisherScore, comboScore,
    eliteBossScore, scrapScore, survivalScore, speedBonus,
    totalScore, goldScore,
    goldEarned: Math.floor(goldScore / 2000),
  };
};

// PACING_PUZZLE.md §5.19 バッチM18②: リザルトの「一番効いた項目」= scoreItems の argmax。
// 同点は先勝ち(配列の先の要素を優先)。空配列は null。レンダラ非依存の純関数。
export interface LabeledValue {
  label: string;
  value: number;
}

export const topScoreItem = <T extends LabeledValue>(items: T[]): T | null => {
  let best: T | null = null;
  for (const item of items) {
    if (best === null || item.value > best.value) best = item;
  }
  return best;
};
