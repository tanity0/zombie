// PACING_PUZZLE.md バッチM2/M4のデバッグ表示用シングルトン。gatePressureState.ts/
// reliefProgramState.ts/gateProgramState.tsと同じパターン(Zustandのper-frame set()経由にしない)。
// useGameLoopが毎フレーム書き込み、DirectorOverlay(?director=1)が読む。読むだけ=挙動には一切影響しない。

export interface PuzzleDebug {
  rank: number;
  boardTarget: number;
  cap: number;
  tightened: boolean;
  komaKind: 'normal' | 'relax' | 'harvest';
}

let debugState: PuzzleDebug | null = null;

export const setPuzzleDebug = (d: PuzzleDebug | null): void => {
  debugState = d;
};

export const getPuzzleDebug = (): PuzzleDebug | null => debugState;
