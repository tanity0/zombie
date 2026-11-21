/**
 * 「寄り道」チュートリアル(tutorials.ts の 'detour-poi')の発火条件。
 * 社長指示2026-11-18: 拠点を初めて確保した時に出す。本編ステージは端末で1度だけ(既読は loadSeenForGate)。
 * 訓練(M0)には拠点が無いが、念のため明示的に出さない。
 */
export interface DetourTutorialGate {
  /** この出撃で、いずれかの拠点が確保(captured)されているか。 */
  anyBaseCaptured: boolean;
  /** 端末で既読か(loadSeenForGate 由来)。 */
  seen: boolean;
  /** 訓練(M0)ステージか。 */
  trainingStage: boolean;
  popupOpen: boolean;
  menuOpen: boolean;
  dialogueActive: boolean;
  /** ボスと交戦中か(戦闘の山場にゲームを止める説明を割り込ませない)。 */
  bossFight: boolean;
  /** アテンション(大型の登場演出等)の最中か。 */
  attention: boolean;
}

export const shouldShowDetourTutorial = (g: DetourTutorialGate): boolean =>
  g.anyBaseCaptured && !g.seen && !g.trainingStage &&
  !g.popupOpen && !g.menuOpen && !g.dialogueActive && !g.bossFight && !g.attention;
