// 鞭の普通の振りの見た目(しなり→パチン・体の振り上げ→しゃがみ)の純関数。判定の時刻(前隙の終わり)で伸び切る・しゃがみの底になることを固める。
import { describe, it, expect } from 'vitest';
import {
  whipRopeShape, whipRopePoints, whipBodyPose, whipRopeTotalMs, WHIP_ROPE_CRACK_HOLD_MS, WHIP_ROPE_RETRACT_MS,
  whipTetherShape, whipTetherBow, whipTetherRetract, WHIP_TETHER_RETRACT_MS, whipFlyLiftPx, whipFlyPeakPx, whipFlyVisualDist, whipFlyOffset,
  WHIP_FLY_DROP_MS, WHIP_FLY_LIFT_MIN_PX, WHIP_FLY_LIFT_MAX_PX,
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
  it('飛ぶ高さ: 放した時と最大距離に着く時刻で地面(0)・途中は浮く。途中で当たったら短く落ちて地面へ', () => {
    expect(whipFlyLiftPx(0, 600, 50)).toBe(0);
    expect(whipFlyLiftPx(300, 600, 50)).toBeCloseTo(50, 6);
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
});
