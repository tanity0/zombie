// SKILL_BUILD_REDESIGN.md §24: 覚醒(スキルLv3到達)カットイン帯の尺。
// gameStore.ts(selectUpgrade側の多重発火デバウンス判定)とDOM(AwakenCutin.tsx)が
// 同じ1本の定数を引く(BossCutinのattentionCutin.tsと同じ型)。
// 「表示中もゲームは止めない」演出なので、attentionのような凍結/尺管理は持たない=定数のみ。

/** 帯の総表示尺(社長発注 §24-1「約1.2秒」)。フェードイン+ホールド+フェードアウトの合計。 */
export const AWAKEN_CUTIN_MS = 1200;
export const AWAKEN_CUTIN_FADEIN_MS = 220;
export const AWAKEN_CUTIN_FADEOUT_MS = 260;
export const AWAKEN_CUTIN_HOLD_MS = AWAKEN_CUTIN_MS - AWAKEN_CUTIN_FADEIN_MS - AWAKEN_CUTIN_FADEOUT_MS;
