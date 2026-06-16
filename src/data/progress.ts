// キャンペーン進行(クリア済みステージ / 直近に選んだステージ)の保存。
// ゲームロジックには触れず localStorage だけで完結させる(導線の解放制御用)。
// メインミッションをクリアすると次ステージが解放される。EX は前提ステージのクリアで解放。

import { STAGES, type Stage } from './campaign';

const CLEARED_KEY = 'zombie.progress.cleared';
const SELECTED_KEY = 'zombie.progress.selectedStage';

const readSet = (): Set<string> => {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(CLEARED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
};

const writeSet = (set: Set<string>): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CLEARED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore (quota / private mode) */
  }
};

export const getClearedStages = (): Set<string> => readSet();

export const markStageCleared = (stageId: string): void => {
  if (!stageId) return;
  const set = readSet();
  if (set.has(stageId)) return;
  set.add(stageId);
  writeSet(set);
};

// 前提ステージ(unlockBy)がクリア済みなら解放。最初のステージ(unlockBy=null)は常に解放。
export const isStageUnlocked = (stage: Stage, cleared: Set<string> = readSet()): boolean =>
  stage.unlockBy === null || cleared.has(stage.unlockBy);

export const getSelectedStageId = (): string => {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(SELECTED_KEY) ?? '';
  } catch {
    return '';
  }
};

export const setSelectedStageId = (stageId: string): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (stageId) localStorage.setItem(SELECTED_KEY, stageId);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    /* ignore */
  }
};

// 開発用: 全ステージ解放 / 進行リセット。
export const unlockAllStages = (): void => writeSet(new Set(STAGES.map(s => s.id)));
export const resetProgress = (): void => {
  writeSet(new Set());
  setSelectedStageId('');
};
