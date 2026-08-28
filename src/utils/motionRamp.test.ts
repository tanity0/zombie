// research/AI_HUMANIZE.md B3(§4「慣性」・CLAUDE.md動きの絶対ルール)。速度状態モデルの純関数テスト。
import { describe, it, expect } from 'vitest';
import { rampVelocity, withinDeadband, MOTION_RAMP_TAU_SEC, MOTION_DEADBAND_PX } from './motionRamp';

describe('rampVelocity', () => {
  it('1tickで目標速度へ瞬間ジャンプしない(連続性=不連続に跳ばない)', () => {
    const v0 = { vx: 0, vy: 0 };
    const v1 = rampVelocity(v0, 300, 0, 1 / 60);
    expect(v1.vx).toBeGreaterThan(0);
    expect(v1.vx).toBeLessThan(300); // 1フレームでは目標に到達しない=イーズ
  });
  it('十分な時間が経てば目標速度へ収束する', () => {
    let v = { vx: 0, vy: 0 };
    for (let i = 0; i < 600; i++) v = rampVelocity(v, 300, -150, 1 / 60);
    expect(v.vx).toBeCloseTo(300, 0);
    expect(v.vy).toBeCloseTo(-150, 0);
  });
  it('目標が0(方向入力なし)でも瞬間停止せず減衰する=オーバーシュートの土台', () => {
    const moving = rampVelocity({ vx: 0, vy: 0 }, 300, 0, 2); // 十分な時間で目標速度近くまで加速
    const v1 = rampVelocity(moving, 0, 0, 1 / 60); // 目標が消えた次tick
    expect(v1.vx).toBeGreaterThan(0); // 瞬間0にならない=残速度で流れる
    expect(v1.vx).toBeLessThan(moving.vx);
  });
  it('tau<=0は即時収束(inertiaAlphaの規約どおり)', () => {
    const v1 = rampVelocity({ vx: 0, vy: 0 }, 300, 0, 1 / 60, 0);
    expect(v1.vx).toBe(300);
  });
  it('連続tickの積分は前tickの速度から滑らかに繋がる(離散ジャンプが無い)', () => {
    let v = { vx: 0, vy: 0 };
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) { v = rampVelocity(v, 400, 0, 1 / 60); samples.push(v.vx); }
    for (let i = 1; i < samples.length; i++) {
      expect(Math.abs(samples[i] - samples[i - 1])).toBeLessThan(400); // 一度に目標へ全跳びしない
    }
    // 単調増加(目標へ向かう一方向のイーズ)。
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
  });
});

describe('withinDeadband', () => {
  it('叩き台の既定デッドバンド(±6px)内はtrue', () => {
    expect(withinDeadband(3, 3)).toBe(true);
    expect(withinDeadband(MOTION_DEADBAND_PX, 0)).toBe(true);
    expect(withinDeadband(MOTION_DEADBAND_PX + 1, 0)).toBe(false);
  });
});

describe('定数の健全性', () => {
  it('時定数は150〜250msの叩き台レンジ内', () => {
    expect(MOTION_RAMP_TAU_SEC).toBeGreaterThanOrEqual(0.15);
    expect(MOTION_RAMP_TAU_SEC).toBeLessThanOrEqual(0.25);
  });
});
