// PACING_REDESIGN.mdバッチ3(最小版)のデバッグ表示用シングルトン。directorRankState.tsと同じ
// パターン(Zustandのper-frame set()経由にしない)。useGameLoopが毎フレーム書き込み、
// DirectorOverlay(?director=1)が読む。読むだけ=挙動には一切影響しない。

import type { ProblemChild } from './gatePressure';

export interface GatePressureDebug {
  pressure: number;
  ceiling: number;
  allowed: ProblemChild[];
}

let debugState: GatePressureDebug | null = null;

export const setGatePressureDebug = (d: GatePressureDebug | null): void => {
  debugState = d;
};

export const getGatePressureDebug = (): GatePressureDebug | null => debugState;
