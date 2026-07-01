// 難易度⑤: DirectorRank(台本 + 前フェーズ評価)。
//
// 社長合意の方式: 15分の大枠フェーズ(difficultyDirector.ts)は固定の台本のまま、各フェーズが
// 終わるたびに「直前フェーズの成績」を評価し、次フェーズ“だけ”を少し強め・報酬多めにする。
// リアルタイム(今このフレーム)には盛らない=「今うまいから今すぐ敵を増やす」はしない、次の山に
// 反映するだけ。逆に今きつい時のブレーキは既存の AI ディレクター RELAX 側の役目(ここでは扱わない)。
//
// 社長指示: 「下限は緩めない」= 苦戦してもフェーズ台本の値(rank=0)より弱くはしない。Rank は
// 0(台本通り)を下限として、良い成績の時だけ底上げする片方向のノブ。
//
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

export type DirectorRank = 0 | 1 | 2;

export interface PhasePerformanceInput {
  durationMs: number;  // フェーズの実経過時間(ms)
  damageTaken: number; // フェーズ中に受けた被ダメージ合計(gameStats.damageTaken の差分)
  hpFracEnd: number;   // フェーズ終了時点のHP残量(0-1)
  kills: number;       // フェーズ中の撃破数(gameStats.enemiesKilled の差分)
  levelGained: number; // フェーズ中に得たレベル数(player.level の差分)
}

// 各指標を 0(悪い)〜1(良い) へ正規化する基準値(私案・実機調整前提)。
const DMG_RATE_BAD = 6;         // 被弾/秒がこれ以上で dmgScore=0
const KILL_RATE_GOOD = 0.5;     // 撃破/秒がこれ以上で killScore=1
const LEVEL_RATE_GOOD = 1 / 60; // 60秒に1レベルのペースで levelScore=1

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// パフォーマンス評価(0=きつい〜1=絶好調)。前フェーズの実測値のみから算出(現在の Intensity には依存しない
// =AIディレクター本体(まだ既定OFFの実験段階)が動いていなくても独立して機能する)。
export const evaluatePhasePerformance = (s: PhasePerformanceInput): number => {
  const durationS = Math.max(1, s.durationMs / 1000);
  const hpScore = clamp01(s.hpFracEnd);
  const dmgScore = clamp01(1 - (s.damageTaken / durationS) / DMG_RATE_BAD);
  const killScore = clamp01((s.kills / durationS) / KILL_RATE_GOOD);
  const levelScore = clamp01((s.levelGained / durationS) / LEVEL_RATE_GOOD);
  return hpScore * 0.35 + dmgScore * 0.30 + killScore * 0.20 + levelScore * 0.15;
};

const RANK1_THRESHOLD = 0.62;
const RANK2_THRESHOLD = 0.82;

export const rankFromPerformance = (score: number): DirectorRank => {
  if (score >= RANK2_THRESHOLD) return 2;
  if (score >= RANK1_THRESHOLD) return 1;
  return 0;
};

export interface RankAdjust {
  escBoost: number;      // spawnEsc(戦力連動escalation)への上乗せ。rank=0は0=台本通り。
  countCapBonus: number; // 通常湧き上限への加算(頭数)。
  rewardMult: number;    // HARVEST(buildupフェーズ)でのEXP倍率。
}

const RANK_ADJUST: Record<DirectorRank, RankAdjust> = {
  0: { escBoost: 0,    countCapBonus: 0, rewardMult: 1.00 },
  1: { escBoost: 0.12, countCapBonus: 1, rewardMult: 1.08 },
  2: { escBoost: 0.22, countCapBonus: 2, rewardMult: 1.15 },
};

export const rankAdjustFor = (rank: DirectorRank): RankAdjust => RANK_ADJUST[rank];
