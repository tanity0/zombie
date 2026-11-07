import { describe, it, expect } from 'vitest';
import { slowLineVisibleChars, SLOW_CHAR_MS, SLOW_ELLIPSIS_PAUSE_MS } from './slowLine';

/** 旧実装(setTimeout の鎖)をそのまま写した参照:各文字が出る時刻の列。 */
const legacyTimes = (text: string): number[] => {
  const chars = Array.from(text);
  const out: number[] = [];
  let t = SLOW_CHAR_MS; // 最初の setTimeout(step, SLOW_CHAR_MS)
  let i = 0;
  for (;;) {
    i += 1; out.push(t);
    if (i >= chars.length) break;
    t += chars[i] === '…' ? SLOW_ELLIPSIS_PAUSE_MS : SLOW_CHAR_MS;
  }
  return out;
};

describe('ゆっくり送る会話の行(描画の周期で文字数を出す)', () => {
  const text = '待って…置いていかないで…';
  const chars = Array.from(text);

  it('★旧実装(タイマーの鎖)と同じ時刻に同じ文字数が出る', () => {
    const times = legacyTimes(text);
    times.forEach((t, k) => {
      expect(slowLineVisibleChars(chars, t - 1)).toBe(k);
      expect(slowLineVisibleChars(chars, t)).toBe(k + 1);
    });
  });

  it('三点リーダの前で一拍ためる', () => {
    // 「待って」の3文字目の後、次は「…」なので 520ms 待つ
    const t3 = SLOW_CHAR_MS * 3;
    expect(slowLineVisibleChars(chars, t3)).toBe(3);
    expect(slowLineVisibleChars(chars, t3 + SLOW_ELLIPSIS_PAUSE_MS - 1)).toBe(3);
    expect(slowLineVisibleChars(chars, t3 + SLOW_ELLIPSIS_PAUSE_MS)).toBe(4);
  });

  it('★フレームが飛んでも(重い時)経過時間ぶん一気に追いつき、全文で止まる', () => {
    expect(slowLineVisibleChars(chars, 0)).toBe(0);
    expect(slowLineVisibleChars(chars, 60_000)).toBe(chars.length);
  });
});
