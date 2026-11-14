import { describe, it, expect } from 'vitest';
import {
  bloodDripSpec, BLOOD_DRIP_CARRY_MIN, BLOOD_DRIP_CARRY_MAX, BLOOD_DRIP_SIDE_MIN, BLOOD_DRIP_SIDE_MAX,
  BLOOD_DRIP_H_MIN, BLOOD_DRIP_H_MAX,
} from './bloodDrip';

const body = { x: 1000, y: 500, width: 40, height: 80 };
const seeded = (seed: number) => { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

describe('bloodDripSpec(滴の出どころと初速)', () => {
  it('出どころは体の中心1点ではない: 左右に体幅の 0.3〜0.4・高さ 0.5〜0.9 の範囲に散る', () => {
    const rnd = seeded(1);
    const cx = body.x + body.width / 2;
    let left = 0, right = 0;
    for (let i = 0; i < 400; i++) {
      const d = bloodDripSpec(body, 0, 0, false, rnd);
      const dx = Math.abs(d.x - cx) / body.width;
      expect(dx).toBeGreaterThanOrEqual(BLOOD_DRIP_SIDE_MIN - 1e-9);
      expect(dx).toBeLessThanOrEqual(BLOOD_DRIP_SIDE_MAX + 1e-9);
      const h = (d.y - body.y) / body.height;
      expect(h).toBeGreaterThanOrEqual(BLOOD_DRIP_H_MIN - 1e-9);
      expect(h).toBeLessThanOrEqual(BLOOD_DRIP_H_MAX + 1e-9);
      if (d.x < cx) left++; else right++;
    }
    expect(left).toBeGreaterThan(100);  // 停止中は左右半々
    expect(right).toBeGreaterThan(100);
  });
  it('足の線(体矩形の下端)で止まる・出どころはその上', () => {
    const d = bloodDripSpec(body, 200, 0, true, seeded(2));
    expect(d.floorY).toBe(body.y + body.height);
    expect(d.y).toBeLessThan(d.floorY);
  });
  it('走っている時: 世界速度は体の速度の 10〜20% を前へ持ち越すだけ(後方へ加速しない)', () => {
    const rnd = seeded(3);
    for (let i = 0; i < 300; i++) {
      const vx = 240, vy = -60;
      const d = bloodDripSpec(body, vx, vy, true, rnd);
      // 前へ(体と同じ向き)。揺らぎ ±7 を含めても、旧(後方へ 50〜240px/s)のような負の大きな値にはならない
      expect(d.vx).toBeGreaterThanOrEqual(vx * BLOOD_DRIP_CARRY_MIN - 7 - 1e-9);
      expect(d.vx).toBeLessThanOrEqual(vx * BLOOD_DRIP_CARRY_MAX + 7 + 1e-9);
      expect(d.vx).toBeGreaterThan(0);
      expect(Math.abs(d.vx)).toBeLessThan(vx * 0.3);
      expect(d.vy).toBeLessThanOrEqual(0);
      expect(d.vy).toBeGreaterThanOrEqual(vy * BLOOD_DRIP_CARRY_MAX - 20 - 1e-9);
    }
  });
  it('左へ走る時は左へ持ち越す(向きが体と一致)', () => {
    const rnd = seeded(4);
    for (let i = 0; i < 100; i++) expect(bloodDripSpec(body, -240, 0, true, rnd).vx).toBeLessThan(0);
  });
  it('走っている時は背中側から多く滴る(右へ走れば左寄り)', () => {
    const rnd = seeded(5);
    const cx = body.x + body.width / 2;
    let trailing = 0;
    const N = 600;
    for (let i = 0; i < N; i++) if (bloodDripSpec(body, 240, 0, true, rnd).x < cx) trailing++;
    expect(trailing / N).toBeGreaterThan(0.55);
    expect(trailing / N).toBeLessThan(0.75);
  });
  it('停止中は今のまま: ほぼ真下へ(横 ±8・下へ 0〜10)', () => {
    const rnd = seeded(6);
    for (let i = 0; i < 100; i++) {
      const d = bloodDripSpec(body, 0, 0, false, rnd);
      expect(Math.abs(d.vx)).toBeLessThanOrEqual(8);
      expect(d.vy).toBeGreaterThanOrEqual(0);
      expect(d.vy).toBeLessThanOrEqual(10);
    }
  });
});
