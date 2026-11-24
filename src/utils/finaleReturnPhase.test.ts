import { describe, it, expect } from 'vitest';
import { shouldBeginFinaleReturnPhase } from './finaleReturnPhase';

const base = { finaleDefeated: true, hasReturnCircle: false, gameWon: false, storyBossMode: false };

describe('shouldBeginFinaleReturnPhase', () => {
  it('ほかのステージのフィナーレボス撃破では今どおり帰還サークルを出す', () => {
    expect(shouldBeginFinaleReturnPhase(base)).toBe(true);
  });
  it('ストーリーボス専用ラン(ステージ7)では撃破しても帰還サークルを出さない', () => {
    expect(shouldBeginFinaleReturnPhase({ ...base, storyBossMode: true })).toBe(false);
  });
  it('未撃破・サークル既出・勝利済みでは出さない', () => {
    expect(shouldBeginFinaleReturnPhase({ ...base, finaleDefeated: false })).toBe(false);
    expect(shouldBeginFinaleReturnPhase({ ...base, hasReturnCircle: true })).toBe(false);
    expect(shouldBeginFinaleReturnPhase({ ...base, gameWon: true })).toBe(false);
  });
});
