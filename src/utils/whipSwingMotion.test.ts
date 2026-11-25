// 鞭の普通の振りの見た目(しなり→パチン・体の振り上げ→しゃがみ)の純関数。判定の時刻(前隙の終わり)で伸び切る・しゃがみの底になることを固める。
import { describe, it, expect } from 'vitest';
import {
  whipRopeShape, whipRopePoints, whipBodyPose, whipRopeTotalMs, WHIP_ROPE_CRACK_HOLD_MS, WHIP_ROPE_RETRACT_MS,
  whipTetherShape, whipTetherBow, whipTetherRetract, WHIP_TETHER_RETRACT_MS, whipFlyLiftPx, whipFlyPeakPx, whipFlyVisualDist, whipFlyOffset,
  WHIP_FLY_DROP_MS, WHIP_FLY_LIFT_MIN_PX, WHIP_FLY_LIFT_MAX_PX,
  whipTetherEntry, WHIP_TETHER_ENTRY_MS, whipTetherGlowK, whipFlyVisualTimeAt, whipThrowStreak, WHIP_THROW_STREAK_OUT_MS,
  whipFlyVisualSpeed, whipFlyReleaseBlend, whipFlyViewOffset, whipTetherRetractTip, whipTrailFade, WHIP_TRAIL_FADE_MS, WHIP_FLY_BLEND_TAU_MS,
} from './whipSwingMotion';
import { whipThrowDurationMs, whipThrowDist } from './whipSwing';

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
    expect(at(100)).toBe('hold');
    expect(at(150)).toBe('lash');
    expect(at(W + 10)).toBe('crack');
    expect(at(W + WHIP_ROPE_CRACK_HOLD_MS + 50)).toBe('retract');
    expect(at(whipRopeTotalMs(W))).toBe('done');
    expect(whipRopeTotalMs(W)).toBe(W + WHIP_ROPE_CRACK_HOLD_MS + WHIP_ROPE_RETRACT_MS);
  });
  it('溜めでは鞭が体の後ろ(先端が後ろ側)・頭の上を通って引く(引きの途中で先が上=負)', () => {
    const hold = whipRopePoints(whipRopeShape(100, W), 150, 0.1, 0.99);
    expect(hold[hold.length - 2].x).toBeLessThan(-60);
    const mid = whipRopeShape(20, W);
    expect(Math.min(...mid.angles)).toBeLessThan(-Math.PI / 4);
  });
  it('打ち出しは手元から先にほどける(手元の区間の方が先にまっすぐ)', () => {
    const s = whipRopeShape(185, W);
    expect(Math.abs(s.angles[0])).toBeLessThan(Math.abs(s.angles[s.angles.length - 1]));
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
