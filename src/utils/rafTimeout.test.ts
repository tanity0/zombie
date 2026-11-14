import { describe, it, expect } from 'vitest';
import { rafTimeout, rafDeadlineReached, type RafTimeoutEnv } from './rafTimeout';

/** 手で進める時計。rAF とタイマーを別々に回せる(=「タイマーが来ない」を再現できる)。 */
const makeEnv = () => {
  let t = 0;
  let nextId = 1;
  const rafs = new Map<number, () => void>();
  const timers = new Map<number, { cb: () => void; at: number }>();
  const env: RafTimeoutEnv = {
    now: () => t,
    raf: cb => { const id = nextId++; rafs.set(id, cb); return id; },
    caf: id => { rafs.delete(id); },
    setT: (cb, ms) => { const id = nextId++; timers.set(id, { cb, at: t + ms }); return id; },
    clearT: id => { timers.delete(id); },
  };
  return {
    env,
    advance: (ms: number) => { t += ms; },
    /** 描画の1フレーム(rAF だけ回す=タイマーは来ない) */
    frame: () => { const list = [...rafs.entries()]; rafs.clear(); for (const [, cb] of list) cb(); },
    /** タイマーだけ回す(期限の来たもの) */
    timers: () => { for (const [id, v] of [...timers.entries()]) if (v.at <= t) { timers.delete(id); v.cb(); } },
    pending: () => ({ rafs: rafs.size, timers: timers.size }),
  };
};

describe('rafTimeout(UI の時計を描画の周期にも乗せる)', () => {
  it('期限の判定', () => {
    expect(rafDeadlineReached(99, 100)).toBe(false);
    expect(rafDeadlineReached(100, 100)).toBe(true);
  });

  it('★タイマーが1度も来なくても、描画(rAF)が回れば期限で1回だけ発火する', () => {
    const c = makeEnv();
    let n = 0;
    rafTimeout(() => { n++; }, 2000, c.env);
    for (let i = 0; i < 10; i++) { c.advance(150); c.frame(); }
    expect(n).toBe(0); // 1500ms
    for (let i = 0; i < 4; i++) { c.advance(150); c.frame(); }
    expect(n).toBe(1); // 2100ms
    c.timers(); c.frame();
    expect(n).toBe(1); // もう片方(タイマー)は取り消されている
    expect(c.pending()).toEqual({ rafs: 0, timers: 0 });
  });

  it('描画が止まっていても(裏タブ)、タイマーが期限で拾う', () => {
    const c = makeEnv();
    let n = 0;
    rafTimeout(() => { n++; }, 450, c.env);
    c.advance(450); c.timers();
    expect(n).toBe(1);
    c.frame();
    expect(n).toBe(1);
  });

  it('期限より前には発火しない(尺はタイマーと同じ)', () => {
    const c = makeEnv();
    let n = 0;
    rafTimeout(() => { n++; }, 450, c.env);
    c.advance(449); c.frame(); c.timers();
    expect(n).toBe(0);
    c.advance(1); c.frame();
    expect(n).toBe(1);
  });

  it('取り消すと、どちらからも発火しない', () => {
    const c = makeEnv();
    let n = 0;
    const cancel = rafTimeout(() => { n++; }, 100, c.env);
    cancel();
    c.advance(500); c.frame(); c.timers();
    expect(n).toBe(0);
    expect(c.pending()).toEqual({ rafs: 0, timers: 0 });
  });
});
