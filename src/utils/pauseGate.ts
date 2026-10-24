// ★一時停止の門を1本に(コード監査2026-10-23 UI B-4/A-2・社長承認「一時停止ボタンの不具合」)。
//
// 旧: キーボード(Esc/P)は「窓が開いている間は切り替えない」を見ていたのに、指のピル(MobileControls)は
// `isPaused` を**無条件に反転**していた。レベルアップの窓は `showUpgradeMenu` が立ってから少し遅れて出るので、
// その間にピルを押すと `isPaused=false` のまま窓が出る=**動いているゲームの上にレベルアップ窓**になった。
// ピル・キーボード・パッドが同じこの1本を通る。

export interface PauseGateState {
  tutorialPopup: unknown | null;
  showUpgradeMenu: boolean;
  showShopMenu: boolean;
  showEventQuestMenu: boolean;
  storyReturnPromptVisible: boolean;
}

/** 手動の一時停止(切り替え)を受け付けてよいか。窓(説明/レベルアップ/店/クエスト/帰還の問い)が自分で止めている間は受け付けない。 */
export const canTogglePause = (s: PauseGateState): boolean =>
  s.tutorialPopup === null && !s.showUpgradeMenu && !s.showShopMenu && !s.showEventQuestMenu && !s.storyReturnPromptVisible;
