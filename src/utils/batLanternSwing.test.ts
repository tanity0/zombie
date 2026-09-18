import { describe, it, expect } from 'vitest';
import {
  batLanternPose, batSlamFrame, BAT_SLAM_FRAMES, BAT_SLAM_IMPACT_FRAME,
  BAT_SLAM_TAIL_MS, BAT_SLAM_ANCHOR_X, BAT_LANTERN_SETTLE_MS,
  BAT_LANTERN_BACK_DEG, BAT_LANTERN_DOWN_DEG, usesBatLantern,
} from './batLanternSwing';

const W = 300, B = 200;

describe('バットのランタン: 振りの姿勢', () => {
  it('噛みつきが走っていない(負の経過)なら出さない', () => {
    expect(batLanternPose(-1, 0, 1, W, B)).toBeNull();
  });

  it('★余韻が切れたら消える(出しっぱなしにしない)', () => {
    expect(batLanternPose(W + B + BAT_LANTERN_SETTLE_MS + 1, 0, 1, W, B)).toBeNull();
  });

  it('★溜めの終わり=背中の上まで振り上がっている(振り下ろしの始点)', () => {
    const p = batLanternPose(W, 0, 1, W, B)!;
    expect(p.angle).toBeCloseTo(BAT_LANTERN_BACK_DEG * Math.PI / 180, 5);
  });

  it('★噛みの終わり(=当たる瞬間)=振り下ろし切っている', () => {
    const p = batLanternPose(W + B, 0, 1, W, B)!;
    expect(p.angle).toBeCloseTo(BAT_LANTERN_DOWN_DEG * Math.PI / 180, 5);
  });

  it('★出はパッと出さない(頭のフレームは薄い)', () => {
    expect(batLanternPose(0, 0, 1, W, B)!.alpha).toBeLessThan(0.2);
    expect(batLanternPose(W, 0, 1, W, B)!.alpha).toBe(1);
  });

  it('★振り下ろしは落ちるほど速い(等速でない=慣性MUST)', () => {
    const a = (t: number) => batLanternPose(W + t * B, 0, 1, W, B)!.angle;
    const first = a(0.5) - a(0);      // 前半で進む量
    const second = a(1) - a(0.5);     // 後半で進む量
    expect(Math.abs(second)).toBeGreaterThan(Math.abs(first) * 1.5);
  });

  it('★振り上げは上ほど遅い(等速でない)', () => {
    const a = (t: number) => batLanternPose(t * W, 0, 1, W, B)!.angle;
    const first = Math.abs(a(0.5) - a(0));
    const second = Math.abs(a(1) - a(0.5));
    expect(first).toBeGreaterThan(second * 1.5);
  });

  it('★左向きは鏡(背中の上→斜め下の関係が保たれる)', () => {
    const r = batLanternPose(W, 0, 1, W, B)!.angle;
    const l = batLanternPose(W, Math.PI, -1, W, B)!.angle;
    // 右向きの角度を縦軸で反転すると左向きの角度になる
    const mirrored = Math.PI - r;
    const norm = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
    expect(norm(l - mirrored)).toBeCloseTo(0, 5);
  });
});

describe('バットのランタン: 叩き落としのコマ送り', () => {
  it('★当たる瞬間にちょうど炸裂のコマが出る(絵と判定の時刻が合う)', () => {
    expect(batSlamFrame(B, B)).toBe(BAT_SLAM_IMPACT_FRAME);
  });

  it('★噛みの頭は先頭のコマ、進むほど番号が上がる(戻らない)', () => {
    let prev = -1;
    for (let t = 0; t <= B + BAT_SLAM_TAIL_MS; t += 5) {
      const f = batSlamFrame(t, B);
      if (f === null) continue;
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(batSlamFrame(0, B)).toBe(0);
  });

  it('★余韻が切れたら消える。最後のコマまで流し切る', () => {
    expect(batSlamFrame(B + BAT_SLAM_TAIL_MS, B)).toBeNull();
    expect(batSlamFrame(B + BAT_SLAM_TAIL_MS - 1, B)).toBe(BAT_SLAM_FRAMES - 1);
  });

  it('接地点の表はコマ数ぶんある(素材を足したら必ずここも足す)', () => {
    expect(BAT_SLAM_ANCHOR_X).toHaveLength(BAT_SLAM_FRAMES);
  });
});

describe('対象の型', () => {
  it('ランタンを振るのはバットだけ(区分外の型に増設しない)', () => {
    expect(usesBatLantern({ type: 'bat' })).toBe(true);
    expect(usesBatLantern({ type: 'skeleton' })).toBe(false);
    expect(usesBatLantern({ type: 'zombie' })).toBe(false);
  });
});
