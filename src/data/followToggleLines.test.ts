import { describe, it, expect } from 'vitest';
import { FOLLOW_TOGGLE_LINES, isFollowToggleLineText, followToggleLineMatches } from './npcLines';

// research/ESCORT_FOLLOW.md §9-1: ショップが開いている間、「連れて歩く」の返事はショップのパネルの中に出す(ShopMenu/NpcDialogue)。
describe('連れて歩くの返事の見分け', () => {
  it('返事の行だけを返事と見なす(雑談は見なさない)', () => {
    for (const l of FOLLOW_TOGGLE_LINES) { expect(isFollowToggleLineText(l.on)).toBe(true); expect(isFollowToggleLineText(l.off)).toBe(true); }
    expect(isFollowToggleLineText('出撃します。')).toBe(false);
  });
  it('今の状態に合う返事だけが一致する(連打で逆の返事を残さない)', () => {
    const l = FOLLOW_TOGGLE_LINES[0];
    expect(followToggleLineMatches(l.on, true)).toBe(true);
    expect(followToggleLineMatches(l.on, false)).toBe(false);
    expect(followToggleLineMatches(l.off, false)).toBe(true);
    expect(followToggleLineMatches(l.off, true)).toBe(false);
  });
});
