// 地面(床の帯 groundStrips)の「流れる速さ」を決める純関数(描画非依存・PixiJSを読まない)。
//
// 社長指示(2026-11-22)「足元の地面は等倍にして、比例して手前、奥の地面の速さは、奥なりのカーブを書く様調整し」
// →「まず1」(地面だけ。物の見た目の位置は変えない)。
//
// 仕組み: 帯 i の模様は、カメラが 1 world px 動くと groundBase のローカル(=worldGroup のローカル=物と同じ単位)で
//   横 = feelX × GROUND_TILE_SCALE_X × conv(i)   縦 = feelY × scaleY(i)
// だけ動く(conv=台形の横倍率 / scaleY=縦の詰め)。物(木・敵・主人公)は 1 動く。
// 旧来は feelX=1.2・feelY=3.0 の固定だったため、足元の行では物と速さが揃っていなかった。
// ここでは**主人公の足元の行で 1(等倍)**になるよう feel を逆算する。他の行は conv(i)/scaleY(i) の比のまま
// =奥ほど遅く・手前ほど速い(遠近の絵の縮み方そのもの)。
//
// ★係数は足元の行(=ズーム・画面の縦横で動く)に応じて毎フレーム変わる。絶対値(camera × feel)で掛けると
// feel が変わった瞬間に模様が飛ぶので、**カメラの移動量の差分 × その時の feel を積み上げる**(GroundScrollAccumulator)。

export interface GroundPerspectiveParams {
  /** 横のタイル倍率の基準(GROUND_TILE_SCALE_X)。 */
  tileScaleX: number;
  /** 台形の最奥の横倍率(GROUND_TRAPEZOID_FAR)。 */
  trapFar: number;
  /** 台形の横の曲がり(GROUND_TRAPEZOID_CURVE)。 */
  trapCurve: number;
  /** 台形の強さ 0..1(GROUND_TRAPEZOID)。 */
  trapezoid: number;
  /** 縦の最奥の詰め(farScale)。 */
  farScale: number;
  /** 縦の手前の詰め(nearScale)。 */
  nearScale: number;
  /** 縦の遠近カーブ(curve)。 */
  curve: number;
}

/** 行位置 t(0=最奥・1=旧来の最下段・>1=延長)での横のタイル倍率(=tileScale.x)。pixiScene の床と同じ式。 */
export const groundRowTileScaleX = (t: number, p: GroundPerspectiveParams): number => {
  const convLine = p.trapFar + (1 - p.trapFar) * Math.pow(Math.max(0, t), p.trapCurve);
  const conv = 1 + (convLine - 1) * p.trapezoid;
  return p.tileScaleX * Math.max(0.02, conv);
};

/** 行位置 t での縦のタイル倍率(=tileScale.y)。pixiScene の床と同じ式。 */
export const groundRowTileScaleY = (t: number, p: GroundPerspectiveParams): number =>
  p.farScale + (p.nearScale - p.farScale) * Math.pow(Math.max(0, t), p.curve);

/** 旧来の固定係数(?gfeel=0 の比較用)。 */
export const GROUND_SCROLL_LEGACY_FEEL_X = 1.2;
export const GROUND_SCROLL_LEGACY_FEEL_Y = 3.0;

/**
 * 足元の行(床の帯のローカルY)から、その行の模様が物と等倍で流れる係数を返す。
 * - `footLocalY`: 主人公の足元の y を groundBase のローカルへ直した値(=足元worldY − camera.y − farH)。
 * - `stripH` / `stripT(i)`: 帯の行の高さと行位置(renderSpec の computeGroundBandLayout / groundStripT)。
 * - 足元の行は**その足元が乗っている帯そのもの**(floor)=その帯で厳密に等倍。
 * - 行は [minRow, maxRow] に丸める(足元が地平線の上・帯の外に出た時に係数が発散しないための保険)。
 */
export const groundFeelAtFoot = (
  footLocalY: number,
  stripH: number,
  stripT: (i: number) => number,
  p: GroundPerspectiveParams,
  minRow: number,
  maxRow: number,
): { feelX: number; feelY: number; row: number } => {
  const raw = Math.floor(footLocalY / Math.max(0.001, stripH));
  const row = Math.max(minRow, Math.min(maxRow, Number.isFinite(raw) ? raw : minRow));
  const t = stripT(row);
  const sx = groundRowTileScaleX(t, p);
  const sy = groundRowTileScaleY(t, p);
  return { feelX: 1 / Math.max(1e-4, sx), feelY: 1 / Math.max(1e-4, sy), row };
};

/** 帯 i の模様の流れる速さ(カメラ 1 world px あたりの groundBase ローカルpx)。物=1。 */
export const groundRowScrollSpeed = (
  t: number, feelX: number, feelY: number, p: GroundPerspectiveParams,
): { x: number; y: number } => ({
  x: feelX * groundRowTileScaleX(t, p),
  y: feelY * groundRowTileScaleY(t, p),
});

/** 1フレームでこれより大きくカメラが飛んだら「ワープ」とみなし、その差分は積まない(模様はそのまま)。 */
export const GROUND_SCROLL_WARP_PX = 600;

/**
 * カメラの移動量 × その時の係数 を積み上げる(係数が変わっても模様が飛ばない)。
 * - `epoch` が変わったら(出撃・ステージ切替・屋内外の切替)リセット=積み上げ0・前回カメラなし。
 * - 前回カメラが無い(初回/リセット直後)フレームは積まない。
 * - 1フレームの移動が `warpPx` を超えたら積まない(ワープ・カメラの大きな飛び。模様はそのまま)。
 * - 積み上げ値は `wrapX` / `wrapY`(テクスチャ1周ぶん)で剰余=長時間でも浮動小数の精度が落ちない。
 *   模様は周期で同じなので、剰余しても見た目は1ビットも変わらない。
 */
export class GroundScrollAccumulator {
  offX = 0;
  offY = 0;
  private lastX: number | null = null;
  private lastY: number | null = null;
  private epoch: string | null = null;

  reset() {
    this.offX = 0; this.offY = 0; this.lastX = null; this.lastY = null;
  }

  step(
    camX: number, camY: number, feelX: number, feelY: number,
    wrapX: number, wrapY: number, epoch: string, warpPx: number = GROUND_SCROLL_WARP_PX,
  ): { offX: number; offY: number } {
    if (epoch !== this.epoch) { this.reset(); this.epoch = epoch; }
    if (this.lastX !== null && this.lastY !== null) {
      const dx = camX - this.lastX;
      const dy = camY - this.lastY;
      if (Number.isFinite(dx) && Number.isFinite(dy) && Math.abs(dx) <= warpPx && Math.abs(dy) <= warpPx) {
        this.offX += dx * feelX;
        this.offY += dy * feelY;
      }
    }
    this.lastX = camX; this.lastY = camY;
    if (wrapX > 0) this.offX %= wrapX;
    if (wrapY > 0) this.offY %= wrapY;
    return { offX: this.offX, offY: this.offY };
  }
}
