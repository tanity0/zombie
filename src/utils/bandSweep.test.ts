import { describe, it, expect } from 'vitest';
import { bandSweepCenter, bandSweepAlphaAt, sweepTelegraphProg, twoPhaseTelegraphProg, BAND_SWEEP_HALF_W } from './bandSweep';

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

describe('sweepTelegraphProg(追尾相→溜めを1本の窓として通す・v0.25.4105)', () => {
  const T = 1000, W = 700;
  const track = (remain: number) => sweepTelegraphProg({ trackMs: T, windupMs: W, inTrack: true, remainMs: remain });
  const wind = (remain: number) => sweepTelegraphProg({ trackMs: T, windupMs: W, inTrack: false, remainMs: remain });

  it('★追尾の頭で0・発動の瞬間(溜めの終わり)でちょうど1', () => {
    expect(track(T)).toBe(0);
    expect(wind(0)).toBe(1);
  });

  it('★ロックの境目で値が連続する(窓が巻き戻らない=「一貫した流星」の肝)', () => {
    expect(wind(W)).toBeCloseTo(track(0), 9);
    expect(track(0)).toBeCloseTo(T / (T + W), 9);
  });

  it('通しで単調増加(戻らない)', () => {
    const seq: number[] = [];
    for (let r = T; r >= 0; r -= 50) seq.push(track(r));
    for (let r = W; r >= 0; r -= 50) seq.push(wind(r));
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
    expect(seq[seq.length - 1]).toBe(1);
  });

  it('★追尾相を通らない(?ttrack=0)なら溜めだけで0→1=従来と完全一致', () => {
    expect(sweepTelegraphProg({ trackMs: 0, windupMs: W, inTrack: false, remainMs: W })).toBe(0);
    expect(sweepTelegraphProg({ trackMs: 0, windupMs: W, inTrack: false, remainMs: W / 2 })).toBeCloseTo(0.5, 9);
    expect(sweepTelegraphProg({ trackMs: 0, windupMs: W, inTrack: false, remainMs: 0 })).toBe(1);
  });

  it('残りが相の長さを超える/負でも 0〜1 を外れない', () => {
    expect(track(99999)).toBe(0);
    expect(wind(-500)).toBe(1);
    expect(sweepTelegraphProg({ trackMs: 0, windupMs: 0, inTrack: true, remainMs: 0 })).toBe(0);
  });
});

describe('twoPhaseTelegraphProg(2拍で1つの予告=噛みつきの「溜め+間」・v0.25.4108)', () => {
  // 噛みつきの実効値(GIANT_BITE_WINDUP_MS=840 / GIANT_BITE_HOLD_MS=420 を
  // ENEMY_ATTACK_SPEED_MULT=1.2 で割る = 実効 700ms / 350ms)。
  const F = 840 / 1.2, S = 420 / 1.2;
  const first = (remain: number) => twoPhaseTelegraphProg({ firstMs: F, secondMs: S, inFirst: true, remainMs: remain });
  const second = (remain: number) => twoPhaseTelegraphProg({ firstMs: F, secondMs: S, inFirst: false, remainMs: remain });

  it('★「間」の終わり=噛む瞬間でちょうど1(消え切り=判定発生)', () => {
    expect(second(0)).toBe(1);
  });

  it('★溜めの終わりでは**まだ抜け切っていない**(ここで消えると実効350ms早い=直した不具合そのもの)', () => {
    expect(first(0)).toBeCloseTo(F / (F + S), 9);
    expect(first(0)).toBeLessThan(1);
  });

  it('拍の境目で連続する(窓が巻き戻らない)', () => {
    expect(second(S)).toBeCloseTo(first(0), 9);
  });

  it('溜めの頭は0・通しで単調増加', () => {
    expect(first(F)).toBe(0);
    let prev = -1;
    for (const v of [...[...Array(11)].map((_, i) => first(F - (F * i) / 10)),
                     ...[...Array(11)].map((_, i) => second(S - (S * i) / 10))]) {
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(prev).toBe(1);
  });
});
