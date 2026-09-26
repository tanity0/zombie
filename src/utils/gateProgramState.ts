// PACING_REDESIGN.mdバッチ5のデバッグ表示用シングルトン。reliefProgramState.ts/gatePressureState.tsと
// 同じパターン(Zustandのper-frame set()経由にしない)。useGameLoopが毎フレーム書き込み、
// DirectorOverlay(?director=1)が読む。読むだけ=挙動には一切影響しない。

import type { GateProgramId } from './gateProgram';

export interface GateProgramDebug {
  id: GateProgramId;
  maxRung: number;
}

let debugState: GateProgramDebug | null = null;

export const setGateProgramDebug = (d: GateProgramDebug | null): void => {
  debugState = d;
};

export const getGateProgramDebug = (): GateProgramDebug | null => debugState;
