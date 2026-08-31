import { describe, it, expect } from 'vitest';
import { bandSweepCenter, bandSweepAlphaAt, BAND_SWEEP_HALF_W } from './bandSweep';

const HW = BAND_SWEEP_HALF_W;

describe('bandSweep(帯の窓マスク・始点→終点)', () => {
  it('★溜めの頭では窓が帯の外に居る=フェードインする(v0.25.4103・社長「ちゃんとフェードインアウト」)', () => {
    const c = bandSweepCenter(0, HW);
    expect(c).toBeCloseTo(-HW, 6);
    // 帯の上(s>=0)はどこも濃さ0=いきなり全開にならない
    expect(bandSweepAlphaAt(0, c, HW)).toBeCloseTo(0, 6);
    expect(bandSweepAlphaAt(0.5, c, HW)).toBe(0);
    // 少し進むと始点から滲み出す
    const c2 = bandSweepCenter(0.15, HW);
    expect(bandSweepAlphaAt(0, c2, HW)).toBeGreaterThan(0);
  });

  it('溜めの終わりでは窓が終点を抜け切っている=消え切り(この瞬間が判定)', () => {
    const c = bandSweepCenter(1, HW);
    expect(c).toBeCloseTo(1 + HW, 6);
    // 帯の上のどこを見ても濃さが**事実上0**(浮動小数の丸めで 1e-31 のような値は残りうるが、
    // 画面には1bitも出ない。「消え切っている」の判定はこの閾値で十分)。
    for (let s = 0; s <= 1.0001; s += 0.05) expect(bandSweepAlphaAt(s, c, HW)).toBeLessThan(1e-9);
  });

  it('窓は始点→終点へ単調に進む(戻らない)', () => {
    let prev = -Infinity;
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const c = bandSweepCenter(p, HW);
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });

  it('等速ではない(慣性・CLAUDE.md MUST)= 前半より後半の方が速い', () => {
    const d1 = bandSweepCenter(0.5, HW) - bandSweepCenter(0, HW);
    const d2 = bandSweepCenter(1, HW) - bandSweepCenter(0.5, HW);
    expect(d2).toBeGreaterThan(d1 * 1.5);
    const l1 = bandSweepCenter(0.5, HW, false) - bandSweepCenter(0, HW, false);
    const l2 = bandSweepCenter(1, HW, false) - bandSweepCenter(0.5, HW, false);
    expect(l2).toBeCloseTo(l1, 6);
  });

  it('濃さは窓の中心で最大・両縁で0(=フェードするグラデ)', () => {
    const c = 0.5;
    expect(bandSweepAlphaAt(0.5, c, HW)).toBeCloseTo(1, 6);
    expect(bandSweepAlphaAt(0.5 - HW, c, HW)).toBe(0);
    expect(bandSweepAlphaAt(0.5 + HW, c, HW)).toBe(0);
    expect(bandSweepAlphaAt(0.5 - HW / 2, c, HW)).toBeGreaterThan(0);
    expect(bandSweepAlphaAt(0.5 - HW / 2, c, HW)).toBeLessThan(1);
  });

  it('★どの時点でも「帯の全長」を切らない=スライスのアルファが連続している(切り口が出ない)', () => {
    // 隣り合うスライスの濃さの差が小さい=段差(ぱつっと)にならない、を数値で固定する。
    const SL = 30;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const c = bandSweepCenter(p, HW);
      let prevA = bandSweepAlphaAt(0.5 / SL, c, HW);
      for (let i = 1; i < SL; i++) {
        const a = bandSweepAlphaAt((i + 0.5) / SL, c, HW);
        expect(Math.abs(a - prevA)).toBeLessThan(0.25);
        prevA = a;
      }
    }
  });

  it('halfW が 0 以下でも落ちない', () => {
    expect(bandSweepAlphaAt(0.5, 0.5, 0)).toBe(0);
    expect(bandSweepAlphaAt(0.5, 0.5, -1)).toBe(0);
  });
});
