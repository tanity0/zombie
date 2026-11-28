/**
 * ★マスク(alpha マスク)の作業用テクスチャを、見える範囲までに切る(2026-11-28・社長実機 v0.25.5917
 * 「ステージ4で城ボスを倒して直ぐくらいに落ちた」)。
 *
 * Pixi 8.19 の alpha マスク(`container.mask = sprite`)は内部で MaskFilter を1回かける。MaskFilter だけは
 * `clipToViewport: false` で作られていて、作業用テクスチャ(TexturePool)を**中身の全体の大きさ**で取る
 * (画面の外へはみ出した分まで)。TexturePool は寸法を2の累乗へ切り上げ、**返されたテクスチャを二度と捨てない**。
 * このゲームでは filteredWorld(世界の手前のフェード)・地平の森・近景の森がマスクを持ち、中身は画面の2〜4倍に広がる。
 * ヘッドレス(スマホの格・430×932・解像度1)の実測: 出撃の直後で TexturePool が 118MB(4096×2048 / 4096×1024 /
 * 2048×2048 …のマスク用)、城ボスの撃破の寄り(アテンション)で 2048×4096 と 1024×4096 が足されて 166MB。
 * どれも「前回最後」の tex / bake の数字には載らない(GPU には居る)。
 *
 * ⇒ MaskFilter の範囲を、**それを囲むフィルタの範囲**(無ければ描き先の画面)との重なりに切る。
 * 囲むフィルタは自分の範囲の外を読まない・描き先の画面の外は映らないので、切った分は元々見えていない
 * (Pixi が普通のフィルタに対してやっている `clipToViewport` と同じ切り方を、外側の範囲まで含めて行うだけ)。
 * 同じ止めた画を切る/切らないで撮り比べた差は、雪の縁などの数画素の丸めの違いだけ(等倍・0.4倍の引きの両方で確認)。
 * 作業用テクスチャは画面ぶん(スマホ 512×1024=2MB)で収まる。
 *
 * 負荷: マスク1回につき矩形の交差1回。毎フレームの走査は無い。
 */
import { MaskFilter, type Renderer } from 'pixi.js';

/** Pixi の Bounds のうち、ここで使う分。 */
export interface BoundsLike {
  minX: number; minY: number; maxX: number; maxY: number;
  readonly isPositive: boolean;
  fitBounds(left: number, right: number, top: number, bottom: number): unknown;
  scale(x: number, y?: number): BoundsLike;
  ceil(): BoundsLike;
}
interface FilterDataLike {
  skip: boolean;
  filters: readonly unknown[];
  bounds: BoundsLike;
  resolution: number;
}
interface ViewPortLike { width: number; height: number }
type CalcBounds = (fd: FilterDataLike, viewPort: ViewPortLike, rootAntialias: boolean, rootResolution: number, paddingMultiplier: number) => void;
/** Pixi 8.19 の FilterSystem のうち、ここで触る内部。 */
export interface FilterSystemLike {
  _filterStack: FilterDataLike[];
  _filterStackIndex: number;
  _calculateFilterBounds: CalcBounds;
}

/** 切る対象か(=マスクのフィルタだけ・1枚)。ほかのフィルタは Pixi のまま(clipToViewport の既定に従う)。 */
export const isMaskOnlyFilterList = (filters: readonly unknown[], isMask: (f: unknown) => boolean): boolean =>
  filters.length > 0 && filters.every(isMask);

/**
 * 今積まれている(push 済み・pop 前の)フィルタのうち、いま計算中の1つ(最上段)を囲む一番内側の範囲。
 * 飛ばされた(skip)段は描き先にならないので数えない。無ければ null(=描き先は画面)。
 */
export const enclosingFilterBounds = (stack: readonly FilterDataLike[], stackIndex: number): BoundsLike | null => {
  for (let i = stackIndex - 2; i >= 0; i--) {
    const fd = stack[i];
    if (fd && !fd.skip) return fd.bounds;
  }
  return null;
};

/**
 * マスクの範囲を、囲む範囲(または画面 0..viewW × 0..viewH)との重なりへ切る。
 * 重なりが無ければ skip(=描かない。囲む範囲の外なので元々映らない)。解像度の格子へ揃え直す(Pixi と同じ ceil)。
 */
export const clipMaskFilterBounds = (fd: FilterDataLike, enclosing: BoundsLike | null, viewW: number, viewH: number): void => {
  const b = fd.bounds;
  if (enclosing) b.fitBounds(enclosing.minX, enclosing.maxX, enclosing.minY, enclosing.maxY);
  else b.fitBounds(0, viewW, 0, viewH);
  const r = fd.resolution > 0 ? fd.resolution : 1;
  b.scale(r).ceil().scale(1 / r);
  if (!b.isPositive) fd.skip = true;
};

/** フィルタの仕組みに切り方を差し込む(描画器ごとに1回・PixiStage の初期化の直後)。2回目以降は何もしない。 */
export const installMaskFilterClip = (
  renderer: Renderer,
  isMask: (f: unknown) => boolean = (f) => f instanceof MaskFilter,
): boolean => {
  const fs = (renderer as unknown as { filter?: FilterSystemLike & { __maskClip?: true } }).filter;
  if (!fs || typeof fs._calculateFilterBounds !== 'function' || fs.__maskClip) return false;
  fs.__maskClip = true;
  const orig = fs._calculateFilterBounds.bind(fs) as CalcBounds;
  fs._calculateFilterBounds = (fd, viewPort, rootAntialias, rootResolution, paddingMultiplier) => {
    orig(fd, viewPort, rootAntialias, rootResolution, paddingMultiplier);
    if (fd.skip || !isMaskOnlyFilterList(fd.filters, isMask)) return;
    const res = rootResolution > 0 ? rootResolution : 1;
    clipMaskFilterBounds(fd, enclosingFilterBounds(fs._filterStack, fs._filterStackIndex), viewPort.width / res, viewPort.height / res);
  };
  return true;
};
