// 「賞金首」チュートリアル('bounty')の発火条件。
import { describe, it, expect } from 'vitest';
import { shouldShowBountyTutorial, dropBountyTutorialPending, type BountyTutorialGate } from './bountyTutorial';
import { getTutorial } from '../data/tutorials';

const gate = (over: Partial<BountyTutorialGate> = {}): BountyTutorialGate => ({
  pending: true, attentionQueued: false, attentionActive: false, bountyPresent: true, seen: false,
  popupOpen: false, menuOpen: false, dialogueActive: false, ...over,
});

describe('賞金首のチュートリアル — 発火条件', () => {
  it('出現のアテンションが終わり切って、何も開いていなければ出す', () => {
    expect(shouldShowBountyTutorial(gate())).toBe(true);
  });
  it('出現演出の間(アテンション発火待ち)・アテンションの最中は出さない', () => {
    expect(shouldShowBountyTutorial(gate({ attentionQueued: true }))).toBe(false);
    expect(shouldShowBountyTutorial(gate({ attentionActive: true }))).toBe(false);
  });
  it('賞金首が出ていない・既読なら出さない', () => {
    expect(shouldShowBountyTutorial(gate({ pending: false }))).toBe(false);
    expect(shouldShowBountyTutorial(gate({ seen: true }))).toBe(false);
    expect(shouldShowBountyTutorial(gate({ bountyPresent: false }))).toBe(false);
  });
  it('ポップアップ(守護霊など)・メニュー・会話に重ねない', () => {
    expect(shouldShowBountyTutorial(gate({ popupOpen: true }))).toBe(false);
    expect(shouldShowBountyTutorial(gate({ menuOpen: true }))).toBe(false);
    expect(shouldShowBountyTutorial(gate({ dialogueActive: true }))).toBe(false);
  });
  it('待ちを捨てる: 既読、またはアテンション後に賞金首が居ない時だけ', () => {
    expect(dropBountyTutorialPending(gate({ seen: true }))).toBe(true);
    expect(dropBountyTutorialPending(gate({ bountyPresent: false }))).toBe(true);
    expect(dropBountyTutorialPending(gate({ bountyPresent: false, attentionQueued: true }))).toBe(false);
    expect(dropBountyTutorialPending(gate({ bountyPresent: false, attentionActive: true }))).toBe(false);
    expect(dropBountyTutorialPending(gate({ popupOpen: true }))).toBe(false);
    expect(dropBountyTutorialPending(gate({ dialogueActive: true }))).toBe(false);
    expect(dropBountyTutorialPending(gate({ pending: false, seen: true }))).toBe(false);
  });
});

describe('賞金首のチュートリアル — 台帳', () => {
  it('題は「賞金首」・本文は4行・映像待ちの1枚', () => {
    const t = getTutorial('bounty');
    expect(t?.title).toBe('賞金首');
    expect(t?.lines).toEqual([
      '賞金首は、一筋縄ではいかない特殊な変異体。',
      '腕に覚えがないうちは危険だ。近づかなければ、いずれ去っていく。',
      'マップには他にも、徘徊する変異体や、噂にしか聞かない超大型の変異体がいるらしい。',
      '倒せば、必ず大型武器庫を落とす。',
    ]);
    expect(t?.slides).toHaveLength(1);
    expect(t?.slides?.[0].mediaPending).toBe(true);
  });
});
