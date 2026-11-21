import { describe, expect, it } from 'vitest';
import {
  PLAYER_INTRO_HELI_FRAC, PLAYER_INTRO_HELI_FAR_X, PLAYER_INTRO_HELI_NEAR_Y, PLAYER_INTRO_HELI_START_SCALE,
  PLAYER_INTRO_LOW_Y, playerIntroOffset, playerIntroScale, playerIntroDescent, playerIntroHeliProgress,
} from './gameStore';

// 登場のヘリ飛来(フェーズA)。社長指示2026-11-21「左下の手前から、ステージの真ん中へヘリ等倍になるように、
// カーブを描きながら慣性を持って移動。移動距離は今と同じ」。
const hf = PLAYER_INTRO_HELI_FRAC;
const N = 200;
const ts = Array.from({ length: N + 1 }, (_, i) => (i / N) * hf * 0.999999);

describe('登場のヘリ飛来(左下の手前 → 着地点で等倍)', () => {
  it('出発点は左下の手前(左=x<0・下=y>0・等倍より大きい)', () => {
    const o = playerIntroOffset(0);
    expect(o.x).toBeCloseTo(-PLAYER_INTRO_HELI_FAR_X, 6);
    expect(o.y).toBeCloseTo(PLAYER_INTRO_HELI_NEAR_Y, 6);
    expect(o.x).toBeLessThan(0);
    expect(o.y).toBeGreaterThan(0);
    expect(playerIntroScale(0)).toBe(PLAYER_INTRO_HELI_START_SCALE);
    expect(PLAYER_INTRO_HELI_START_SCALE).toBeGreaterThan(1);
  });
  it('フェーズAの終わりで着地点(フェーズB開始点)・等倍に着く', () => {
    const o = playerIntroOffset(hf - 1e-9);
    expect(o.x).toBeCloseTo(0, 3);
    expect(o.y).toBeCloseTo(-PLAYER_INTRO_LOW_Y, 3);
    expect(playerIntroScale(hf - 1e-9)).toBeCloseTo(1, 6);
    expect(playerIntroScale(hf)).toBe(1);
    expect(playerIntroOffset(hf)).toEqual({ x: 0, y: 0 });
  });
  it('移動距離(出発点→着地点の直線)は旧軌道(-4500,-420 → 0,-28)と同じ(±1%)', () => {
    const old = Math.hypot(4500, 420 - PLAYER_INTRO_LOW_Y);
    const o0 = playerIntroOffset(0);
    const d = Math.hypot(o0.x, o0.y + PLAYER_INTRO_LOW_Y);
    expect(Math.abs(d - old) / old).toBeLessThan(0.01);
  });
  it('着地点へ単調に近づき、縮尺も単調に1へ縮む(行きすぎ・戻りが無い)', () => {
    let prevD = Infinity;
    let prevS = Infinity;
    for (const t of ts) {
      const o = playerIntroOffset(t);
      const d = Math.hypot(o.x, o.y + PLAYER_INTRO_LOW_Y);
      const s = playerIntroScale(t);
      expect(d).toBeLessThanOrEqual(prevD + 1e-6);
      expect(s).toBeLessThanOrEqual(prevS + 1e-9);
      expect(s).toBeGreaterThanOrEqual(1);
      prevD = d; prevS = s;
    }
  });
  it('曲線を描く(直線から外れる)', () => {
    const o0 = playerIntroOffset(0);
    const ex = 0, ey = -PLAYER_INTRO_LOW_Y;
    const len = Math.hypot(ex - o0.x, ey - o0.y);
    let maxDev = 0;
    for (const t of ts) {
      const o = playerIntroOffset(t);
      const dev = Math.abs((ex - o0.x) * (o0.y - o.y) - (o0.x - o.x) * (ey - o0.y)) / len;
      maxDev = Math.max(maxDev, dev);
    }
    expect(maxDev).toBeGreaterThan(200);
  });
  it('慣性: 速度を持って入り、加速してから着地へ減速して止まる', () => {
    const p = playerIntroHeliProgress;
    expect(p(0)).toBe(0);
    expect(p(1)).toBeCloseTo(1, 9);
    const v = (a: number) => (p(a + 1e-4) - p(a)) / 1e-4;
    expect(v(0)).toBeGreaterThan(0.5);             // 入ってきた時点で既に動いている
    expect(v(0.25)).toBeGreaterThan(v(0));          // 加速
    expect(v(0.999)).toBeLessThan(0.05);            // 着地で止まる
    for (let a = 0; a < 1; a += 0.01) expect(p(a + 0.01)).toBeGreaterThanOrEqual(p(a));
  });
  it('下(手前)から来るので寄りズームの高さ係数は常に0(フェーズAとBの境目に段差なし)', () => {
    for (const t of ts) expect(playerIntroDescent(t)).toBe(0);
    expect(playerIntroDescent(hf)).toBe(0);
  });
});
