import { describe, it, expect } from 'vitest';
import { npcChatterAllowed, NPC_CHATTER_CATEGORIES } from './npcChatter';

const CHATTER = ['sortie', 'companion', 'baseNear', 'npcKill', 'praise', 'kickAssist', 'rescued', 'rescueReturned', 'revived'];
const KEPT = ['surrounded', 'pushback', 'neglectFar', 'escortTargeted', 'baseCaptured', 'retreat', 'junLeftBehind', 'tutorial-left-wall', 'm0-heal'];

describe('npcChatterAllowed', () => {
  it('ON: 全部の場面を出す(今までと同じ)', () => {
    for (const c of [...CHATTER, ...KEPT]) expect(npcChatterAllowed(c, true)).toBe(true);
  });
  it('OFF: 雑談だけ止める', () => {
    for (const c of CHATTER) expect(npcChatterAllowed(c, false)).toBe(false);
  });
  it('OFF: 情報・物語・チュートリアルの一言は止めない', () => {
    for (const c of KEPT) expect(npcChatterAllowed(c, false)).toBe(true);
  });
  it('OFF: ジュンの台詞は雑談の場面でも止めない', () => {
    for (const c of CHATTER) expect(npcChatterAllowed(c, false, true)).toBe(true);
  });
  it('雑談の表は情報の場面を含まない', () => {
    for (const c of KEPT) expect(NPC_CHATTER_CATEGORIES.has(c)).toBe(false);
    expect(NPC_CHATTER_CATEGORIES.size).toBe(CHATTER.length);
  });
});
