import { describe, it, expect } from 'vitest';
import { allowBake, newBakeGovernor, newBakeFrameGate, isRecentBake, bakeOpsBudget, BAKE_OPS_PER_FRAME, BAKE_SATURATED_INTERVAL_MS } from './bakeGovernor';

describe('焼き置きが天井に張り付いた時の焼き直しの間引き(2026-10-22 ステージ4で急に重い)', () => {
  it('天井に届いていない時は毎回焼いてよい(従来どおり)', () => {
    const g = newBakeGovernor();
    for (let t = 0; t < 100; t += 16) expect(allowBake(g, false, t)).toBe(true);
  });
  it('張り付いている間は一定の間隔に1回まで', () => {
    const g = newBakeGovernor();
    let n = 0;
    for (let t = 0; t < 1500; t += 16) if (allowBake(g, true, t)) n++;
    expect(n).toBeLessThanOrEqual(Math.ceil(1500 / BAKE_SATURATED_INTERVAL_MS) + 1);
    expect(n).toBeGreaterThan(0); // 止めきらない(いつかは焼ける)
  });
  it('最初の1回はすぐ焼ける', () => {
    expect(allowBake(newBakeGovernor(), true, 0)).toBe(true);
  });
  it('★フレームが重い(1フレーム500ms)時、影・縁・白を合わせて1フレームに1回まで(2026-11-28 fps2 bk8)', () => {
    const gate = newBakeFrameGate();
    const gs = [newBakeGovernor(), newBakeGovernor(), newBakeGovernor()];
    let n = 0;
    for (let f = 0; f < 10; f++) {
      const t = f * 500;
      for (const g of gs) if (allowBake(g, true, t, BAKE_SATURATED_INTERVAL_MS, gate, f)) n++;
    }
    expect(n).toBe(10); // 札が無ければ 3種×10フレーム=30回
  });
  it('札を共有しても、60fps では間隔の方が先に効く(従来と同じ回数)', () => {
    const gate = newBakeFrameGate();
    const g = newBakeGovernor(), g0 = newBakeGovernor();
    let n = 0, n0 = 0;
    for (let f = 0; f < 120; f++) {
      const t = f * 16.7;
      if (allowBake(g, true, t, BAKE_SATURATED_INTERVAL_MS, gate, f)) n++;
      if (allowBake(g0, true, t)) n0++;
    }
    expect(n).toBe(n0);
  });
  it('張り付いていない時は札に関係なく焼いてよい(札も打たない)', () => {
    const gate = newBakeFrameGate();
    const g = newBakeGovernor();
    expect(allowBake(g, false, 0, BAKE_SATURATED_INTERVAL_MS, gate, 1)).toBe(true);
    expect(allowBake(g, false, 0, BAKE_SATURATED_INTERVAL_MS, gate, 1)).toBe(true);
    expect(gate.frame).toBe(-1);
  });
});

describe('焼き置きの退避の守り(時計の窓かフレームの窓・2026-11-28 fps2 で窓が縮む)', () => {
  it('60fps: 2秒前(120フレーム前)に使った物は守らない=従来どおり', () => {
    expect(isRecentBake(0, 0, 2000, 120, 2000)).toBe(false);
    expect(isRecentBake(0, 0, 1990, 119, 2000)).toBe(true);
  });
  it('fps2: 時計で2秒経っても、フレームで見て直近なら守る(歩きのコマを捨てない)', () => {
    expect(isRecentBake(0, 0, 2000, 4, 2000)).toBe(true); // 2秒=4フレーム。旧(時計だけ)なら捨てていた
    expect(isRecentBake(0, 0, 60000, 120, 2000)).toBe(false); // いつかは捨てる
  });
  it('使った記録が無い物は守らない', () => {
    expect(isRecentBake(undefined, undefined, 0, 0, 2000)).toBe(false);
  });
});

describe('1フレームに焼く数の上限(2026-11-28 敵が入れ替わった時に1フレーム37回焼いていた)', () => {
  it('60fps(16.7ms)では既定の上限', () => {
    expect(bakeOpsBudget(16.7)).toBe(BAKE_OPS_PER_FRAME);
  });
  it('重いフレーム(fps2=500ms)では1つだけ=重いほど焼きを足さない', () => {
    expect(bakeOpsBudget(500)).toBe(1);
  });
  it('上限は1を下回らない(いつかは焼ける)', () => {
    expect(bakeOpsBudget(16, 0)).toBe(1);
  });
});
