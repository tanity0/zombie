// 描く時に、物の位置も大きさも、地面と同じ遠近の計算を通す(投影)の正本(純関数・PixiJS を読まない)。
// 設計書: research/PERSPECTIVE_PROJECTION.md §1(式の正本)・§3-3 作る物1。
//
// `?proj=1` の時だけ pixiScene が使う(既定 `?proj=0` では1ビットも使われない)。
// ゲームの判定(当たり・移動・湧き・回収・攻撃範囲)には一切関与しない=描画の写像だけ。
//
// 座標の呼び方:
//   world    = ゲームの座標(store / world の判定と同じ)。
//   ℓ (l)    = 地面の帯のローカルY(= 表示Y − camera.y − farH)。帯の上端(地平線)=0。
//   表示座標 = `world` コンテナの子に置く座標(= 投影後の world 座標)。表示x = CXw + s·(worldX − CXw)、表示y = camera.y + farH + ℓ。
//   画面px   = ズーム後の canvas の論理px(worldGroup の scale/position を掛けた後)。
//
// 投影(§1-1):
//   縦:  W(ℓ) − W_ref = scaleY(ℓ_ref) · ( G(ℓ) − G(ℓ_ref) ),  G(ℓ) = ∫ dℓ / scaleY(ℓ)
//   横:  表示x = CXw + conv(ℓ)/conv(ℓ_ref) · (worldX − CXw),  CXw = camera.x + screenW/2
//   大きさ: s(ℓ) = conv(ℓ)/conv(ℓ_ref)
// 基準点と基準行は必ず組 (W_ref, ℓ_ref) で渡す(アテンション中は (W_refAtt, ℓ_refAtt)・§1-6)。

import { groundRowTileScaleX, groundRowTileScaleY, type GroundPerspectiveParams } from './groundScroll';

export type { GroundPerspectiveParams };

/** 帯の本数の基準(renderSpec.GROUND_STRIP_REF_COUNT と同じ値)。t = ℓ / stripH / (REF − 1)。 */
export const PROJ_REF_STRIP_COUNT = 72;
/** 細かい表の、帯1本あたりの分割数(叩き台: 8 → 180本で 1,440 点・§1-1b)。 */
export const PROJ_TABLE_SUBDIV = 8;

/** ℓ → t(§10 B8)。地面の帯の標本・物のなめらかな値・基準行の t は全部この1本の式で出す。 */
export const projTOfL = (l: number, stripH: number, refCount: number = PROJ_REF_STRIP_COUNT): number =>
  refCount <= 1 ? 1 : (l / Math.max(1e-6, stripH)) / (refCount - 1);

/** 地面の横の縮み conv(t)(tileScale.x / GROUND_TILE_SCALE_X)。 */
export const projConvAt = (t: number, p: GroundPerspectiveParams): number =>
  groundRowTileScaleX(t, p) / Math.max(1e-9, p.tileScaleX);

/** 地面の縦の詰め scaleY(t)(tileScale.y)。 */
export const projScaleYAt = (t: number, p: GroundPerspectiveParams): number =>
  Math.max(1e-6, groundRowTileScaleY(t, p));

/** G(ℓ)=∫dℓ/scaleY の細かい表(台形則)。帯の引数(stripH・本数・曲線)だけで決まり、ℓ_ref に依らない(§1-1d)。 */
export interface ProjTable {
  readonly stripH: number;
  readonly refCount: number;
  /** 表の刻み(ℓ)。 */
  readonly step: number;
  /** 表の点数 −1(最後の点の ℓ = n·step = lMax)。 */
  readonly n: number;
  readonly lMax: number;
  /** g[k] = G(k·step)。G(0)=0。単調増加。 */
  readonly g: Float64Array;
  readonly p: GroundPerspectiveParams;
  /** 作り直す条件の比較用(§10 B7)。 */
  readonly key: string;
}

export const projTableKey = (p: GroundPerspectiveParams, stripH: number, stripCount: number, refCount: number, subdiv: number): string =>
  `${p.tileScaleX}|${p.trapFar}|${p.trapCurve}|${p.trapezoid}|${p.farScale}|${p.nearScale}|${p.curve}|${stripH}|${stripCount}|${refCount}|${subdiv}`;

/**
 * 表を作る。範囲は ℓ ∈ [0, stripCount·stripH](地面を敷いている範囲。引き 0.4 で 180 本=t 2.5 まで)。
 * 範囲の外は projG / projGInv が端の傾きで直線に延長する(発散・逆転しない・§10 B1)。
 */
export const buildProjTable = (
  p: GroundPerspectiveParams, stripH: number, stripCount: number,
  refCount: number = PROJ_REF_STRIP_COUNT, subdiv: number = PROJ_TABLE_SUBDIV,
): ProjTable => {
  const sh = Math.max(1e-3, stripH);
  const n = Math.max(1, Math.round(Math.max(1, stripCount) * Math.max(1, subdiv)));
  const step = sh / Math.max(1, subdiv);
  const g = new Float64Array(n + 1);
  let prev = 1 / projScaleYAt(0, p);
  for (let k = 1; k <= n; k++) {
    const cur = 1 / projScaleYAt(projTOfL(k * step, sh, refCount), p);
    g[k] = g[k - 1] + 0.5 * (prev + cur) * step;
    prev = cur;
  }
  return { stripH: sh, refCount, step, n, lMax: n * step, g, p, key: projTableKey(p, stripH, stripCount, refCount, subdiv) };
};

/** 北端(ℓ<0)の延長の傾き=1/scaleY(0)。南端(ℓ>lMax)の延長の傾き=1/scaleY(lMax)。 */
const slopeAt = (tb: ProjTable, l: number): number => 1 / projScaleYAt(projTOfL(l, tb.stripH, tb.refCount), tb.p);

/** G(ℓ)。表の中は1次補間(O(1))、外は端の傾きで直線に延長。 */
export const projG = (tb: ProjTable, l: number): number => {
  if (!(l > 0)) return l * slopeAt(tb, 0); // l<=0(NaN も 0 側へ)
  if (l >= tb.lMax) return tb.g[tb.n] + (l - tb.lMax) * slopeAt(tb, tb.lMax);
  const x = l / tb.step;
  const k = Math.floor(x);
  const f = x - k;
  return tb.g[k] + (tb.g[k + 1] - tb.g[k]) * f;
};

/** G の逆(単調な表の二分探索)。projG の厳密な逆写像(区分1次なので往復の誤差は浮動小数だけ)。 */
export const projGInv = (tb: ProjTable, gv: number): number => {
  if (!(gv > 0)) return gv / slopeAt(tb, 0);
  const gMax = tb.g[tb.n];
  if (gv >= gMax) return tb.lMax + (gv - gMax) / slopeAt(tb, tb.lMax);
  let lo = 0, hi = tb.n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tb.g[mid] <= gv) lo = mid; else hi = mid;
  }
  const d = tb.g[hi] - tb.g[lo];
  const f = d > 0 ? (gv - tb.g[lo]) / d : 0;
  return (lo + f) * tb.step;
};

/** 1フレームの投影の状態(pixiScene が毎フレーム作る)。 */
export interface ProjFrameInput {
  table: ProjTable;
  camX: number;
  camY: number;
  farH: number;
  screenW: number;
  screenH: number;
  /** 基準点(world)と基準行(ℓ)の組。片方だけ差し替えない。 */
  wRef: number;
  lRef: number;
  /** 模様の密度の行 t_std(ズーム1の ℓ_ref の t・定数)。 */
  tStd: number;
  /** worldGroup の scale と position(ズーム・支点・パン)。 */
  wgScale?: number;
  wgX?: number;
  wgY?: number;
  /** 揺れ(world / groundBase の位置に足されている量)。投影の外側で一律に効く。 */
  shakeX?: number;
  shakeY?: number;
  /** 描く距離のフェード(★#4): 基準の world Y(主人公の足元)・北へ start→end で 1→0。end<=0 なら無し。 */
  farRefY?: number;
  farStart?: number;
  farEnd?: number;
}

export interface ProjFrame extends Required<ProjFrameInput> {
  /** 画面中央の列(world)。横の消失点。 */
  cxw: number;
  gRef: number;
  syRef: number;
  convRef: number;
  convStd: number;
  syStd: number;
}

export const makeProjFrame = (i: ProjFrameInput): ProjFrame => {
  const p = i.table.p;
  const tRef = projTOfL(i.lRef, i.table.stripH, i.table.refCount);
  return {
    wgScale: 1, wgX: 0, wgY: 0, shakeX: 0, shakeY: 0, farRefY: 0, farStart: 0, farEnd: 0,
    ...i,
    cxw: i.camX + i.screenW / 2,
    gRef: projG(i.table, i.lRef),
    syRef: projScaleYAt(tRef, p),
    convRef: Math.max(1e-6, projConvAt(tRef, p)),
    convStd: Math.max(1e-6, projConvAt(i.tStd, p)),
    syStd: projScaleYAt(i.tStd, p),
  };
};

/** world Y → 帯のローカル ℓ(投影の縦)。 */
export const projLocalYOfWorld = (f: ProjFrame, wy: number): number =>
  projGInv(f.table, f.gRef + (wy - f.wRef) / f.syRef);

/** 帯のローカル ℓ → world Y(逆投影の縦)。 */
export const projWorldYOfLocal = (f: ProjFrame, l: number): number =>
  f.wRef + f.syRef * (projG(f.table, l) - f.gRef);

/** 帯のローカル ℓ での立っている絵の倍率 s。 */
export const projScaleAtLocal = (f: ProjFrame, l: number): number =>
  projConvAt(projTOfL(l, f.table.stripH, f.table.refCount), f.table.p) / f.convRef;

/** 描く距離のフェード(★#4): 北への距離 d が start→end で 1→0(線形)。end<=0 なら常に1。 */
export const projDistanceFade = (dNorth: number, start: number, end: number): number => {
  if (!(end > 0)) return 1;
  if (dNorth <= start) return 1;
  if (dNorth >= end) return 0;
  return (end - dNorth) / Math.max(1e-6, end - start);
};

export interface ProjPoint {
  /** 表示座標(world コンテナの子に置く座標)。 */
  x: number;
  y: number;
  /** 帯のローカルY。 */
  l: number;
  /** 立っている絵の倍率(基準行で 1)。 */
  s: number;
  /** 定義域と描く距離のフェード(地平線より北=0・描く距離の上限の先=0)。地平線フェードは別(pixiScene)。 */
  alpha: number;
  /** 定義域の中か(地平線より北=false。南は表の外へ延長するので常に true)。 */
  inDomain: boolean;
}

/** world 点 → 表示座標・倍率・フェード(§3-3 作る物1)。 */
export const project = (f: ProjFrame, wx: number, wy: number): ProjPoint => {
  const l = projLocalYOfWorld(f, wy);
  const s = projScaleAtLocal(f, l);
  const inDomain = l >= 0;
  const fade = projDistanceFade(f.farRefY - wy, f.farStart, f.farEnd);
  return {
    x: f.cxw + s * (wx - f.cxw),
    y: f.camY + f.farH + l,
    l, s,
    alpha: inDomain ? fade : 0,
    inDomain,
  };
};

/** 表示座標 → 画面px(ズーム後)。 */
export const projDisplayToScreen = (f: ProjFrame, dx: number, dy: number): { x: number; y: number } => ({
  x: f.wgX + f.wgScale * (dx - f.camX + f.shakeX),
  y: f.wgY + f.wgScale * (dy - f.camY + f.shakeY),
});

/** 画面px(ズーム後・canvas の論理px)→ world(§3-3 作る物1。ズーム・支点・パンを中で外す)。 */
export const unproject = (f: ProjFrame, sx: number, sy: number): { x: number; y: number; l: number } => {
  const sc = f.wgScale > 0 ? f.wgScale : 1;
  const dx = (sx - f.wgX) / sc + f.camX - f.shakeX;
  const dy = (sy - f.wgY) / sc + f.camY - f.shakeY;
  const l = dy - f.camY - f.farH;
  const s = Math.max(1e-6, projScaleAtLocal(f, l));
  return { x: f.cxw + (dx - f.cxw) / s, y: projWorldYOfLocal(f, l), l };
};

export interface ProjQuad {
  tl: { x: number; y: number };
  tr: { x: number; y: number };
  br: { x: number; y: number };
  bl: { x: number; y: number };
  /** 台形を囲む長方形(方針③)。 */
  rect: { left: number; top: number; right: number; bottom: number };
}

/**
 * 画面の四隅を逆投影した、見える world の台形。上の辺は「地平線」と「描く距離の上限」の手前の方で切る
 * (定義域の外を可視域に入れない)。
 */
export const visibleWorldQuad = (f: ProjFrame): ProjQuad => {
  const sc = f.wgScale > 0 ? f.wgScale : 1;
  const lOfScreenY = (sy: number) => (sy - f.wgY) / sc - f.shakeY - f.farH;
  let lTop = Math.max(0, lOfScreenY(0));
  if (f.farEnd > 0) {
    const lFar = projLocalYOfWorld(f, f.farRefY - f.farEnd);
    if (lFar > lTop) lTop = lFar;
  }
  let lBot = lOfScreenY(f.screenH);
  if (lBot < lTop) lBot = lTop;
  const rowCorners = (l: number) => {
    const s = Math.max(1e-6, projScaleAtLocal(f, l));
    const wy = projWorldYOfLocal(f, l);
    const dxL = (0 - f.wgX) / sc + f.camX - f.shakeX;
    const dxR = (f.screenW - f.wgX) / sc + f.camX - f.shakeX;
    return { l: { x: f.cxw + (dxL - f.cxw) / s, y: wy }, r: { x: f.cxw + (dxR - f.cxw) / s, y: wy } };
  };
  const top = rowCorners(lTop), bot = rowCorners(lBot);
  return {
    tl: top.l, tr: top.r, br: bot.r, bl: bot.l,
    rect: {
      left: Math.min(top.l.x, bot.l.x), right: Math.max(top.r.x, bot.r.x),
      top: top.l.y, bottom: bot.l.y,
    },
  };
};

/**
 * 南のカリングの余白(作る物4): 絵の高さ artH(world の大きさ・s=1 の時の高さ)の物が、足元が画面の下端より南でも
 * 絵の上端が画面の下端に掛かる、一番南の world Y を返す。帯を敷いている範囲(表の lMax)の外へは延ばさない
 * (それより南は表の延長の上=数十 world px で絵が数倍に膨らむ範囲)。
 */
export const southCullWorldY = (f: ProjFrame, artH: number, lScreenBottom: number): number => {
  const lb = Math.max(0, lScreenBottom);
  const lCap = Math.max(lb, f.table.lMax);
  const top = (l: number) => l - Math.max(0, artH) * projScaleAtLocal(f, l); // 絵の上端の ℓ
  if (top(lCap) <= lb) return projWorldYOfLocal(f, lCap);
  let lo = lb, hi = lCap;
  for (let k = 0; k < 40; k++) {
    const mid = 0.5 * (lo + hi);
    if (top(mid) <= lb) lo = mid; else hi = mid;
  }
  return projWorldYOfLocal(f, hi);
};

/** 基準行 ℓ_ref(§1-1d・★#20 裁定②): 縦の下げ量 downFrac(=zoomCameraDownFrac(camdown, z))の定位置に主人公の足元が落ち着く行。 */
export const projRefLocalY = (viewH: number, downFrac: number, playerH: number, farH: number): number =>
  viewH * (0.5 + downFrac) + playerH / 2 - farH;

/**
 * アテンション(§1-6): 基準点を注目点へ包絡線 env(0..1)で運び、基準行もそれに合わせて運ぶ(必ず組で返す)。
 * W_refAtt = W_ref + (a.y − W_ref)·env、ℓ_refAtt = W_refAtt − camera.y − farH。
 */
export const projAttentionRef = (wRef: number, attY: number, env: number, camY: number, farH: number): { wRef: number; lRef: number } => {
  const w = wRef + (attY - wRef) * Math.max(0, Math.min(1, env));
  return { wRef: w, lRef: w - camY - farH };
};

/** 地面の帯 i の TilingSprite の値(§1-1a: 絶対値・§1-1b: 帯の中央で標本)。 */
export interface GroundStripTile {
  tileScaleX: number;
  tileScaleY: number;
  tilePosX: number;
  tilePosY: number;
  /** 帯の中央の行(ℓ)と world Y(計器用)。 */
  lc: number;
  wc: number;
}

const modPos = (a: number, m: number): number => (m > 0 ? ((a % m) + m) % m : a);

/**
 * 帯 i の模様を world に固定した1枚の布として、物と同じ投影の関数から絶対値で出す(足し込みなし)。
 * 模様の world の密度 κ は定数(κx = 1/(tileScaleX·conv(t_std))、κy = 1/scaleY(t_std))。テクスチャ座標は1周で剰余。
 * overW = 帯の幅(groundBase のローカル。中央 overW/2 が画面中央の列 CXw に当たる)。
 */
export const groundStripTile = (
  f: ProjFrame, i: number, texW: number, texH: number, overW: number,
): GroundStripTile => {
  const tb = f.table, p = tb.p;
  const lc = (i + 0.5) * tb.stripH;
  const tc = projTOfL(lc, tb.stripH, tb.refCount);
  const convC = projConvAt(tc, p);
  const syC = projScaleYAt(tc, p);
  const tsx = p.tileScaleX * f.convStd * convC / f.convRef;
  const tsy = f.syStd * syC / f.syRef;
  const kx = 1 / (p.tileScaleX * f.convStd);
  const ky = 1 / f.syStd;
  const uC = modPos(f.cxw * kx, Math.max(1, texW));
  const wc = projWorldYOfLocal(f, lc);
  const vC = modPos(wc * ky, Math.max(1, texH));
  return {
    tileScaleX: tsx, tileScaleY: tsy,
    tilePosX: overW / 2 - uC * tsx,
    tilePosY: tb.stripH / 2 - vC * tsy,
    lc, wc,
  };
};

/**
 * 計器・テスト用(受け入れ条件2・作る物8): world 点 P を「物の投影」で写した位置と、P と同じ world 点の地面の模様が
 * 描かれている位置の差を、ズーム後の画面pxで返す。地面は P の投影後の行が乗っている帯 i の線形の写像(帯の値は中央の標本)。
 */
export const groundVsObjectDiff = (f: ProjFrame, wx: number, wy: number): { dx: number; dy: number; t: number; x: number } => {
  const tb = f.table, p = tb.p;
  const lObj = projLocalYOfWorld(f, wy);
  const i = Math.floor(lObj / tb.stripH);
  const lc = (i + 0.5) * tb.stripH;
  const tc = projTOfL(lc, tb.stripH, tb.refCount);
  const convC = projConvAt(tc, p);
  const syC = projScaleYAt(tc, p);
  const sObj = projScaleAtLocal(f, lObj);
  const xObj = sObj * (wx - f.cxw);
  const xGround = (convC / f.convRef) * (wx - f.cxw);
  const lGround = lc + (wy - projWorldYOfLocal(f, lc)) * syC / f.syRef;
  return {
    dx: (xObj - xGround) * f.wgScale,
    dy: (lObj - lGround) * f.wgScale,
    t: projTOfL(lObj, tb.stripH, tb.refCount),
    x: xObj * f.wgScale,
  };
};

/** 受け入れ条件2の上限(§1-1b): (conv(t+1/71) − conv(t)) / 2 / conv(t) × x(x = 消失点の列からの距離・ズーム後の画面px)。 */
export const groundSlipBound = (t: number, x: number, p: GroundPerspectiveParams, refCount: number = PROJ_REF_STRIP_COUNT): number => {
  const c0 = projConvAt(t, p);
  const c1 = projConvAt(t + 1 / (refCount - 1), p);
  return Math.abs(c1 - c0) / 2 / Math.max(1e-6, c0) * Math.abs(x);
};
