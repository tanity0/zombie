// 画面 ⇔ ワールドの変換に要る「描画の拡大と位置」(research/PC_SUPPORT.md §11-2)。
// 描画(pixiScene)が毎フレーム worldGroup の拡大(zoom)と位置(offX/offY)を置き、PC のマウスの層が照準の変換に読む。
// これ自体はゲームの状態ではない(store には置かない)。スマホ(タッチ)は読まない。
// ただし `?proj=1`(★#40=B・§3-9o ケ13・コ3)では、マウスの出来事の時だけ「カーソルの画面点」と「投影の枠の入力のスカラー値」を
// 写し(takeAimSnap)、入力の層が store へ置く=照準の吸い付きの判定(頭の画面点との距離)がその写しを読む。`?proj=0` では写さない。
// `?proj=1` の時は pixiScene が投影の枠(setViewProjection)も渡し、照準は逆投影で地面の点へ戻す
// (research/PERSPECTIVE_PROJECTION.md §3-9b・作る物2)。その時、照準の world 点(撃つ向き・PHILL の照準の基準)が投影に揃う。
// 画面の点 (sx, sy) が指すワールド点 = camera + ((sx - offX) / zoom, (sy - offY) / zoom)。等倍(zoom=1・off=0)なら camera + (sx, sy)=従来どおり。
import {
  makeProjPoint, makeProjUnprojectOut, projUnprojectInto, projUnprojectLMin, projWorldToScreenInto, type ProjFrame,
} from './perspectiveProjection';
import { projAimFrameScalars, type ProjAimSnapInput } from './projAimSnap';

export interface ViewTransform { zoom: number; offX: number; offY: number }
const vt: ViewTransform = { zoom: 1, offX: 0, offY: 0 };
export const setViewTransform = (zoom: number, offX: number, offY: number): void => {
  vt.zoom = zoom > 0 ? zoom : 1; vt.offX = offX; vt.offY = offY;
};
export const getViewTransform = (): Readonly<ViewTransform> => vt;

/** `?proj=1` の今フレームの投影の枠(pixiScene が updateProjFrame の直後に毎フレーム渡す・null=`?proj=0`/投影が効かない場面)。参照で持つ。 */
let viewProj: ProjFrame | null = null;
export const setViewProjection = (f: ProjFrame | null): void => { viewProj = f; };
export const getViewProjection = (): ProjFrame | null => viewProj;

/** 計器 `s6 aim`(?projaudit=1 の表示用・`?proj=1` の時だけ数える): 往復の差の最大(画面px)・ℓ_min で切った回数・逆投影した回数。 */
export const projAimStats = { maxRoundTripPx: 0, clamps: 0, calls: 0, lastClamped: false };

const lastCursor = { x: 0, y: 0 };
let hasCursor = false;
/** 計器 `s6 aim` 用: 最後に逆投影したカーソルの画面点(`?proj=1` の時だけ・それ以外は null)。 */
export const getLastCursorScreen = (): Readonly<{ x: number; y: number }> | null => (hasCursor ? lastCursor : null);

let lastSnap: ProjAimSnapInput | null = null;
/** ★#40=B: 最後に逆投影したマウスの照準の写し(`?proj=1` で枠がある時だけ・取ったら空にする)。それ以外は null。 */
export const takeAimSnap = (): ProjAimSnapInput | null => { const v = lastSnap; lastSnap = null; return v; };

const unOut = makeProjUnprojectOut();
const rtP = makeProjPoint();
const rtS = { x: 0, y: 0 };

/**
 * 画面の点(論理座標)→ カメラからのずれ(= ワールド − camera)。
 * `?proj=1`(枠あり)の時は逆投影(★#39 裁定 A=縦だけ ℓ_min の行で切る)した地面の点 − 枠のカメラ。揺れは入れない(ケ10)。
 */
export const screenToCameraLocal = (sx: number, sy: number, t: Readonly<ViewTransform> = vt): { x: number; y: number } => {
  const f = t === vt ? viewProj : null;
  if (f) {
    lastCursor.x = sx; lastCursor.y = sy; hasCursor = true;
    const sc = f.wgScale > 0 ? f.wgScale : 1;
    // 揺れ(shakeX/Y)を打ち消す: 画面点を揺れの分だけずらしてから逆投影=揺れ 0 の枠で逆投影したのと同じ。
    const ex = sx + sc * f.shakeX, ey = sy + sc * f.shakeY;
    const u = projUnprojectInto(f, ex, ey, projUnprojectLMin(f), unOut);
    projAimStats.calls++;
    projAimStats.lastClamped = u.clamped;
    if (u.clamped) projAimStats.clamps++;
    else {
      // 往復: projWorldToScreenInto は揺れを足すので、戻る先は揺れをずらした画面点 (ex, ey)。
      projWorldToScreenInto(f, u.x, u.y, rtP, rtS);
      const err = Math.hypot(rtS.x - ex, rtS.y - ey);
      if (err > projAimStats.maxRoundTripPx) projAimStats.maxRoundTripPx = err;
    }
    // ★#40=B: カーソルの画面点そのもの(sx, sy)と、揺れ 0 の枠のスカラー値。写しの枠が揺れ 0 なので、画面点も揺れでずらさない
    // (ずらすと揺れ 0 の枠で出した頭の画面点と食い違う)。逆投影だけは揺れを打ち消した点で行う(ケ10)。
    lastSnap = { sx, sy, frame: projAimFrameScalars(f) };
    return { x: u.x - f.camX, y: u.y - f.camY };
  }
  return {
    x: (sx - t.offX) / t.zoom,
    y: (sy - t.offY) / t.zoom,
  };
};
