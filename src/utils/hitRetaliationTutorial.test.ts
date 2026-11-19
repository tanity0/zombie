// 「レッドカウンター」チュートリアル('hit-retaliation')の発火条件と、閉じた後の窓の開き直し。
import { describe, it, expect } from 'vitest';
import { shouldShowRetaliationTutorial, reopenRetaliationWindowAfterTutorial, type RetaliationTutorialGate } from './hitRetaliationTutorial';
import { RETALIATE_WINDOW_MS, isRetaliationWindowOpen } from './hitRetaliation';
import { getTutorial } from '../data/tutorials';

const gate = (over: Partial<RetaliationTutorialGate> = {}): RetaliationTutorialGate => ({
  arrowShown: true, seen: false, trainingStage: false,
  popupOpen: false, menuOpen: false, dialogueActive: false, attention: false, ...over,
});

describe('レッドカウンターのチュートリアル — 発火条件', () => {
  it('台帳の題は「レッドカウンター」', () => {
    expect(getTutorial('hit-retaliation')?.title).toBe('レッドカウンター');
  });
  it('矢印が出ていて、未読で、何も開いていなければ出す', () => {
    expect(shouldShowRetaliationTutorial(gate())).toBe(true);
  });
  it('矢印が出ていない(窓が無い/反撃できない状態)なら出さない', () => {
    expect(shouldShowRetaliationTutorial(gate({ arrowShown: false }))).toBe(false);
  });
  it('既読なら出さない(端末で1度だけ)', () => {
    expect(shouldShowRetaliationTutorial(gate({ seen: true }))).toBe(false);
  });
  it('訓練(M0)では出さない', () => {
    expect(shouldShowRetaliationTutorial(gate({ trainingStage: true }))).toBe(false);
  });
  it('ポップアップ・メニュー・会話・アテンションに重ねない', () => {
    expect(shouldShowRetaliationTutorial(gate({ popupOpen: true }))).toBe(false);
    expect(shouldShowRetaliationTutorial(gate({ menuOpen: true }))).toBe(false);
    expect(shouldShowRetaliationTutorial(gate({ dialogueActive: true }))).toBe(false);
    expect(shouldShowRetaliationTutorial(gate({ attention: true }))).toBe(false);
  });
});

describe('レッドカウンターのチュートリアル — 閉じた後の窓の開き直し', () => {
  it('相手が生きていれば、今から窓の長さぶん開き直す(ヒットストップは掛け直さない)', () => {
    const w = reopenRetaliationWindowAfterTutorial('e1', 5000, { health: 10 }, 3, 4);
    expect(w).not.toBeNull();
    expect(w!.fromId).toBe('e1');
    expect(w!.openedAt).toBe(5000);
    expect(w!.closesAt).toBe(5000 + RETALIATE_WINDOW_MS);
    expect(w!.stopUntil).toBe(5000);
    expect(w!.dirX).toBeCloseTo(0.6);
    expect(w!.dirY).toBeCloseTo(0.8);
    expect(isRetaliationWindowOpen(w, 5000)).toBe(true);
    expect(isRetaliationWindowOpen(w, 5000 + RETALIATE_WINDOW_MS)).toBe(false);
  });
  it('相手が居ない/倒れているなら開き直さない', () => {
    expect(reopenRetaliationWindowAfterTutorial('e1', 5000, undefined, 1, 0)).toBeNull();
    expect(reopenRetaliationWindowAfterTutorial('e1', 5000, { health: 0 }, 1, 0)).toBeNull();
  });
});
