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

import { noticeOnHitPatch, HIT_NOTICE_MS, LAB_LOSE_SIGHT_MS as LOSE_MS } from './labStealth';
describe('攻撃を受けたら気付く(2026-10-24「索敵系の敵は全て攻撃喰らっても気付く様にして」)', () => {
  it('休眠中の視界で見つける型は、被弾で起きて一定時間「気付いている」', () => {
    const p = noticeOnHitPatch({ dormant: true, aggroRange: 180 }, false, 1000);
    expect(p).toEqual({ dormant: false, losLostSince: undefined, noticedUntil: 1000 + HIT_NOTICE_MS });
  });
  it('起きている時も、被弾で気付いている時間を延ばす(起こし直しはしない)', () => {
    const p = noticeOnHitPatch({ dormant: false, aggroRange: 180 }, false, 5000);
    expect(p).toEqual({ losLostSince: undefined, noticedUntil: 5000 + HIT_NOTICE_MS });
  });
  it('賞金首など除外の型・aggroRange が無い/0 の個体には何もしない', () => {
    expect(noticeOnHitPatch({ dormant: true, aggroRange: 180 }, true, 0)).toBeNull();
    expect(noticeOnHitPatch({ dormant: true, aggroRange: 0 }, false, 0)).toBeNull();
    expect(noticeOnHitPatch({ dormant: true }, false, 0)).toBeNull();
  });
  it('気付いている間は、壁の向こう・遠くでも見失わない。期限が過ぎれば従来どおり見失う', () => {
    const base = { losBlocked: true, distance: 900, losLostSince: 0 };
    expect(evaluateLabLoseSight({ ...base, now: LOSE_MS + 10, noticedUntil: LOSE_MS + 100 }).shouldDormant).toBe(false);
    expect(evaluateLabLoseSight({ ...base, now: LOSE_MS + 10, noticedUntil: 5 }).shouldDormant).toBe(true);
  });
});

import { spottedSfxOnWake } from './labStealth';
describe('見つかった音(社長支給2026-10-24「索敵系の敵に見つかった時の音」)', () => {
  const sight = { aggroRange: 180 };
  it('ステージ2で視界に入って起きた時だけ鳴る', () => {
    expect(spottedSfxOnWake(sight, { labTheme: true, seen: true, excluded: false })).toBe(true);
  });
  it('撃たれて起きた(見つかっていない)・他のステージ・除外の型・台本で起こす静止個体は鳴らない', () => {
    expect(spottedSfxOnWake(sight, { labTheme: true, seen: false, excluded: false })).toBe(false);
    expect(spottedSfxOnWake(sight, { labTheme: false, seen: true, excluded: false })).toBe(false);
    expect(spottedSfxOnWake(sight, { labTheme: true, seen: true, excluded: true })).toBe(false);
    expect(spottedSfxOnWake({ aggroRange: 0 }, { labTheme: true, seen: true, excluded: false })).toBe(false);
  });
});
