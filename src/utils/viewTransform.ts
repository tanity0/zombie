// 画面 ⇔ ワールドの変換に要る「描画の拡大と位置」(research/PC_SUPPORT.md §11-2)。
// 描画(pixiScene)が毎フレーム worldGroup の拡大(zoom)と位置(offX/offY)を置き、PC のマウスの層が照準の変換に読む。
// ゲームの状態ではない(store には置かない=判定は一切これを読まない)。スマホ(タッチ)は読まない。
// 画面の点 (sx, sy) が指すワールド点 = camera + ((sx - offX) / zoom, (sy - offY) / zoom)。等倍(zoom=1・off=0)なら camera + (sx, sy)=従来どおり。
export interface ViewTransform { zoom: number; offX: number; offY: number }
const vt: ViewTransform = { zoom: 1, offX: 0, offY: 0 };
export const setViewTransform = (zoom: number, offX: number, offY: number): void => {
  vt.zoom = zoom > 0 ? zoom : 1; vt.offX = offX; vt.offY = offY;
};
export const getViewTransform = (): Readonly<ViewTransform> => vt;
/** 画面の点(論理座標)→ カメラからのずれ(= ワールド − camera)。 */
export const screenToCameraLocal = (sx: number, sy: number, t: Readonly<ViewTransform> = vt): { x: number; y: number } => ({
  x: (sx - t.offX) / t.zoom,
  y: (sy - t.offY) / t.zoom,
});
