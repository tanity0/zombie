// ピンチ救済(難易度⑥)の「今この瞬間の効き目」をストア外の軽量シングルトンで共有する。
// directorRankState.ts と同じパターン(Zustand の per-frame set() を増やさない)。
// useGameLoop が毎フレーム書き込み、gameStore.ts の dropBreakablePropLoot が同期的に読む。

import { BASE_DROP_TUNING, type PityDropTuning } from './pityDirector';

let currentTuning: PityDropTuning = BASE_DROP_TUNING;
let currentLevel = 0;

export const setPityDrop = (tuning: PityDropTuning, level: number): void => {
  currentTuning = tuning;
  currentLevel = level;
};

export const getPityDropTuning = (): PityDropTuning => currentTuning;
export const getPityLevel = (): number => currentLevel;

export const resetPityDrop = (): void => {
  currentTuning = BASE_DROP_TUNING;
  currentLevel = 0;
};
