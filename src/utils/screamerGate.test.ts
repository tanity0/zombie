import { describe, it, expect } from 'vitest';
import { screamerStartGate, SCREAMER_OFFSCREEN_HOLD_MS, screamerMarkVisible, SCREAMER_MARK_MAX_DIST_PX, screamerWarpDue, SCREAMER_WARP_GAP_MS } from './screamerGate';

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

describe('叫喚型の方角の印(社長指示2026-11-11「遠くに離れたらマーク消えて良い」)', () => {
  it('決めた距離までは出す・それより遠いと出さない(向きは問わない)', () => {
    expect(screamerMarkVisible(0, 0, SCREAMER_MARK_MAX_DIST_PX, 0)).toBe(true);
    expect(screamerMarkVisible(0, 0, 0, -SCREAMER_MARK_MAX_DIST_PX)).toBe(true);
    expect(screamerMarkVisible(0, 0, SCREAMER_MARK_MAX_DIST_PX + 1, 0)).toBe(false);
    expect(screamerMarkVisible(100, 100, 100 + 900, 100 + 900)).toBe(false);
  });
});


describe('叫喚型の置き去りを進む先へ動かす(社長指示2026-11-11「進行方向にワープさせる」)', () => {
  const D = SCREAMER_MARK_MAX_DIST_PX;
  it('距離の境目: 決めた距離ちょうどは動かさない・超えたら動かす', () => {
    expect(screamerWarpDue(0, 0, D, 0, undefined, undefined, 10000)).toBe(false);
    expect(screamerWarpDue(0, 0, D + 1, 0, undefined, undefined, 10000)).toBe(true);
    expect(screamerWarpDue(100, 100, 100, 100 - D - 1, undefined, undefined, 10000)).toBe(true);
  });
  it('叫びの溜めの最中は動かさない', () => {
    expect(screamerWarpDue(0, 0, D + 500, 0, 'scream', undefined, 10000)).toBe(false);
  });
  it('前に動かしてから決めた間が経つまでは動かさない・経っていれば動かす', () => {
    expect(screamerWarpDue(0, 0, D + 500, 0, undefined, 10000, 10000 + SCREAMER_WARP_GAP_MS - 1)).toBe(false);
    expect(screamerWarpDue(0, 0, D + 500, 0, undefined, 10000, 10000 + SCREAMER_WARP_GAP_MS)).toBe(true);
  });
  it('間が経っていても近ければ動かさない', () => {
    expect(screamerWarpDue(0, 0, D - 1, 0, undefined, 0, 100000)).toBe(false);
  });
});
