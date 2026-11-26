// ボスの叩きつけ・振り回しの重さ・3連撃の純関数(社長指示2026-11-26)。
import { describe, it, expect } from 'vitest';
import {
  whipOverheadProgress, whipOverheadProgressVel, whipOverheadGround, whipOverheadLanding, WHIP_OVERHEAD_LAND_TURNS, WHIP_OVERHEAD_MS, WHIP_OVERHEAD_RISE_FRAC,
  whipSwingSpinAt, whipSwingMaxAngVel, WHIP_SWING_ACCEL_MS, WHIP_SWING_MAX_MS, WHIP_SWING_SURGE,
} from './whipSwing';
import {
  whipOverheadLiftPx, whipOverheadPeakPx, whipOverheadRot, whipOverheadAfterSlam, whipOverheadAfterDrop, whipOverheadSide,
  whipOverheadRotMax, whipOverheadAlpha, whipOverheadBodyPose, whipOverheadFace, whipRopeShape,
  whipRopeSweepOffset, WHIP_OVERHEAD_LAND_HOLD_MS, WHIP_OVERHEAD_STANDUP_MS, WHIP_OVERHEAD_CLEAR_PX, WHIP_OVERHEAD_PEAK_MIN_PX, WHIP_OVERHEAD_BODY_RECOVER_MS,
  WHIP_ROPE_FINISH_PULL,
} from './whipSwingMotion';
import {
  whipComboNextStage, whipComboCritBonus, whipComboLight, whipComboSweepSign, whipComboQueuedAction, whipComboTapAction, whipComboFeel,
  WHIP_COMBO_RESET_MS, WHIP_COMBO_QUEUE_MAX_MS,
} from './whipCombo';

const T = WHIP_OVERHEAD_MS;

describe('叩きつけの弧の進み', () => {
  it('0→1・単調・頂点(持ち上げの終わり)で s=0.5 を止まらずに越える・叩きつける瞬間が一番速い', () => {
    expect(whipOverheadProgress(0)).toBe(0);
    expect(whipOverheadProgress(T)).toBeCloseTo(1, 9);
    expect(whipOverheadProgress(T * WHIP_OVERHEAD_RISE_FRAC)).toBeCloseTo(0.5, 9);
    let prev = 0;
    for (let t = 1; t <= T; t++) { const s = whipOverheadProgress(t); expect(s).toBeGreaterThanOrEqual(prev - 1e-12); prev = s; }
    expect(whipOverheadProgressVel(0)).toBeCloseTo(0, 9); // 止まった所から持ち上げる
    expect(whipOverheadProgressVel(T * WHIP_OVERHEAD_RISE_FRAC)).toBeGreaterThan(0.5 / T); // 頂点で止まらない
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
  it('頂点の前後(弧の ±18°)に居る時間は 80〜130ms(見え方の監査 A3: 旧 約300ms)', () => {
    let n = 0;
    for (let t = 0; t <= T; t++) if (Math.abs(whipOverheadProgress(t) - 0.5) < 0.1) n++;
    expect(n).toBeGreaterThanOrEqual(80);
    expect(n).toBeLessThanOrEqual(130);
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
  it('山: 頭上で回ったボスの絵の一番下がプレイヤーの頭を越える・大きいボスほど高い・上限で止まる', () => {
    const rot = 0.6;
    const peak = whipOverheadPeakPx(70, 300, 320, rot);
    const hh = 150, hw = 160, r = rot / 2;
    const lowest = peak + hh - (hh * Math.cos(r) + hw * Math.sin(r)); // 頭上の絵の一番下の高さ
    expect(lowest).toBeCloseTo(70 + WHIP_OVERHEAD_CLEAR_PX, 6);
    expect(whipOverheadPeakPx(70, 300, 320, rot)).toBeGreaterThan(whipOverheadPeakPx(70, 120, 90, rot));
    expect(whipOverheadPeakPx(70, 300, 320, rot, 50)).toBe(50);
    expect(whipOverheadPeakPx(70, 300, 320, rot, 5)).toBe(WHIP_OVERHEAD_PEAK_MIN_PX);
  });
  it('高さは掴んだ時と叩きつけで0・頭上で山', () => {
    const peak = 120;
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
  it('真横に置けない時は反対側のまま斜めへ(画面の手前=下を先に)・それも無ければ緩い条件で反対側', () => {
    const turn = whipOverheadLanding({ px: 0, py: 0, ex: 100, ey: 0, minDist: 50, fallbackUx: 1, fallbackUy: 0, free: x => x > -40, turns: WHIP_OVERHEAD_LAND_TURNS });
    expect(turn.kind).toBe('turn');
    expect(turn.x).toBeLessThan(0); // 反対側のまま
    expect(turn.y).toBeGreaterThan(0); // 手前(下)を先に
    const loose = whipOverheadLanding({ px: 0, py: 0, ex: 100, ey: 0, minDist: 50, fallbackUx: 1, fallbackUy: 0, free: () => false, turns: WHIP_OVERHEAD_LAND_TURNS, looseFree: x => x < 0 });
    expect(loose).toMatchObject({ x: -100, y: 0, kind: 'mirror' });
  });
});

describe('叩きつけの体の回り', () => {
  it('弧の回りは横倒しまで(±90°未満・大きい体ほど小さい)→横倒しで一拍→短い方へ戻りながら跳ねて起き上がる', () => {
    const rm = whipOverheadRotMax(170);
    expect(rm).toBeLessThan(Math.PI / 2);
    expect(whipOverheadRotMax(372)).toBeLessThan(rm);
    expect(whipOverheadRot(0, 1, rm)).toBe(0);
    expect(whipOverheadRot(T, 1, rm)).toBeCloseTo(rm, 6);
    expect(whipOverheadRot(T, -1, rm)).toBeCloseTo(-rm, 6);
    expect(whipOverheadAfterSlam(0, 1, rm, 10)).toEqual({ rot: rm, lift: 0 });
    expect(whipOverheadAfterSlam(WHIP_OVERHEAD_LAND_HOLD_MS - 1, 1, rm, 10).rot).toBeCloseTo(rm, 9);
    const mid = whipOverheadAfterSlam(WHIP_OVERHEAD_LAND_HOLD_MS + WHIP_OVERHEAD_STANDUP_MS / 2, 1, rm, 10);
    expect(mid.rot).toBeGreaterThan(0); expect(mid.rot).toBeLessThan(rm); // 来た向きの逆(短い方)へ戻る
    expect(mid.lift).toBeGreaterThan(5);
    expect(whipOverheadAfterSlam(WHIP_OVERHEAD_LAND_HOLD_MS + WHIP_OVERHEAD_STANDUP_MS + 1, 1, rm, 10)).toEqual({ rot: 0, lift: 0 });
    // 戻りは1ms で跳ばない
    for (let el = 0; el < WHIP_OVERHEAD_LAND_HOLD_MS + WHIP_OVERHEAD_STANDUP_MS; el++) {
      expect(Math.abs(whipOverheadAfterSlam(el + 1, 1, rm, 10).rot - whipOverheadAfterSlam(el, 1, rm, 10).rot)).toBeLessThan(0.02);
    }
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

describe('叩きつけの透け・プレイヤーの体と向き', () => {
  it('弧の間だけ透ける(掴んだ時と叩きつけは不透明)', () => {
    expect(whipOverheadAlpha(0)).toBe(1);
    expect(whipOverheadAlpha(T)).toBeCloseTo(1, 6);
    expect(whipOverheadAlpha(T * WHIP_OVERHEAD_RISE_FRAC)).toBeLessThan(0.7);
  });
  it('担ぎ上げ=振り上げの絵で伸び上がる → 叩きつけでしゃがみの底 → 立ち姿へ', () => {
    const up = whipOverheadBodyPose(T * 0.5);
    expect(up.pose).toBe('swing'); expect(up.sqY).toBeGreaterThan(1); expect(up.lean).toBeLessThan(0);
    const slam = whipOverheadBodyPose(T, T, 0);
    expect(slam.pose).toBe('ready'); expect(slam.sqY).toBeLessThan(1); expect(slam.lean).toBeGreaterThan(0);
    const justBefore = whipOverheadBodyPose(T - 1);
    expect(Math.abs(justBefore.sqY - slam.sqY)).toBeLessThan(0.01); // 叩きつけの瞬間に形が跳ばない
    expect(whipOverheadBodyPose(T, T, WHIP_OVERHEAD_BODY_RECOVER_MS).pose).toBeNull();
  });
  it('向き: 頭上を越えるまで掴んだ側・越えたら着地点の側', () => {
    expect(whipOverheadFace(0.2, 0, 100, -100, 1)).toBe(1);
    expect(whipOverheadFace(0.7, 0, 100, -100, 1)).toBe(-1);
    expect(whipOverheadFace(0.7, 0, 2, -3, 1)).toBe(1);
  });
});

describe('3段目の振りかぶり', () => {
  it('手元を大きく後ろ上へ引き、パチンの瞬間はまっすぐのまま', () => {
    const W = 250;
    const n = whipRopeShape(W * 0.5, W), f = whipRopeShape(W * 0.5, W, undefined, WHIP_ROPE_FINISH_PULL);
    expect(Math.hypot(f.handX, f.handY)).toBeGreaterThan(Math.hypot(n.handX, n.handY) * 1.3);
    // 溜めの形が違う(S字でなく、真後ろへまっすぐ)
    const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
    expect(spread(f.angles)).toBeLessThan(spread(n.angles));
    const crack = whipRopeShape(W, W, undefined, WHIP_ROPE_FINISH_PULL);
    expect(crack.angles.every(a => a === 0)).toBe(true);
    expect(crack.handX).toBe(0);
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
