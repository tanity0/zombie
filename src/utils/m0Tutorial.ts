// 訓練(M0)のチュートリアルの**発火条件**。本文は `src/data/tutorials.ts` の台帳。
//
// **M0は「ずっとチュートリアルが出る」ステージ**(社長指示v0.25.2266)。
// M2の2件(phill/scout)が「端末で1度だけ」なのに合わせて既読で止めるようにしたのは**取り違え**で、
// v0.25.2264で入れた既読ゲートは撤回した。M0では**出撃ごとに1回**必ず出す。
//  - 「出撃ごとに1回」の記憶は store の `tutorialPopupShown`(resetGameでリセット)を使う。
//    端末記憶(zombie:tutorialsSeen)は**見ない**。
//  - ただし表示時に既読の記録自体は書く(資料室の「操作記録」に載せるため)。これは showTutorialOnce 側の仕事。

export interface M0TutorialGate {
  shownThisRun: boolean; // この出撃で既に出したか(store の tutorialPopupShown)
  popupOpen: boolean;    // 別のポップアップが出ている(重ねない)
  menuOpen: boolean;     // ショップ/強化メニュー等が開いている(裏で出さない)
  gameTimeMs: number;
}

// 出すまでの待ち(ms)。開幕の登場演出とぶつけないための間。
export const M0_MOVE_TUTORIAL_AT_MS = 1200;

export const shouldShowMoveTutorial = (gate: M0TutorialGate): boolean =>
  gate.gameTimeMs >= M0_MOVE_TUTORIAL_AT_MS &&
  !gate.shownThisRun && !gate.popupOpen && !gate.menuOpen;
