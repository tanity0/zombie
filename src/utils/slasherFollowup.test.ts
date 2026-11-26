import { describe, it, expect } from 'vitest';
import {
  planSlasherFollowups, takeDueSlasherFollowups, slasherFollowupCount, slasherFollowupMult, slasherFollowupKbPx, slasherFollowupIsFinal,
  SLASHER_FOLLOWUP_INTERVAL_MS, SLASHER_FORCE_KB_PX, SLASHER_FINAL_KB_MULT,
} from './slasherFollowup';

describe('スラッシャーの追い打ち(純関数)', () => {
  it('回数は Lv1/2/3 = 1/2/3(旧の最大2/3/4連=元の一撃+追い打ち)', () => {
    expect([0, 1, 2, 3, 4].map(slasherFollowupCount)).toEqual([0, 1, 2, 3, 3]);
  });
  it('間隔は 0.1秒', () => {
    expect(SLASHER_FOLLOWUP_INTERVAL_MS).toBe(100);
    const plan = planSlasherFollowups(1000, 3, 'knife', 1, 0, [{ id: 'a', seed: 9 }]);
    expect(plan.map(f => f.at)).toEqual([1100, 1200, 1300]);
    expect(plan.map(f => f.k)).toEqual([1, 2, 3]);
    expect(plan.every(f => f.count === 3)).toBe(true);
  });
  it('威力は1回ごとに 2/3(元の一撃に対して 2/3・4/9・8/27)', () => {
    expect(slasherFollowupMult(1)).toBeCloseTo(2 / 3, 9);
    expect(slasherFollowupMult(2)).toBeCloseTo(4 / 9, 9);
    expect(slasherFollowupMult(3)).toBeCloseTo(8 / 27, 9);
    for (let k = 2; k <= 3; k++) expect(slasherFollowupMult(k) / slasherFollowupMult(k - 1)).toBeCloseTo(2 / 3, 9);
  });
  it('最後の追い打ちだけ吹き飛ばす・Lv3 は大きめ', () => {
    expect(slasherFollowupKbPx(1, 1, 1)).toBe(SLASHER_FORCE_KB_PX);
    expect(slasherFollowupKbPx(2, 1, 2)).toBe(0);
    expect(slasherFollowupKbPx(2, 2, 2)).toBe(SLASHER_FORCE_KB_PX);
    expect(slasherFollowupKbPx(3, 2, 3)).toBe(0);
    expect(slasherFollowupKbPx(3, 3, 3)).toBe(SLASHER_FORCE_KB_PX * SLASHER_FINAL_KB_MULT);
    expect(slasherFollowupIsFinal(3, 3)).toBe(true);
    expect(slasherFollowupIsFinal(1, 3)).toBe(false);
  });
  it('Lv0・当たり無し・値の無い種は予約しない', () => {
    expect(planSlasherFollowups(0, 0, 'knife', 1, 0, [{ id: 'a', seed: 1 }])).toEqual([]);
    expect(planSlasherFollowups(0, 3, 'knife', 1, 0, [])).toEqual([]);
    expect(planSlasherFollowups(0, 3, 'knife', 1, 0, [{ id: 'a', seed: 0 }, { id: 'b', seed: NaN }])).toEqual([]);
  });
  it('時刻の来た分だけ取り出す(順序を保つ)', () => {
    const plan = planSlasherFollowups(0, 3, 'whip', 0, 1, [{ id: 'a', seed: 3 }]);
    const r1 = takeDueSlasherFollowups(plan, 150);
    expect(r1.due.map(f => f.k)).toEqual([1]);
    expect(r1.rest.map(f => f.k)).toEqual([2, 3]);
    const r0 = takeDueSlasherFollowups(r1.rest, 150);
    expect(r0.due).toEqual([]);
    expect(r0.rest).toBe(r1.rest);
  });
  it('向きは正規化する(0ベクトルは右向き)', () => {
    const [f] = planSlasherFollowups(0, 1, 'katana', 3, 4, [{ id: 'a', seed: 1 }]);
    expect(f.dirX).toBeCloseTo(0.6); expect(f.dirY).toBeCloseTo(0.8);
    const [g] = planSlasherFollowups(0, 1, 'katana', 0, 0, [{ id: 'a', seed: 1 }]);
    expect([g.dirX, g.dirY]).toEqual([1, 0]);
  });
});
