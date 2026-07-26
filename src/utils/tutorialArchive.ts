// 「一度見たチュートリアル」の端末記憶(社長指示v0.25.2252「一度見たやつ資料室にまとめよう」)。
// 既読集合を1キーにまとめて持ち、資料室(操作記録)と発火ゲートの**両方がここを唯一の出どころ**にする。
// storyArchive(loadStoryArchive)と同じ方針: store購読はせず、必要な時に1回読む。

import type { TutorialId } from '../data/tutorials';

// ===== 一時措置(社長指示v0.25.2256)=====================================
// 「チュートリアルは毎回見せて。できてるか見る手段がないから。完成したら一度見たら出ないに戻して」
// **完成したらここを false に戻すだけ**で「1度だけ」に戻る(他は何も変えなくてよい)。
// 記録(localStorage)自体は今まで通り残すので、**資料室の「操作記録」は正しく埋まっていく**。
// 毎回出るのは「出撃ごとに1回」。同じランで何度も出ることはない(refで1回に絞っているため)。
export const TUTORIAL_ALWAYS_SHOW = true;
// =======================================================================

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
// TUTORIAL_ALWAYS_SHOW が true の間は常に空集合を返す=毎回出る。記録は消さないので資料室は埋まる。
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
