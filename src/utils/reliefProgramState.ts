// PACING_REDESIGN.mdバッチ4のデバッグ表示用シングルトン。gatePressureState.tsと同じパターン
// (Zustandのper-frame set()経由にしない)。useGameLoopが毎フレーム書き込み、
// DirectorOverlay(?director=1)が読む。読むだけ=挙動には一切影響しない。

import type { ReliefProgramId } from './reliefProgram';

export interface ReliefProgramDebug {
  id: ReliefProgramId;
  lessonSpawned: boolean;
}

let debugState: ReliefProgramDebug | null = null;

export const setReliefProgramDebug = (d: ReliefProgramDebug | null): void => {
  debugState = d;
};

export const getReliefProgramDebug = (): ReliefProgramDebug | null => debugState;
