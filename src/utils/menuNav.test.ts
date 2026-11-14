import { describe, it, expect } from 'vitest';
import { pickNeighbor } from './menuNav';

const r = (x: number, y: number, w = 100, h = 40) => ({ x, y, w, h });

describe('メニューの矢印移動(位置で一番近いボタン)', () => {
  const list = [r(0, 0), r(0, 60), r(0, 120), r(200, 60)];
  it('下は同じ列の次', () => { expect(pickNeighbor(r(0, 0), list.slice(1), 'down')).toBe(0); });
  it('右は横の物', () => { expect(pickNeighbor(r(0, 60), [list[0], list[2], list[3]], 'right')).toBe(2); });
  it('その向きに何も無ければ -1', () => { expect(pickNeighbor(r(0, 120), [list[0], list[1]], 'down')).toBe(-1); });
  it('真下が離れていても、斜めの近い物より同じ列を選ぶ(横ずれは重く数える)', () => {
    expect(pickNeighbor(r(0, 0), [r(0, 200), r(150, 50)], 'down')).toBe(0);
  });
});
