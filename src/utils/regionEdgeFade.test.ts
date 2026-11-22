import { describe, it, expect } from 'vitest';
import { playerCenteredRegion, regionEdgeFade } from './regionEdgeFade';

describe('regionEdgeFade(範囲の縁の手前で 1→0)', () => {
  const r = playerCenteredRegion(0, 0, 430, 900, 520);
  it('範囲は store と同じ形(画面 ± pad)', () => {
    expect(r).toEqual({ left: -735, right: 735, top: -970, bottom: 970 });
  });
  it('内側は1・縁で0・外は0・間は単調', () => {
    expect(regionEdgeFade(0, 0, r, 150)).toBe(1);
    expect(regionEdgeFade(735, 0, r, 150)).toBe(0);
    expect(regionEdgeFade(0, -2000, r, 150)).toBe(0);
    let prev = -1;
    for (let x = 735; x >= 735 - 160; x -= 5) {
      const a = regionEdgeFade(x, 0, r, 150);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
    expect(regionEdgeFade(735 - 75, 0, r, 150)).toBeCloseTo(0.5, 9);
  });
  it('縁でなめらか(傾き0で入る=パッと出ない)', () => {
    const a = regionEdgeFade(735 - 1, 0, r, 150);
    expect(a).toBeLessThan(0.001);
  });
});
