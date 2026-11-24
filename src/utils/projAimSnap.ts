// ?proj=1 段階6(★#40=B・V4・research/PERSPECTIVE_PROJECTION.md §3-9o エ・ケ13・コ3): マウスの照準の吸い付きを、
// 描かれた頭の画面点とカーソルの画面点の距離で測る(PC のマウスだけ。タッチとキーボードは今のまま=world の距離)。
//
// 入力の手続き(viewTransform の `?proj=1` の枝)が、マウスの出来事の時だけ store に「カーソルの画面点」と
// 「枠の入力のスカラー値」(表への参照は置かない)を置く。store はここで自分の表を組み直して、頭の画面点を出す。
// PixiJS を読まない。
import {
  makeProjFrame, makeProjPoint, projectInto, projDisplayToScreenInto, updateProjTable,
  type GroundPerspectiveParams, type ProjFrame,
} from './perspectiveProjection';

/** 枠の入力のスカラー値(描画の投影の枠の写し・揺れは 0=ケ10)。 */
export interface ProjAimFrameScalars {
  persp: GroundPerspectiveParams;
  stripH: number; stripCount: number; refCount: number; subdiv: number; lNear: number;
  camX: number; camY: number; farH: number; screenW: number; screenH: number;
  wRef: number; lRef: number; tStd: number;
  wgScale: number; wgX: number; wgY: number;
  farRefY: number; farStart: number; farEnd: number;
}

/** store に置くマウスの吸い付きの入力(カーソルの画面点そのもの・枠は揺れ 0)。 */
export interface ProjAimSnapInput { sx: number; sy: number; frame: ProjAimFrameScalars }

/** 描画の枠からスカラー値を写す(表への参照は持たない)。 */
export const projAimFrameScalars = (f: ProjFrame): ProjAimFrameScalars => ({
  persp: { ...f.table.p },
  stripH: f.table.stripH, stripCount: f.table.stripCount, refCount: f.table.refCount, subdiv: f.table.subdiv, lNear: f.table.lNear,
  camX: f.camX, camY: f.camY, farH: f.farH, screenW: f.screenW, screenH: f.screenH,
  wRef: f.wRef, lRef: f.lRef, tStd: f.tStd,
  wgScale: f.wgScale, wgX: f.wgX, wgY: f.wgY,
  farRefY: f.farRefY, farStart: f.farStart, farEnd: f.farEnd,
});


let table: ReturnType<typeof updateProjTable> | null = null;
let lastIn: ProjAimFrameScalars | null = null;
let lastCamX = NaN, lastCamY = NaN;
let frame: ProjFrame | null = null;

/**
 * スカラー値から store 自身の表で枠を組み直す(同じ入力なら作り置きを返す)。
 * camX/camY を渡すとカメラだけ今の値で上書きする(マウスを止めて歩くと写しのカメラが古くなる=頭の画面点が
 * カメラの移動量×ズームずれる。store は今の state.camera を渡す)。省略時は写しのカメラ。
 */
export const projAimFrameFrom = (s: ProjAimFrameScalars, camX: number = s.camX, camY: number = s.camY): ProjFrame => {
  if (frame && lastIn === s && lastCamX === camX && lastCamY === camY) return frame;
  if (!(frame && lastIn === s)) table = updateProjTable(table, s.persp, s.stripH, s.stripCount, s.refCount, s.subdiv, s.lNear);
  frame = makeProjFrame({
    table: table!, camX, camY, farH: s.farH, screenW: s.screenW, screenH: s.screenH,
    // 基準行の world Y(wRef=camY+farH+ℓ_ref)と主人公の足元(farRefY)は、カメラと一緒に動く=カメラの縦の移動量だけずらす。
    wRef: s.wRef + (camY - s.camY), lRef: s.lRef, tStd: s.tStd, wgScale: s.wgScale, wgX: s.wgX, wgY: s.wgY, shakeX: 0, shakeY: 0,
    farRefY: s.farRefY + (camY - s.camY), farStart: s.farStart, farEnd: s.farEnd,
  });
  lastIn = s; lastCamX = camX; lastCamY = camY;
  return frame;
};

const hp = makeProjPoint();
const hs = { x: 0, y: 0 };
/**
 * 頭の画面点(足元 (footX, footY) を地面の点として投影し、足元からの頭の高さ (footY − headY)×s を上へ=ケ15)と、
 * カーソルの画面点の距離の2乗(画面px)。定義域の外(地平線より北)は Infinity。
 */
export const projHeadScreenDist2 = (f: ProjFrame, sx: number, sy: number, footX: number, footY: number, headY: number): number => {
  const p = projectInto(f, footX, footY, hp);
  if (!p.inDomain) return Infinity;
  projDisplayToScreenInto(f, p.x, p.y - (footY - headY) * p.s, hs);
  return (hs.x - sx) ** 2 + (hs.y - sy) ** 2;
};
