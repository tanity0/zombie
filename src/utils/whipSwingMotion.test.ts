// 鞭の普通の振りの見た目(しなり→パチン・体の振り上げ→しゃがみ)の純関数。判定の時刻(前隙の終わり)で伸び切る・しゃがみの底になることを固める。
import { describe, it, expect } from 'vitest';
import { whipRopeShape, whipRopePoints, whipBodyPose, whipRopeTotalMs, WHIP_ROPE_CRACK_HOLD_MS, WHIP_ROPE_RETRACT_MS } from './whipSwingMotion';

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
