// 寄り道POI(PACING_PUZZLE.md §6.24-UX 裁定c)のチュートリアル1枚の**発火条件**。
// 本文は `src/data/tutorials.ts` の台帳(id: 'detour-poi')。表示は既存の showTutorialPopup を流用。
//
// 社長裁定(§6.24-UX):「M1来た時に一度だけ」= **M1(stage-1)の初出撃時に表示・端末で1度だけ**
// (本編ステージ扱い=既読は tutorialArchive の loadSeenForGate を見る。M0の「毎出撃」型ではない)。
//
// このファイルは純関数のみ(renderer非依存・storeにもPixiにも依存しない)。判定を useGameLoop に
// 直書きしないための切り出し(CLAUDE.md 実装精度の規律4)。

/** 出す対象のステージ(M1=狂い咲きの森)。 */
export const DETOUR_POI_TUTORIAL_STAGE_ID = 'stage-1';

/** 出すまでの待ち(ms)。開幕の登場演出とぶつけないための間(M0の移動チュートリアルと同じ考え方)。 */
export const DETOUR_POI_TUTORIAL_AT_MS = 1200;

export interface DetourPoiTutorialGate {
  stageId: string;         // この出撃のステージid(getSelectedStageId)
  poiPresent: boolean;     // この出撃に寄り道POIが立っているか(立たない出撃では説明しない)
  seen: boolean;           // この端末で表示済みか(loadSeenForGate)
  popupOpen: boolean;      // 別のポップアップが出ている(重ねない)
  menuOpen: boolean;       // ショップ/強化メニュー等が開いている(裏で出さない)
  dialogueActive: boolean; // 出撃時の会話/通信が流れている(割り込まない=流れ終わってから出す)
  gameTimeMs: number;
}

export const shouldShowDetourPoiTutorial = (gate: DetourPoiTutorialGate): boolean =>
  gate.stageId === DETOUR_POI_TUTORIAL_STAGE_ID &&
  gate.poiPresent &&
  gate.gameTimeMs >= DETOUR_POI_TUTORIAL_AT_MS &&
  !gate.seen && !gate.popupOpen && !gate.menuOpen && !gate.dialogueActive;
