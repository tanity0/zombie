import { describe, it, expect } from 'vitest';
import {
  cineCameraAt, cineAccepts, thirdsPoint, CINE_KILL_CUT_FRAC, CINE_KILL_PUSH_START_MS, CINE_KILL_PUSH_MS,
  CINE_KILL_ORBIT_START_MS, CINE_KILL_ORBIT_MS, CINE_KILL_ORBIT_FRAC, CINE_COUNTER_OVERSHOOT, CINE_COUNTER_IN_MS,
  CINE_COUNTER_ORBIT_OUT_MS, CINE_COUNTER_ORBIT_BACK_MS, CINE_DEATH_FROM_FRAC, CINE_DEATH_IN_MS, CINE_THIRDS_T, type CineEvent,
  thirdsAim, cinePlateIn, cinePlateKinds, CINE_EXEC_CUT_FRAC, CINE_EXEC_PUSH1_TO, CINE_EXEC_PUSH2_START_MS, CINE_EXEC_PUSH2_MS,
  CINE_THIRDS_X_FRAC, CINE_FRAME_MARGIN_FRAC, CINE_PLATE_IN_MS,
} from './cineCamera';

describe('ダイナミック・カメラワーク(research/CINEMATIC_CAMERA.md v2・社長承認2026-09-14)', () => {
  it('KILL: カット(85%)で始まり、ストップ明けから押し込んで保持の前半で100%(最大寄り=スローの最遅区間の裁定を保つ)', () => {
    expect(cineCameraAt('kill', 0, 'full').zoomFrac).toBe(CINE_KILL_CUT_FRAC);
    expect(cineCameraAt('kill', CINE_KILL_PUSH_START_MS - 1, 'full').zoomFrac).toBe(CINE_KILL_CUT_FRAC);
    const mid = cineCameraAt('kill', CINE_KILL_PUSH_START_MS + CINE_KILL_PUSH_MS / 2, 'full').zoomFrac;
    expect(mid).toBeGreaterThan(CINE_KILL_CUT_FRAC); expect(mid).toBeLessThan(1);
    expect(cineCameraAt('kill', CINE_KILL_PUSH_START_MS + CINE_KILL_PUSH_MS, 'full').zoomFrac).toBeCloseTo(1, 9);
    expect(CINE_KILL_PUSH_START_MS + CINE_KILL_PUSH_MS).toBeLessThanOrEqual(100 + 560 * 0.5);
  });
  it('KILL: 横滑りは押し込みの後半から重ねて立ち上がる(終点と始点を同じ瞬間にしない)。三分割は full のみ。cutPush/pushOnly では構図を触らない', () => {
    expect(CINE_KILL_ORBIT_START_MS).toBeLessThan(CINE_KILL_PUSH_START_MS + CINE_KILL_PUSH_MS);
    expect(CINE_KILL_ORBIT_START_MS).toBeGreaterThan(CINE_KILL_PUSH_START_MS);
    expect(cineCameraAt('kill', CINE_KILL_ORBIT_START_MS, 'full').orbitFrac).toBe(0);
    expect(cineCameraAt('kill', CINE_KILL_ORBIT_START_MS + CINE_KILL_ORBIT_MS, 'full').orbitFrac).toBeCloseTo(CINE_KILL_ORBIT_FRAC, 9);
    expect(cineCameraAt('kill', 500, 'full').thirds).toBe(true);
    for (const m of ['cutPush', 'pushOnly'] as const) {
      const c = cineCameraAt('kill', 500, m);
      expect(c.orbitFrac).toBe(0); expect(c.thirds).toBe(false);
      expect(c.zoomFrac).toBeCloseTo(1, 9); // 押し込みは残る
    }
  });
  it('カウンター: 112%→100%のばねで入り、逆側へ速く出て(60ms)ゆっくり戻る(180ms)=往復は対称ではない。戻りは硬く切る(outPow>1)', () => {
    expect(cineCameraAt('counter', 0, 'full').zoomFrac).toBeCloseTo(1 + CINE_COUNTER_OVERSHOOT, 9);
    expect(cineCameraAt('counter', CINE_COUNTER_IN_MS, 'full').zoomFrac).toBeCloseTo(1, 9);
    const peak = cineCameraAt('counter', CINE_COUNTER_IN_MS + CINE_COUNTER_ORBIT_OUT_MS, 'full').orbitFrac;
    expect(peak).toBeCloseTo(-0.05, 9); // 逆側・最大
    const half = cineCameraAt('counter', CINE_COUNTER_IN_MS + CINE_COUNTER_ORBIT_OUT_MS / 2, 'full').orbitFrac;
    const backHalf = cineCameraAt('counter', CINE_COUNTER_IN_MS + CINE_COUNTER_ORBIT_OUT_MS + CINE_COUNTER_ORBIT_BACK_MS / 2, 'full').orbitFrac;
    expect(Math.abs(half)).toBeGreaterThan(0.05 * 0.8); // 往きは速い(半分の時間で8割超)
    expect(Math.abs(backHalf)).toBeGreaterThan(0);      // 戻りはまだ残っている
    expect(cineCameraAt('counter', CINE_COUNTER_IN_MS + CINE_COUNTER_ORBIT_OUT_MS + CINE_COUNTER_ORBIT_BACK_MS, 'full').orbitFrac).toBeCloseTo(0, 9);
    expect(cineCameraAt('counter', 0, 'full').outPow).toBeGreaterThan(1);
  });
  it('死亡: 60%からじり寄り(ease-in)、保持(1150)の前に着いて止める。戻りは来た時より遅い(outPow<1)。救援は台本なし(恒等)', () => {
    expect(cineCameraAt('death', 0, 'full').zoomFrac).toBe(CINE_DEATH_FROM_FRAC);
    const early = cineCameraAt('death', CINE_DEATH_IN_MS / 2, 'full').zoomFrac;
    expect(early).toBeGreaterThan(CINE_DEATH_FROM_FRAC);
    expect(early).toBeLessThan(CINE_DEATH_FROM_FRAC + (1 - CINE_DEATH_FROM_FRAC) / 2); // 前半は遅い=ease-in
    expect(cineCameraAt('death', CINE_DEATH_IN_MS, 'full').zoomFrac).toBeCloseTo(1, 9);
    expect(CINE_DEATH_IN_MS).toBeLessThan(1150);
    expect(cineCameraAt('death', 500, 'full').thirds).toBe(false);
    expect(cineCameraAt('death', 0, 'full').outPow).toBeLessThan(1);
    expect(cineCameraAt('rescue', 100, 'full')).toEqual({ zoomFrac: 1, orbitFrac: 0, thirds: false, outPow: 1 });
  });
  it('重なり: 進行中より高い順位だけ割り込む(KILL保持中のカウンターは捨てる・死亡は割り込む)。終わっていれば何でも受ける', () => {
    const kill: CineEvent = { kind: 'kill', startAt: 1000, endAt: 1700, hasTarget: true, targetX: 0, targetY: 0 };
    expect(cineAccepts(kill, 'counter', 1200)).toBe(false);
    expect(cineAccepts(kill, 'kill', 1200)).toBe(false);
    expect(cineAccepts(kill, 'death', 1200)).toBe(true);
    expect(cineAccepts(kill, 'counter', 1700)).toBe(true);
    expect(cineAccepts(null, 'rescue', 0)).toBe(true);
  });
  it('三分割の寄り先は自機→相手の内分(相手寄り)', () => {
    const p = thirdsPoint(0, 0, 100, 0);
    expect(p.x).toBeCloseTo(100 * CINE_THIRDS_T, 9); expect(p.y).toBe(0);
    expect(CINE_THIRDS_T).toBeGreaterThan(0.5); expect(CINE_THIRDS_T).toBeLessThan(1);
  });
});

describe('第2弾(v0.25.4296): 処刑の別台本・画面上の三分割・近景の板', () => {
  it('処刑(execute): カットは KILL より広く、一拍目→止め→二拍目で100%。優先順は kill より上・death より下', () => {
    expect(cineCameraAt('execute', 0, 'full').zoomFrac).toBe(CINE_EXEC_CUT_FRAC);
    expect(CINE_EXEC_CUT_FRAC).toBeLessThan(CINE_KILL_CUT_FRAC);
    const hold = cineCameraAt('execute', CINE_EXEC_PUSH2_START_MS - 1, 'full').zoomFrac;
    expect(hold).toBeCloseTo(CINE_EXEC_PUSH1_TO, 2); // 止めの間は92%
    expect(cineCameraAt('execute', CINE_EXEC_PUSH2_START_MS + CINE_EXEC_PUSH2_MS, 'full').zoomFrac).toBeCloseTo(1, 9);
    const kill: CineEvent = { kind: 'kill', startAt: 0, endAt: 700, hasTarget: true, targetX: 0, targetY: 0 };
    expect(cineAccepts(kill, 'execute', 100)).toBe(true);
    const exec: CineEvent = { kind: 'execute', startAt: 0, endAt: 1100, hasTarget: true, targetX: 0, targetY: 0 };
    expect(cineAccepts(exec, 'kill', 100)).toBe(false);
    expect(cineAccepts(exec, 'death', 100)).toBe(true);
  });
  it('三分割(画面上の置き場所): 相手は縦の三分割線(自機の反対側)に乗り、自機は枠内に残る', () => {
    const W = 800, H = 600, zoom = 2;
    // 近接キル(相手が右60px): 距離比なら中央寄せと同じだが、置き場所なら相手は右の三分割線
    const near = thirdsAim({ px: 0, py: 0, tx: 60, ty: 0, zoom, screenW: W, screenH: H });
    const targetScreenX = W / 2 + (60 - near.x) * zoom;
    expect(targetScreenX).toBeCloseTo(W / 2 + W * CINE_THIRDS_X_FRAC, 6);
    expect(near.sideX).toBe(1);
    // 遠距離(相手が右900px): 自機が枠外へ出ないよう寄り先がクランプされる
    const far = thirdsAim({ px: 0, py: 0, tx: 900, ty: 0, zoom, screenW: W, screenH: H });
    const playerScreenX = W / 2 + (0 - far.x) * zoom;
    expect(playerScreenX).toBeGreaterThanOrEqual(W * CINE_FRAME_MARGIN_FRAC - 1e-6);
    expect(playerScreenX).toBeLessThanOrEqual(W - W * CINE_FRAME_MARGIN_FRAC + 1e-6);
    // 相手が左なら左の三分割線
    expect(thirdsAim({ px: 0, py: 0, tx: -60, ty: 0, zoom, screenW: W, screenH: H }).sideX).toBe(-1);
  });
  it('近景の板: 滑り込みは行き過ぎて止まる(途中で1を超える)。出す演目は処刑2種と死亡だけ', () => {
    expect(cinePlateIn(0)).toBe(0);
    let over = false;
    for (let t = 0; t <= CINE_PLATE_IN_MS; t += 10) if (cinePlateIn(t) > 1) over = true;
    expect(over).toBe(true);
    expect(cinePlateIn(CINE_PLATE_IN_MS)).toBeCloseTo(1, 9);
    expect(cinePlateKinds.has('kill')).toBe(true); expect(cinePlateKinds.has('execute')).toBe(true);
    expect(cinePlateKinds.has('death')).toBe(true); expect(cinePlateKinds.has('counter')).toBe(false);
  });
});
