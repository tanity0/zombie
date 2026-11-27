import { describe, expect, it } from 'vitest';
import { MELEE_HIT_HOLD_MIN_MS, meleePoseSince, drawSinceWithStop } from './meleeHitstopTiming';
import { brawlerStartAttack, initialBrawlerState, brawlerCrispPoseAt, brawlerApplyHitstop, brawlerTotalMs, brawlerElapsed, brawlerPoseAt } from './brawler';

describe('空振りは止めない(社長指示2026-11-27「空振りは止めない。止めてと言ったのは、キャラの絵が攻撃時に揺れているところだけ」)', () => {
  it('空振り(hit=null)は生の時計のまま', () => {
    for (let t = 0; t <= 500; t += 7) expect(meleePoseSince(t, null)).toBe(t);
  });
  it('当たった時は今の自分の止めと下限(70ms)の長い方(当たった時の止めの長さは変えない)', () => {
    expect(MELEE_HIT_HOLD_MIN_MS).toBe(70);
    // 自分の止めが長い(117ms)=今のまま
    expect(meleePoseSince(250, { stopSince: 180, selfMs: 117 })).toBe(drawSinceWithStop(250, 180, 117));
    // 自分の止めが短い(54ms)=70ms へ延ばす
    expect(meleePoseSince(180 + 60, { stopSince: 180, selfMs: 54 })).toBe(180);
    expect(meleePoseSince(180 + 80, { stopSince: 180, selfMs: 54 })).toBe(180 + 10);
  });
});

describe('格闘の空振りは姿勢の絵の時計を止めない', () => {
  const s0 = brawlerStartAttack(initialBrawlerState(), 1, 1000, false);
  const W = s0.windupMs;
  it('空振りは前隙の終わりの後も姿勢の絵が技の時計のまま進む(止め0の写しと同じ絵)', () => {
    expect(brawlerElapsed(s0, 1000 + W + 60)).toBeCloseTo(W + 60, 6);
    const total = brawlerTotalMs(s0);
    const noStop = { ...s0, stopPrevMs: 1e-9 }; // 止め0の写し(決めの間を足さない側の時計)
    for (let e = 0; e <= total; e += 2) {
      const a = brawlerCrispPoseAt(s0, 1000 + e), b = brawlerCrispPoseAt(noStop, 1000 + e);
      expect(a!.push).toBeCloseTo(b!.push, 4);
    }
  });
  it('空振りの絵(tex)は元の姿勢のその時刻の絵と同じ', () => {
    const total = brawlerTotalMs(s0);
    for (let e = 0; e < total; e += 16) {
      const crisp = brawlerCrispPoseAt(s0, 1000 + e);
      expect(crisp?.tex).toBe(brawlerPoseAt(s0, 1000 + e)?.tex);
    }
  });
  it('当たった技は今どおり技の時計ごと止まる', () => {
    const hit = brawlerApplyHitstop(s0, 1000 + W, 80);
    const a = brawlerCrispPoseAt(hit, 1000 + W + 10), b = brawlerCrispPoseAt(hit, 1000 + W + 60);
    expect(a && b).toBeTruthy();
    expect(b!.push).toBeCloseTo(a!.push, 6);
    expect(b!.tex).toBe(a!.tex);
  });
});
