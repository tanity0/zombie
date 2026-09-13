import { describe, it, expect } from 'vitest';
import { evaluateLabLoseSight, LAB_LOSE_SIGHT_RANGE, LAB_LOSE_SIGHT_MS } from './labStealth';

// ステージ2の索敵解除(社長承認 M2_LAB_CORRIDOR_SPEC.md v0.25.2175「視線を1秒切ると見失う」)。
describe('evaluateLabLoseSight (ステージ2・視線切りで見失う)', () => {
  it('定数が仕様どおり', () => {
    expect(LAB_LOSE_SIGHT_RANGE).toBe(450);
    expect(LAB_LOSE_SIGHT_MS).toBe(1000);
  });

  it('見えている(LOS通り・距離450以内)なら再休眠しない・タイマーはリセットされる', () => {
    const r = evaluateLabLoseSight({ losBlocked: false, distance: 100, losLostSince: 5000, now: 6000 });
    expect(r.shouldDormant).toBe(false);
    expect(r.losLostSince).toBeUndefined();
  });

  it('見えなくなった瞬間(LOS遮断)はまだ再休眠しない・losLostSince=now が立つ', () => {
    const r = evaluateLabLoseSight({ losBlocked: true, distance: 100, losLostSince: undefined, now: 1000 });
    expect(r.shouldDormant).toBe(false);
    expect(r.losLostSince).toBe(1000);
  });

  it('距離が450を超えた瞬間もまだ再休眠しない・losLostSince=now が立つ', () => {
    const r = evaluateLabLoseSight({ losBlocked: false, distance: LAB_LOSE_SIGHT_RANGE + 1, losLostSince: undefined, now: 2000 });
    expect(r.shouldDormant).toBe(false);
    expect(r.losLostSince).toBe(2000);
  });

  it('距離ちょうど450は見えている扱い(超過のみが見失い条件)', () => {
    const r = evaluateLabLoseSight({ losBlocked: false, distance: LAB_LOSE_SIGHT_RANGE, losLostSince: 500, now: 900 });
    expect(r.shouldDormant).toBe(false);
    expect(r.losLostSince).toBeUndefined();
  });

  it('見えない状態が1000ms未満はまだ再休眠しない・losLostSinceは開始時刻を保持', () => {
    const r = evaluateLabLoseSight({ losBlocked: true, distance: 500, losLostSince: 1000, now: 1000 + LAB_LOSE_SIGHT_MS - 1 });
    expect(r.shouldDormant).toBe(false);
    expect(r.losLostSince).toBe(1000);
  });

  it('見えない状態がちょうど1000ms継続したら再休眠する', () => {
    const r = evaluateLabLoseSight({ losBlocked: true, distance: 500, losLostSince: 1000, now: 1000 + LAB_LOSE_SIGHT_MS });
    expect(r.shouldDormant).toBe(true);
    expect(r.losLostSince).toBe(1000);
  });

  it('見えない状態が1000msを超えて継続したら再休眠する', () => {
    const r = evaluateLabLoseSight({ losBlocked: false, distance: 9999, losLostSince: 0, now: 5000 });
    expect(r.shouldDormant).toBe(true);
    expect(r.losLostSince).toBe(0);
  });

  it('見失いタイマー中に再び見えたら即座にリセットされる(ヒステリシスの切り戻し)', () => {
    const lost = evaluateLabLoseSight({ losBlocked: true, distance: 500, losLostSince: undefined, now: 0 });
    expect(lost.losLostSince).toBe(0);
    const reseen = evaluateLabLoseSight({ losBlocked: false, distance: 100, losLostSince: lost.losLostSince, now: 500 });
    expect(reseen.shouldDormant).toBe(false);
    expect(reseen.losLostSince).toBeUndefined();
  });
});
