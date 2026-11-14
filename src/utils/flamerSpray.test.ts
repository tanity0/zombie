import { describe, it, expect } from 'vitest';
import { FLAMER_RANGE_PX, FLAMER_HALF_ANGLE_RAD, FLAMER_PULSE_MS } from './flamerCone';
import {
  FLAMER_SPRAY_SLOTS, FLAMER_SPRAY_LIFE_MAX_MS, FLAMER_SPRAY_LIFE_MIN_MS, FLAMER_TIP_RANGE_MUL, flamerSprayLifeMs,
  flamerSprayParticle, flamerSprayParticleAt, flamerSprayStopAt, flamerSprayTravel, flamerSprayRole,
  type FlamerSprayOrigin,
} from './flamerSpray';

const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1], [Math.SQRT1_2, -Math.SQRT1_2], [-0.6, 0.8], [0.8, 0.6]];
const angDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const still = (o: FlamerSprayOrigin) => () => o;

describe('flamerSpray', () => {
  it('塊・中・噴流は生まれた時の扇と射程の中(火の粉は射程の+15%まで・半角の中)', () => {
    for (const [dx, dy] of DIRS) {
      const base = Math.atan2(dy, dx);
      const o = { x: 300, y: -200, dirX: dx, dirY: dy };
      for (let i = 0; i < FLAMER_SPRAY_SLOTS; i++) {
        const role = flamerSprayRole(i);
        const lim = (role === 'tip' ? FLAMER_TIP_RANGE_MUL : 1) * FLAMER_RANGE_PX;
        for (let n = 0; n < 12; n++) {
          for (let u = 0; u < 1; u += 0.035) {
            const p = flamerSprayParticleAt(i, n, u, o);
            if (!p) continue;
            const rx = p.x - o.x, ry = p.y - o.y;
            expect(Math.hypot(rx, ry)).toBeLessThanOrEqual(lim + 1e-6);
            expect(Math.abs(angDiff(Math.atan2(ry, rx), base))).toBeLessThanOrEqual(FLAMER_HALF_ANGLE_RAD + 1e-6);
          }
        }
      }
    }
  });

  it('根元(中心から20px以内)に塊を置かない', () => {
    for (const [dx, dy] of DIRS) {
      const o = { x: 0, y: 0, dirX: dx, dirY: dy };
      for (let i = 0; i < FLAMER_SPRAY_SLOTS; i++) for (let n = 0; n < 30; n++) for (let u = 0; u < 1; u += 0.01) {
        const p = flamerSprayParticleAt(i, n, u, o);
        if (p && p.size === 3) expect(Math.hypot(p.x, p.y)).toBeGreaterThan(20);
      }
    }
  });

  it('同じ入力なら同じ出力', () => {
    const o = still({ x: 10, y: 20, dirX: 0.3, dirY: 0.95 });
    for (let i = 0; i < FLAMER_SPRAY_SLOTS; i++) {
      expect(flamerSprayParticle(i, 1873, 1000, 1850, o)).toEqual(flamerSprayParticle(i, 1873, 1000, 1850, o));
    }
  });

  it('寿命は 250〜450ms でばらつく', () => {
    const lives = Array.from({ length: FLAMER_SPRAY_SLOTS }, (_, i) => flamerSprayLifeMs(i));
    for (const l of lives) {
      expect(l).toBeGreaterThanOrEqual(FLAMER_SPRAY_LIFE_MIN_MS);
      expect(l).toBeLessThanOrEqual(FLAMER_SPRAY_LIFE_MAX_MS);
    }
    expect(new Set(lives.map(l => Math.round(l))).size).toBeGreaterThan(FLAMER_SPRAY_SLOTS / 2);
  });

  it('噴き始め直後は遠くに粒が無く、少し経つと扇が満ちる', () => {
    const start = 5000;
    const o = still({ x: 0, y: 0, dirX: 1, dirY: 0 });
    for (let i = 0; i < FLAMER_SPRAY_SLOTS; i++) {
      const p = flamerSprayParticle(i, start + 30, start, start + 30, o);
      if (p) expect(Math.hypot(p.x, p.y)).toBeLessThan(FLAMER_RANGE_PX * 0.5);
    }
    expect(flamerSprayParticle(0, start - 1, start, start, o)).toBeNull();
    let visible = 0, far = 0;
    const t = start + 800;
    for (let i = 0; i < FLAMER_SPRAY_SLOTS; i++) {
      const p = flamerSprayParticle(i, t, start, t, o);
      if (!p) continue;
      visible++;
      if (Math.hypot(p.x, p.y) > FLAMER_RANGE_PX * 0.6) far++;
    }
    expect(visible).toBeGreaterThan(FLAMER_SPRAY_SLOTS * 0.7);
    expect(far).toBeGreaterThan(0);
  });

  it('止めた後(最後のパルス+2パルス+最大寿命)には全部消えている/止めた直後はまだ飛んでいる', () => {
    const start = 0, last = 1500;
    const o = still({ x: 0, y: 0, dirX: 1, dirY: 0 });
    const stop = flamerSprayStopAt(last);
    expect(stop).toBe(last + FLAMER_PULSE_MS * 2);
    let alive = 0;
    for (let i = 0; i < FLAMER_SPRAY_SLOTS; i++) {
      expect(flamerSprayParticle(i, stop + FLAMER_SPRAY_LIFE_MAX_MS + 1, start, last, o)).toBeNull();
      expect(flamerSprayParticle(i, stop + 5000, start, last, o)).toBeNull();
      if (flamerSprayParticle(i, stop + 30, start, last, o)) alive++;
    }
    expect(alive).toBeGreaterThan(0);
  });

  it('速さが単調に落ちる(減速・指数 2.0〜3.2 のどれでも)', () => {
    for (const k of [2.0, 2.6, 3.2]) {
      let prevStep = Infinity;
      for (let s = 0; s < 50; s++) {
        const step = flamerSprayTravel((s + 1) / 50, k) - flamerSprayTravel(s / 50, k);
        expect(step).toBeGreaterThan(0);
        expect(step).toBeLessThan(prevStep);
        prevStep = step;
      }
      expect(flamerSprayTravel(0, k)).toBe(0);
      expect(flamerSprayTravel(1, k)).toBe(1);
    }
  });

  it('生まれた時の位置・向きで飛ぶ(持ち主が後で動いても、飛んでいる粒の世界座標は変わらない)', () => {
    const start = 0, T0 = 1000;
    const before = { x: 100, y: 100, dirX: 1, dirY: 0 };
    const after = { x: 400, y: -50, dirX: 0, dirY: 1 };
    // 2つの履歴: T0 までは同じ、T0 より後は片方だけ持ち主が動いて振り向いた。
    const histA = () => before;
    const histB = (b: number) => (b <= T0 ? before : after);
    const t = T0 + 60;
    let compared = 0;
    for (let i = 0; i < FLAMER_SPRAY_SLOTS; i++) {
      const pa = flamerSprayParticle(i, t, start, t, histA);
      const pb = flamerSprayParticle(i, t, start, t, histB);
      // T0 以前に生まれた粒(=pa と pb で origin が同じ)は同じ世界座標。
      const born = pa && t - pa.u * flamerSprayLifeMs(i);
      if (pa && pb && born !== null && born <= T0) { expect(pb).toEqual(pa); compared++; }
    }
    expect(compared).toBeGreaterThan(FLAMER_SPRAY_SLOTS / 2);
  });

  it('1つの粒は色の段が戻らない(煤は最後だけ)', () => {
    const o = { x: 0, y: 0, dirX: 1, dirY: 0 };
    for (let i = 0; i < FLAMER_SPRAY_SLOTS; i++) for (let n = 0; n < 10; n++) {
      let prev = -1;
      for (let u = 0; u < 1; u += 0.01) {
        const p = flamerSprayParticleAt(i, n, u, o);
        if (!p) continue;
        expect(p.stage).toBeGreaterThanOrEqual(prev === 4 ? 4 : Math.min(prev, 2));
        prev = p.stage;
      }
    }
  });
});
