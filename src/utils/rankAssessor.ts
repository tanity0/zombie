// PACING_PUZZLE.md バッチM2: ランク査定+コマ内の盤面目標ランプ+リアルタイム緩急。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。
//
// 責務分離(実装精度の規律4): このファイルは「今の盤面目標・基本CD・ランクは何か」だけを扱う。
// 実際に何を湧かせるか(型の選び方・邪魔者/特別枠の構成)はscriptPuzzle.ts(M3)の責務。

export type PuzzleRank = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const BASE_CAP = 10;      // R1〜R6の盤面上限(憲法第1条: 基本10)
export const R7_CAP_MIN = 10;
export const R7_CAP_MAX = 20;    // 憲法第1条の天井20と一致
export const R7_CAP_STEP = 2;    // R7中の上限成長/縮小の刻み(叩き台)

export const clampRank = (r: number): PuzzleRank => Math.max(1, Math.min(7, Math.round(r))) as PuzzleRank;

// ---- 持続状態(コマをまたいで引き継ぐ) ----------------------------------------------------

export interface PuzzleClockState {
  rank: PuzzleRank;
  r7Cap: number;          // R7中だけ意味を持つ(10..20)。R1〜R6ではBASE_CAP固定。
  boardTarget: number;    // 盤面の目標数(コマをまたいで引き継ぐ・毎分リセットしない)
  belowTargetMs: number;  // 「盤面数<目標」の連続継続時間(ms)。追いついたら0へ(リアルタイム締めトリガー用)。
  msSinceRampMs: number;  // 直近の目標+1からの経過ms(ランプ間隔判定用)。
}

export const createPuzzleClockState = (): PuzzleClockState => ({
  rank: 1, r7Cap: R7_CAP_MIN, boardTarget: 1, belowTargetMs: 0, msSinceRampMs: 0,
});

export const capForState = (state: PuzzleClockState): number => (state.rank === 7 ? state.r7Cap : BASE_CAP);

// ---- 3-D: CD基準値(ランク別・叩き台) --------------------------------------------------

// R1=1.0s〜R6=0.25s。R7は0.1sだが、上限成長がR7_CAP_MAXに達したらCD0(最恐形)。
const CD_BASIS_MS: Record<PuzzleRank, number> = { 1: 1000, 2: 850, 3: 700, 4: 550, 5: 400, 6: 250, 7: 100 };

export const cdBasisForRank = (rank: PuzzleRank, r7Cap: number): number =>
  (rank === 7 && r7Cap >= R7_CAP_MAX) ? 0 : CD_BASIS_MS[rank];

// §0.5攻略性の原則: この基本CD(チャフの補充テンポ)は締め/成長でどこまでも縮められるが、
// 邪魔者・特別枠自体の投入CD(3秒・scriptPuzzle.ts側)は締めても絶対に縮めない(仕様どおり)。
export const cdBasisTightened = (rank: PuzzleRank, r7Cap: number): number => {
  if (rank === 7) return cdBasisForRank(7, r7Cap); // 最速帯なのでこれ以上締めようがない
  return cdBasisForRank(Math.min(7, rank + 1) as PuzzleRank, r7Cap);
};

// ---- 3-A/3-D: 毎フレームの目標ランプ+リアルタイム緩急 --------------------------------

export const RAMP_INTERVAL_NORMAL_MS = 6000;
export const RAMP_INTERVAL_TIGHT_MS = 4000;
export const RAMP_NO_HIT_HOLD_MS = 10000;   // 直近10秒に被弾があれば目標を増やさない(据え置き)
export const TIGHTEN_NO_HIT_MS = 15000;     // 締めトリガー: 直近15秒無被弾
export const TIGHTEN_PERF_MIN = 0.6;
export const TIGHTEN_STARVE_MS = 15000;     // 締めトリガー: 盤面<目標が15秒継続

export interface ClockTickInput {
  dtMs: number;
  msSinceLastHit: number; // 直近被弾からの経過ms(被弾した瞬間に0へ戻る前提・AIディレクター本体と同じ計測)
  perf: number;           // 0..1のパフォーマンス指標(AIディレクターのperformanceを想定)
  boardCount: number;     // 現在の盤面数(パズル管理下の敵のみ)
}

export interface ClockTickResult {
  state: PuzzleClockState;
  tightened: boolean; // このフレームが締め状態か(永続しない・毎回この入力から導出)
  cdMs: number;        // 実効基本CD(ms)。tightened時は1ランク上の基準値。
}

export const tickPuzzleClock = (state: PuzzleClockState, input: ClockTickInput): ClockTickResult => {
  const cap = capForState(state);
  const belowTargetMs = input.boardCount < state.boardTarget ? state.belowTargetMs + input.dtMs : 0;
  const tightened = input.msSinceLastHit >= TIGHTEN_NO_HIT_MS
    && (input.perf >= TIGHTEN_PERF_MIN || belowTargetMs >= TIGHTEN_STARVE_MS);
  const rampIntervalMs = tightened ? RAMP_INTERVAL_TIGHT_MS : RAMP_INTERVAL_NORMAL_MS;
  const canIncrease = input.msSinceLastHit >= RAMP_NO_HIT_HOLD_MS;

  let boardTarget = state.boardTarget;
  let msSinceRampMs = state.msSinceRampMs + input.dtMs;
  if (!canIncrease) {
    msSinceRampMs = 0; // 被弾直後は足踏み。無被弾に戻ってからフルの間隔を待つ。
  } else if (msSinceRampMs >= rampIntervalMs) {
    if (boardTarget < cap) boardTarget += 1;
    msSinceRampMs = 0;
  }

  const cdMs = tightened ? cdBasisTightened(state.rank, state.r7Cap) : cdBasisForRank(state.rank, state.r7Cap);
  return { state: { ...state, boardTarget, belowTargetMs, msSinceRampMs }, tightened, cdMs };
};

// ---- 3-B/3-C: コマ境界(60秒ごと)の査定 ------------------------------------------------

export interface KomaAssessmentInput {
  capReached: boolean; // コマ中にboardTargetが上限へ到達した瞬間があったか
  perfAvg: number;
  intensAvg: number;
  dmgRatio: number;    // このコマの被ダメ合計 ÷ maxHealth
  starveRatio: number; // このコマ中「盤面数<目標」だった時間の割合(0..1)
}

export type RankDelta = 1 | 0 | -1;

// 「上限体験に耐えるスコアなら昇格」の機械化。両方の条件が同時に成立し得る場合(高ダメージ域は
// 重ならないが、低dmgRatio×高intensAvgはあり得る)は降格側を優先する(第5条「ピンチに撃たない」の
// 精神=危険シグナルが出ている時は昇格させない安全側の判定順)。
export const assessKomaDelta = (input: KomaAssessmentInput): RankDelta => {
  if (input.dmgRatio >= 0.60 || input.intensAvg >= 0.85) return -1;
  if (input.capReached && input.dmgRatio < 0.35 && (input.perfAvg >= 0.45 || input.starveRatio >= 0.4)) return 1;
  return 0;
};

// R7中の解釈(実装精度の規律1に基づき明記・PACING_PUZZLE.md★未決事項にも記載): 「耐えられない」判定は
// まず上限を-2(下限10)で吸収し、上限が既に下限にいる状態でさらに耐えられない判定が出た時だけ
// 実際にR6へ降格する(「R7から降格したら上限は10に戻る」の文と、「耐えられない判定は-2体」の文の
// 両方を矛盾なく満たす読み)。新規にR7へ昇格した瞬間は上限を10からやり直す。
export const applyKomaAssessment = (state: PuzzleClockState, input: KomaAssessmentInput): PuzzleClockState => {
  const delta = assessKomaDelta(input);
  if (state.rank === 7) {
    if (delta === 1) return { ...state, r7Cap: Math.min(R7_CAP_MAX, state.r7Cap + R7_CAP_STEP) };
    if (delta === -1) {
      if (state.r7Cap > R7_CAP_MIN) return { ...state, r7Cap: Math.max(R7_CAP_MIN, state.r7Cap - R7_CAP_STEP) };
      return { ...state, rank: 6, r7Cap: R7_CAP_MIN, boardTarget: Math.min(state.boardTarget, BASE_CAP) };
    }
    return state;
  }
  const nextRank = clampRank(state.rank + delta);
  if (nextRank === 7) return { ...state, rank: nextRank, r7Cap: R7_CAP_MIN }; // state.rank!==7はここまでで確定済み
  return { ...state, rank: nextRank };
};

// ---- コマ集計(呼び出し側が毎フレーム足し込み、コマ境界でfinalizeしてapplyKomaAssessmentへ渡す) ----

export interface KomaAccumulatorState {
  perfMsSum: number;
  intensMsSum: number;
  weightMs: number;
  dmgTaken: number;
  capReached: boolean;
  belowTargetMsThisKoma: number;
  komaDurationMs: number;
}

export const createKomaAccumulator = (): KomaAccumulatorState => ({
  perfMsSum: 0, intensMsSum: 0, weightMs: 0, dmgTaken: 0, capReached: false, belowTargetMsThisKoma: 0, komaDurationMs: 0,
});

export interface KomaAccumulatorTickInput {
  dtMs: number;
  perf: number;
  intensity: number;
  dmgTakenThisFrame: number;
  boardCount: number;
  boardTarget: number;
  cap: number;
}

export const stepKomaAccumulator = (acc: KomaAccumulatorState, input: KomaAccumulatorTickInput): KomaAccumulatorState => ({
  perfMsSum: acc.perfMsSum + input.perf * input.dtMs,
  intensMsSum: acc.intensMsSum + input.intensity * input.dtMs,
  weightMs: acc.weightMs + input.dtMs,
  dmgTaken: acc.dmgTaken + Math.max(0, input.dmgTakenThisFrame),
  capReached: acc.capReached || input.boardTarget >= input.cap,
  belowTargetMsThisKoma: acc.belowTargetMsThisKoma + (input.boardCount < input.boardTarget ? input.dtMs : 0),
  komaDurationMs: acc.komaDurationMs + input.dtMs,
});

export const finalizeKomaAssessmentInput = (acc: KomaAccumulatorState, maxHealth: number): KomaAssessmentInput => {
  const dur = Math.max(1, acc.komaDurationMs);
  return {
    capReached: acc.capReached,
    perfAvg: acc.weightMs > 0 ? acc.perfMsSum / acc.weightMs : 0,
    intensAvg: acc.weightMs > 0 ? acc.intensMsSum / acc.weightMs : 0,
    dmgRatio: maxHealth > 0 ? acc.dmgTaken / maxHealth : 0,
    starveRatio: acc.belowTargetMsThisKoma / dur,
  };
};
