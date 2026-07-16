// プレイヤーのピクセルスナップ(v0.25.1768-1774)の数学部分。純関数(規律4)。
// k = 「キャンバスpx / テクセル」(スプライトスケール×累積ワールドスケール×レンダラ解像度)。
// 半端な k(≈1.06〜1.12 等)はドット列の太り/欠け=潰れを作るため、整数へ丸める。
//  ・HOLD 以内のずれ: 完全スナップ(1ドット=整数px)
//  ・HOLD..RELEASE: 線形ブレンド(ズーム演出で帯を出入りしてもサイズが跳ねない)
//  ・RELEASE 以上 / k<0.5(丸め先が1未満): 素の k のまま(ズーム大引き等)
// 帯幅は端末網羅から逆算(deviceCoverage.ts / ENGINEERING_NOTES「端末カバレッジの対応方針」):
// フルスクリーン係数 iPhone SE2〜16ProMax=0.926〜1.086 / Android 360dp級=0.889(12.5%) → HOLD=13%。

export const TEXEL_SNAP_HOLD = 0.13;    // 誤差この割合まではスナップ維持(360dp級Android=12.5%を含める)
export const TEXEL_SNAP_RELEASE = 0.19; // ここで完全に素のスケールへ(間は線形ブレンド)

// k(キャンバスpx/テクセル)をスナップ後の k' へ。呼び出し側は sc' = sc × (k'/k) で反映する。
export const snapTexelRatio = (
  k: number,
  hold: number = TEXEL_SNAP_HOLD,
  release: number = TEXEL_SNAP_RELEASE
): number => {
  if (!(k > 0)) return k;
  const k2 = Math.round(k);
  if (k2 < 1) return k; // 1px未満へは丸めない(ズーム大引き)
  const off = Math.abs(k2 - k) / k;
  if (off <= hold) return k2;
  if (off < release) {
    const t = (off - hold) / (release - hold); // 0=完全スナップ → 1=素のまま
    return k2 * (1 - t) + k * t;
  }
  return k;
};

// この k でスナップが「完全に」効くか(端末カバレッジ判定用)。
export const isSnapCovered = (k: number, hold: number = TEXEL_SNAP_HOLD): boolean => {
  const k2 = Math.round(k);
  return k2 >= 1 && Math.abs(k2 - k) / k <= hold;
};
