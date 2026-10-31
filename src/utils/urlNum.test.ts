import { describe, it, expect } from 'vitest';
import { urlNum } from './urlNum';

describe('urlNum(URLの数値ツマミ)', () => {
  it('★キーが無ければ既定値(Number(null)=0 に落ちない=v0.25.4341の事故の再発防止)', () => {
    expect(urlNum('', 'mhittint', 0xffeade)).toBe(0xffeade);
    expect(urlNum('?other=1', 'mhittint', 0xffeade)).toBe(0xffeade);
    // 既定値が 0 以外である限り、0 が返ったらそれは事故。
    expect(urlNum('', 'k', 150)).toBe(150);
  });
  it('空文字も既定値へ落とす(?key= のような打ち間違い)', () => {
    expect(urlNum('?k=', 'k', 7)).toBe(7);
    expect(urlNum('?k=%20', 'k', 7)).toBe(7);
  });
  it('数値でなければ既定値', () => {
    expect(urlNum('?k=abc', 'k', 7)).toBe(7);
    expect(urlNum('?k=NaN', 'k', 7)).toBe(7);
  });
  it('指定された値は読む(0 も負も16進も明示なら通す)', () => {
    expect(urlNum('?k=0', 'k', 7)).toBe(0);
    expect(urlNum('?k=-3', 'k', 7)).toBe(-3);
    expect(urlNum('?k=0xffeade', 'k', 1)).toBe(0xffeade);
    expect(urlNum('?k=1.5', 'k', 7)).toBe(1.5);
  });
});
