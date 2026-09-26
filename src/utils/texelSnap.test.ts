import { describe, it, expect } from 'vitest';
import { snapTexelRatio, isSnapCovered, TEXEL_SNAP_HOLD, TEXEL_SNAP_RELEASE } from './texelSnap';

describe('snapTexelRatio(ピクセルスナップの数学・v0.25.1768-1774)', () => {
  it('帯内は整数へ完全スナップ(SE2フル=0.926 / 15ProMax=1.062 / 360dpAndroid=0.889)', () => {
    expect(snapTexelRatio(0.926)).toBe(1);
    expect(snapTexelRatio(1.062)).toBe(1);
    expect(snapTexelRatio(0.889)).toBe(1); // v0.25.1774の帯拡張(HOLD13%)で入った
    expect(snapTexelRatio(1.086)).toBe(1); // 16ProMax
  });

  it('帯外は素のまま(SE2バー付き=0.768 / SE1=0.789 / iPad=1.639 / ズーム大引き)', () => {
    expect(snapTexelRatio(0.768)).toBe(0.768);
    expect(snapTexelRatio(0.789)).toBe(0.789);
    expect(snapTexelRatio(1.639)).toBe(1.639);
    expect(snapTexelRatio(0.4)).toBe(0.4); // round=0 → 1px未満へは丸めない
  });

  it('待機ズーム(+5%)や遠近の揺れ(±数%)はスナップ帯が吸収し続ける', () => {
    // 常用機の係数 0.93〜1.09 × 待機ズーム1.05 の範囲をなめてもスナップ維持
    for (let k = 0.93; k <= 1.13; k += 0.01) {
      expect(snapTexelRatio(k), `k=${k}`).toBe(1);
    }
  });

  it('HOLD→RELEASE は線形ブレンド=境界でサイズが跳ねない(連続性)', () => {
    const holdEdge = 1 / (1 - TEXEL_SNAP_HOLD);      // off がちょうど HOLD になる k(>1側)
    const releaseEdge = 1 / (1 - TEXEL_SNAP_RELEASE); // off がちょうど RELEASE になる k
    // HOLD境界の直内/直外で値がほぼ連続(跳ね<1%)
    const inHold = snapTexelRatio(holdEdge - 1e-6);
    const outHold = snapTexelRatio(holdEdge + 1e-6);
    expect(Math.abs(inHold - outHold)).toBeLessThan(0.01);
    // RELEASE境界の直内/直外もほぼ連続
    const inRel = snapTexelRatio(releaseEdge - 1e-6);
    const outRel = snapTexelRatio(releaseEdge + 1e-6);
    expect(Math.abs(inRel - outRel)).toBeLessThan(0.01);
    // ブレンド帯の中間はスナップ値(1)と素の値の間
    const mid = (holdEdge + releaseEdge) / 2;
    const v = snapTexelRatio(mid);
    expect(v).toBeGreaterThan(1);
    expect(v).toBeLessThan(mid);
  });

  it('×2以上の整数にもスナップする(タブレット向け将来対応の素地。2.05→2)', () => {
    expect(snapTexelRatio(2.05)).toBe(2);
    expect(isSnapCovered(2.05)).toBe(true);
  });
});
