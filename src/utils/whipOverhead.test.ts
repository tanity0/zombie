// ボスの叩きつけ・振り回しの重さ・3連撃の純関数(社長指示2026-11-26)。
import { describe, it, expect } from 'vitest';
import {
  whipOverheadProgress, whipOverheadProgressVel, whipOverheadGround, whipOverheadLanding, WHIP_OVERHEAD_MS, WHIP_OVERHEAD_RISE_FRAC,
  whipSwingSpinAt, whipSwingMaxAngVel, WHIP_SWING_ACCEL_MS, WHIP_SWING_MAX_MS, WHIP_SWING_SURGE,
} from './whipSwing';
import {
  whipOverheadLiftPx, whipOverheadPeakPx, whipOverheadRot, whipOverheadAfterSlamRot, whipOverheadAfterDrop, whipOverheadSide,
  whipRopeSweepOffset, WHIP_OVERHEAD_PEAK_K, WHIP_OVERHEAD_LAND_HOLD_MS, WHIP_OVERHEAD_STANDUP_MS,
} from './whipSwingMotion';
import {
  whipComboNextStage, whipComboCritBonus, whipComboLight, whipComboSweepSign, whipComboQueuedAction, whipComboTapAction, whipComboFeel,
  WHIP_COMBO_RESET_MS, WHIP_COMBO_QUEUE_MAX_MS,
} from './whipCombo';

const T = WHIP_OVERHEAD_MS;

describe('叩きつけの弧の進み', () => {
  it('0→1・単調・頂点(持ち上げの終わり)で s=0.5 かつ速さ0・叩きつける瞬間が一番速い', () => {
    expect(whipOverheadProgress(0)).toBe(0);
    expect(whipOverheadProgress(T)).toBeCloseTo(1, 9);
    expect(whipOverheadProgress(T * WHIP_OVERHEAD_RISE_FRAC)).toBeCloseTo(0.5, 9);
    let prev = 0;
    for (let t = 1; t <= T; t++) { const s = whipOverheadProgress(t); expect(s).toBeGreaterThanOrEqual(prev - 1e-12); prev = s; }
    expect(whipOverheadProgressVel(T * WHIP_OVERHEAD_RISE_FRAC)).toBeCloseTo(0, 9);
    let vmax = 0, tmax = 0;
    for (let t = 1; t < T; t++) { const v = whipOverheadProgressVel(t); if (v > vmax) { vmax = v; tmax = t; } }
    expect(tmax).toBeGreaterThan(T - 3);
  });
  it('速さは途切れない(1ms ごとの速さの差が小さい)・持ち上げは振り下ろしより遅い', () => {
    for (let t = 1; t < T - 1; t++) {
      expect(Math.abs(whipOverheadProgressVel(t + 1) - whipOverheadProgressVel(t))).toBeLessThan(2e-4);
    }
    const riseMax = Math.max(...Array.from({ length: Math.floor(T * WHIP_OVERHEAD_RISE_FRAC) }, (_, i) => whipOverheadProgressVel(i)));
    expect(whipOverheadProgressVel(T - 1)).toBeGreaterThan(riseMax * 1.5);
  });
  it('頂点の前後は遅い(一瞬ためる)', () => {
    const ta = T * WHIP_OVERHEAD_RISE_FRAC;
    expect(whipOverheadProgress(ta + 60) - whipOverheadProgress(ta - 60)).toBeLessThan(0.05);
  });
});

describe('叩きつけの地面の位置・高さ・着地点', () => {
  it('掴んだ点→頭上(弧の中心)→着地点', () => {
    const g0 = whipOverheadGround(0, 0, 0, 100, 20, -100, -20);
    expect(g0).toEqual({ x: 100, y: 20 });
    const gm = whipOverheadGround(0.5, 0, 0, 100, 20, -100, -20);
    expect(Math.hypot(gm.x, gm.y)).toBeLessThan(1e-9);
    const g1 = whipOverheadGround(1, 0, 0, 100, 20, -90, -10);
    expect(g1.x).toBeCloseTo(-90, 9); expect(g1.y).toBeCloseTo(-10, 9);
  });
  it('高さは掴んだ時と叩きつけで0・頭上で山(プレイヤーの体の高さ×1.4)', () => {
    const peak = whipOverheadPeakPx(70);
    expect(peak).toBeCloseTo(70 * WHIP_OVERHEAD_PEAK_K, 9);
    expect(whipOverheadLiftPx(0, peak)).toBeCloseTo(0, 9);
    expect(whipOverheadLiftPx(T, peak)).toBeCloseTo(0, 6);
    expect(whipOverheadLiftPx(T * WHIP_OVERHEAD_RISE_FRAC, peak)).toBeCloseTo(peak, 6);
  });
  it('着地点: 反対側・同じ距離。近すぎれば体の大きさまで離す。置けなければ手前へ、それも無理なら掴んだ点', () => {
    const free = () => true;
    expect(whipOverheadLanding({ px: 0, py: 0, ex: 100, ey: 0, minDist: 50, fallbackUx: 1, fallbackUy: 0, free })).toMatchObject({ x: -100, y: 0, kind: 'mirror' });
    const near = whipOverheadLanding({ px: 0, py: 0, ex: 20, ey: 0, minDist: 80, fallbackUx: 1, fallbackUy: 0, free });
    expect(near.x).toBeCloseTo(-80, 9);
    const wall = whipOverheadLanding({ px: 0, py: 0, ex: 100, ey: 0, minDist: 50, fallbackUx: 1, fallbackUy: 0, free: x => x > -70 });
    expect(wall.kind).toBe('near'); expect(wall.x).toBeGreaterThan(-70); expect(wall.x).toBeLessThanOrEqual(-50);
    const none = whipOverheadLanding({ px: 0, py: 0, ex: 100, ey: 0, minDist: 50, fallbackUx: 1, fallbackUy: 0, free: x => x > 0 });
    expect(none).toMatchObject({ x: 100, y: 0, kind: 'start' });
  });
});

describe('叩きつけの体の回り', () => {
  it('弧で半回転(叩きつけで逆さま)→一拍→同じ向きへ回って起き上がる', () => {
    expect(whipOverheadRot(0, 1)).toBe(0);
    expect(whipOverheadRot(T, 1)).toBeCloseTo(Math.PI, 6);
    expect(whipOverheadRot(T, -1)).toBeCloseTo(-Math.PI, 6);
    expect(whipOverheadAfterSlamRot(0, 1)).toBeCloseTo(Math.PI, 9);
    expect(whipOverheadAfterSlamRot(WHIP_OVERHEAD_LAND_HOLD_MS + WHIP_OVERHEAD_STANDUP_MS / 2, 1)).toBeGreaterThan(Math.PI);
    expect(whipOverheadAfterSlamRot(WHIP_OVERHEAD_LAND_HOLD_MS + WHIP_OVERHEAD_STANDUP_MS + 1, 1)).toBe(0);
    expect(whipOverheadSide(100, -100, 1)).toBe(-1);
    expect(whipOverheadSide(-100, 100, -1)).toBe(1);
  });
  it('途中で放すと高さは重さで地面へ・回りは正立へ寄る(瞬間に戻らない)', () => {
    const d0 = whipOverheadAfterDrop(0, 90, 0.1, 1.2, 0.003);
    expect(d0.lift).toBeCloseTo(90, 6);
    const d1 = whipOverheadAfterDrop(16, 90, 0.1, 1.2, 0.003);
    expect(d1.lift).toBeGreaterThan(80);
    expect(whipOverheadAfterDrop(600, 90, 0.1, 1.2, 0.003).lift).toBe(0);
    expect(Math.abs(whipOverheadAfterDrop(600, 90, 0.1, 1.2, 0.003).rot)).toBeLessThan(0.05);
  });
});

describe('振り回しの重さ(回り出しが重い・速さが揺れる・投げる前に溜める)', () => {
  const spin = { a0: 0, dir: 1 as const, maxMs: WHIP_SWING_MAX_MS };
  it('回り出しはゆっくり(出だしの加速も0)', () => {
    expect(whipSwingSpinAt(30, spin).w).toBeLessThan(whipSwingMaxAngVel() * 0.05);
    expect(whipSwingSpinAt(WHIP_SWING_ACCEL_MS / 2, spin).w).toBeLessThan(whipSwingMaxAngVel() * 0.75);
  });
  it('最高速に届いた後も、角度で速さが揺れる(手前で速く奥で遅い)', () => {
    let lo = Infinity, hi = 0;
    for (let t = WHIP_SWING_ACCEL_MS; t < WHIP_SWING_MAX_MS - 500; t += 5) { const w = whipSwingSpinAt(t, spin).w; lo = Math.min(lo, w); hi = Math.max(hi, w); }
    expect(hi / lo).toBeGreaterThan(1.4);
  });
  it('最長の手前で一段速くなる(溜め)', () => {
    const before = whipSwingSpinAt(WHIP_SWING_MAX_MS - 520, spin);
    const end = whipSwingSpinAt(WHIP_SWING_MAX_MS - 1, spin);
    const sway = (th: number) => 1 + 0.3 * Math.sin(th);
    expect(end.w / sway(end.th)).toBeGreaterThan((before.w / sway(before.th)) * (WHIP_SWING_SURGE - 0.05));
  });
  it('角度は途切れない(1ms で跳ばない)', () => {
    let prev = whipSwingSpinAt(0, spin).th;
    for (let t = 1; t < WHIP_SWING_MAX_MS; t += 1) { const th = whipSwingSpinAt(t, spin).th; expect(Math.abs(th - prev)).toBeLessThan(0.03); prev = th; }
  });
});

describe('3連撃', () => {
  it('段は 1→2→3→1・戻る時間を過ぎたら1', () => {
    expect(whipComboNextStage(0, 0, 100)).toBe(1);
    expect(whipComboNextStage(1, 0, 300)).toBe(2);
    expect(whipComboNextStage(2, 0, 300)).toBe(3);
    expect(whipComboNextStage(3, 0, 300)).toBe(1);
    expect(whipComboNextStage(1, 0, WHIP_COMBO_RESET_MS + 1)).toBe(1);
  });
  it('会心の上乗せ・押しの有無・払いの向き・手応えの重さ', () => {
    expect(whipComboCritBonus(1)).toBe(0);
    expect(whipComboCritBonus(2)).toBeGreaterThan(0);
    expect(whipComboCritBonus(3)).toBeGreaterThan(whipComboCritBonus(2));
    expect(whipComboLight(1) && whipComboLight(2) && !whipComboLight(3)).toBe(true);
    expect(whipComboSweepSign(3, 0)).toBe(0);
    expect(whipComboSweepSign(1, 0)).toBe(-whipComboSweepSign(2, 0));
    // 上向き(先端が左→右へ動く=時計回り)
    expect(whipComboSweepSign(1, -Math.PI / 2)).toBe(1);
    const f1 = whipComboFeel(1), f2 = whipComboFeel(2), f3 = whipComboFeel(3);
    expect(f1.stopMs < f2.stopMs && f2.stopMs < f3.stopMs).toBe(true);
    expect(f1.shakeMag < f2.shakeMag && f2.shakeMag < f3.shakeMag).toBe(true);
    expect(f1.hitRate > f2.hitRate && f2.hitRate > f3.hitRate).toBe(true);
  });
  it('予約: 前隙・間隔の間は待ち、明けたら出す・古い予約は捨てる', () => {
    expect(whipComboTapAction(100, 200, false)).toBe('queue');
    expect(whipComboTapAction(200, 200, false)).toBe('swing');
    expect(whipComboQueuedAction(150, 100, 200, false)).toBe('wait');
    expect(whipComboQueuedAction(210, 100, 200, false)).toBe('fire');
    expect(whipComboQueuedAction(100 + WHIP_COMBO_QUEUE_MAX_MS + 1, 100, 200, false)).toBe('drop');
  });
  it('払い: パチンの瞬間はまっすぐ(0)・その前後で速さが途切れない', () => {
    const W = 250, sw = 1.1;
    expect(whipRopeSweepOffset(W, W, sw)).toBeCloseTo(0, 9);
    expect(whipRopeSweepOffset(W * 0.5, W, sw)).toBeCloseTo(-sw, 9);
    const v = (t: number) => whipRopeSweepOffset(t + 0.5, W, sw) - whipRopeSweepOffset(t - 0.5, W, sw);
    expect(Math.abs(v(W - 1) - v(W + 1))).toBeLessThan(0.002);
    expect(whipRopeSweepOffset(W + 400, W, sw)).toBeLessThan(sw * 0.5);
    expect(whipRopeSweepOffset(W + 400, W, sw)).toBeGreaterThan(0);
  });
});
