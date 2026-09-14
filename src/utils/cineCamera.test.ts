import { describe, it, expect } from 'vitest';
import {
  cineCameraAt, cineAccepts, thirdsPoint, CINE_KILL_CUT_FRAC, CINE_KILL_PUSH_START_MS, CINE_KILL_PUSH_MS,
  CINE_KILL_ORBIT_START_MS, CINE_KILL_ORBIT_MS, CINE_KILL_ORBIT_FRAC, CINE_COUNTER_OVERSHOOT, CINE_COUNTER_IN_MS,
  CINE_COUNTER_ORBIT_MS, CINE_DEATH_FROM_FRAC, CINE_DEATH_IN_MS, CINE_THIRDS_T, type CineEvent,
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
  it('KILL: 横滑りは押し込みが着いてから立ち上がり、三分割は full のみ。cutPush/pushOnly では構図を触らない', () => {
    expect(cineCameraAt('kill', CINE_KILL_ORBIT_START_MS, 'full').orbitFrac).toBe(0);
    expect(cineCameraAt('kill', CINE_KILL_ORBIT_START_MS + CINE_KILL_ORBIT_MS, 'full').orbitFrac).toBeCloseTo(CINE_KILL_ORBIT_FRAC, 9);
    expect(cineCameraAt('kill', 500, 'full').thirds).toBe(true);
    for (const m of ['cutPush', 'pushOnly'] as const) {
      const c = cineCameraAt('kill', 500, m);
      expect(c.orbitFrac).toBe(0); expect(c.thirds).toBe(false);
      expect(c.zoomFrac).toBeCloseTo(1, 9); // 押し込みは残る
    }
  });
  it('カウンター: 104%→100%のばねで入り、逆側へ1拍(往復)して戻る', () => {
    expect(cineCameraAt('counter', 0, 'full').zoomFrac).toBeCloseTo(1 + CINE_COUNTER_OVERSHOOT, 9);
    expect(cineCameraAt('counter', CINE_COUNTER_IN_MS, 'full').zoomFrac).toBeCloseTo(1, 9);
    const peak = cineCameraAt('counter', CINE_COUNTER_IN_MS + CINE_COUNTER_ORBIT_MS / 2, 'full').orbitFrac;
    expect(peak).toBeLessThan(0); // 逆側
    expect(cineCameraAt('counter', CINE_COUNTER_IN_MS + CINE_COUNTER_ORBIT_MS, 'full').orbitFrac).toBeCloseTo(0, 9);
  });
  it('死亡: 60%からゆっくり100%へ。構図は触らない。救援は台本なし(恒等)', () => {
    expect(cineCameraAt('death', 0, 'full').zoomFrac).toBe(CINE_DEATH_FROM_FRAC);
    expect(cineCameraAt('death', CINE_DEATH_IN_MS / 2, 'full').zoomFrac).toBeGreaterThan(CINE_DEATH_FROM_FRAC);
    expect(cineCameraAt('death', CINE_DEATH_IN_MS, 'full').zoomFrac).toBeCloseTo(1, 9);
    expect(cineCameraAt('death', 500, 'full').thirds).toBe(false);
    expect(cineCameraAt('rescue', 100, 'full')).toEqual({ zoomFrac: 1, orbitFrac: 0, thirds: false });
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
