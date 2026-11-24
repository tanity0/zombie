// ゲーム側の「ゲームの画面」(`?proj=1` の時だけ・純関数・PixiJS を読まない)。
// 設計書: research/PERSPECTIVE_PROJECTION.md §3-9d・§3-9i 作る物3・§3-9o(ア/イ/ウ/エ/ケ/コ)。
//
// 描画(pixiScene.updateProjFrame)とゲーム側(store / hooks / utils)が**同じ1本の投影の関数**で画面と world を行き来する。
// 組み立ての式(帯・基準行・アテンション・表)は projFrameBase の1本で、pixiScene も同じ関数を呼ぶ(wg と揺れだけ pixi の実値で上書き)。
// ゲームの画面はズーム=viewZoom だけ(走りの引き・寄せ・パンチ・揺れは入れない)・ズームの写しは描画と同じ形
// (横=画面中央・縦=引きは farH・寄りは中央を支点)。判定点は今と同じ world 点を**地面の点**として投影する(§3-8h の4)。
//
// 既定(`?proj=0`)・屋内・洋館・研究所・M0 では getProjGameView() が null を返し、呼ぶ所は今の関数へ落ちる。
import {
  makeProjFrame, makeProjPoint, makeProjUnprojectOut, projUnprojectInto, projUnprojectLMin, projAttentionRef, projectInto, projDisplayToScreenInto, projLocalYOfWorld, projRefLocalY,
  projScaleAtLocal, projRowKx, projTOfL, projWorldYOfLocal, updateProjTable, visibleWorldBands, visibleWorldQuad,
  PROJ_REF_STRIP_COUNT, PROJ_TABLE_SUBDIV,
  type GroundPerspectiveParams, type ProjFrame, type ProjFrameInput, type ProjPoint, type ProjTable,
} from './perspectiveProjection';
import { computeGroundBandLayout } from './groundBandLayout';
import { zoomCameraDownFrac, ZOOM_MIN_ABS } from './cameraZoom';
import { horizonFadeAlphaAt } from './horizonForestLine';
import {
  GROUND_TILE_SCALE_X, GROUND_TILE_SCALE_Y_NEAR, GROUND_TILE_SCALE_Y_FAR, GROUND_PERSPECTIVE_CURVE,
  GROUND_TRAPEZOID, GROUND_TRAPEZOID_FAR, GROUND_TRAPEZOID_CURVE,
  PROJ_GAME_VIEW,
} from './projFlag';

/** 投影の枠の場面(段階8・§3-10c)。 */
export type ProjScene = 'outdoor' | 'lab' | 'indoor' | 'corridor';

/**
 * 縦の下げ量の1本(段階8 §3-10i の3): 研究所・屋内=字の 0(useGameLoop のカメラと同じ)・洋館=zoomCameraDownFrac(洋館の基準, camZ)・
 * ほか=zoomCameraDownFrac(屋外の基準, camZ)。基準の値は store の CAMERA_DOWN_OFFSET_FRAC / CORRIDOR_CAMERA_DOWN_FRAC を呼び手が渡す。
 */
export const projCamDownFracFor = (scene: ProjScene, camZ: number, outdoorBase: number, corridorBase: number): number => {
  if (scene === 'lab' || scene === 'indoor') return 0;
  return zoomCameraDownFrac(scene === 'corridor' ? corridorBase : outdoorBase, camZ);
};

/**
 * 照準の門(段階8 U40・§3-10e): 投影の枠を照準(逆投影・吸い付き)へ渡してよい場面。
 * ★#46=A(社長 2026-11-24「はい」=研究所・洋館も照準だけ揃える): 屋外・研究所・洋館で開ける。屋内は枠を作らない。
 * 見えている・湧き・回収(★#36〜#38)は研究所・洋館では今の独自の作りのまま(ゲームの画面=getProjGameView は null のまま)。
 */
export const PROJ_AIM_SCENE_OK: Readonly<Record<ProjScene, boolean>> = { outdoor: true, lab: true, corridor: true, indoor: false };
export const projAimAllowed = (scene: ProjScene | null): boolean => scene !== null && PROJ_AIM_SCENE_OK[scene];

/** 地面の曲線(pixiScene の地面と同じ定数)。 */
export const projGroundPersp = (): GroundPerspectiveParams => ({
  tileScaleX: GROUND_TILE_SCALE_X, trapFar: GROUND_TRAPEZOID_FAR, trapCurve: GROUND_TRAPEZOID_CURVE,
  trapezoid: GROUND_TRAPEZOID, farScale: GROUND_TILE_SCALE_Y_FAR, nearScale: GROUND_TILE_SCALE_Y_NEAR, curve: GROUND_PERSPECTIVE_CURVE,
});

/** 濃さがこれ未満の所は「見えていない」(★#38・地平線フェードと描く距離のフェード・3-9o エ・叩き台)。 */
export const PROJ_GAME_VISIBLE_ALPHA = 0.5;

/** 組み立ての入力(描画とゲームで同じ)。 */
export interface ProjFrameBaseParams {
  persp: GroundPerspectiveParams;
  camX: number;
  camY: number;
  /** 画面(論理px)。帯の敷き方と画面の大きさ。 */
  screenW: number;
  screenH: number;
  /** 遠景の帯の高さ。 */
  farH: number;
  /** カメラの定位置の高さ(store の gameBounds.height=カメラと同じ高さ)。 */
  viewH: number;
  playerH: number;
  /** 主人公の足元の world Y(描く距離のフェードの基準・ケ12)。 */
  playerFootY: number;
  /** カメラのズーム(基準行の縦の下げ量・★#20 裁定②)。 */
  camZoom: number;
  /** カメラの縦の下げ量の基準(CAMERA_DOWN_OFFSET_FRAC)。 */
  camDown: number;
  /**
   * 段階8(§3-10c・2巡目監査 A5): 縦の下げ量の1本(projCamDownFracFor)を渡す時のズーム → 下げ量の関数。研究所は字の 0
   * (zoomCameraDownFrac(0, z) は z<1 で 0 にならない)。省略は今の式 zoomCameraDownFrac(camDown, z)(屋外は同じ値)。
   */
  downFracAt?: (z: number) => number;
  zref: 1 | 2;
  near: boolean;
  /** アテンション(zoomToUnity)の注目点と包絡線。null=掛けない。 */
  att: { y: number; env: number } | null;
  farStart: number;
  farEnd: number;
  /** 帯の敷き方の引きの余裕(ZOOM_OVERSCAN=1/ZOOM_MIN_ABS)。 */
  overscan: number;
}

/**
 * 組み立て(pixiScene.updateProjFrame と同じ式の1本・§3-9d)。表は prev を使い回す(updateProjTable は prev を書き換える=
 * 枠ごとに別の表を持つこと・ケ8)。返り値の input には wg と揺れを入れない(呼び手が上書きする)。
 */
export const projFrameBase = (prev: ProjTable | null, p: ProjFrameBaseParams): { table: ProjTable; input: ProjFrameInput } => {
  const band = computeGroundBandLayout(p.farH, p.screenH, p.overscan);
  const camZ = p.zref === 2 ? p.camZoom : 1;
  const df = p.downFracAt ?? ((z: number) => zoomCameraDownFrac(p.camDown, z));
  const lRef1 = projRefLocalY(p.viewH, df(1), p.playerH, p.farH);
  let lRef = p.zref === 2 ? projRefLocalY(p.viewH, df(camZ), p.playerH, p.farH) : lRef1;
  let wRef = p.camY + p.farH + lRef;
  if (p.att) {
    const a = projAttentionRef(wRef, p.att.y, p.att.env, p.camY, p.farH);
    wRef = a.wRef; lRef = a.lRef;
  }
  const lNear = p.near ? lRef : NaN;
  const table = updateProjTable(prev, p.persp, band.stripH, band.stripCount, PROJ_REF_STRIP_COUNT, PROJ_TABLE_SUBDIV, lNear);
  return {
    table,
    input: {
      table, camX: p.camX, camY: p.camY, farH: p.farH, screenW: p.screenW, screenH: p.screenH,
      wRef, lRef, tStd: projTOfL(lRef1, band.stripH, PROJ_REF_STRIP_COUNT),
      farRefY: p.playerFootY, farStart: p.farStart, farEnd: p.farEnd,
    },
  };
};

/** ゲームの画面のズームの写し(描画と同じ形・ケ12): 横=画面中央・縦=引きは farH・寄りは中央を支点。頭打ちにしない。 */
export const projGameZoomPlacement = (z: number, screenW: number, screenH: number, farH: number): { wgScale: number; wgX: number; wgY: number } => {
  const zz = Number.isFinite(z) && z > 0 ? z : 1;
  const pivotY = zz < 1 ? farH : screenH / 2;
  return { wgScale: zz, wgX: (screenW / 2) * (1 - zz), wgY: pivotY * (1 - zz) };
};

/** ゲームの画面(1つの枠)。 */
export interface ProjGameView {
  f: ProjFrame;
  /** 地平線フェードの境目(森の足元)のローカルY(utils/horizonForestLine.horizonForestFootLocalY)。 */
  horizonLocal: number;
  /** 地平線フェードの帯の幅(画面px・renderSpec.horizonActorFadePx)。 */
  fadePx: number;
}

/** ゲームの画面を組む(作り置きの表 prev を使い回す)。 */
export const projGameFrame = (
  prev: ProjTable | null, p: ProjFrameBaseParams, z: number, horizonLocal: number, fadePx: number,
): ProjGameView => {
  const { input } = projFrameBase(prev, p);
  const wg = projGameZoomPlacement(z, p.screenW, p.screenH, p.farH);
  const f = makeProjFrame({ ...input, ...wg, shakeX: 0, shakeY: 0 });
  return { f, horizonLocal, fadePx };
};

const scratchP: ProjPoint = makeProjPoint();
const scratchS = { x: 0, y: 0 };

/** 投影した点の描かれる濃さ(定義域・描く距離のフェード × 地平線フェード)。手前のフェードは見ない(判定の物差しに入れない)。 */
export const projGameAlphaAt = (gv: ProjGameView, p: ProjPoint): number => {
  if (!p.inDomain || p.alpha <= 0) return 0;
  const f = gv.f;
  return Math.min(p.alpha, horizonFadeAlphaAt(p.y - f.camY, gv.horizonLocal, f.wgScale, gv.fadePx));
};

/**
 * world 点(地面の点として)がゲームの画面の中か(★#38=A)。余白 marginPx は画面px(今の zoomedViewportBounds の余白と同じ意味)。
 * 定義域の外・描く距離のフェード/地平線フェードの濃さ 0.5 未満=false。
 */
export const projGameViewContains = (gv: ProjGameView, x: number, y: number, marginPx = 0, minAlpha = PROJ_GAME_VISIBLE_ALPHA): boolean => {
  const f = gv.f;
  const p = projectInto(f, x, y, scratchP);
  if (!p.inDomain) return false;
  if (p.alpha < minAlpha) return false;
  if (horizonFadeAlphaAt(p.y - f.camY, gv.horizonLocal, f.wgScale, gv.fadePx) < minAlpha) return false;
  projDisplayToScreenInto(f, p.x, p.y, scratchS);
  return scratchS.x >= -marginPx && scratchS.x <= f.screenW + marginPx && scratchS.y >= -marginPx && scratchS.y <= f.screenH + marginPx;
};

/**
 * 足元 (footX, footY) に立つ絵(s=1 の幅 artW・高さ artH・横は中央)の投影した箱が、ゲームの画面に掛かるか(ケ14)。
 * 足元の点が定義域の外・濃さ minAlpha(既定 0.5=★#38 の「見えている」)未満なら false。
 */
export const projGameBoxOnScreen = (
  gv: ProjGameView, footX: number, footY: number, artW: number, artH: number, marginPx = 0, minAlpha = PROJ_GAME_VISIBLE_ALPHA,
): boolean => {
  const f = gv.f;
  const p = projectInto(f, footX, footY, scratchP);
  if (!p.inDomain || p.alpha < minAlpha) return false;
  if (horizonFadeAlphaAt(p.y - f.camY, gv.horizonLocal, f.wgScale, gv.fadePx) < minAlpha) return false;
  projDisplayToScreenInto(f, p.x, p.y, scratchS);
  const z = f.wgScale;
  const w = Math.max(0, artW) * p.s * z, h = Math.max(0, artH) * p.s * z;
  return scratchS.x + w / 2 >= -marginPx && scratchS.x - w / 2 <= f.screenW + marginPx
    && scratchS.y >= -marginPx && scratchS.y - h <= f.screenH + marginPx;
};

/** ゲームの画面の見える行の範囲(ℓ): 上=地平線・描く距離のフェード 0.5・地平線フェード 0.5・画面の上端の南の方/下=画面の下端。 */
export const projGameVisibleRows = (gv: ProjGameView): { lTop: number; lBot: number } => {
  const f = gv.f;
  const sc = f.wgScale > 0 ? f.wgScale : 1;
  let lTop = Math.max(0, (0 - f.wgY) / sc - f.shakeY - f.farH);
  if (f.farEnd > 0) {
    const dHalf = (f.farStart + f.farEnd) / 2; // smoothstep の 0.5 の距離
    const lFar = projLocalYOfWorld(f, f.farRefY - dHalf);
    if (lFar > lTop) lTop = lFar;
  }
  const lHz = gv.horizonLocal - f.farH + (gv.fadePx > 0 ? PROJ_GAME_VISIBLE_ALPHA * gv.fadePx / sc : 0);
  if (lHz > lTop) lTop = lHz;
  let lBot = (f.screenH - f.wgY) / sc - f.shakeY - f.farH;
  if (lBot < lTop) lBot = lTop;
  return { lTop, lBot };
};

/** 置く範囲(★#38・V38/V43/V47/V49): 見える行を n 本に切った world の帯(左右は帯の北の端の行の画面の縁+余白)。使った本数を返す。 */
export const projGameViewBands = (
  gv: ProjGameView, n: number, marginPx: number, out: { left: number; top: number; right: number; bottom: number }[],
): number => {
  const { lTop, lBot } = projGameVisibleRows(gv);
  const sc = gv.f.wgScale > 0 ? gv.f.wgScale : 1;
  return visibleWorldBands(gv.f, lTop, lBot, n, marginPx / sc, out);
};

/** 台形を囲む長方形(判定には使わない・矩形を読む式の代わり)。 */
export const projGameViewRect = (gv: ProjGameView): { left: number; top: number; right: number; bottom: number } =>
  visibleWorldQuad(gv.f).rect;

/**
 * 縁の点(V5): (fromX, fromY) から world の向き (dirX, dirY) へ進む線が、ゲームの画面の外へ出る最初の点(world)。
 * 出発点が画面の外なら出発点を返す。二分探索(画面の外へ出るまで倍々に伸ばしてから 24 回)。
 */
export const projGameEdgePoint = (
  gv: ProjGameView, fromX: number, fromY: number, dirX: number, dirY: number,
): { x: number; y: number } => {
  const m = Math.hypot(dirX, dirY);
  if (!(m > 0) || !projGameViewContains(gv, fromX, fromY)) return { x: fromX, y: fromY };
  const ux = dirX / m, uy = dirY / m;
  let lo = 0, hi = 64;
  for (let k = 0; k < 20 && projGameViewContains(gv, fromX + ux * hi, fromY + uy * hi); k++) { lo = hi; hi *= 2; }
  for (let k = 0; k < 24; k++) {
    const mid = 0.5 * (lo + hi);
    if (projGameViewContains(gv, fromX + ux * mid, fromY + uy * mid)) lo = mid; else hi = mid;
  }
  return { x: fromX + ux * hi, y: fromY + uy * hi };
};

/** 行 ℓ の見える左右(world・余白なし)。テスト・計器用。 */
export const projGameRowSpan = (gv: ProjGameView, l: number): { left: number; right: number; y: number } => {
  const f = gv.f;
  const sc = f.wgScale > 0 ? f.wgScale : 1;
  const s = Math.max(1e-6, projRowKx(f, l)); // 行の横の倍率(ground は s と同じ値・段階8 §3-10c)
  const dxL = (0 - f.wgX) / sc + f.camX - f.shakeX;
  const dxR = (f.screenW - f.wgX) / sc + f.camX - f.shakeX;
  return { left: f.cxw + (dxL - f.cxw) / s, right: f.cxw + (dxR - f.cxw) / s, y: projWorldYOfLocal(f, l) };
};

/** world の行 y の見える左右の半幅(world・余白なし・V77 の行ごとの帯の幅)。定義域の外(地平線より北)は 0。 */
export const projGameRowHalfW = (gv: ProjGameView, worldY: number): number => {
  const p = projectInto(gv.f, gv.f.cxw, worldY, scratchP);
  if (!p.inDomain) return 0;
  const r = projGameRowSpan(gv, p.l);
  return Math.max(0, (r.right - r.left) / 2);
};

/** 置く範囲の帯の本数(V38/V43/V47/V49)。 */
export const PROJ_PLACE_BANDS = 8;
const placeBands: { left: number; top: number; right: number; bottom: number }[] = [];
/**
 * 置く範囲(★#38=A・V38/V43/V49): ゲームの画面の見える地面(projGameViewBands の帯・余白 marginPx は画面px・負=内側)から、
 * 乱数2本 (u, v) で world 点を1つ。縦は帯の全体を u で、横はその行の見える左右(行ごとの実際の幅)を v で。乱数の本数は今の矩形と同じ2本。
 */
export const projGameBandPick = (
  gv: ProjGameView, marginPx: number, u: number, v: number, topExtraPx = 0,
): { x: number; y: number } => {
  const n = projGameViewBands(gv, PROJ_PLACE_BANDS, marginPx, placeBands);
  const f = gv.f;
  let top = placeBands[0].top;
  const bot = placeBands[n - 1].bottom;
  // 上の辺だけさらに内側へ(画面px・正=内側): 今の矩形の「上だけ余白が大きい」置き方の写し(V49 の上 60・下 30)。
  if (topExtraPx > 0) {
    const sc0 = f.wgScale > 0 ? f.wgScale : 1;
    const yIn = projWorldYOfLocal(f, projLocalYOfWorld(f, top) + topExtraPx / sc0);
    top = Math.min(bot, Math.max(top, yIn));
  }
  const y = top + Math.min(1, Math.max(0, u)) * (bot - top);
  const l = projLocalYOfWorld(f, y);
  const r = projGameRowSpan(gv, l);
  const sc = f.wgScale > 0 ? f.wgScale : 1;
  const s = Math.max(1e-6, projScaleAtLocal(f, l));
  const m = marginPx / sc / s; // 画面px の余白をその行の world へ
  const left = r.left - m, right = r.right + m;
  return { x: left + Math.min(1, Math.max(0, v)) * Math.max(0, right - left), y };
};

// ---- ★#36・★#37 の縦横で使い回す矩形(3-9o ア・ウ・純関数。配線は作る物4) ----

/** 基準のスマホの論理寸法(3-9o の寸法の前提: 430×932 → 405×878)。 */
export const PROJ_REF_PHONE_W = 405;
export const PROJ_REF_PHONE_H = 878;
/** 長い辺の足し分 E(3-9o ア: 横長の左右がズーム1で ±643 > PC の見える端 ±640)。 */
export const PROJ_SPAWN_LONG_EXTRA_PX = 64;

/** 湧く範囲の寸法(ア): 辺の位置 = 中心 ∓ (half + margin + pad)。左右の辺の散らばりは halfH、上下の辺の散らばりは halfW で取る(ケ6)。 */
export interface ProjSpawnRect { halfW: number; halfH: number; padX: number; padY: number }

/**
 * ★#36 湧く範囲(3-9o ア・ケ6): 縦持ち=今の矩形(半幅 (W/2)/z・半高 (H/2)/z)の上下の辺だけ E 遠く/
 * 横長=基準のスマホを倒した固定の大きさ(半幅 (Hs/2)/z・半高 (Ws/2)/z)の左右の辺だけ E 遠く。余白 M は呼び手が足す。
 */
export const projGameSpawnRect = (viewW: number, viewH: number, z: number): ProjSpawnRect => {
  const zz = Number.isFinite(z) && z > 0 ? z : 1;
  if (viewW <= viewH) return { halfW: viewW / 2 / zz, halfH: viewH / 2 / zz, padX: 0, padY: PROJ_SPAWN_LONG_EXTRA_PX };
  return { halfW: PROJ_REF_PHONE_H / 2 / zz, halfH: PROJ_REF_PHONE_W / 2 / zz, padX: PROJ_SPAWN_LONG_EXTRA_PX, padY: 0 };
};

/**
 * ★#37 回収の範囲(3-9o ウ・ケ11): 中心 (cx, cy) の矩形。縦持ち=(W/2)/ZOOM_MIN_ABS + margin・(H/2)/ZOOM_MIN_ABS + margin + E/
 * 横長=(Hs/2)/ZOOM_MIN_ABS + margin + E・(Ws/2)/ZOOM_MIN_ABS + margin。
 */
export const projGameRecycleRect = (
  viewW: number, viewH: number, cx: number, cy: number, margin: number,
): { left: number; top: number; right: number; bottom: number } => {
  const portrait = viewW <= viewH;
  const hw = portrait ? viewW / 2 / ZOOM_MIN_ABS + margin : PROJ_REF_PHONE_H / 2 / ZOOM_MIN_ABS + margin + PROJ_SPAWN_LONG_EXTRA_PX;
  const hh = portrait ? viewH / 2 / ZOOM_MIN_ABS + margin + PROJ_SPAWN_LONG_EXTRA_PX : PROJ_REF_PHONE_W / 2 / ZOOM_MIN_ABS + margin;
  return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh };
};

/**
 * ★#37 作る範囲(V28・3-9o ウ・ケ4): 中心 (cx, cy) ± (画面の大きさの半分 + pad)。縦持ち=その端末の画面(今のまま)/
 * 横長=基準のスマホを縦横入れ替えた大きさ(幅 Hs・高さ Ws)。store の syncBreakableProps と描画の縁のフェードの両方がこれを呼ぶ。
 */
export const projPropRegionRect = (
  viewW: number, viewH: number, cx: number, cy: number, pad: number,
): { left: number; top: number; right: number; bottom: number } => {
  const portrait = viewW <= viewH;
  const hw = (portrait ? viewW : PROJ_REF_PHONE_H) / 2 + pad;
  const hh = (portrait ? viewH : PROJ_REF_PHONE_W) / 2 + pad;
  return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh };
};

/** ★#37 エンディングの兵士の入れ直しの半幅(V76・ウ): 縦持ち=今の式/横長=幅の項を基準のスマホの縦(878)に入れ替え。 */
export const projEndingReentryHalfW = (viewW: number, viewH: number, margin: number): number =>
  (viewW <= viewH ? viewW : PROJ_REF_PHONE_H) / 2 / ZOOM_MIN_ABS + margin;

/** ★#37 弾のカリングの半径(V78・ウ): 縦持ち=今の max(W,H)/ZOOM_MIN_ABS/横長=基準のスマホの値 878/0.4 の固定。 */
export const projBulletCullRadius = (viewW: number, viewH: number): number =>
  viewW <= viewH ? Math.max(viewW, viewH) / ZOOM_MIN_ABS : PROJ_REF_PHONE_H / ZOOM_MIN_ABS;

/**
 * 湧きのフェードインの尺(3-9o イ・クリエイティブ監査: 出と消えを非対称に=闇から立ち上がる・叩き台 900ms)。
 * 互換の名前 PROJ_FADE_MS はフェードインの尺を指す。
 */
export const PROJ_FADE_IN_MS = 900;
export const PROJ_FADE_MS = PROJ_FADE_IN_MS;
/** 敵の回収の残像のフェードアウトの尺(叩き台 450ms・ease-in=最後に抜ける)。 */
export const PROJ_GHOST_FADE_MS = 450;
/** 弾の回収の残像のフェードアウトの尺(叩き台 200ms・ease-in)。 */
export const PROJ_BULLET_GHOST_FADE_MS = 200;

/**
 * 湧きのフェードイン(3-9o イ): 経過 gameTime の ms → 濃さ 0..1。ease-out 寄り(速く立ち上がり、長く寄せる)だが
 * 始まりと終わりの速さは 0(慣性 MUST)。f(t)=1−(1−t)³(1+3t)・f'(t)=12t(1−t)²=t=1/3 で一番速い。単調・900ms で 1。
 */
export const projFadeInAlpha = (elapsedMs: number): number => {
  if (!(elapsedMs > 0)) return 0;
  if (elapsedMs >= PROJ_FADE_IN_MS) return 1;
  const t = elapsedMs / PROJ_FADE_IN_MS;
  const u = 1 - t;
  return 1 - u * u * u * (1 + 3 * t);
};

/** フェードインの明るさの下限(暗い輪郭)。 */
export const PROJ_FADE_IN_DARK = 0.12;
/** 明るさは不透明度より遅れて戻す(前半は黒い輪郭・後半で色が乗る): 経過のこの割合までは暗いまま。 */
export const PROJ_FADE_IN_BRIGHT_DELAY = 0.3;

/**
 * フェードインの明るさ(tint に掛ける倍率 PROJ_FADE_IN_DARK..1): 不透明度より遅れて(尺の 30% から)ease-in-out で戻る。
 * 印が無い(経過が尺を越えた)時は 1。
 */
export const projFadeInBrightness = (elapsedMs: number): number => {
  if (elapsedMs >= PROJ_FADE_IN_MS) return 1;
  const t0 = Math.max(0, elapsedMs) / PROJ_FADE_IN_MS;
  const t = Math.min(1, Math.max(0, (t0 - PROJ_FADE_IN_BRIGHT_DELAY) / (1 - PROJ_FADE_IN_BRIGHT_DELAY)));
  const e = t * t * (3 - 2 * t);
  return PROJ_FADE_IN_DARK + (1 - PROJ_FADE_IN_DARK) * e;
};

/**
 * 回収の残像の濃さ(1→0): ease-in 寄り(はじめはゆっくり薄れ、最後に抜ける)・始まりと終わりの速さは 0。
 * g(t)=t³(4−3t)=フェードインの曲線を時間で裏返した形。単調・尺で 0。
 */
export const projGhostFadeAlpha = (elapsedMs: number, durMs: number): number => {
  if (!(elapsedMs > 0)) return 1;
  if (elapsedMs >= durMs) return 0;
  const t = elapsedMs / durMs;
  return 1 - t * t * t * (4 - 3 * t);
};

/** 濃さ 0.5 未満の間は ★#38 の「見えていない」(フェードインの曲線で測る)。印が無ければ false(=`?proj=0` は1ビットも変わらない)。 */
export const projFadeHidden = (e: { projFadeInAt?: number }, gameTime: number): boolean =>
  e.projFadeInAt !== undefined && projFadeInAlpha(gameTime - e.projFadeInAt) < PROJ_GAME_VISIBLE_ALPHA;

// ---- モジュールに1つ(cameraZoomLink と同じ形・§3-9d「置き場所と作り直す時刻」) ----

/** このフレームのゲームの画面(cam=store のカメラ・アテンションあり/player=主人公中心の基準・アテンションなし)。 */
export interface ProjGameViews { cam: ProjGameView; player: ProjGameView }

let current: ProjGameViews | null = null;

/** useGameLoop がカメラを書いた直後に毎フレーム1回(null=`?proj=0`・場面の外)。tick の途中で作り直さない。 */
export const setProjGameView = (v: ProjGameViews | null): void => { current = v; };

/** このフレームのゲームの画面。null の時、呼ぶ所は今の関数へ落ちる。 */
export const getProjGameView = (): ProjGameViews | null => current;

/** 引き(ZOOM_OVERSCAN)の既定。 */
export const PROJ_GAME_OVERSCAN = 1 / ZOOM_MIN_ABS;

/** 毎フレームの作り直しの入力(useGameLoop がカメラを書いた直後に渡す)。 */
export interface ProjGameViewsInput {
  /** store のカメラ(追従の遅れ・先読みを含む=描かれている画面)。 */
  camX: number;
  camY: number;
  /** 主人公中心の基準のカメラ(先読み=ボス・隕石の寄せ・追従の遅れを含まない。縦は構図の下げ zoomCameraDownFrac だけ入る)。 */
  playerCamX: number;
  playerCamY: number;
  viewW: number;
  viewH: number;
  viewZoom: number;
  playerH: number;
  playerFootY: number;
  camZoom: number;
  camDown: number;
  zref: 1 | 2;
  near: boolean;
  farStart: number;
  farEnd: number;
  /** アテンション(zoomToUnity)。gfCam だけに掛ける(gfPlayer は掛けない・ケ8)。 */
  att: { y: number; env: number } | null;
  /** 森の足元の行(utils/horizonForestLine.horizonForestFootLocalY)と地平線フェードの帯の幅。 */
  horizonLocal: number;
  fadePx: number;
}

let tableCam: ProjTable | null = null;
let tablePlayer: ProjTable | null = null;

/**
 * ゲームの画面を2つ(gfCam・gfPlayer)作り直してモジュールに置く。表は枠ごとに別に持つ(updateProjTable が前の表を書き換えるため・ケ8)。
 * 画面の大きさは store の gameBounds(=ゲームの論理寸法)。遠景の帯は屋外の式(farBackdropHeightFor・M0 は場面の外)。
 */
export const rebuildProjGameViews = (i: ProjGameViewsInput, farH: number): ProjGameViews => {
  const common = {
    persp: projGroundPersp(), screenW: i.viewW, screenH: i.viewH, farH, viewH: i.viewH, playerH: i.playerH, playerFootY: i.playerFootY,
    camZoom: i.camZoom, camDown: i.camDown, zref: i.zref, near: i.near, farStart: i.farStart, farEnd: i.farEnd, overscan: PROJ_GAME_OVERSCAN,
  };
  const bc = projFrameBase(tableCam, { ...common, camX: i.camX, camY: i.camY, att: i.att });
  tableCam = bc.table;
  const bp = projFrameBase(tablePlayer, { ...common, camX: i.playerCamX, camY: i.playerCamY, att: null });
  tablePlayer = bp.table;
  const wg = projGameZoomPlacement(i.viewZoom, i.viewW, i.viewH, farH);
  const v: ProjGameViews = {
    cam: { f: makeProjFrame({ ...bc.input, ...wg, shakeX: 0, shakeY: 0 }), horizonLocal: i.horizonLocal, fadePx: i.fadePx },
    player: { f: makeProjFrame({ ...bp.input, ...wg, shakeX: 0, shakeY: 0 }), horizonLocal: i.horizonLocal, fadePx: i.fadePx },
  };
  current = v;
  return v;
};

/**
 * ★#38=A の「見えているか」を引く所の入口: `PROJ_GAME_VIEW` が立ち、このフレームのゲームの画面がある時だけ gfCam(store のカメラ)を返す。
 * null の時(`?proj=0`・場面の外・store だけのテスト)、呼ぶ所は今の関数(isPointInZoomedViewport 等)のまま。
 */
export const projViewCam = (): ProjGameView | null => (PROJ_GAME_VIEW && current ? current.cam : null);

/**
 * ★#38=A(V29〜V51 の「見えているか」): `?proj=1` でゲームの画面がある時は、world 点(地面の点として)がゲームの画面(gfCam)の中か。
 * 無い時(`?proj=0`・場面の外)は今の物差しの答え legacy をそのまま返す(=`?proj=0` は1ビットも変わらない)。
 */
export const projSeen = (x: number, y: number, marginPx: number, legacy: boolean): boolean => {
  const gv = projViewCam();
  return gv ? projGameViewContains(gv, x, y, marginPx) : legacy;
};

const centerOut = makeProjUnprojectOut();
/** ゲームの画面の中心(画面px)を逆投影した地面の点(V34)。中心の行が ℓ_min より北なら ℓ_min の行。 */
export const projGameScreenCenter = (gv: ProjGameView): { x: number; y: number } => {
  const u = projUnprojectInto(gv.f, gv.f.screenW / 2, gv.f.screenH / 2, projUnprojectLMin(gv.f), centerOut);
  return { x: u.x, y: u.y };
};

/** ★#38=A の主人公中心の基準(V72〜V75・V77): gfPlayer。null の時は今の物差しのまま。 */
export const projViewPlayer = (): ProjGameView | null => (PROJ_GAME_VIEW && current ? current.player : null);

/** projSeen の主人公中心の基準版(gfPlayer)。 */
export const projSeenPlayer = (x: number, y: number, marginPx: number, legacy: boolean): boolean => {
  const gv = projViewPlayer();
  return gv ? projGameViewContains(gv, x, y, marginPx) : legacy;
};

/** 箱(当たり判定の箱)が完全にゲームの画面の外か(V73 の分身・足元を地面の点として箱を投影)。gv が無い時は legacy。 */
export const projBoxFullyOffPlayer = (b: { x: number; y: number; width: number; height: number }, legacy: boolean): boolean => {
  const gv = projViewPlayer();
  return gv ? !projGameBoxOnScreen(gv, b.x + b.width / 2, b.y + b.height, b.width, b.height, 0) : legacy;
};

/** V51(追い上げの湧きの「画面内の数」): 箱(当たり判定の箱)を足元から投影してゲームの画面(store のカメラ)に掛かる数。 */
export const projCountVisible = (gv: ProjGameView, boxes: readonly { x: number; y: number; width: number; height: number }[]): number => {
  let n = 0;
  for (const b of boxes) if (projGameBoxOnScreen(gv, b.x + b.width / 2, b.y + b.height, b.width, b.height, 0)) n++;
  return n;
};

const fracP: ProjPoint = makeProjPoint();
const fracS = { x: 0, y: 0 };
/**
 * V30(ジュンの寄り先の縦の帯): 足元 (x, footY) を地面の点として投影し、高さ h×s 上の点の画面Y ÷ 画面の高さ。
 * ゲームの画面(store のカメラ)が無い時は legacy。
 */
export const projScreenYFracOr = (x: number, footY: number, h: number, legacy: number): number => {
  const gv = projViewCam();
  if (!gv) return legacy;
  const f = gv.f;
  const p = projectInto(f, x, footY, fracP);
  projDisplayToScreenInto(f, p.x, p.y - h * p.s, fracS);
  return fracS.y / Math.max(1, f.screenH);
};
