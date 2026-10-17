// 憲法第1条(PACING_REDESIGN.md): 画面内は基本10体。11〜20は「退屈シグナル」が出た時だけ解禁する
// 上振れバッファ。このファイルはその退屈シグナルの検出器(純関数)。
//
// 退屈 = 「かなりうまくて退屈している/何かの運で強くなりすぎて供給が追い付いていない」(社長定義)。
// 検出は Performance が高い状態が持続 かつ その間 Intensity が低いまま。ボーナスは段階的に増え
// (+2体ずつ)、Intensity が上がり始めたら【即】ゼロへ戻す(=心電図の下り)。
// 社長合意: まず叩き台で入れて、実プレイできつそうならすぐ戻す(?upswing=0 で無効化可)。
//
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

export interface BoredomState { boredMs: number; }

export const createBoredomState = (): BoredomState => ({ boredMs: 0 });

export const BORED_PERF_MIN = 0.8;        // これ以上のPerformanceで「余裕」
export const BORED_INTENSITY_MAX = 0.4;   // これ以下のIntensityで「危なげない」
export const BORED_RESET_INTENSITY = 0.6; // これ以上に上がったら即リセット(上振れ即解除)
// 実機フィードバック②(v0.25.1315): Performanceの初期値は「開始時=しばらく無被弾扱い+HP満タン」
// のため、ラン開始数秒で退屈判定に入り、buildup①(まばらな立ち上がり)を毎回8→18体の濁流にして
// いた。ランの立ち上がりは「退屈」ではないので、開始からこの時間は蓄積を始めない(グレース)。
export const BORED_RUN_GRACE_MS = 90000;  // ≒buildup①(0:00-1:35)の間
export const BORED_START_MS = 25000;      // 退屈がこの時間続いてから上振れ開始(叩き台: 25s)
export const BORED_STEP_MS = 10000;       // 以後この間隔で+BORED_STEP_BONUS体ずつ
export const BORED_STEP_BONUS = 2;
export const BORED_BONUS_MAX = 10;        // 基本10体 + 最大10 = 天井20(ENEMY_COUNT_CEIL)
// 蓄積の上限(これ以上溜めてもボーナスは増えない=解除後の再蓄積を素直にする)
const BORED_MS_CAP = BORED_START_MS + (BORED_BONUS_MAX / BORED_STEP_BONUS) * BORED_STEP_MS;

export const stepBoredom = (
  prev: BoredomState,
  input: { performance: number; intensity: number; dtMs: number; gameTimeMs?: number }
): BoredomState => {
  // ラン開始グレース: 立ち上がりを退屈と誤認しない(gameTimeMs省略時は従来どおり=既存テスト互換)。
  if (input.gameTimeMs !== undefined && input.gameTimeMs < BORED_RUN_GRACE_MS) return { boredMs: 0 };
  // 危険が戻ったら即解除(社長: 上がりすぎたら落とす)。
  if (input.intensity >= BORED_RESET_INTENSITY) return { boredMs: 0 };
  const bored = input.performance >= BORED_PERF_MIN && input.intensity <= BORED_INTENSITY_MAX;
  const boredMs = bored
    ? Math.min(BORED_MS_CAP, prev.boredMs + input.dtMs)
    : Math.max(0, prev.boredMs - input.dtMs * 2); // 条件を外れたら2倍速で減衰
  return { boredMs };
};

// 現在の上振れボーナス(通常湧き上限への加算体数)。boredStartMs未満は0。
// PACING_REDESIGN.mdバッチ6(ステージ難易度指数): 省略時はBORED_START_MS(25000ms)=従来と完全一致。
// stageAggro.tsの`boredStartMsForAggro`が算出した値を渡す(0.5で25000msに一致)。
export const boredomBonus = (boredMs: number, boredStartMs: number = BORED_START_MS): number => {
  if (boredMs < boredStartMs) return 0;
  const steps = Math.floor((boredMs - boredStartMs) / BORED_STEP_MS) + 1;
  return Math.min(BORED_BONUS_MAX, steps * BORED_STEP_BONUS);
};
