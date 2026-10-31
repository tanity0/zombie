import { describe, it, expect } from 'vitest';
import { canTogglePause, type PauseGateState } from './pauseGate';

const open: PauseGateState = { tutorialPopup: null, showUpgradeMenu: false, showShopMenu: false, showEventQuestMenu: false, storyReturnPromptVisible: false };

describe('一時停止の門(ピル・キーボード・パッド共通)', () => {
  it('窓が無い時は切り替えられる', () => {
    expect(canTogglePause(open)).toBe(true);
  });
  it('★レベルアップの窓が立っている間(窓が描かれる前の待ちも含む)は切り替えない', () => {
    expect(canTogglePause({ ...open, showUpgradeMenu: true })).toBe(false);
  });
  it('説明・店・クエスト・帰還の問いの間も切り替えない', () => {
    expect(canTogglePause({ ...open, tutorialPopup: { id: 'x' } })).toBe(false);
    expect(canTogglePause({ ...open, showShopMenu: true })).toBe(false);
    expect(canTogglePause({ ...open, showEventQuestMenu: true })).toBe(false);
    expect(canTogglePause({ ...open, storyReturnPromptVisible: true })).toBe(false);
  });
});
