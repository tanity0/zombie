import { describe, expect, it } from 'vitest';
import { STAGE1_GUIDE_SLIDES, getTutorial } from '../data/tutorials';
import { shouldShowStage1Guide, STAGE1_GUIDE_AT_MS, STAGE1_GUIDE_STAGE_ID } from './stage1GuideTutorial';

const READY = {
  stageId: STAGE1_GUIDE_STAGE_ID,
  seen: false,
  popupOpen: false,
  menuOpen: false,
  dialogueActive: false,
  gameTimeMs: STAGE1_GUIDE_AT_MS,
};

describe('shouldShowStage1Guide', () => {
  it('ステージ1開始時の待ちを過ぎたら出す', () => {
    expect(shouldShowStage1Guide(READY)).toBe(true);
  });

  it('ステージ1以外と開始待ちより前では出さない', () => {
    expect(shouldShowStage1Guide({ ...READY, stageId: 'stage-2' })).toBe(false);
    expect(shouldShowStage1Guide({ ...READY, gameTimeMs: STAGE1_GUIDE_AT_MS - 1 })).toBe(false);
  });

  it('端末で既読なら二度と出さない', () => {
    expect(shouldShowStage1Guide({ ...READY, seen: true })).toBe(false);
  });

  it('会話・別ポップアップ・メニューへ割り込まない', () => {
    expect(shouldShowStage1Guide({ ...READY, popupOpen: true })).toBe(false);
    expect(shouldShowStage1Guide({ ...READY, menuOpen: true })).toBe(false);
    expect(shouldShowStage1Guide({ ...READY, dialogueActive: true })).toBe(false);
  });
});

describe('stage1-guide tutorial data', () => {
  it('武器商人・拠点・目的の3ページを順番どおり持つ', () => {
    expect(STAGE1_GUIDE_SLIDES.map(slide => slide.title)).toEqual(['武器商人', '拠点', '目的']);
    expect(getTutorial('stage1-guide')?.slides).toBe(STAGE1_GUIDE_SLIDES);
  });

  it('全ページが後日動画を差し込める待機枠になっている', () => {
    expect(STAGE1_GUIDE_SLIDES).toHaveLength(3);
    for (const slide of STAGE1_GUIDE_SLIDES) {
      expect(slide.lines.join('').length).toBeGreaterThan(20);
      expect(slide.img).toBeUndefined();
      expect(slide.mediaPending).toBe(true);
    }
  });
});

