// 「武器商人」チュートリアル('merchant')の発火条件。
import { describe, it, expect } from 'vitest';
import { shouldShowMerchantTutorial, isInsideMerchantCircle, type MerchantTutorialGate } from './merchantTutorial';
import { getTutorial, STAGE1_GUIDE_SLIDES } from '../data/tutorials';

const gate = (over: Partial<MerchantTutorialGate> = {}): MerchantTutorialGate => ({
  inMerchantCircle: true, merchantHidden: false, facilitiesLocked: false, seen: false, trainingStage: false,
  popupOpen: false, menuOpen: false, dialogueActive: false, attention: false, ...over,
});

describe('武器商人のチュートリアル — 発火条件', () => {
  it('サークルに入っていて、未読で、何も開いていなければ出す', () => {
    expect(shouldShowMerchantTutorial(gate())).toBe(true);
  });
  it('サークルの外では出さない', () => {
    expect(shouldShowMerchantTutorial(gate({ inMerchantCircle: false }))).toBe(false);
  });
  it('商人がまだ居ない/施設ロック中は出さない(取引が開かない間)', () => {
    expect(shouldShowMerchantTutorial(gate({ merchantHidden: true }))).toBe(false);
    expect(shouldShowMerchantTutorial(gate({ facilitiesLocked: true }))).toBe(false);
  });
  it('既読・訓練(M0)では出さない', () => {
    expect(shouldShowMerchantTutorial(gate({ seen: true }))).toBe(false);
    expect(shouldShowMerchantTutorial(gate({ trainingStage: true }))).toBe(false);
  });
  it('ポップアップ・メニュー(取引中を含む)・会話・アテンションに重ねない', () => {
    expect(shouldShowMerchantTutorial(gate({ popupOpen: true }))).toBe(false);
    expect(shouldShowMerchantTutorial(gate({ menuOpen: true }))).toBe(false);
    expect(shouldShowMerchantTutorial(gate({ dialogueActive: true }))).toBe(false);
    expect(shouldShowMerchantTutorial(gate({ attention: true }))).toBe(false);
  });
  it('サークルの内外(縁ちょうどは中)', () => {
    const m = { x: 100, y: 100, radius: 50 };
    expect(isInsideMerchantCircle(100, 100, m)).toBe(true);
    expect(isInsideMerchantCircle(150, 100, m)).toBe(true);
    expect(isInsideMerchantCircle(151, 100, m)).toBe(false);
    expect(isInsideMerchantCircle(100, 100, { x: 100, y: 100, radius: 0 })).toBe(false);
  });
});

describe('武器商人のチュートリアル — 台帳', () => {
  it('題は「武器商人」・本文は3行・映像待ちの1枚', () => {
    const t = getTutorial('merchant');
    expect(t?.title).toBe('武器商人');
    expect(t?.lines).toHaveLength(3);
    expect(t?.slides).toHaveLength(1);
    expect(t?.slides?.[0].mediaPending).toBe(true);
    expect(t?.slides?.[0].lines).toEqual(t?.lines);
  });
  it('フィールドガイドからは外した(同じ文を2回見せない)', () => {
    expect(STAGE1_GUIDE_SLIDES.some(s => s.title === '武器商人')).toBe(false);
  });
});
