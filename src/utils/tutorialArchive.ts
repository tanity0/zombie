// 「一度見たチュートリアル」の端末記憶(社長指示v0.25.2252「一度見たやつ資料室にまとめよう」)。
// 既読集合を1キーにまとめて持ち、資料室(操作記録)と発火ゲートの**両方がここを唯一の出どころ**にする。
// storyArchive(loadStoryArchive)と同じ方針: store購読はせず、必要な時に1回読む。

import type { TutorialId } from '../data/tutorials';

const KEY = 'zombie:tutorialsSeen';

// v0.25.2251 で先に入れた話題別キー。既に見た人の記録を落とさないため、初回読み込み時に取り込む。
const LEGACY_KEYS: Partial<Record<TutorialId, string>> = {
  phill: 'zombie:tut:lab-phill',
  scout: 'zombie:tut:lab-scout',
};

const readRaw = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

// 既読のチュートリアルidの集合。localStorageが使えない環境では常に空(=チュートリアルは毎回出るが、
// 資料室が空になるだけで壊れはしない)。
export const loadSeenTutorials = (): Set<TutorialId> => {
  const ids = new Set(readRaw() as TutorialId[]);
  // 旧キーの取り込み(1度取り込めば新キー側に載るので、以後は読むだけ)。
  for (const [id, legacy] of Object.entries(LEGACY_KEYS) as [TutorialId, string][]) {
    try {
      if (localStorage.getItem(legacy) === '1') ids.add(id);
    } catch {
      /* 読めなければ無視 */
    }
  }
  return ids;
};

export const hasSeenTutorial = (id: TutorialId): boolean => loadSeenTutorials().has(id);

export const markTutorialSeen = (id: TutorialId): void => {
  try {
    const ids = loadSeenTutorials();
    ids.add(id);
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    /* 保存できなくても表示自体は成立する(次のランでまた出るだけ) */
  }
};
