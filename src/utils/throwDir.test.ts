import { describe, it, expect } from 'vitest';
import { safeThrowDirection } from './throwDir';

const enemy = (x: number, y: number) => ({ x, y, width: 20, height: 20 });

describe('safeThrowDirection', () => {
  it('敵が近くに居なければ fallback を正規化して返す', () => {
    const d = safeThrowDirection(0, 0, [], { x: 2, y: 0 });
    expect(d.x).toBeCloseTo(1);
    expect(d.y).toBeCloseTo(0);
  });

  it('fallback が 0 ベクトルでも壊れない', () => {
    const d = safeThrowDirection(0, 0, [], { x: 0, y: 0 });
    expect(Number.isFinite(d.x)).toBe(true);
    expect(Number.isFinite(d.y)).toBe(true);
  });

  it('敵が右に固まっていれば左方向へ投げる', () => {
    const d = safeThrowDirection(0, 0, [enemy(100, 0), enemy(120, 10), enemy(90, -10)], { x: 1, y: 0 });
    expect(d.x).toBeLessThan(0); // 敵(右)と反対=左
  });

  it('敵が上に固まっていれば下方向へ投げる', () => {
    const d = safeThrowDirection(0, 0, [enemy(0, -100), enemy(10, -120)], { x: 0, y: -1 });
    expect(d.y).toBeGreaterThan(0); // 敵(上=-y)と反対=下(+y)
  });

  it('遠すぎる敵(radius外)は無視して fallback を返す', () => {
    const d = safeThrowDirection(0, 0, [enemy(2000, 0)], { x: 0, y: 1 }, 500);
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(1);
  });

  it('常に単位ベクトルを返す', () => {
    const d = safeThrowDirection(0, 0, [enemy(50, 50), enemy(-30, 80)], { x: 1, y: 0 });
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 5);
  });
});
