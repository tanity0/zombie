// 訓練(M0)のチュートリアルの**発火条件**。
// CLAUDE.md「チュートリアルの作り方」の型に合わせて、M2(`labTutorial.ts`)と同じ形にしたもの
// (社長指示v0.25.2264「他のチュートリアルもあの形式で直して」)。
// 本文は `src/data/tutorials.ts` の台帳、既読は `src/utils/tutorialArchive.ts` が持つ。ここは条件だけ。
//
// 直した点(旧実装との違い):
//  - 旧: `!tutorialPopupShown && gameTime >= 1200` = **このランで出したか**しか見ておらず、
//        端末の既読記録(zombie:tutorialsSeen)を無視して毎ランで出ていた。M2の2件と挙動が食い違う。
//  - 新: 既読・他ポップアップ・メニューを M2 と同じゲートで見る(下の TutorialGate)。

import type { LabTutorialGate } from './labTutorial';

// 出すまでの待ち(ms)。開幕の登場演出とぶつけないための間。
export const M0_MOVE_TUTORIAL_AT_MS = 1200;

// M2側と同じ形のゲート(既読/他ポップアップ/メニュー)+ 経過時間。
export const shouldShowMoveTutorial = (
  gate: LabTutorialGate & { gameTimeMs: number },
): boolean =>
  gate.gameTimeMs >= M0_MOVE_TUTORIAL_AT_MS &&
  !gate.seen && !gate.popupOpen && !gate.menuOpen;
