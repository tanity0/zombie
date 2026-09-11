import { describe, it, expect } from 'vitest';
import { circleSweepBand, circleSweepAlphaAt, CIRCLE_SWEEP_HALF_W } from './circleSweep';

const R = 100;
const HW = R * CIRCLE_SWEEP_HALF_W;

describe('circleSweep(赤円の帯マスク・外→内)', () => {
  it('★溜めの1フレーム目から外枠に帯が乗っている(v0.25.4093: 初版は最初の2割が真っ白だった)', () => {
    const band = circleSweepBand(0, R, HW);
    expect(band).toBeCloseTo(R, 6);
    // 外枠(=判定半径)の位置がいちばん濃い=「どこが危ないか」が1フレーム目に出る
    expect(circleSweepAlphaAt(R, band, HW)).toBeCloseTo(1, 6);
    // 内側は帯の半幅ぶんだけフェードして消える
    expect(circleSweepAlphaAt(R - HW, band, HW)).toBe(0);
    expect(circleSweepAlphaAt(0, band, HW)).toBe(0);
  });

  it('溜めの終わりでは帯が中心を抜け切っている=消え切り(この瞬間が判定)', () => {
    const band = circleSweepBand(1, R, HW);
    expect(band).toBeCloseTo(-HW, 6);
    for (let r = 0; r <= R; r += 5) expect(circleSweepAlphaAt(r, band, HW)).toBe(0);
  });

  it('帯は外から内へ単調に進む(戻らない)', () => {
    let prev = Infinity;
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const band = circleSweepBand(p, R, HW);
      expect(band).toBeLessThan(prev);
      prev = band;
    }
  });

  it('等速ではない(慣性・CLAUDE.md MUST)= 前半より後半の方が速い', () => {
    const d1 = circleSweepBand(0, R, HW) - circleSweepBand(0.5, R, HW);
    const d2 = circleSweepBand(0.5, R, HW) - circleSweepBand(1, R, HW);
    expect(d2).toBeGreaterThan(d1 * 1.5);
    // ease=false なら等速に戻せる(ロールバック用)
    const l1 = circleSweepBand(0, R, HW, false) - circleSweepBand(0.5, R, HW, false);
    const l2 = circleSweepBand(0.5, R, HW, false) - circleSweepBand(1, R, HW, false);
    expect(l2).toBeCloseTo(l1, 6);
  });

  it('濃さは帯の中心で最大・両縁で0(=フェードするグラデ)', () => {
    const band = 50;
    expect(circleSweepAlphaAt(50, band, HW)).toBeCloseTo(1, 6);
    expect(circleSweepAlphaAt(50 - HW, band, HW)).toBe(0);
    expect(circleSweepAlphaAt(50 + HW, band, HW)).toBe(0);
    expect(circleSweepAlphaAt(50 - HW / 2, band, HW)).toBeGreaterThan(0);
    expect(circleSweepAlphaAt(50 - HW / 2, band, HW)).toBeLessThan(1);
    // 帯の外は完全に0(=絵が出ない)
    expect(circleSweepAlphaAt(50 + HW * 2, band, HW)).toBe(0);
  });

  it('halfW が 0 以下でも落ちない', () => {
    expect(circleSweepAlphaAt(10, 10, 0)).toBe(0);
    expect(circleSweepAlphaAt(10, 10, -5)).toBe(0);
  });

  // research/CREATIVE_AUDIT_2026-09-11.md #25(b)追記(品質監査1巡目): easePow 省略時は今の挙動
  // (t*t)と数値的に同値であること。区分ごとの easePow 差し替え(#25(b))が既定(雑魚)の見た目を
  // 1pxも変えないことの担保。
  it('easePow 省略時は t*t と同値(#25(b)・既定の見た目を変えない担保)', () => {
    for (let p = 0; p <= 1.0001; p += 0.05) {
      expect(circleSweepBand(p, R, HW)).toBeCloseTo(circleSweepBand(p, R, HW, true, 2), 10);
    }
    // 明示的に easePow=2 を渡しても同じ(既定値と一致することの確認)。
    expect(circleSweepBand(0.37, R, HW, true, 2)).toBeCloseTo(circleSweepBand(0.37, R, HW), 10);
  });

  it('easePow が大きいほど終盤への加速が急になる(#25(b)「重い」ボスほど強いease)', () => {
    const mid2 = circleSweepBand(0.5, R, HW, true, 2);
    const mid3 = circleSweepBand(0.5, R, HW, true, 3);
    // t=0.5 では t^3 < t^2 なので e が小さい=まだ外周寄り(帯の位置=R-e*(R+HW)がRに近い)。
    expect(mid3).toBeGreaterThan(mid2);
    // 両端(prog=0/1)は easePow に関わらず一致する。
    expect(circleSweepBand(0, R, HW, true, 3)).toBeCloseTo(circleSweepBand(0, R, HW, true, 2), 10);
    expect(circleSweepBand(1, R, HW, true, 3)).toBeCloseTo(circleSweepBand(1, R, HW, true, 2), 10);
  });
});
