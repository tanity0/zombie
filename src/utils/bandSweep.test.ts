import { describe, it, expect } from 'vitest';
import { bandSweepCenter, bandSweepAlphaAt, sweepTelegraphProg, twoPhaseTelegraphProg, multiPhaseTelegraphProg, bandSweepSliceAlpha, BAND_SWEEP_SLICES, BAND_SWEEP_HALF_W } from './bandSweep';

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

  // research/CREATIVE_AUDIT_2026-09-11.md #25(b)追記(品質監査1巡目): easePow 省略時は旧(t*t)と
  // 同値であること。帯(カプセル)にも区分ごとの easePow を配線したが、雑魚の既定の見た目は
  // 1pxも変わらないことの担保(circleSweepBand と対の網)。
  it('easePow 省略時は旧(t*t)と同値(#25(b)・既定の見た目を変えない担保)', () => {
    for (let p = 0; p <= 1.0001; p += 0.05) {
      expect(bandSweepCenter(p, HW)).toBeCloseTo(bandSweepCenter(p, HW, true, 2), 10);
    }
    expect(bandSweepCenter(0.37, HW, true, 2)).toBeCloseTo(bandSweepCenter(0.37, HW), 10);
  });

  it('easePow が大きいほど終盤への加速が急になる(#25(b)「重い」ボスほど強いease)', () => {
    const mid2 = bandSweepCenter(0.5, HW, true, 2);
    const mid3 = bandSweepCenter(0.5, HW, true, 3);
    // t=0.5 では t^3 < t^2 = e が小さい=まだ始点寄り(中心位置 -halfW + e*(1+2halfW) が小さい)。
    expect(mid3).toBeLessThan(mid2);
    // 両端は easePow に関わらず一致する。
    expect(bandSweepCenter(0, HW, true, 3)).toBeCloseTo(bandSweepCenter(0, HW, true, 2), 10);
    expect(bandSweepCenter(1, HW, true, 3)).toBeCloseTo(bandSweepCenter(1, HW, true, 2), 10);
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

// ★★赤い予告の4つの掟①②③(CLAUDE.md・社長指示2026-09-18)。PACING_PUZZLE.md §18。
describe('multiPhaseTelegraphProg(N拍の通し=多段の技の「その段が当たる瞬間まで」)', () => {
  it('2拍なら twoPhaseTelegraphProg と一致する(一般形であって別物ではない)', () => {
    for (const [first, second, inFirst, remain] of [
      [800, 1000, true, 300], [800, 1000, false, 250], [650, 260, true, 0], [0, 500, false, 100],
    ] as const) {
      expect(multiPhaseTelegraphProg([first, second], inFirst ? 0 : 1, remain))
        .toBeCloseTo(twoPhaseTelegraphProg({ firstMs: first, secondMs: second, inFirst, remainMs: remain }), 6);
    }
  });
  it('拍の境目で値が連続する(段差なし)', () => {
    const ph = [650, 130, 260];
    expect(multiPhaseTelegraphProg(ph, 0, 0)).toBeCloseTo(multiPhaseTelegraphProg(ph, 1, ph[1]), 6);
    expect(multiPhaseTelegraphProg(ph, 1, 0)).toBeCloseTo(multiPhaseTelegraphProg(ph, 2, ph[2]), 6);
  });
  it('最後の拍が尽きた瞬間にちょうど1(=その段が当たる瞬間に消え切る)', () => {
    expect(multiPhaseTelegraphProg([650, 130, 260], 2, 0)).toBe(1);
    expect(multiPhaseTelegraphProg([650, 130, 260], 0, 650)).toBe(0);
  });
  it('index/remain が範囲外でも 0〜1 に収まる(境界安全)', () => {
    expect(multiPhaseTelegraphProg([100, 100], -5, 50)).toBeGreaterThanOrEqual(0);
    expect(multiPhaseTelegraphProg([100, 100], 99, -50)).toBe(1);
    expect(multiPhaseTelegraphProg([], 0, 0)).toBe(1);
  });
});

// PACING_PUZZLE.md §18-1 C-3〜C-6(偶像の狙い撃ち/扇射/オーブ、スリィエルの環のビーム)。
// **旧実装の嘘の検知器**: 旧 `drawAngelBeamLine` は「太さ・濃さが prog で増えるだけ」で、
// **発射の瞬間(prog=1)がいちばん濃かった**=流星(消え切った瞬間に来る)と真逆だった。
describe('★bandSweepSliceAlpha — 射線(T6)も流星の文法へ', () => {
  const at = (prog: number) => Array.from({ length: BAND_SWEEP_SLICES },
    (_, i) => bandSweepSliceAlpha((i + 0.5) / BAND_SWEEP_SLICES, prog));

  it('★発射の瞬間(prog=1)は線が消え切っている(旧実装はここが最大だった)', () => {
    expect(Math.max(...at(1))).toBe(0);
  });
  it('★溜めの頭(prog=0)も線は出ていない=窓は帯の外から入ってくる', () => {
    expect(Math.max(...at(0))).toBe(0);
  });
  it('★途中では必ずどこかが光っている(予告が消えたまま溜めが進まない)', () => {
    for (const p of [0.2, 0.4, 0.6, 0.8, 0.95]) expect(Math.max(...at(p))).toBeGreaterThan(0);
  });
  it('★窓は起点→終点へ進む(逆流しない)', () => {
    const peakAt = (prog: number) => {
      const a = at(prog);
      return a.indexOf(Math.max(...a));
    };
    let prev = -1;
    for (const p of [0.25, 0.4, 0.55, 0.7, 0.85, 0.95]) {
      const i = peakAt(p);
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });
  it('窓の中心では最大・縁では0(bandSweepAlphaAt と同じ窓を使っている=自前の位相を作らない)', () => {
    const c = bandSweepCenter(0.5, HW);
    expect(bandSweepSliceAlpha(c, 0.5)).toBeCloseTo(bandSweepAlphaAt(c, c, HW), 10);
    expect(bandSweepSliceAlpha(c + HW, 0.5)).toBe(0);
  });
});
