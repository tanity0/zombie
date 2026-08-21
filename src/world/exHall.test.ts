// PACING_PUZZLE.md §10-20#5/#6/#7: EX広間(通路スケールアップ方式)の純関数の不変条件。
import { describe, it, expect } from 'vitest';
import {
  exHallScaleT, exHallLateralClampFromT, exHallLateralClamp,
  EX_SURIEL_HALL, EX_PHILL_HALL, EX_HALL_TRANSITION_PX,
  EX_SURIEL_TRIGGER_Y, EX_HALL_LATERAL_CLAMP,
} from './exHall';
import { CORRIDOR_LATERAL_CLAMP } from '../utils/corridorProjection';

describe('exHallScaleT — 広間の外/内側', () => {
  it('スタート付近(通常通路)はt=0', () => {
    expect(exHallScaleT(0)).toBe(0);
    expect(exHallScaleT(-500)).toBe(0);
  });
  it('スリィエル広間の内部(南端〜北端)はt=1', () => {
    expect(exHallScaleT(EX_SURIEL_HALL.southY)).toBe(1);
    expect(exHallScaleT(-3000)).toBe(1); // 広間中心
    expect(exHallScaleT(EX_SURIEL_HALL.northY)).toBe(1);
  });
  it('フィル広間の内部もt=1', () => {
    expect(exHallScaleT(EX_PHILL_HALL.southY)).toBe(1);
    expect(exHallScaleT(-5500)).toBe(1);
    expect(exHallScaleT(EX_PHILL_HALL.northY)).toBe(1);
  });
  it('2つの広間の間(通常通路区間)はt=0(遷移帯の外)', () => {
    // スリィエル北端-3700から遷移帯400pxぶん離れた場所は完全に通常幅。
    expect(exHallScaleT(-3700 - EX_HALL_TRANSITION_PX)).toBe(0);
  });
});

describe('exHallScaleT — 遷移帯は連続(急に切り替えない=CLAUDE.md慣性則)', () => {
  it('南端の手前は0→1へ単調に増加する', () => {
    const southY = EX_SURIEL_HALL.southY;
    const t0 = exHallScaleT(southY + EX_HALL_TRANSITION_PX); // 遷移帯の入口
    const tMid = exHallScaleT(southY + EX_HALL_TRANSITION_PX / 2);
    const t1 = exHallScaleT(southY); // 広間の南端ちょうど
    expect(t0).toBeCloseTo(0, 5);
    expect(t1).toBe(1);
    expect(tMid).toBeGreaterThan(t0);
    expect(tMid).toBeLessThan(t1);
  });
});

describe('exHallScaleT — §10-20#5「戦闘開始時にt=1が完了していること」', () => {
  it('スリィエルの発火y(トリガー)では既にt=1(南端-2300 > トリガー-2800なので既に広間の内側)', () => {
    expect(exHallScaleT(EX_SURIEL_TRIGGER_Y)).toBe(1);
  });
});

describe('exHallLateralClampFromT / exHallLateralClamp', () => {
  it('t=0は通常通路の横クランプ(CORRIDOR_LATERAL_CLAMP)そのもの', () => {
    expect(exHallLateralClampFromT(0)).toBe(CORRIDOR_LATERAL_CLAMP);
  });
  it('t=1は広間の横クランプ(EX_HALL_LATERAL_CLAMP)そのもの', () => {
    expect(exHallLateralClampFromT(1)).toBe(EX_HALL_LATERAL_CLAMP);
  });
  it('yからのショートハンドがexHallScaleT経由と一致する', () => {
    expect(exHallLateralClamp(-3000)).toBe(EX_HALL_LATERAL_CLAMP);
    expect(exHallLateralClamp(0)).toBe(CORRIDOR_LATERAL_CLAMP);
  });
});
