import { describe, it, expect } from 'vitest';
import { frameByHold, holdTotalMs, holdLeadMs } from './fxFrameClock';

const HOLD = [10, 20, 30, 40, 50];   // 5コマ
const IMPACT = 2;                    // 3コマ目が当たる瞬間

describe('コマ送りの時計', () => {
  it('★当たる瞬間にちょうど impactFrame へ切り替わる', () => {
    expect(frameByHold(0, HOLD, IMPACT)).toBe(IMPACT);
    expect(frameByHold(-1, HOLD, IMPACT)).toBe(IMPACT - 1);
  });

  it('先頭より前・流し切った後は出さない', () => {
    const lead = holdLeadMs(HOLD, IMPACT);
    expect(lead).toBe(30);
    expect(frameByHold(-lead, HOLD, IMPACT)).toBe(0);
    expect(frameByHold(-lead - 1, HOLD, IMPACT)).toBeNull();
    expect(frameByHold(holdTotalMs(HOLD) - lead, HOLD, IMPACT)).toBeNull();
    expect(frameByHold(holdTotalMs(HOLD) - lead - 1, HOLD, IMPACT)).toBe(HOLD.length - 1);
  });

  it('★コマは戻らない(単調)', () => {
    const lead = holdLeadMs(HOLD, IMPACT);
    let prev = -1;
    for (let t = -lead; t < holdTotalMs(HOLD) - lead; t += 1) {
      const f = frameByHold(t, HOLD, IMPACT)!;
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(prev).toBe(HOLD.length - 1);
  });

  it('尺の表どおりに切り替わる(境界)', () => {
    const lead = holdLeadMs(HOLD, IMPACT);
    expect(frameByHold(-lead + 9, HOLD, IMPACT)).toBe(0);
    expect(frameByHold(-lead + 10, HOLD, IMPACT)).toBe(1);
  });
});
