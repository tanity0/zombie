import { describe, expect, it } from 'vitest';
import {
  BRAWLER_HITSTOP_STRETCH, CRISP_MOVE_MS, KATANA_SELF_STOP_MS, MELEE_HITSTOP_STRETCH,
  closestSince, crispCurve, crispEase, crispKeyframes, drawSinceWithStop, katanaSlashCenterT, knifeCircleForFists, knifeHitstopDrawSince,
  knifeTipAt, meleeArcRunEnd, meleeStopPlan, stretchStopMs,
} from './meleeHitstopTiming';
import { katanaSlashPose, KATANA_SLASH_TIMING } from './katanaSlashSheet';

describe('動き→止まり(キーフレーム)', () => {
  it('移りの曲線は 0→1・出だしの速度 0・単調', () => {
    expect(crispEase(0)).toBe(0);
    expect(crispEase(1)).toBeCloseTo(1, 9);
    let prev = 0;
    for (let u = 0.01; u <= 1; u += 0.01) { const v = crispEase(u); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
    expect(crispEase(0.01)).toBeLessThan(0.01); // 瞬間移動しない
    expect(crispEase(0.5)).toBeGreaterThan(0.6); // 速く出て減速
  });
  it('キーの間は1pxも動かない(止まっている)・移りは moveMs だけ', () => {
    const keys = [{ at: 200, v: 1 }, { at: 313, v: 0 }];
    expect(crispKeyframes(0, keys)).toBe(0);
    expect(crispKeyframes(199, keys)).toBe(0);
    expect(crispKeyframes(200 + CRISP_MOVE_MS, keys)).toBeCloseTo(1, 9);
    expect(crispKeyframes(260, keys)).toBe(crispKeyframes(300, keys));
    expect(crispKeyframes(313 + CRISP_MOVE_MS, keys)).toBeCloseTo(0, 9);
  });
  it('続いた曲線を山の時刻に着いて止まる形に作り直す(山の値と時刻は変えない)', () => {
    // 前隙で 0→14 へ上がり、当たり(150)から戻る曲線。
    const raw = (e: number) => (e < 150 ? 14 * (e / 150) ** 2 : 14 * (1 - (e - 150) / 250));
    expect(crispCurve(raw, 0, 0, 400, [150])).toBe(0);
    expect(crispCurve(raw, 150 - CRISP_MOVE_MS - 1, 0, 400, [150])).toBe(0); // 着く前は止まって待つ
    expect(crispCurve(raw, 150, 0, 400, [150])).toBeCloseTo(14, 6);         // 当たりの瞬間に山へ着く
    expect(crispCurve(raw, 300, 0, 400, [150])).toBeCloseTo(14, 6);         // 戻り始めまで止まる
    expect(crispCurve(raw, 400, 0, 400, [150])).toBeCloseTo(0, 6);
  });
});

describe('止める時刻', () => {
  it('当たりが絵より早い時は絵の時刻で止め、敵の止めをそこまで延ばす', () => {
    const p = meleeStopPlan(0, 220, 90, 113);
    expect(p.stopSince).toBe(220);
    expect(p.enemyMs).toBe(220 + 90);
  });
  it('当たりが絵より遅い時は当たった瞬間の絵で止める(過去へ戻さない)・敵の止めは自分の止めより短くしない', () => {
    const p = meleeStopPlan(230, 200, 165, 90);
    expect(p.stopSince).toBe(230);
    expect(p.enemyMs).toBe(165);
  });
  it('一番近い時刻を返す', () => {
    expect(closestSince(t => ({ x: t, y: 0 }), { x: 37, y: 0 }, 0, 100, 1)).toBe(37);
  });
  it('絵の時計の止めは連続(入りと明けで飛ばない)', () => {
    expect(drawSinceWithStop(100, 200, 90)).toBe(100);
    expect(drawSinceWithStop(250, 200, 90)).toBe(200);
    expect(drawSinceWithStop(290, 200, 90)).toBe(200);
    expect(drawSinceWithStop(300, 200, 90)).toBe(210);
    expect(drawSinceWithStop(300, -1, 90)).toBe(300);
  });
});

describe('ナイフの刃先', () => {
  const unit = 28 * 2.3;
  const base = { unitPx: unit, pxPerUnit: 1 / unit, prefix: 'player-magnum-melee', swingMs: 368, runEnd: meleeArcRunEnd(300, 368), windupMs: 200 };
  it('止める絵の刃先は、ほかの時刻の刃先より敵の中心に近い', () => {
    const c = knifeCircleForFists('player-magnum-melee', 1 / unit)!;
    for (const down of [false, true]) for (const [fwd, dy] of [[40, 0], [55, -15], [50, 20]]) {
      const t = knifeHitstopDrawSince({ ...base, fwd, dy, down });
      const tgt = { x: fwd / unit, y: dy / unit };
      const d = (s: number) => { const q = knifeTipAt(s, 368, base.runEnd, c, down); return Math.hypot(q.x - tgt.x, q.y - tgt.y); };
      for (let s = 0; s <= 368; s += 10) expect(d(t)).toBeLessThanOrEqual(d(s) + 1e-9);
    }
  });
  it('振り上げは高い敵ほど遅く、振り下ろしは高い敵ほど早く止まる(刃の通る順)', () => {
    const upLow = knifeHitstopDrawSince({ ...base, fwd: 50, dy: 20, down: false });
    const upHigh = knifeHitstopDrawSince({ ...base, fwd: 50, dy: -25, down: false });
    expect(upHigh).toBeGreaterThan(upLow);
    const dnLow = knifeHitstopDrawSince({ ...base, fwd: 50, dy: 20, down: true });
    const dnHigh = knifeHitstopDrawSince({ ...base, fwd: 50, dy: -25, down: true });
    expect(dnHigh).toBeLessThan(dnLow);
  });
  it('ポーズの無い装い(拳の実測なし)は刃が出る時刻', () => {
    expect(knifeHitstopDrawSince({ ...base, prefix: undefined, fwd: 50, dy: 0, down: false })).toBe(200);
  });
});

describe('刀の斬撃', () => {
  it('止める時刻の絵は、刃先が中心(見せる割合 0.5)に来た所', () => {
    for (const move of ['swing', 'issen', 'satsujin'] as const) {
      const t = katanaSlashCenterT(KATANA_SLASH_TIMING[move].out);
      const pose = katanaSlashPose(t, move);
      expect(pose.side).toBe('tail');
      expect(pose.reveal).toBeCloseTo(0.5, 6);
    }
  });
});

describe('長さ', () => {
  it('ナイフ・鞭・刀は ×1.5(格闘の 1.25 は叩き台の値だけ・未適用)', () => {
    expect(MELEE_HITSTOP_STRETCH).toBe(1.5);
    expect(BRAWLER_HITSTOP_STRETCH).toBe(1.25);
    expect(stretchStopMs(60)).toBe(90);
    expect(stretchStopMs(110)).toBe(165);
    expect(stretchStopMs(0)).toBe(0);
    expect(KATANA_SELF_STOP_MS).toBe(90);
  });
});
