import { describe, expect, it } from 'vitest';
import { COUNTER_CLASH_REACH_PX, counterClashPoint } from './counterClash';

describe('counterClashPoint', () => {
  it('攻撃が近い時は2点のちょうど間', () => {
    expect(counterClashPoint(0, 0, 40, 0)).toEqual({ x: 20, y: 0 });
  });
  it('攻撃が遠い時は弾いた側から届く距離までで止める(敵の上には出ない)', () => {
    const p = counterClashPoint(100, 100, 100, 400);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(100 + COUNTER_CLASH_REACH_PX);
  });
  it('攻撃が来た方向へ出る(向きは攻撃の位置で決まる)', () => {
    const p = counterClashPoint(0, 0, -300, -300);
    expect(p.x).toBeLessThan(0);
    expect(p.y).toBeLessThan(0);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(COUNTER_CLASH_REACH_PX);
  });
  it('2点が重なる時は弾いた側の中心', () => {
    expect(counterClashPoint(5, 7, 5, 7)).toEqual({ x: 5, y: 7 });
  });
});
