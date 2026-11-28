// 物(敵・木・置物・NPC)の「奥ほど小さく・手前ほど大きく」を、地面の倒れ具合に合わせる試作(描画非依存・PixiJSを読まない)。
//
// 社長指示(2026-11-22)「表示(大きく、小さく)の部分だけ、盤面の板をほんの少し奥に倒せる?
// すると、比例して手前も大きくなるんだと思うけど。地面の倒れ具合に合わせてみたい。」→「3通り並べて見せて」。
//
// URLツマミ `?objdepth=`(既定0=今のまま・1px も変えない):
//   0 = 今の遠近(pixiScene の depthScaleMapped)
//   1 = 地面に合わせる: 物の大きさ = conv(物の足元の行) / conv(主人公の足元の行)
//   2 = 地面を少し奥に倒した上で 1 と同じ合わせ方(地面の見た目も変わる)
// conv(t) = 地面の帯の行 t での**横の縮み**(台形の横倍率)。pixiScene の床・utils/groundScroll と同じ式。
// 主人公の足元の行で 1(等倍)。見た目の大きさだけ(判定・移動・位置は不変)。

export interface GroundConvParams {
  /** 台形の最奥(t=0)の横倍率(GROUND_TRAPEZOID_FAR)。 */
  trapFar: number;
  /** 台形の横の曲がり(GROUND_TRAPEZOID_CURVE・1=直線)。 */
  trapCurve: number;
  /** 台形の強さ 0..1(GROUND_TRAPEZOID)。 */
  trapezoid: number;
}

/** 行位置 t(0=最奥・1=旧来の最下段・>1=手前の延長)での地面の横の縮み。床の tileScale.x / GROUND_TILE_SCALE_X と同じ。 */
export const groundConvAt = (t: number, p: GroundConvParams): number => {
  const convLine = p.trapFar + (1 - p.trapFar) * Math.pow(Math.max(0, t), p.trapCurve);
  const conv = 1 + (convLine - 1) * p.trapezoid;
  return Math.max(0.02, conv);
};

/**
 * 地面の帯のローカルY(=足元worldY − camera.y − farH。床の帯と物は同じ worldGroup の中なので、ズームしても同じ単位)から
 * 行位置 t を連続値で返す(groundStripT(i) の i を y/stripH の連続値にしたもの)。
 */
export const groundRowTAt = (localY: number, stripH: number, refStripCount: number): number =>
  refStripCount <= 1 ? 1 : (localY / Math.max(0.001, stripH)) / (refStripCount - 1);

/**
 * 物の見た目の大きさ = conv(物の足元の行) / conv(主人公の足元の行) を [min, max] に丸めた値。
 * 主人公の足元(refLocalY)では厳密に 1。
 */
export const groundMatchedDepthScale = (
  footLocalY: number,
  refLocalY: number,
  stripH: number,
  refStripCount: number,
  p: GroundConvParams,
  min: number,
  max: number,
): number => {
  const ref = groundConvAt(groundRowTAt(refLocalY, stripH, refStripCount), p);
  const obj = groundConvAt(groundRowTAt(footLocalY, stripH, refStripCount), p);
  const r = obj / Math.max(1e-4, ref);
  if (!Number.isFinite(r)) return 1;
  return r < min ? min : r > max ? max : r;
};

/** `?objdepth=` の値を 0/1/2 に丸める(それ以外=0=今のまま)。 */
export const parseObjDepthMode = (v: number): 0 | 1 | 2 => (v === 1 ? 1 : v === 2 ? 2 : 0);

/** objdepth=2(地面を少し奥に倒す)で使う地面のツマミの既定値。URLで g3dfar / gfar を明示した時はそちらが勝つ。 */
export const OBJ_DEPTH_TILT_TRAP_FAR = 0.05;   // 今 0.10(台形の最奥の横倍率。小さいほど奥へ倒れる)
export const OBJ_DEPTH_TILT_GFAR = 0.04;       // 今 0.055(最奥の縦の詰め。小さいほど奥へ倒れる)
