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

/**
 * 手前の地面の伸びを抑える案(`?projnear=1`・社長「みせて」の比較用・既定は無し): 行 ℓ_near(=基準行 ℓ_ref)より南だけ、
 * 縦の詰めを「縦の伸び ≤ 横の倍率」に抑える:
 *   scaleY'(ℓ) = min( scaleY(ℓ), scaleY(ℓ_near) · conv(ℓ)/conv(ℓ_near) )   (ℓ > ℓ_near)
 *   scaleY'(ℓ) = scaleY(ℓ)                                               (ℓ ≤ ℓ_near)
 * 地面の円の縦横比(縦/横)= (scaleY'/scaleY_ref)/(conv/conv_ref) ≤ 1 になる(=手前の円は縦長の卵にならず、基準行の円と同じ丸さで止まる)。
 * ℓ_near 以北の scaleY は1ビットも変えないので、G(ℓ) − G(ℓ_ref)(ℓ ≤ ℓ_ref)・横の倍率 s=conv/conv_ref は北で同じ=北の投影は不変。
 * lNear が有限でない時は抑えない(今のまま)。
 */
export const projScaleYNearAt = (l: number, stripH: number, refCount: number, p: GroundPerspectiveParams, lNear: number): number => {
  const sy = projScaleYAt(projTOfL(l, stripH, refCount), p);
  if (!Number.isFinite(lNear) || !(l > lNear)) return sy;
  const tN = projTOfL(lNear, stripH, refCount);
  const cap = projScaleYAt(tN, p) * projConvAt(projTOfL(l, stripH, refCount), p) / Math.max(1e-9, projConvAt(tN, p));
  return Math.max(1e-6, Math.min(sy, cap));
};

/** G(ℓ)=∫dℓ/scaleY の細かい表(台形則)。帯の引数(stripH・本数・曲線)だけで決まり、ℓ_ref に依らない(§1-1d)。手前を抑える案(lNear)の時だけ ℓ_near に依る。 */
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
  /** 手前を抑える行(`?projnear=1` の時の ℓ_ref)。抑えない時は NaN。 */
  readonly lNear: number;
  /**
   * ℓ_near が刻みの中(端点でない)にある時の、その刻みの左端の添字 kc(無ければ −1)と、
   * その刻みで ℓ ≤ ℓ_near の側に使う「抑えない表の右端の値」gOrig と、G(ℓ_near)=gNear。
   * ℓ ≤ ℓ_near の G は抑えない表と同じ補間になる(=基準行より北は1ビットも変わらない)。
   */
  readonly kc: number;
  readonly gOrig: number;
  readonly gNear: number;
  /** 作り直す条件の比較用(§10 B7)。 */
  readonly key: string;
}

export const projTableKey = (
  p: GroundPerspectiveParams, stripH: number, stripCount: number, refCount: number, subdiv: number, lNear: number = NaN,
): string =>
  `${p.tileScaleX}|${p.trapFar}|${p.trapCurve}|${p.trapezoid}|${p.farScale}|${p.nearScale}|${p.curve}|${stripH}|${stripCount}|${refCount}|${subdiv}` +
  (Number.isFinite(lNear) ? `|near${lNear}` : '');

/** 表の行 ℓ の縦の詰め(手前を抑える案の時は scaleY'・§ projScaleYNearAt)。地面の帯・物・延長の傾きは全部これを引く。 */
export const projTableScaleY = (tb: ProjTable, l: number): number =>
  projScaleYNearAt(l, tb.stripH, tb.refCount, tb.p, tb.lNear);

/**
 * 表を作る。範囲は ℓ ∈ [0, stripCount·stripH](地面を敷いている範囲。引き 0.4 で 180 本=t 2.5 まで)。
 * 範囲の外は projG / projGInv が端の傾きで直線に延長する(発散・逆転しない・§10 B1)。
 */
export const buildProjTable = (
  p: GroundPerspectiveParams, stripH: number, stripCount: number,
  refCount: number = PROJ_REF_STRIP_COUNT, subdiv: number = PROJ_TABLE_SUBDIV, lNear: number = NaN,
): ProjTable => {
  const sh = Math.max(1e-3, stripH);
  const n = Math.max(1, Math.round(Math.max(1, stripCount) * Math.max(1, subdiv)));
  const step = sh / Math.max(1, subdiv);
  const g = new Float64Array(n + 1);
  const ln = Number.isFinite(lNear) ? lNear : NaN;
  let prev = 1 / projScaleYNearAt(0, sh, refCount, p, ln);
  let kc = -1, gOrig = 0, gNear = 0;
  if (!Number.isFinite(ln)) {
    for (let k = 1; k <= n; k++) {
      const cur = 1 / projScaleYAt(projTOfL(k * step, sh, refCount), p);
      g[k] = g[k - 1] + 0.5 * (prev + cur) * step;
      prev = cur;
    }
  } else {
    // 手前を抑える案: ℓ_near より北の刻みは抑えない表と同じ。ℓ_near をまたぐ刻みは、北側を抑えない表の補間のまま
    // G(ℓ_near) を取り、南側だけ抑えた傾きで積む。
    for (let k = 1; k <= n; k++) {
      const l0 = (k - 1) * step, l1 = k * step;
      const curOrig = 1 / projScaleYAt(projTOfL(l1, sh, refCount), p);
      const cur = 1 / projScaleYNearAt(l1, sh, refCount, p, ln);
      if (l0 < ln && ln < l1) {
        kc = k - 1;
        gOrig = g[k - 1] + 0.5 * (prev + curOrig) * step;
        gNear = g[k - 1] + (gOrig - g[k - 1]) * ((ln - l0) / step);
        const mid = 1 / projScaleYAt(projTOfL(ln, sh, refCount), p);
        g[k] = gNear + 0.5 * (mid + cur) * (l1 - ln);
      } else {
        g[k] = g[k - 1] + 0.5 * (prev + cur) * step;
      }
      prev = cur;
    }
  }
  return {
    stripH: sh, refCount, step, n, lMax: n * step, g, p, lNear: ln, kc, gOrig, gNear,
    key: projTableKey(p, stripH, stripCount, refCount, subdiv, ln),
  };
};

/** 北端(ℓ<0)の延長の傾き=1/scaleY(0)。南端(ℓ>lMax)の延長の傾き=1/scaleY(lMax)。 */
const slopeAt = (tb: ProjTable, l: number): number => 1 / projTableScaleY(tb, l);

/** G(ℓ)。表の中は1次補間(O(1))、外は端の傾きで直線に延長。 */
export const projG = (tb: ProjTable, l: number): number => {
  if (!(l > 0)) return l * slopeAt(tb, 0); // l<=0(NaN も 0 側へ)
  if (l >= tb.lMax) return tb.g[tb.n] + (l - tb.lMax) * slopeAt(tb, tb.lMax);
  const x = l / tb.step;
  const k = Math.floor(x);
  const f = x - k;
  if (k === tb.kc) {
    if (l <= tb.lNear) return tb.g[k] + (tb.gOrig - tb.g[k]) * f;
    const l1 = (k + 1) * tb.step;
    return tb.gNear + (tb.g[k + 1] - tb.gNear) * ((l - tb.lNear) / Math.max(1e-12, l1 - tb.lNear));
  }
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
  if (lo === tb.kc) {
    if (gv <= tb.gNear) {
      const d0 = tb.gOrig - tb.g[lo];
      return (lo + (d0 > 0 ? (gv - tb.g[lo]) / d0 : 0)) * tb.step;
    }
    const d1 = tb.g[hi] - tb.gNear;
    const l1 = hi * tb.step;
    return tb.lNear + (d1 > 0 ? (gv - tb.gNear) / d1 : 0) * (l1 - tb.lNear);
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

/**
 * 描く距離のフェード(★#4): 北への距離 d が start→end で 1→0。end<=0 なら常に1。
 * 始まりも終わりもなだらか(smoothstep=両端で傾き0・クリエイティブ監査13)。消え切る距離(end)は変えない。
 */
export const projDistanceFade = (dNorth: number, start: number, end: number): number => {
  if (!(end > 0)) return 1;
  if (dNorth <= start) return 1;
  if (dNorth >= end) return 0;
  const t = (dNorth - start) / Math.max(1e-6, end - start);
  return 1 - t * t * (3 - 2 * t);
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

/** 空の ProjPoint(作り置きの入れ物用)。 */
export const makeProjPoint = (): ProjPoint => ({ x: 0, y: 0, l: 0, s: 1, alpha: 1, inDomain: true });

/** world 点 → 表示座標・倍率・フェードを out へ書く(毎フレームの確保を増やさない形)。 */
export const projectInto = (f: ProjFrame, wx: number, wy: number, out: ProjPoint): ProjPoint => {
  const l = projLocalYOfWorld(f, wy);
  const s = projScaleAtLocal(f, l);
  const inDomain = l >= 0;
  const fade = projDistanceFade(f.farRefY - wy, f.farStart, f.farEnd);
  out.x = f.cxw + s * (wx - f.cxw);
  out.y = f.camY + f.farH + l;
  out.l = l; out.s = s;
  out.alpha = inDomain ? fade : 0;
  out.inDomain = inDomain;
  return out;
};

/** world 点 → 表示座標・倍率・フェード(§3-3 作る物1)。新しい入れ物を返す(テスト・稀な呼び出し用)。 */
export const project = (f: ProjFrame, wx: number, wy: number): ProjPoint => projectInto(f, wx, wy, makeProjPoint());

/** 表示座標 → 画面px(ズーム後)を out へ書く。 */
export const projDisplayToScreenInto = (f: ProjFrame, dx: number, dy: number, out: { x: number; y: number }): { x: number; y: number } => {
  out.x = f.wgX + f.wgScale * (dx - f.camX + f.shakeX);
  out.y = f.wgY + f.wgScale * (dy - f.camY + f.shakeY);
  return out;
};

/** 表示座標 → 画面px(ズーム後)。 */
export const projDisplayToScreen = (f: ProjFrame, dx: number, dy: number): { x: number; y: number } =>
  projDisplayToScreenInto(f, dx, dy, { x: 0, y: 0 });

/**
 * 足元 (wx, wy) に立つ絵(s=1 の world の幅 artW・高さ artH・横のアンカー ax)を投影した箱が、画面(ズーム後の画面px)に
 * marginPx の余白込みで掛かるか。掛からない物は作らない/隠す(段階1 監査 A1)。定義域の外(地平線より北)は false。
 */
export const projBoxOnScreen = (
  f: ProjFrame, wx: number, wy: number, artW: number, artH: number, ax: number, marginPx: number, scratch: ProjPoint,
): boolean => {
  const p = projectInto(f, wx, wy, scratch);
  if (!p.inDomain || p.alpha <= 0) return false;
  const z = f.wgScale;
  const sx = f.wgX + z * (p.x - f.camX + f.shakeX);
  const sy = f.wgY + z * (p.y - f.camY + f.shakeY);
  const w = Math.max(0, artW) * p.s * z, h = Math.max(0, artH) * p.s * z;
  const left = sx - ax * w, right = sx + (1 - ax) * w;
  return right >= -marginPx && left <= f.screenW + marginPx && sy >= -marginPx && sy - h <= f.screenH + marginPx;
};

/** 投影した world 点が画面(ズーム後の画面px)の外へどれだけ出ているか(表示座標の px=画面px÷ズーム)。中なら 0。 */
export const projScreenOutside = (f: ProjFrame, wx: number, wy: number, scratch: ProjPoint): number => {
  const p = projectInto(f, wx, wy, scratch);
  if (!p.inDomain) return Infinity;
  const z = f.wgScale > 0 ? f.wgScale : 1;
  const sx = f.wgX + z * (p.x - f.camX + f.shakeX);
  const sy = f.wgY + z * (p.y - f.camY + f.shakeY);
  const dx = sx < 0 ? -sx : sx > f.screenW ? sx - f.screenW : 0;
  const dy = sy < 0 ? -sy : sy > f.screenH ? sy - f.screenH : 0;
  return Math.hypot(dx, dy) / z;
};

/** 帯の行 ℓ の画面Y(ズーム後)の上端・下端に当たる ℓ。 */
export const projScreenRowsL = (f: ProjFrame): { top: number; bottom: number } => {
  const sc = f.wgScale > 0 ? f.wgScale : 1;
  return { top: (0 - f.wgY) / sc - f.shakeY - f.farH, bottom: (f.screenH - f.wgY) / sc - f.shakeY - f.farH };
};

/**
 * 物を取ってくる範囲を、行ごとの左右の幅(台形そのもの)で切った帯の列(world の矩形・段階1 監査 A1)。
 * ℓ ∈ [lTop, lBot] を n 本に分け、各帯の左右は帯の北の端の行(一番広い)で画面の左右の縁を逆投影し、marginX(world)を足す。
 * 縦は帯の world の範囲。out に書き、使った本数を返す。
 */
export const visibleWorldBands = (
  f: ProjFrame, lTop: number, lBot: number, n: number, marginX: number,
  out: { left: number; top: number; right: number; bottom: number }[],
): number => {
  const sc = f.wgScale > 0 ? f.wgScale : 1;
  const dxL = (0 - f.wgX) / sc + f.camX - f.shakeX;
  const dxR = (f.screenW - f.wgX) / sc + f.camX - f.shakeX;
  const k = Math.max(1, Math.floor(n));
  const span = Math.max(0, lBot - lTop);
  for (let i = 0; i < k; i++) {
    const l0 = lTop + (span * i) / k, l1 = lTop + (span * (i + 1)) / k;
    const s = Math.max(1e-6, projScaleAtLocal(f, l0));
    const r = out[i] ?? (out[i] = { left: 0, top: 0, right: 0, bottom: 0 });
    r.left = f.cxw + (dxL - f.cxw) / s - marginX;
    r.right = f.cxw + (dxR - f.cxw) / s + marginX;
    r.top = projWorldYOfLocal(f, l0);
    r.bottom = projWorldYOfLocal(f, l1);
  }
  return k;
};

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
  const syC = projTableScaleY(tb, lc);
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
  const syC = projTableScaleY(tb, lc);
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
