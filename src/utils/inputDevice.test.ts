import { describe, it, expect } from 'vitest';
import { blocksLandscape } from './inputDevice';

// research/PC_SUPPORT.md §13: 横持ちを止めるのはスマホ(タッチが主・短い辺600未満)だけ。
describe('横持ちを止めるか', () => {
  it('スマホ(タッチ・短い辺 360〜430)は止める=従来どおり', () => {
    for (const s of [320, 360, 375, 390, 414, 430]) expect(blocksLandscape(true, s)).toBe(true);
  });
  it('タブレット(タッチ・短い辺 744〜1024)は止めない', () => {
    for (const s of [744, 768, 810, 820, 834, 1024]) expect(blocksLandscape(true, s)).toBe(false);
  });
  it('マウスのある端末は大きさに関係なく止めない', () => {
    expect(blocksLandscape(false, 390)).toBe(false);
    expect(blocksLandscape(false, 1080)).toBe(false);
  });
});
