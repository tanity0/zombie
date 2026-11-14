import { describe, it, expect } from 'vitest';
import { allowBake, newBakeGovernor, BAKE_SATURATED_INTERVAL_MS } from './bakeGovernor';

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
});
