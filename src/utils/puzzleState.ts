// PACING_PUZZLE.md バッチM2/M4のデバッグ表示用シングルトン。gatePressureState.ts/
// reliefProgramState.ts/gateProgramState.tsと同じパターン(Zustandのper-frame set()経由にしない)。
// useGameLoopが毎フレーム書き込み、DirectorOverlay(?director=1)が読む。読むだけ=挙動には一切影響しない。

export interface PuzzleDebug {
  rank: number;
  boardTarget: number;
  cap: number;
  tightened: boolean;
  softened: boolean; // M6 §3-D改訂: 全コマ常時の「多少緩め」が効いているか
  komaKind: 'relax' | 'harvest' | 'normal' | 'peak'; // M6 §4-C: 4コマサイクル
}

let debugState: PuzzleDebug | null = null;

export const setPuzzleDebug = (d: PuzzleDebug | null): void => {
  debugState = d;
};

export const getPuzzleDebug = (): PuzzleDebug | null => debugState;
