// DirectorRank(難易度⑤)の「今この瞬間の効き目」を、ストア外の軽量シングルトンで共有する。
// aiDirectorDebug.ts と同じパターン: Zustand の per-frame set() 経由にしない(購読者を毎フレーム
// 起こさない・CLAUDE.mdのReact再描画規律)。useGameLoop が毎フレーム書き込み、gameStore.ts の
// キル報酬計算(dropEnemyXp)が同期的に読む。

let currentRewardMult = 1;

export const setDirectorRankRewardMult = (mult: number): void => {
  currentRewardMult = mult;
};

export const getDirectorRewardMult = (): number => currentRewardMult;
