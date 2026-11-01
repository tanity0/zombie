// ハンターの巡回・急接近の1フレームの移動(慣性・社長MUST「全ての動きに慣性」/監査2026-11-01)。
import { describe, it, expect } from 'vitest';
import type { Enemy } from '../types/game';
import { stepHunterPatrol } from './hunterPatrolTick';
import { HUNTER_PATROL_SPEED, HUNTER_PATROL_ACCEL_S, HUNTER_RUSH_SPEED } from './hunterPatrol';

const hunter = (x: number, y: number, vx: number, vy: number): Enemy =>
  ({ id: 'h', type: 'hunter', x: x - 20, y: y - 30, width: 40, height: 60, vx, vy, health: 1, maxHealth: 1 } as unknown as Enemy);

const run = (e0: Enemy, want: number, to: { x: number; y: number } | undefined, frames: number, dt = 1 / 60) => {
  let e = e0; const sp: number[] = [];
  for (let i = 0; i < frames; i++) { const r = stepHunterPatrol(e, 6000, 0, want, dt, to); e = { ...e, ...r.patch }; sp.push(r.speed); }
  return { e, sp };
};

describe('stepHunterPatrol: 向きにも慣性', () => {
  it('逆向きへ切り替えても、その場で反転せず減速→加速で回り込む', () => {
    // 右へ急接近の速さで走っている所に、左の点へ向かえと言う
    const { sp } = run(hunter(0, 0, HUNTER_RUSH_SPEED, 0), HUNTER_RUSH_SPEED, { x: -5000, y: 0 }, 60);
    expect(sp[0]).toBeGreaterThan(HUNTER_RUSH_SPEED * 0.9); // 1フレーム目はまだほぼ同じ速さ(パッと反転しない)
    expect(Math.min(...sp)).toBeLessThan(HUNTER_RUSH_SPEED * 0.2); // いったん落ちてから
    expect(sp[sp.length - 1]).toBeGreaterThan(HUNTER_RUSH_SPEED * 0.5); // 逆へ加速している
  });
  it('向かう点の手前から減速して止まる(着いた瞬間にパッと止まらない)', () => {
    const { e, sp } = run(hunter(0, 0, HUNTER_RUSH_SPEED, 0), HUNTER_RUSH_SPEED, { x: 600, y: 0 }, 120);
    const cx = e.x + e.width / 2;
    expect(Math.abs(cx - 600)).toBeLessThan(3);
    for (let i = 1; i < sp.length; i++) {
      // 1フレームの速さの変化は、加減速の上限(速い方の速さ÷0.4秒)を超えない
      expect(Math.abs(sp[i] - sp[i - 1])).toBeLessThanOrEqual((HUNTER_RUSH_SPEED / HUNTER_PATROL_ACCEL_S) / 60 + 1e-6);
    }
  });
  it('止まれ(0)と言われたら同じ向きのまま減速する', () => {
    const { e, sp } = run(hunter(0, 0, HUNTER_PATROL_SPEED, 0), 0, { x: -3000, y: 0 }, 6);
    expect(sp[5]).toBeLessThan(HUNTER_PATROL_SPEED);
    expect(e.vx).toBeGreaterThanOrEqual(0); // 逆向きに振れない
  });
});
