// ★止めの間の押しの出だし(社長承認2026-11-14「敵の浮く動作がまだ少しぎごちない」①・utils/knockbackStopCreep)。
// 押しの合計の距離は旧(止めの間は0・明けで ((止め+280)/280)² 倍の直線減衰)と同じ・止めの明けに速さが段差で跳ばない・加速で始まる、を固める。
import { describe, it, expect } from 'vitest';
import { kbStopCreepFrameFactor, kbStopLegacyFrameSum, kbCreepShape, kbCreepShapeCum, KB_CREEP_BASE_MS } from './knockbackStopCreep';
import { KNOCKBACK_DURATION, kbStopBoost } from '../store/gameStore';

/** 刻み dt・位相 phase(当たりから最初のフレームまで)で押しを最後まで足す。返り値=[旧の和, 新の和, 新の1フレームごとの掛け]。 */
const run = (S: number, dt: number, phase: number) => {
  const T = S + KB_CREEP_BASE_MS;
  let oldSum = 0, newSum = 0;
  const fs: number[] = [];
  for (let t = phase; T - t > 0; t += dt) {
    const r = T - t;
    oldSum += (r > KB_CREEP_BASE_MS ? 0 : kbStopBoost(S) * Math.min(1, r / KB_CREEP_BASE_MS)) * dt;
    const f = kbStopCreepFrameFactor(r, S, dt);
    fs.push(f); newSum += f * dt;
  }
  return { oldSum, newSum, fs };
};

describe('押しの出だし(止めの間もゆっくり押し始める)', () => {
  it('基準の尺は KNOCKBACK_DURATION と同じ', () => {
    expect(KB_CREEP_BASE_MS).toBe(KNOCKBACK_DURATION);
  });
  it('★合計の距離は旧と同じ(同じ刻み・同じ位相なら・止めの長さ・刻み・位相を振る)', () => {
    for (const S of [40, 90, 110, 150, 183, 220, 340]) {
      for (const dt of [1000 / 60, 16, 1000 / 30, 1000 / 120]) {
        for (const phase of [0, dt * 0.13, dt * 0.5, dt * 0.97]) {
          const { oldSum, newSum } = run(S, dt, phase);
          expect(newSum, `S=${S} dt=${dt.toFixed(2)} phase=${phase.toFixed(2)}`).toBeCloseTo(oldSum, 6);
          expect(kbStopLegacyFrameSum(S + KB_CREEP_BASE_MS - phase, S, dt)).toBeCloseTo(oldSum, 6);
        }
      }
    }
  });
  it('止めの間も押し始める・速さは 0 から加速して始まり・止めの明けで段差が出ない(旧の段差より十分小さい)', () => {
    const S = 183, dt = 1000 / 60;
    const { fs } = run(S, dt, 0);
    expect(fs[0]).toBeGreaterThanOrEqual(0);
    expect(fs[0]).toBeLessThan(0.05);
    // 止めの間に動いている(旧は 0)
    const stopFrames = Math.floor(S / dt);
    expect(fs.slice(0, stopFrames).some(f => f > 0)).toBe(true);
    // 立ち上がりは単調に増える(山まで)
    const peakI = fs.indexOf(Math.max(...fs));
    expect(peakI).toBeGreaterThan(stopFrames - 1);
    for (let i = 1; i <= peakI; i++) expect(fs[i]).toBeGreaterThanOrEqual(fs[i - 1]);
    // 1フレームの速さの段差の最大 < 旧の明けの段差(0 → 補正×1)の 1/3
    let maxStep = 0;
    for (let i = 1; i < fs.length; i++) maxStep = Math.max(maxStep, Math.abs(fs[i] - fs[i - 1]));
    expect(maxStep).toBeLessThan(kbStopBoost(S) / 3);
    // 山は旧の最初の速さ(補正)より低い
    expect(Math.max(...fs)).toBeLessThan(kbStopBoost(S));
  });
  it('止めの無い押しは旧の直線減衰のまま', () => {
    for (const r of [300, 280, 200, 50, 1]) expect(kbStopCreepFrameFactor(r, 0, 16)).toBeCloseTo(Math.min(1, r / 280), 9);
    expect(kbStopCreepFrameFactor(0, 100, 16)).toBe(0);
  });
  it('形の積分の閉じた式は数値積分と一致する', () => {
    for (const S of [0, 90, 183]) {
      let acc = 0; const h = 0.01;
      for (let e = h / 2; e < S + KB_CREEP_BASE_MS; e += h) acc += kbCreepShape(e, S) * h;
      expect(kbCreepShapeCum(S + KB_CREEP_BASE_MS, S)).toBeCloseTo(acc, 3);
      expect(kbCreepShapeCum(S + 33, S)).toBeCloseTo((() => { let a = 0; for (let e = h / 2; e < S + 33; e += h) a += kbCreepShape(e, S) * h; return a; })(), 3);
    }
  });
});
