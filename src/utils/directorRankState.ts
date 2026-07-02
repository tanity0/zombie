// DirectorRank(難易度⑤)の「今この瞬間の効き目」を、ストア外の軽量シングルトンで共有する。
// aiDirectorDebug.ts と同じパターン: Zustand の per-frame set() 経由にしない(購読者を毎フレーム
// 起こさない・CLAUDE.mdのReact再描画規律)。useGameLoop が毎フレーム書き込み、gameStore.ts の
// キル報酬計算(dropEnemyXp)が同期的に読む。デバッグ表示(DirectorOverlay)用の内訳も同じ場所に置く。

import type { DirectorRank } from './directorRank';

let currentRewardMult = 1;

export const setDirectorRankRewardMult = (mult: number): void => {
  currentRewardMult = mult;
};

export const getDirectorRewardMult = (): number => currentRewardMult;

export interface DirectorRankDebug {
  rank: DirectorRank;
  phaseKey: string;
  escBoost: number;
  countCapBonus: number;
  rewardMult: number;
  harvestActive: boolean; // 現在HARVEST相当(buildupフェーズ)でEXP倍率が効いているか
  enabled: boolean;       // ?rank=0 で無効化されていないか(屋内/ラボ中も false)
}

let debugState: DirectorRankDebug | null = null;

export const setDirectorRankDebug = (d: DirectorRankDebug): void => {
  debugState = d;
};

export const getDirectorRankDebug = (): DirectorRankDebug | null => debugState;
