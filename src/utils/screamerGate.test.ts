import { describe, it, expect } from 'vitest';
import { screamerStartGate, SCREAMER_OFFSCREEN_HOLD_MS } from './screamerGate';

describe('叫喚型の叫びの関所(社長報告2026-11-11「遠くに居てもずっと叫んでる」)', () => {
  it('予定の時刻より前は始めない(画面の中でも外でも・予定は動かさない)', () => {
    expect(screamerStartGate(5000, 4999, true)).toEqual({ start: false, next: 5000 });
    expect(screamerStartGate(5000, 4999, false)).toEqual({ start: false, next: 5000 });
  });
  it('予定を過ぎて画面の中なら始める', () => {
    expect(screamerStartGate(5000, 5000, true).start).toBe(true);
  });
  it('画面の外では何秒経っても始めない。画面に入ってから少し待って始める', () => {
    let next = 5000;
    for (let t = 5000; t < 60000; t += 16) { const g = screamerStartGate(next, t, false); expect(g.start).toBe(false); next = g.next; }
    const tIn = 60000;
    expect(screamerStartGate(next, tIn, true).start).toBe(false); // 入った瞬間は叫ばない
    expect(next - tIn).toBeLessThanOrEqual(SCREAMER_OFFSCREEN_HOLD_MS);
    expect(screamerStartGate(next, next, true).start).toBe(true);
  });
});
