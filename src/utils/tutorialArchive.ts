// 「一度見たチュートリアル」の端末記憶(社長指示v0.25.2252「一度見たやつ資料室にまとめよう」)。
// 既読集合を1キーにまとめて持ち、資料室(操作記録)と発火ゲートの**両方がここを唯一の出どころ**にする。
// storyArchive(loadStoryArchive)と同じ方針: store購読はせず、必要な時に1回読む。

import type { TutorialId } from '../data/tutorials';

// v0.25.2846(社長確定): 本編チュートリアルは端末で一度だけ。訓練(M0)だけは教習ステージのため、
// useGameLoop側でこの既読ゲートを見ず毎出撃表示する別仕様を維持する。
export const TUTORIAL_ALWAYS_SHOW = false;

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

// **ゲーム中に出す/出さないの判定はこちらを使う**(資料室は loadSeenTutorials の方を使う)。
// 開発確認で一時的に true へ戻した場合だけ空集合を返す。製品設定は false=端末の既読を尊重する。
export const loadSeenForGate = (): Set<TutorialId> =>
  TUTORIAL_ALWAYS_SHOW ? new Set<TutorialId>() : loadSeenTutorials();

export const markTutorialSeen = (id: TutorialId): void => {
  try {
    const ids = loadSeenTutorials();
    ids.add(id);
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    /* 保存できなくても表示自体は成立する(次のランでまた出るだけ) */
  }
};
