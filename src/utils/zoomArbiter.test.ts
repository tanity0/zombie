// 寄りズームの調停(v0.25.2608・社長指示「早い者勝ちで演出中はその他塞ぐ / 告知はキャンセルではなく遅延」)。
// 描画専用の判定なので、ここでは純関数の不変条件だけを固定する。
import { describe, it, expect } from 'vitest';
import { decideZoom, dequeueZoom, ZOOM_QUEUE_MAX, type ZoomRequest } from './zoomArbiter';

const req = (kind: ZoomRequest['kind'], over: Partial<ZoomRequest> = {}): ZoomRequest => ({
  mag: 1, durationMs: 1000, holdMs: 0, kind, ...over,
});

describe('decideZoom: 早い者勝ち', () => {
  it('誰も演出していなければ、種別に関わらず開始する', () => {
    expect(decideZoom('fx', 0, 1000, 0)).toEqual({ action: 'start' });
    expect(decideZoom('notice', 0, 1000, 0)).toEqual({ action: 'start' });
    // 終了時刻ちょうど=もう演出中ではない(境界は「開始できる」側に倒す)。
    expect(decideZoom('fx', 1000, 1000, 0)).toEqual({ action: 'start' });
  });

  it('演出中に来た「見せ場の寄り」は捨てる(混ぜない=引っ張り合いが起きない)', () => {
    expect(decideZoom('fx', 2000, 1000, 0)).toEqual({ action: 'drop' });
  });

  it('演出中に来た「告知」は捨てずに待たせる', () => {
    expect(decideZoom('notice', 2000, 1000, 0)).toEqual({ action: 'queue' });
  });

  it('告知を積み過ぎたら捨てる(異常時の安全弁)', () => {
    expect(decideZoom('notice', 2000, 1000, ZOOM_QUEUE_MAX - 1)).toEqual({ action: 'queue' });
    expect(decideZoom('notice', 2000, 1000, ZOOM_QUEUE_MAX)).toEqual({ action: 'drop' });
  });

  it('待ち行列が一杯でも、演出が終わっていれば開始できる(待ち数は先勝ち判定に影響しない)', () => {
    expect(decideZoom('notice', 0, 1000, ZOOM_QUEUE_MAX)).toEqual({ action: 'start' });
  });
});

describe('dequeueZoom: 順番が来た告知を出す', () => {
  it('演出中は取り出さない', () => {
    const q = [req('notice')];
    expect(dequeueZoom(q, 2000, 1000)).toEqual({ next: null, rest: q });
  });

  it('演出が終わっていれば先頭を1件だけ取り出す(FIFO=来た順に出す)', () => {
    const a = req('notice', { mag: 1 });
    const b = req('notice', { mag: 2 });
    const r = dequeueZoom([a, b], 0, 1000);
    expect(r.next).toBe(a);
    expect(r.rest).toEqual([b]);
  });

  it('空なら何も起きない', () => {
    expect(dequeueZoom([], 0, 1000)).toEqual({ next: null, rest: [] });
  });

  it('元の配列を変更しない(storeの参照を壊さない)', () => {
    const q = [req('notice'), req('notice')];
    const copy = [...q];
    dequeueZoom(q, 0, 1000);
    expect(q).toEqual(copy);
  });
});

// 社長指示の意図そのものを不変条件として固定する(将来ここを緩めるなら社長裁定が要る)。
describe('社長指示の不変条件', () => {
  it('告知は「演出中だから」という理由だけでは絶対に捨てられない', () => {
    for (let queued = 0; queued < ZOOM_QUEUE_MAX; queued++) {
      expect(decideZoom('notice', 9999, 0, queued).action).not.toBe('drop');
    }
  });

  it('見せ場の寄りは、演出中なら必ず捨てる(伸ばす/混ぜるは選ばない)', () => {
    expect(decideZoom('fx', 9999, 0, 0).action).toBe('drop');
    expect(decideZoom('fx', 9999, 0, ZOOM_QUEUE_MAX).action).toBe('drop');
  });
});
