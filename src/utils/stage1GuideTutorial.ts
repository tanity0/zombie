/** ステージ1開始時に一度だけ出す、複数ページのフィールドガイド発火条件。 */
export const STAGE1_GUIDE_STAGE_ID = 'stage-1';

/** 登場演出と衝突させず、開始時の会話が終わり次第すぐ出せる最小待ち。 */
export const STAGE1_GUIDE_AT_MS = 1200;

export interface Stage1GuideGate {
  stageId: string;
  seen: boolean;
  popupOpen: boolean;
  menuOpen: boolean;
  dialogueActive: boolean;
  gameTimeMs: number;
}

export const shouldShowStage1Guide = (gate: Stage1GuideGate): boolean =>
  gate.stageId === STAGE1_GUIDE_STAGE_ID &&
  gate.gameTimeMs >= STAGE1_GUIDE_AT_MS &&
  !gate.seen && !gate.popupOpen && !gate.menuOpen && !gate.dialogueActive;

