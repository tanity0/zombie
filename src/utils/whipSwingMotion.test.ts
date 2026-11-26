// 鞭の普通の振りの見た目(しなり→パチン・体の振り上げ→しゃがみ)の純関数。判定の時刻(前隙の終わり)で伸び切る・しゃがみの底になることを固める。
import { describe, it, expect } from 'vitest';
import {
  whipRopeShape, whipRopePoints, whipBodyPose, whipRopeTotalMs, WHIP_ROPE_CRACK_HOLD_MS, WHIP_ROPE_RETRACT_MS,
  whipTetherShape, whipTetherBow, whipTetherRetract, WHIP_TETHER_RETRACT_MS, whipFlyLiftPx, whipFlyPeakPx, whipFlyVisualDist, whipFlyOffset,
  WHIP_FLY_DROP_MS, WHIP_FLY_LIFT_MIN_PX, WHIP_FLY_LIFT_MAX_PX,
  whipTetherEntry, WHIP_TETHER_ENTRY_MS, whipTetherGlowK, whipFlyVisualTimeAt, whipThrowStreak, WHIP_THROW_STREAK_OUT_MS,
  whipFlyVisualSpeed, whipFlyReleaseBlend, whipFlyViewOffset, whipTetherRetractTip, whipTrailFade, WHIP_TRAIL_FADE_MS, WHIP_FLY_BLEND_TAU_MS,
  WHIP_ROPE_FINISH_PULL, WHIP_ROPE_POINTS, WHIP_LOOP_ROPE_POINTS, WHIP_ROPE_PULL_END, WHIP_LOOP_FORM_START, WHIP_LOOP_ROLL_START, whipLoopAt, whipLoopPose, whipSwingRopePoints, WHIP_LOOP_FIN_ROLL_START, WHIP_LOOP_FIN_FORM_START, WHIP_LOOP_FIN_ACCEL_POW, WHIP_LOOP_ACCEL_POW, WHIP_LOOP_TURN_RAD, WHIP_LOOP_TURN_FIN_RAD, whipGrabZoomAt, WHIP_GRAB_ZOOM_MAG, WHIP_GRAB_ZOOM_IN_MS, WHIP_GRAB_ZOOM_HOLD_MS, WHIP_GRAB_ZOOM_TOTAL_MS, WHIP_SNARE_FX_ENABLED,
} from './whipSwingMotion';
import { whipThrowDurationMs, whipThrowDist, WHIP_THROW_DIST_MULT } from './whipSwing';
import { whipComboSweepSign, WHIP_COMBO_SWEEP_RAD } from './whipCombo';

const W = 200;

describe('鞭の形', () => {
  it('前隙の終わり(=判定の時刻)でまっすぐ伸び切る: 全区間の向き0・手元のずれ0・先端=射程ちょうど', () => {
    const s = whipRopeShape(W, W);
    expect(s.phase).toBe('crack');
    expect(s.angles.every(a => a === 0)).toBe(true);
    expect(s.handX).toBe(0);
    const pts = whipRopePoints(s, 150, 0.1, 0.99);
    const tipBeforeTail = pts[pts.length - 2];
    expect(tipBeforeTail.x).toBeCloseTo(150, 6);
    expect(tipBeforeTail.y).toBeCloseTo(0, 6);
    expect(pts[1]).toEqual({ x: 0, y: 0 }); // 手元=原点
  });
  it('段の順: 引く→溜め→打ち出し→パチン→戻り→終わり', () => {
    const at = (el: number) => whipRopeShape(el, W).phase;
    expect(at(10)).toBe('pull');
    expect(at(80)).toBe('hold');
    expect(at(150)).toBe('lash');
    expect(at(W + 10)).toBe('crack');
    expect(at(W + WHIP_ROPE_CRACK_HOLD_MS + 50)).toBe('retract');
    expect(at(whipRopeTotalMs(W))).toBe('done');
    expect(whipRopeTotalMs(W)).toBe(W + WHIP_ROPE_CRACK_HOLD_MS + WHIP_ROPE_RETRACT_MS);
  });
  it('溜めでは鞭が体の後ろ(先端が後ろ側)・頭の上を通って引く(引きの途中で先が上=負)', () => {
    const hold = whipRopePoints(whipRopeShape(80, W), 150, 0.1, 0.99);
    expect(hold[hold.length - 2].x).toBeLessThan(-60);
    const mid = whipRopeShape(20, W);
    expect(Math.min(...mid.angles)).toBeLessThan(-Math.PI / 4);
  });
  it('打ち出しは手元から先にほどける(手元の区間の方が先にまっすぐ)', () => {
    const s = whipRopeShape(185, W);
    expect(Math.abs(s.angles[0])).toBeLessThan(Math.abs(s.angles[s.angles.length - 1]));
  });
  it('どの段でも縄が自分に交差しない・打ち出しで約150度折り返す・パチンでまっすぐ', () => {
    const cross = (p: { x: number; y: number }[]): boolean => {
      const o = (a: typeof p[0], b: typeof p[0], c: typeof p[0]) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      for (let i = 0; i + 1 < p.length; i++) for (let j = i + 2; j + 1 < p.length; j++) {
        if (o(p[i], p[i + 1], p[j]) * o(p[i], p[i + 1], p[j + 1]) < 0 && o(p[j], p[j + 1], p[i]) * o(p[j], p[j + 1], p[i + 1]) < 0) return true;
      }
      return false;
    };
    let maxTurn = 0;
    for (const segs of [WHIP_ROPE_POINTS - 1, WHIP_LOOP_ROPE_POINTS - 1]) for (const pull of [1, WHIP_ROPE_FINISH_PULL]) for (const lag of [-1, 0, 1]) {
      for (let el = 0; el < whipRopeTotalMs(W); el += 1) {
        const sh = whipRopeShape(el, W, segs, pull, lag);
        expect(cross(whipRopePoints(sh, 150, 0.1, 0.99))).toBe(false);
        if (sh.phase === 'lash') maxTurn = Math.max(maxTurn, ...sh.angles.map(Math.abs));
      }
      expect(whipRopeShape(W, W, segs, pull, lag).angles.every(a => a === 0)).toBe(true);
    }
    expect(maxTurn).toBeGreaterThan((140 * Math.PI) / 180);
    expect(maxTurn).toBeLessThan((180 * Math.PI) / 180);
  });
  it('戻りは縮んで薄くなる', () => {
    const s = whipRopeShape(W + WHIP_ROPE_CRACK_HOLD_MS + WHIP_ROPE_RETRACT_MS * 0.8, W);
    expect(s.lenK).toBeLessThan(1);
    expect(s.alpha).toBeLessThan(1);
  });
});

describe('体の動き(ナイフの逆=振り上げ→しゃがみ)', () => {
  it('振り上げは縦に伸びて後ろへ反る・パチンの瞬間がしゃがみの底(縦に一番縮む・前へ傾く)', () => {
    const up = whipBodyPose(100, W);
    expect(up.pose).toBe('swing');
    expect(up.sqY).toBeGreaterThan(1);
    expect(up.lean).toBeLessThan(0);
    const bottom = whipBodyPose(W, W);
    expect(bottom.pose).toBe('ready');
    for (const el of [150, 190, W + 40, W + 150]) expect(whipBodyPose(el, W).sqY).toBeGreaterThanOrEqual(bottom.sqY);
    expect(bottom.lean).toBeGreaterThan(0);
  });
  it('振りの外は何もしない', () => {
    expect(whipBodyPose(-1, W).pose).toBeNull();
    expect(whipBodyPose(W + 1000, W)).toEqual({ pose: null, sqX: 1, sqY: 1, lean: 0 });
  });
});

describe('鞭の絡め取り→振り回し→投げの見た目(research/WHIP_FOLLOWUP.md §8)', () => {
  it('張った縄: どのたわみでも先端は敵の位置(射程ちょうど・横のずれ0)に着き、真ん中は回る向きと逆へ遅れる', () => {
    for (const bow of [0, 0.3, 0.95]) {
      for (const dir of [1, -1] as const) {
        const pts = whipRopePoints(whipTetherShape(bow, dir), 120, 0.1, 0.99);
        const tip = pts[pts.length - 2];
        expect(tip.x).toBeCloseTo(120, 6);
        expect(tip.y).toBeCloseTo(0, 6);
        const mid = pts[Math.floor(pts.length / 2)];
        if (bow > 0) expect(Math.sign(mid.y)).toBe(-dir);
      }
    }
  });
  it('たわみ: 回り出し(角速度0)が一番大きく、最高速ではほぼまっすぐ', () => {
    expect(whipTetherBow(0, 0)).toBeGreaterThan(0.9);
    expect(whipTetherBow(0.5, 0)).toBeLessThan(whipTetherBow(0.2, 0));
    expect(Math.abs(whipTetherBow(1, 123))).toBeLessThan(0.03);
  });
  it('巻き戻り: 加速しながら(ease-in)手元へ戻り、長さの中で消える', () => {
    const a = whipTetherRetract(WHIP_TETHER_RETRACT_MS * 0.25)!, b = whipTetherRetract(WHIP_TETHER_RETRACT_MS * 0.5)!, c = whipTetherRetract(WHIP_TETHER_RETRACT_MS * 0.75)!;
    expect(b.k - a.k).toBeLessThan(c.k - b.k);
    expect(whipTetherRetract(0)!.k).toBe(0);
    expect(whipTetherRetract(WHIP_TETHER_RETRACT_MS)).toBeNull();
    expect(WHIP_TETHER_RETRACT_MS).toBeGreaterThanOrEqual(120);
    expect(WHIP_TETHER_RETRACT_MS).toBeLessThanOrEqual(180);
  });
  it('巻き戻り: たわみは放した瞬間が一番大きく、戻るほど張る(まっすぐへ)。細くなりながら消える', () => {
    const at = (f: number) => whipTetherRetract(WHIP_TETHER_RETRACT_MS * f, 0.02)!;
    expect(at(0).bow).toBeGreaterThan(at(0.4).bow);
    expect(at(0.4).bow).toBeGreaterThan(at(0.8).bow);
    expect(at(0.99).bow).toBeLessThan(0.01);
    expect(at(0.9).thick).toBeLessThan(at(0.1).thick);
    expect(at(0).alpha).toBe(1);
    expect(at(0.99).alpha).toBeLessThan(0.05);
  });
  it('掴んだ瞬間の引き継ぎ: 0 から減速して 1 へ。光の縁は最高速の近くだけ', () => {
    expect(whipTetherEntry(0)).toBe(0);
    expect(whipTetherEntry(WHIP_TETHER_ENTRY_MS)).toBe(1);
    expect(whipTetherEntry(WHIP_TETHER_ENTRY_MS * 0.5)).toBeGreaterThan(0.5); // 減速して着く
    expect(whipTetherGlowK(0)).toBe(0);
    expect(whipTetherGlowK(0.7)).toBe(0);
    expect(whipTetherGlowK(1)).toBeCloseTo(1, 9);
  });
  it('飛ぶ高さ: 放した時と最大距離に着く時刻で地面(0)・途中は浮く。途中で当たったら短く落ちて地面へ', () => {
    expect(whipFlyLiftPx(0, 600, 50)).toBe(0);
    expect(whipFlyLiftPx(300, 600, 50)).toBeCloseTo(50, 2); // 立ち上がりの掛け(出だしの上への速さ0)で頂点はわずかに低い
    expect(whipFlyLiftPx(600, 600, 50)).toBe(0);
    expect(whipFlyLiftPx(900, 600, 50)).toBe(0);
    const h0 = whipFlyLiftPx(200, 600, 50, 200);
    expect(h0).toBeGreaterThan(0);
    expect(whipFlyLiftPx(200 + WHIP_FLY_DROP_MS / 2, 600, 50, 200)).toBeLessThan(h0);
    expect(whipFlyLiftPx(200 + WHIP_FLY_DROP_MS, 600, 50, 200)).toBe(0);
    expect(whipFlyPeakPx(10)).toBe(WHIP_FLY_LIFT_MIN_PX);
    expect(whipFlyPeakPx(1000)).toBe(WHIP_FLY_LIFT_MAX_PX);
  });
  it('絵の距離: 判定より後ろ(ずれ<=0)を進み、最大距離でちょうど速さ0で止まる(急停止しない)', () => {
    const v0 = 900, D = 375;
    const T = whipThrowDurationMs(v0, D);
    for (const t of [0, 50, 150, 300, T]) {
      const off = whipFlyOffset({ tMs: t, v0, maxDist: D, logicalD: whipThrowDist(t, v0, D) });
      expect(off).toBeLessThanOrEqual(1e-9);
      expect(off).toBeGreaterThan(-0.15 * D);
    }
    const Tv = (2 * D / v0) * 1000;
    expect(whipFlyVisualDist(Tv, v0, D)).toBeCloseTo(D, 6);
    expect(whipFlyVisualDist(Tv - 1, v0, D)).toBeGreaterThan(D - 0.01);
    // 最大距離で着いた後: 滑って追いつき、ずれは 0 へ(着いた後に体より先へ出ない)。
    const landed = (t: number) => whipFlyOffset({ tMs: t, v0, maxDist: D, logicalD: D, landAtMs: T, landKind: 'max', landD: D });
    expect(landed(T)).toBeLessThan(0);
    expect(landed((T + Tv) / 2)).toBeGreaterThan(landed(T));
    expect(landed(Tv)).toBeCloseTo(0, 6);
    // 途中で当たって着いた: 短く戻る。
    const hit = (t: number) => whipFlyOffset({ tMs: t, v0, maxDist: D, logicalD: 200, landAtMs: 200, landKind: 'hit', landD: 200 });
    expect(hit(200)).toBeLessThan(0);
    expect(Math.abs(hit(600))).toBeLessThan(0.05);
  });
  it('投げの風の筋: 尾は放した点より後ろへ出ず、先は敵の体。着弾したら先から尾へ縮んで消える', () => {
    const v0 = 1200, D = 375;
    for (const d of [0, 50, 200, 370]) expect(whipFlyVisualDist(whipFlyVisualTimeAt(d, v0, D), v0, D)).toBeCloseTo(d, 6);
    for (const t of [0, 40, 120, 250]) {
      const head = whipFlyVisualDist(t, v0, D);
      const s = whipThrowStreak({ tMs: t, v0, maxDist: D, headNow: head })!;
      expect(s.headD).toBeCloseTo(head, 9);
      expect(s.tailD).toBeGreaterThanOrEqual(0);
      expect(s.tailD).toBeLessThanOrEqual(s.headD);
    }
    // 速いほど長い(減速で縮む)。
    const len = (t: number) => { const s = whipThrowStreak({ tMs: t, v0, maxDist: D, headNow: whipFlyVisualDist(t, v0, D) })!; return s.headD - s.tailD; };
    expect(len(150)).toBeGreaterThan(len(400));
    // 途中で当たって着いた: 尾は動かず、先が加速しながら尾へ縮み、消える。
    const land = 150, landD = whipFlyVisualDist(land, v0, D);
    const after = (dt: number) => whipThrowStreak({ tMs: land + dt, v0, maxDist: D, headNow: landD, landAtMs: land, landD });
    const a0 = after(0.001)!, a1 = after(WHIP_THROW_STREAK_OUT_MS * 0.3)!, a2 = after(WHIP_THROW_STREAK_OUT_MS * 0.6)!, a3 = after(WHIP_THROW_STREAK_OUT_MS * 0.9)!;
    expect(a1.tailD).toBeCloseTo(a0.tailD, 9);
    expect(a0.headD - a1.headD).toBeLessThan(a2.headD - a3.headD); // 加速して縮む
    expect(a3.headD - a3.tailD).toBeLessThan(0.25 * (a0.headD - a0.tailD));
    expect(after(WHIP_THROW_STREAK_OUT_MS)).toBeNull();
  });
});

// ★慣性(社長「鞭は動きがギクシャクしない様に慣性に従って自然に動く様に注意してね」): 場面の継ぎ目で位置と速さが跳ばないこと。
describe('鞭の継ぎ目の慣性(位置と速さが続く)', () => {
  const v0 = 1257, D = 375;
  const T = whipThrowDurationMs(v0, D);
  /** 中心差分の速さ(px/ms)。 */
  const vel = (f: (t: number) => number, t: number) => (f(t + 0.5) - f(t - 0.5));
  it('掴んだ瞬間の縄の巻き付き: 出だしと着きの速さ0(パチンで止まっていた先がいきなり速く動かない)', () => {
    expect(vel(whipTetherEntry, 0.5) * WHIP_TETHER_ENTRY_MS).toBeLessThan(0.05);
    expect(vel(whipTetherEntry, WHIP_TETHER_ENTRY_MS - 0.5) * WHIP_TETHER_ENTRY_MS).toBeLessThan(0.05);
  });
  it('放した瞬間の曲がり: 出だしの速さの差がちょうど回っていた勢いとの差で、その後0へ戻る', () => {
    const rv = { x: -2500, y: 300 };
    const bx = (t: number) => whipFlyReleaseBlend(t, rv.x, rv.y).x;
    expect(((bx(0.01) - bx(0)) / 0.01) * 1000).toBeCloseTo(rv.x, -1); // px/s
    expect(Math.abs(bx(WHIP_FLY_BLEND_TAU_MS * 10))).toBeLessThan(0.5);
    const peak = Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(bx(i))));
    expect(peak).toBeLessThan(Math.abs(rv.x) * WHIP_FLY_BLEND_TAU_MS / 1000 / Math.E + 1e-6);
  });
  it('最大距離に着いたフレームで絵が前へ跳ばない(着いたフレームは着いた距離で見る)', () => {
    const landD = D, staleD = whipThrowDist(T - 16.7, v0, D); // 前のフレームの判定の距離
    const at = landD + whipFlyOffset({ tMs: T, v0, maxDist: D, logicalD: staleD, landAtMs: T, landKind: 'max', landD });
    expect(Math.abs(at - whipFlyVisualDist(T, v0, D))).toBeLessThan(1e-6);
  });
  it('途中で当たって着いた: 絵の速さを持ち越して減速して止まる(速さが1フレームで0にならない・めり込みは小さい)', () => {
    const land = 150, landD = whipThrowDist(land, v0, D);
    const pos = (t: number) => (t < land ? whipFlyVisualDist(t, v0, D) : landD + whipFlyOffset({ tMs: t, v0, maxDist: D, logicalD: landD, landAtMs: land, landKind: 'hit', landD }));
    const vBefore = vel(pos, land - 1), vAfter = vel(pos, land + 1);
    expect(Math.abs(vAfter - vBefore)).toBeLessThan(0.1 * vBefore);
    expect(vBefore).toBeCloseTo(whipFlyVisualSpeed(land, v0, D) / 1000, 1);
    let maxOver = 0;
    for (let t = land; t < land + 400; t += 1) maxOver = Math.max(maxOver, pos(t) - landD);
    expect(maxOver).toBeLessThan(16);
    expect(Math.abs(pos(land + 400) - landD)).toBeLessThan(0.1);
  });
  it('飛ぶ高さ: 放した瞬間の上への速さ0。途中で当たったら上下の速さを持ち越して落ちる', () => {
    const peak = 40, fly = 420;
    const h = (t: number) => whipFlyLiftPx(t, fly, peak);
    expect(h(1)).toBeLessThan(0.1);
    for (const land of [60, 150, 300]) {
      const hl = (t: number) => whipFlyLiftPx(t, fly, peak, land);
      expect(Math.abs(vel(hl, land + 1) - vel(hl, land - 1))).toBeLessThan(0.05);
      expect(hl(land + WHIP_FLY_DROP_MS)).toBe(0);
    }
  });
  it('whipFlyViewOffset: 高さ・直進のずれ・曲がりを1本に足す', () => {
    const f = { tMs: 30, v0, maxDist: D, flyMs: T, ux: 1, uy: 0, logicalD: whipThrowDist(30, v0, D), rvx: 0, rvy: 1000 };
    const v = whipFlyViewOffset(f, 60);
    expect(v.dy).toBeCloseTo(whipFlyReleaseBlend(30, 0, 1000).y, 9);
    expect(v.lift).toBeCloseTo(whipFlyLiftPx(30, T, whipFlyPeakPx(60)), 9);
  });
  it('放した後の縄の先: 放した瞬間の勢いのまま進み出し、手元へ戻って消える', () => {
    const vx = 1.2; // px/ms
    const x = (t: number) => whipTetherRetractTip(t, 90, 0, 0, vx)!.y;
    expect(vel(x, 0.5)).toBeCloseTo(vx, 1);
    expect(whipTetherRetractTip(0, 90, 0, 0, vx)).toEqual({ x: 90, y: 0 });
    expect(Math.abs(whipTetherRetractTip(WHIP_TETHER_RETRACT_MS - 1, 90, 0, 0, vx)!.x)).toBeLessThan(2);
    expect(whipTetherRetractTip(WHIP_TETHER_RETRACT_MS, 90, 0, 0, vx)).toBeNull();
  });
  it('放した後の軌跡: 1フレームで消えず、尾から縮みながら薄れる', () => {
    expect(whipTrailFade(0)).toEqual({ spanK: 1, alphaK: 1 });
    const a = whipTrailFade(WHIP_TRAIL_FADE_MS * 0.3)!, b = whipTrailFade(WHIP_TRAIL_FADE_MS * 0.7)!;
    expect(b.spanK).toBeLessThan(a.spanK); expect(b.alphaK).toBeLessThan(a.alphaK);
    expect(whipTrailFade(WHIP_TRAIL_FADE_MS)).toBeNull();
    expect(WHIP_TRAIL_FADE_MS).toBeGreaterThanOrEqual(80);
  });
});

// ★転がる輪(社長指示2026-11-26「鞭のしなりをもっとぐにゃっと150度ぐらい曲げてほしい。そこから円を描くように伸びるんじゃなくて、そのまま伸びていく感じ」)。
describe('転がる輪(150度折り返して、そのまま伸びる)', () => {
  const S = WHIP_LOOP_ROPE_POINTS - 1;
  const rollStartOf = (pull: number) => W * (pull > 1 ? WHIP_LOOP_FIN_ROLL_START : WHIP_LOOP_ROLL_START);
  const formStartOf = (pull: number) => W * (pull > 1 ? WHIP_LOOP_FIN_FORM_START : WHIP_LOOP_FORM_START);
  const powOf = (pull: number) => (pull > 1 ? WHIP_LOOP_FIN_ACCEL_POW : WHIP_LOOP_ACCEL_POW);
  // 実際に使う組(向き×段)。
  const AIMS = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, -Math.PI / 4, -Math.PI / 2, (-3 * Math.PI) / 4];
  const cases = [1, 2, 3].flatMap(st => AIMS.map(aim => {
    const pull = st === 3 ? WHIP_ROPE_FINISH_PULL : 1;
    return { st, aim, pull, ...whipLoopPose(aim, whipComboSweepSign(st, aim) * WHIP_COMBO_SWEEP_RAD, pull) };
  }));
  for (const c of cases) {
    const name = `段${c.st} 向き${Math.round((c.aim * 180) / Math.PI)}°`;
    const shape = (el: number) => whipRopeShape(el, W, S, c.pull, c.lag, c.startAt, c.lean);
    it(`${name}: 輪より手元側はまっすぐ(lean→0)・先は約150度以上折り返し・輪は手元→先端へ加速して進む`, () => {
      const r0 = rollStartOf(c.pull);
      let prevC = -Infinity, prevV = 0;
      for (const q of [0.2, 0.4, 0.6, 0.8]) {
        const sh = shape(r0 + (W - r0) * q);
        expect(sh.phase).toBe('lash');
        const { center, width, p } = whipLoopAt(q, c.startAt, powOf(c.pull));
        const a1 = c.lean * (1 - p * p * (3 - 2 * p));
        sh.angles.forEach((a, i) => {
          const u = (i + 0.5) / S;
          if (u < center - width / 2) expect(a).toBeCloseTo(a1, 9);
          if (u > center + width / 2 + 0.05) expect(Math.abs(a - a1)).toBeGreaterThan((145 * Math.PI) / 180);
        });
        const v = center - prevC;
        if (prevC > -Infinity) expect(v).toBeGreaterThan(prevV); // 加速(等速にしない)
        prevV = prevC > -Infinity ? v : 0; prevC = center;
      }
      expect(whipLoopAt(0.9).width).toBeLessThan(whipLoopAt(0.1).width);
    });
    it(`${name}: 転がる間、先端は前へ進み続ける(円を描いて払わない)・パチンで射程ちょうど・継ぎ目で跳ばない`, () => {
      let prevX = -Infinity;
      for (let el = rollStartOf(c.pull); el <= W; el += 2) {
        const tip = whipRopePoints(shape(el), 150, 0.1, 0.99).at(-2)!;
        expect(tip.x).toBeGreaterThan(prevX - 1);
        prevX = tip.x;
      }
      expect(prevX).toBeCloseTo(150, 6);
      for (const t of [W * WHIP_ROPE_PULL_END, formStartOf(c.pull), rollStartOf(c.pull), W, W + WHIP_ROPE_CRACK_HOLD_MS]) {
        const a = shape(t - 0.5).angles, b = shape(t + 0.5).angles;
        expect(Math.max(...a.map((x, i) => Math.abs(x - b[i])))).toBeLessThan(0.2);
      }
    });
    it(`${name}: 折れ(U字の曲がり)は折れができた時から当たるまで体の絵(足元から体の高さぶんの縦長の箱)の外`, () => {
      // 画面の座標(描く側と同じ: 形の y に cos の符号を掛けて狙いの向きへ回し、高さ h を上へ)。箱 = 横 ±0.12L・足元(手元の少し下)から上へ 0.42L。
      const L = 150, side = Math.cos(c.aim) >= 0 ? 1 : -1, ca = Math.cos(c.aim), sa = Math.sin(c.aim);
      const r0 = rollStartOf(c.pull);
      for (let el = r0; el < W - (W - r0) * 0.25; el += 4) {
        const q = (el - r0) / (W - r0);
        const { center, width } = whipLoopAt(q, c.startAt, powOf(c.pull));
        const rp = whipSwingRopePoints(el, W, L, 0.1, 0.99, { segs: S, lag: c.lag, lean: c.lean, pull: c.pull, tilt: c.tilt, startAt: c.startAt });
        // 点 i+1 が区間 i の終わり(点0=柄の端・点1=手元)。
        for (let i = 0; i < S; i++) {
          const u = (i + 1) / S;
          if (Math.abs(u - center) > width * 0.5) continue;
          const p = rp.pts[i + 2];
          const ly = p.y * side;
          const sx = p.x * ca - ly * sa, sy = p.x * sa + ly * ca - p.h;
          const inBox = Math.abs(sx) < 0.12 * L && sy < 0.04 * L && sy > -0.42 * L;
          expect(inBox, `el=${el} u=${u.toFixed(2)} (${sx.toFixed(0)},${sy.toFixed(0)})`).toBe(false);
        }
      }
    });
  }
  it('向きごとの輪の作り方: 左右・斜め=手前(+y)へ折る・上下=横へ寝かせて払いの来る側・3段目=頭上へ立てて前へ垂らす', () => {
    expect(whipLoopPose(0, 0.5, 1)).toMatchObject({ lag: 1, lean: 0 });
    expect(whipLoopPose(Math.PI, -0.5, 1)).toMatchObject({ lag: 1, lean: 0 });
    const up1 = whipLoopPose(-Math.PI / 2, whipComboSweepSign(1, -Math.PI / 2), 1), up2 = whipLoopPose(-Math.PI / 2, whipComboSweepSign(2, -Math.PI / 2), 1);
    expect(up1.lag).toBe(-up2.lag); // 1段目と2段目で横の側が逆
    expect(Math.sign(up1.lean)).toBe(up1.lag);
    expect(Math.abs(up1.lean)).toBeGreaterThan(0.5);
    const fin = whipLoopPose(-Math.PI / 2, 0, WHIP_ROPE_FINISH_PULL);
    expect(fin.lag).toBe(1);
    expect(fin.lean).toBeLessThan(-0.5);
    expect(fin.tilt).toBeGreaterThan(1);
  });
  it('引き: 手が先に動き、縄は根元から順に曲がる(先端が一番遅れる・棒のように回らない)', () => {
    const rest = whipRopeShape(0, W, S, 1, 1);
    for (const el of [24, 32]) {
      const a = whipRopeShape(el, W, S, 1, 1);
      const turned = a.angles.map((x, i) => Math.abs(x - rest.angles[i]));
      expect(turned[0]).toBeGreaterThan(turned[S - 1] + 0.3); // 根元が先に回る
      expect(Math.hypot(a.handX, a.handY)).toBeGreaterThan(5); // 手はもう動いている
    }
    // 32ms でも縄全体が同じ向き(棒)になっていない
    const mid = whipRopeShape(32, W, S, 1, 1).angles;
    expect(Math.max(...mid) - Math.min(...mid)).toBeGreaterThan(0.8);
  });
  it('3段目: 折れを深く・ゆっくり作り(転がり始めが遅い)、最後に一気に伸ばす(当たる時刻は同じ)', () => {
    expect(WHIP_LOOP_FIN_ROLL_START).toBeGreaterThan(WHIP_LOOP_ROLL_START + 0.1);
    expect(WHIP_LOOP_FIN_ACCEL_POW).toBeGreaterThan(WHIP_LOOP_ACCEL_POW);
    expect(WHIP_LOOP_TURN_FIN_RAD).toBeGreaterThan(WHIP_LOOP_TURN_RAD);
    expect(whipRopeShape(W, W, S, WHIP_ROPE_FINISH_PULL, 1, 0.5, -0.7).angles.every(a => a === 0)).toBe(true);
  });
  it('パチンの後: 先端が縄の長さの1〜2割以上戻り、鳴った直後からたるみ始める(止まって見えない・いきなり倒れない)', () => {
    for (const c of cases.filter(x => x.st !== 3)) {
      const pts = (el: number) => whipRopePoints(whipRopeShape(el, W, S, c.pull, c.lag, c.startAt, c.lean), 150, 0.1, 0.99);
      const back = Math.min(...[16, 24, 32, 40, 48, 56].map(d => pts(W + d).at(-2)!.x));
      expect(150 - back).toBeGreaterThan(150 * 0.12);
      expect(150 - back).toBeLessThan(150 * 0.3);
      // 16ms ごとに形が動き続ける(固まらない)
      for (let el = W + 8; el < W + 90; el += 16) {
        const a = pts(el), b = pts(el + 16);
        expect(Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)))).toBeGreaterThan(3);
      }
      // 1ms で跳ばない(戻りの始まりも)
      for (let el = W + 1; el < whipRopeTotalMs(W) - 1; el += 1) {
        const a = whipRopeShape(el, W, S, c.pull, c.lag, c.startAt, c.lean).angles, b = whipRopeShape(el + 1, W, S, c.pull, c.lag, c.startAt, c.lean).angles;
        expect(Math.max(...a.map((x, i) => Math.abs(x - b[i])))).toBeLessThan(0.15);
      }
    }
  });
  it('3段目の縦の面を横へ倒すと、形の y の一部が横へ出る(上下の向きで輪がつぶれない)', () => {
    const t = whipSwingRopePoints(W * 0.8, W, 150, 0.1, 0.99, { pull: WHIP_ROPE_FINISH_PULL, tilt: 0.6, lag: 1, lean: -0.9 });
    expect(Math.max(...t.pts.map(p => Math.abs(p.y)))).toBeGreaterThan(10);
  });
  it('3段目(頭上): 縦の面の点列=横のずれ0・溜めの先端は手元より上(高さ+)で後ろ', () => {
    const hold = whipSwingRopePoints(W * 0.36, W, 150, 0.1, 0.99, { pull: WHIP_ROPE_FINISH_PULL, lag: 1 });
    expect(hold.pts.every(p => p.y === 0)).toBe(true);
    const tip = hold.pts[hold.pts.length - 2];
    expect(tip.h).toBeGreaterThan(40);
    expect(tip.x).toBeLessThan(-60);
    const crack = whipSwingRopePoints(W, W, 150, 0.1, 0.99, { pull: WHIP_ROPE_FINISH_PULL, lag: 1, lean: -0.9 });
    expect(crack.pts.every(p => Math.abs(p.h) < 1e-9)).toBe(true);
    const ground = whipSwingRopePoints(W * 0.5, W, 150, 0.1, 0.99, { lag: 1 });
    expect(ground.pts.every(p => p.h === 0)).toBe(true);
    expect(ground.pts.length).toBe(WHIP_LOOP_ROPE_POINTS + 2);
  });
});

describe('掴んだ瞬間の寄り(社長指示2026-11-26「その敵に一瞬少し寄りズーム」)', () => {
  it('寄る量は1.15〜1.25倍・寄り→止め→戻りの合計0.4〜0.6秒・終わったら0', () => {
    expect(1 + WHIP_GRAB_ZOOM_MAG).toBeGreaterThanOrEqual(1.15);
    expect(1 + WHIP_GRAB_ZOOM_MAG).toBeLessThanOrEqual(1.25);
    expect(WHIP_GRAB_ZOOM_TOTAL_MS).toBeGreaterThanOrEqual(400);
    expect(WHIP_GRAB_ZOOM_TOTAL_MS).toBeLessThanOrEqual(600);
    expect(whipGrabZoomAt(-1)).toBe(0);
    expect(whipGrabZoomAt(0)).toBe(0);
    expect(whipGrabZoomAt(WHIP_GRAB_ZOOM_IN_MS + WHIP_GRAB_ZOOM_HOLD_MS / 2)).toBe(1);
    expect(whipGrabZoomAt(WHIP_GRAB_ZOOM_TOTAL_MS)).toBe(0);
  });
  it('慣性: 寄り始め・寄り切り・戻り始め・戻り終わりで速さが0に近く、1ms で跳ばない', () => {
    const v = (t: number) => whipGrabZoomAt(t + 0.5) - whipGrabZoomAt(t - 0.5);
    for (const t of [0.5, WHIP_GRAB_ZOOM_IN_MS, WHIP_GRAB_ZOOM_IN_MS + WHIP_GRAB_ZOOM_HOLD_MS, WHIP_GRAB_ZOOM_TOTAL_MS - 0.5]) expect(Math.abs(v(t))).toBeLessThan(0.002);
    for (let t = 1; t < WHIP_GRAB_ZOOM_TOTAL_MS; t += 7) expect(Math.abs(v(t))).toBeLessThan(0.03);
  });
});

describe('投げの距離を縮めても、判定が着く時刻に絵が地面へ戻り・絵は最大距離で止まる(社長指示2026-11-26 2.5→1.75)', () => {
  it('届く距離 150 の時', () => {
    const D = 150 * WHIP_THROW_DIST_MULT, v0 = 1200;
    const T = whipThrowDurationMs(v0, D);
    expect(whipThrowDist(T, v0, D)).toBeCloseTo(D, 6);
    expect(whipFlyLiftPx(T, T, whipFlyPeakPx(60))).toBe(0);
    expect(whipFlyLiftPx(T / 2, T, whipFlyPeakPx(60))).toBeGreaterThan(20);
    expect(whipFlyVisualDist((2 * D / v0) * 1000, v0, D)).toBeCloseTo(D, 6);
  });
});

describe('赤いしなりは一旦出さない(社長指示2026-11-26「赤い斬撃は一旦削除　合ってない」)', () => {
  it('旗が false', () => { expect(WHIP_SNARE_FX_ENABLED).toBe(false); });
});
