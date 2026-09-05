import { describe, expect, it } from 'vitest';
import {
  isSwordLungeLive, planSwordLunge, swordLungeCenterAt, swordLungeEase,
} from './swordLunge';

describe('swordLungeEase', () => {
  it('starts and ends at rest (慣性=加減速のない動きは禁止)', () => {
    expect(swordLungeEase(0)).toBe(0);
    expect(swordLungeEase(1)).toBe(1);
    // 立ち上がりと締めの速度が、中腹の速度よりはっきり遅い=加速→減速している。
    const v = (t: number) => swordLungeEase(t + 0.02) - swordLungeEase(t);
    expect(v(0)).toBeLessThan(v(0.5) * 0.3);
    expect(v(0.98)).toBeLessThan(v(0.5) * 0.3);
  });

  it('clamps outside the window instead of overshooting', () => {
    expect(swordLungeEase(-5)).toBe(0);
    expect(swordLungeEase(5)).toBe(1);
  });
});

describe('planSwordLunge', () => {
  it('closes the gap up to the standoff distance', () => {
    const p = planSwordLunge('harai', 0, 0, 300, 0, 80, 1000, 5000, 290);
    expect(p).not.toBeNull();
    expect(p!.dist).toBe(220);   // 300 - 80
    expect(p!.dirX).toBeCloseTo(1);
    expect(p!.dirY).toBeCloseTo(0);
  });

  it('caps the step so 払い does not turn into a dash', () => {
    const p = planSwordLunge('harai', 0, 0, 1000, 0, 80, 150, 0, 290);
    expect(p!.dist).toBe(150);
  });

  it('returns null when already inside the standoff (0距離の踏み込みを作らない)', () => {
    expect(planSwordLunge('harai', 0, 0, 60, 0, 80, 150, 0, 290)).toBeNull();
    expect(planSwordLunge('harai', 0, 0, 80.5, 0, 80, 150, 0, 290)).toBeNull();
  });

  it('returns null when the target coincides with the boss', () => {
    expect(planSwordLunge('harai', 10, 10, 10, 10, 0, 150, 0, 290)).toBeNull();
  });
});

describe('isSwordLungeLive', () => {
  const plan = planSwordLunge('harai', 0, 0, 300, 0, 80, 150, 1000, 290)!;

  it('is live only for its own move', () => {
    expect(isSwordLungeLive(plan, 'harai', 1100)).toBe(true);
    expect(isSwordLungeLive(plan, 'tate', 1100)).toBe(false);
  });

  it('dies by the clock so cancelled techniques need no explicit cleanup', () => {
    expect(isSwordLungeLive(plan, 'harai', 1289)).toBe(true);
    expect(isSwordLungeLive(plan, 'harai', 1290)).toBe(false);
    expect(isSwordLungeLive(plan, 'harai', 99999)).toBe(false);
  });

  it('treats a missing plan as not live', () => {
    expect(isSwordLungeLive(undefined, 'harai', 1100)).toBe(false);
  });
});

describe('swordLungeCenterAt', () => {
  const plan = planSwordLunge('sweep', 100, 200, 100, 400, 60, 110, 0, 300)!;

  it('never teleports: it is at the origin on the first frame', () => {
    expect(swordLungeCenterAt(plan, 0)).toEqual({ x: 100, y: 200 });
  });

  it('arrives exactly at from + dir * dist', () => {
    const end = swordLungeCenterAt(plan, 300);
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(200 + plan.dist);
  });

  it('moves monotonically forward (前へ出て戻らない)', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 300; t += 15) {
      const y = swordLungeCenterAt(plan, t).y;
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it('travels less than a quarter of the way in the first quarter of the time (慣性)', () => {
    const q = swordLungeCenterAt(plan, 75).y - 200;
    expect(q).toBeLessThan(plan.dist * 0.25);
  });
});
