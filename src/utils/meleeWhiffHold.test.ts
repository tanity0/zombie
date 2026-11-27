import { describe, expect, it } from 'vitest';
import { MELEE_WHIFF_HOLD_MS, whiffHoldSince, meleePoseSince, drawSinceWithStop } from './meleeHitstopTiming';
import { brawlerStartAttack, initialBrawlerState, brawlerCrispPoseAt, brawlerPoseAt, brawlerApplyHitstop, brawlerTotalMs } from './brawler';

describe('空振りの決めの間(社長指示2026-11-27「当たらなくても止めて」)', () => {
  const key = 200, end = 368;
  it('空振りでも決めで70ms止まる', () => {
    expect(MELEE_WHIFF_HOLD_MS).toBe(70);
    expect(whiffHoldSince(key + 1, key, end)).toBe(key);
    expect(whiffHoldSince(key + 35, key, end)).toBe(key);
    expect(whiffHoldSince(key + 70, key, end)).toBe(key);
    expect(whiffHoldSince(key + 71, key, end)).toBeGreaterThan(key);
  });
  it('決めの前はそのまま', () => {
    expect(whiffHoldSince(0, key, end)).toBe(0);
    expect(whiffHoldSince(150, key, end)).toBe(150);
  });
  it('絵の終わりの時刻が変わらない(終わりで今と同じ値・終わりの後はそのまま)', () => {
    expect(whiffHoldSince(end - 1e-6, key, end)).toBeCloseTo(end, 4);
    expect(whiffHoldSince(end, key, end)).toBe(end);
    expect(whiffHoldSince(end + 50, key, end)).toBe(end + 50);
  });
  it('明けで跳ばない(連続・単調)', () => {
    const a = whiffHoldSince(key + 70 - 1e-4, key, end), b = whiffHoldSince(key + 70 + 1e-4, key, end);
    expect(Math.abs(b - a)).toBeLessThan(0.01);
    let prev = -1;
    for (let t = 0; t <= 500; t += 2) { const v = whiffHoldSince(t, key, end); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); prev = v; }
  });
  it('止める余地が無い時はそのまま', () => {
    expect(whiffHoldSince(250, 200, 260)).toBe(250);
  });
  it('当たった時は今の自分の止めと70msの長い方(二重にしない)', () => {
    // 自分の止めが長い(117ms)=今のまま
    expect(meleePoseSince(250, { stopSince: 180, selfMs: 117 }, key, end)).toBe(drawSinceWithStop(250, 180, 117));
    // 自分の止めが短い(54ms)=70ms へ延ばす。決めの間は足さない(止めは1回だけ)
    expect(meleePoseSince(180 + 60, { stopSince: 180, selfMs: 54 }, key, end)).toBe(180);
    expect(meleePoseSince(180 + 80, { stopSince: 180, selfMs: 54 }, key, end)).toBe(180 + 10);
    // 空振り
    expect(meleePoseSince(230, null, key, end)).toBe(key);
  });
});

describe('格闘の空振りの決めの間(姿勢の絵だけ・技の時計は止めない)', () => {
  const s0 = brawlerStartAttack(initialBrawlerState(), 1, 1000, false);
  const W = s0.windupMs;
  it('空振りは前隙の終わりで姿勢の絵が止まる', () => {
    const a = brawlerCrispPoseAt(s0, 1000 + W + 5), b = brawlerCrispPoseAt(s0, 1000 + W + 60);
    expect(a && b).toBeTruthy();
    expect(b!.push).toBeCloseTo(a!.push, 6);
    expect(b!.tex).toBe(a!.tex);
  });
  it('絵の終わりの時刻は今と同じ(終わりの直前は今の絵と同じ)', () => {
    const total = brawlerTotalMs(s0);
    const endPose = brawlerCrispPoseAt(s0, 1000 + total - 0.01);
    expect(endPose?.tex).toBe(brawlerPoseAt(s0, 1000 + total - 0.01)?.tex);
  });
  it('当たった技(止めが掛かった)には決めの間を足さない=止めの後は押しが進む', () => {
    const hit = brawlerApplyHitstop(s0, 1000 + W, 80);
    const a = brawlerCrispPoseAt(hit, 1000 + W + 80 + 5);
    const ref = brawlerCrispPoseAt({ ...s0, startAt: s0.startAt + 80 }, 1000 + W + 80 + 5); // 時計ごと止まった=80ms 後ろへずれた空振りと同じ時計
    expect(a && ref).toBeTruthy();
    // 空振りの写しは決めの間で止まっているが、当たった技は止めの後に進む(同じ経過 W+5 の時点で両者とも決めの直後)
    expect(a!.tex).toBe(ref!.tex);
  });
});
