// 投影の段階4「形を持つもの」の純関数(PixiJS を読まない・描画の写像だけ)。
// 設計書: research/PERSPECTIVE_PROJECTION.md §3-6(3-6b 描き方の共通部品・3-6f 予告の濃さ・3-6g 線の太さ・3-6j 作る物1)。
//
// 芯: 予告の形を、判定と同じ平面の座標(world)のまま作り、**頂点ごとに投影**して描く。投影は単調な1対1の写像なので、
// world で判定の形の内側だった点は、画面でも投影した形の内側に入る(赤い所=当たる所)。中心だけ投影して円のまま描くのは違反。
//
// 分け方は「画面での誤差」で決める(world の半径で決め打ちしない): 辺の中点を投影した点と、投影した両端の中点の差が
// tolPx(ズーム後の画面px)を超えたら2分する。深さ5まで。画面(+16px)に掛からない辺は分けない。
// 定義域の外(地平線より北・ℓ<0)の頂点は ℓ=0 に寄せる(地平線の線に潰す・§3-6b 原則3)。
//
// `?proj=1` の時だけ pixiScene(src/pixi/projDraw.ts)が使う。既定 `?proj=0` では1ビットも使われない。
// ゲームの判定(当たり・時刻・威力)には一切関与しない。

import {
  projLocalYOfWorld, projWorldYOfLocal, projScaleAtLocal, projDistanceFade, projScreenRowsL, type ProjFrame,
} from './perspectiveProjection';

/**
 * ★#23「予告の線の太さと遠近」(社長裁定 2026-11-23「予告はb」=B): 太さが判定を表さない線(縁・芯・流星の線・内側の細い輪・白い針)と記号の大きさ。
 * 'A'=画面の上で今の太さのまま/'B'=s を掛ける(採用・画面で 1px を下回る所は PROJ_TELE_LINE_MIN_PX で止めて薄くする=§3-6g3)/'C'=√s を掛ける。ここ1か所で切り替わる。
 */
export const PROJ_TELE_LINE_MODE: 'A' | 'B' | 'C' = 'B';

/** 線の太さ(または記号の大きさ)に掛ける倍率(★#23)。s=その点の立っている絵の倍率。 */
export const projTeleLineScale = (s: number, mode: 'A' | 'B' | 'C' = PROJ_TELE_LINE_MODE): number =>
  mode === 'A' ? 1 : mode === 'B' ? Math.max(0, s) : Math.sqrt(Math.max(0, s));

/**
 * 線の太さの下限(ズーム後の画面px・社長裁定 2026-11-23=1px・§3-6g3)。太さが判定を表さない線と記号は、画面で 1px を下回らない。
 * 下限に当たった所は、細くする代わりに濃さを落とす(projTeleLineAlpha)。0=下限なし。
 */
export const PROJ_TELE_LINE_MIN_PX = 1;
/** 下限に当たった所の濃さの掛け率の下限(叩き台 0.35)。 */
export const PROJ_TELE_LINE_MIN_ALPHA = 0.35;

/**
 * 下限に当たった所の濃さの掛け率: 本来の太さ truePx(ズーム後の画面px)が minPx 以上なら 1(濃さを変えない)、
 * 下回れば truePx/minPx(下限 floor)。=「細くする代わりに薄くする」(線の画素の総量がおおよそ保たれる)。
 */
export const projTeleLineAlpha = (
  truePx: number, minPx: number = PROJ_TELE_LINE_MIN_PX, floor: number = PROJ_TELE_LINE_MIN_ALPHA,
): number => (!(minPx > 0) || truePx >= minPx ? 1 : Math.max(floor, Math.min(1, Math.max(0, truePx) / minPx)));

/** 線の帯の濃さを塗りの命令ごとにまとめる刻み(0.1 刻み・1 は 1 のまま・floor を下回らない)。 */
export const projTeleAlphaBucket = (a: number, floor: number = PROJ_TELE_LINE_MIN_ALPHA): number =>
  a >= 1 ? 1 : Math.max(floor, Math.min(1, Math.round(a * 10) / 10));

/**
 * 記号(中心だけ投影する輝点・終点の輪・潰れた楕円の印)の大きさの下限: 記号の短い方の直径 minDiamDisp(表示座標=k 掛け後)が
 * 画面で minPx を下回るなら、形の比を保って短い方を minPx に広げる倍率 grow と、濃さの掛け率 alpha を返す。下回らなければ {1, 1}。
 */
export const projGlyphMinSize = (
  minDiamDisp: number, z: number, minPx: number = PROJ_TELE_LINE_MIN_PX, floor: number = PROJ_TELE_LINE_MIN_ALPHA,
): { grow: number; alpha: number } => {
  const zz = z > 0 ? z : 1;
  const px = Math.max(0, minDiamDisp) * zz;
  if (!(minPx > 0) || px >= minPx) return { grow: 1, alpha: 1 };
  return { grow: px > 1e-9 ? minPx / px : 1, alpha: projTeleLineAlpha(px, minPx, floor) };
};

/**
 * 記号の縁の線(終点の輪・楕円の印の縁)の幅と濃さの掛け率(監査 A-1): 幅 width(s=1 の world)に記号と同じ倍率 k(★#23=s)を掛け、
 * その幅が画面で minPx を下回るなら minPx に止める。濃さは中心のフェード a × min(直径の下限の掛け率 diamAlpha, 線幅の下限の掛け率)
 * =下げは強い方の1回だけ(二重に薄くしない)。
 */
export const projGlyphStrokeLook = (
  width: number, a: number, k: number, z: number, diamAlpha = 1,
): { width: number; alpha: number } => {
  const w = Math.max(0, width) * Math.max(0, k);
  const m = projGlyphMinSize(w, z);
  return { width: w * m.grow, alpha: a * Math.min(diamAlpha, m.alpha) };
};

/** 分ける規則の目安(ズーム後の画面px・§3-6b)。 */
export const PROJ_SHAPE_TOL_PX = 0.5;
/** 2分の深さの上限。 */
export const PROJ_SHAPE_MAX_DEPTH = 5;
/** 画面に掛かるかの余白(ズーム後の画面px)。 */
export const PROJ_SHAPE_SCREEN_PAD = 16;

/** 円の底の辺の数 = clamp(ceil(2πr/200), 24, 160)(§3-6b)。 */
export const projCircleBaseEdges = (r: number): number =>
  Math.max(24, Math.min(160, Math.ceil((2 * Math.PI * Math.max(0, r)) / 200)));

// ---------------------------------------------------------------------------------------------
// 出力の入れ物(作り置き・毎フレームの確保を増やさない)
// ---------------------------------------------------------------------------------------------

/**
 * 投影した頂点列(表示座標)。複数の輪郭(contour)を持てる: 輪郭 c の頂点は [cs[c], cs[c+1]) (最後は n まで)。
 * 入れた world 点の Y の範囲(wyMin/wyMax・予告の濃さ 3-6f が読む)と、投影した点の数(計器)を持つ。
 */
export class ProjPathOut {
  xy: number[] = [];
  /** 頂点の数。 */
  n = 0;
  /** 輪郭の始まりの頂点の添字。 */
  cs: number[] = [];
  cn = 0;
  /** 投影した点の数(中点の試しを含む・計器の「点の数」)。 */
  pts = 0;
  wyMin = Infinity;
  wyMax = -Infinity;
  /** 頂点ごとの s(xy と同じ添字・線を頂点ごとの太さの帯で描く時に読む)。 */
  ss: number[] = [];
  /** 頂点の s の最大と最小(線の太さ・記号の大きさ用)。 */
  sMin = Infinity;
  sMax = -Infinity;
  /** 頂点の定義域と描く距離のフェードの最大(全部 0 なら描かない側の判断に使える)。 */
  aMax = 0;
  /** 線の帯(projStrokeStripInto)の頂点ごとの濃さの掛け率(線の下限に当たった所 <1)と、その最小。帯以外では使わない。 */
  la: number[] = [];
  laMin = 1;
  reset(): this {
    this.n = 0; this.cn = 0; this.pts = 0;
    this.wyMin = Infinity; this.wyMax = -Infinity; this.sMin = Infinity; this.sMax = -Infinity; this.aMax = 0; this.laMin = 1;
    return this;
  }
  beginContour(): void {
    this.cs[this.cn++] = this.n;
  }
  push(x: number, y: number): void {
    const k = this.n * 2;
    this.xy[k] = x; this.xy[k + 1] = y;
    this.n++;
  }
  /** 輪郭 c の頂点の範囲 [start, end)。 */
  contourStart(c: number): number { return this.cs[c]; }
  contourEnd(c: number): number { return c + 1 < this.cn ? this.cs[c + 1] : this.n; }
  noteWorldY(wy: number): void {
    if (wy < this.wyMin) this.wyMin = wy;
    if (wy > this.wyMax) this.wyMax = wy;
  }
}

/** 1点の投影の結果(作り置き)。 */
interface P2 { x: number; y: number; s: number; a: number; sx: number; sy: number; l?: number }
const mkP2 = (): P2 => ({ x: 0, y: 0, s: 1, a: 1, sx: 0, sy: 0, l: 0 });

/**
 * world 点 → 表示座標(地平線より北は ℓ=0 に寄せる)。sx/sy はズーム後の画面px。
 * out.a = 定義域と描く距離のフェード(地平線より北で 0)。
 */
export const projVertexInto = (f: ProjFrame, wx: number, wy: number, out: { x: number; y: number; s: number; a: number; sx: number; sy: number; l?: number }) => {
  let l = projLocalYOfWorld(f, wy);
  out.l = l;
  const inDomain = l >= 0;
  if (!inDomain) l = 0;
  const s = projScaleAtLocal(f, l);
  out.x = f.cxw + s * (wx - f.cxw);
  out.y = f.camY + f.farH + l;
  out.s = s;
  out.a = inDomain ? projDistanceFade(f.farRefY - wy, f.farStart, f.farEnd) : 0;
  out.sx = f.wgX + f.wgScale * (out.x - f.camX + f.shakeX);
  out.sy = f.wgY + f.wgScale * (out.y - f.camY + f.shakeY);
  return out;
};

/** 3点の画面の箱が画面(+pad)に掛かるか。 */
const segOnScreen = (f: ProjFrame, a: P2, b: P2, m: P2, pad: number): boolean => {
  const minX = Math.min(a.sx, b.sx, m.sx), maxX = Math.max(a.sx, b.sx, m.sx);
  const minY = Math.min(a.sy, b.sy, m.sy), maxY = Math.max(a.sy, b.sy, m.sy);
  return maxX >= -pad && minX <= f.screenW + pad && maxY >= -pad && minY <= f.screenH + pad;
};

// ---- 曲線の記述(作り置き・閉包を毎フレーム作らない) ----
// kind 0=線分(ax,ay)→(bx,by)・t∈[0,1] / 1=楕円の弧(cx,cy,rx,ry,rot)・t=角
interface Curve { kind: 0 | 1; ax: number; ay: number; bx: number; by: number; cx: number; cy: number; rx: number; ry: number; cr: number; sr: number }
const mkCurve = (): Curve => ({ kind: 0, ax: 0, ay: 0, bx: 0, by: 0, cx: 0, cy: 0, rx: 0, ry: 0, cr: 1, sr: 0 });
const evalCurve = (c: Curve, t: number, o: { x: number; y: number }) => {
  if (c.kind === 0) { o.x = c.ax + (c.bx - c.ax) * t; o.y = c.ay + (c.by - c.ay) * t; return o; }
  const ex = c.rx * Math.cos(t), ey = c.ry * Math.sin(t);
  o.x = c.cx + ex * c.cr - ey * c.sr; o.y = c.cy + ex * c.sr + ey * c.cr;
  return o;
};

// 再帰の作り置き(深さ5まで=各深さに中点を1つ)。
const STACK_M: P2[] = Array.from({ length: PROJ_SHAPE_MAX_DEPTH + 6 }, mkP2);
const W_TMP = { x: 0, y: 0 };
const CURVE = mkCurve();
const PA = mkP2(), PB = mkP2();

const noteVertex = (out: ProjPathOut, p: P2) => {
  out.ss[out.n - 1] = p.s;
  if (p.s < out.sMin) out.sMin = p.s;
  if (p.s > out.sMax) out.sMax = p.s;
  if (p.a > out.aMax) out.aMax = p.a;
};

/** 地平線を跨ぐ辺の跨ぐ点の t(二分で 14 回)。northA=始点が北(ℓ<0)。 */
const horizonT = (f: ProjFrame, c: Curve, t0: number, t1: number, northA: boolean): number => {
  let lo = t0, hi = t1;
  for (let k = 0; k < 14; k++) {
    const mid = 0.5 * (lo + hi);
    const w = evalCurve(c, mid, W_TMP);
    const north = projLocalYOfWorld(f, w.y) < 0;
    if (north === northA) lo = mid; else hi = mid;
  }
  return northA ? hi : lo;
};
/** 地平線を跨ぐ辺だけに許す深さの上乗せ(跨ぐ点で割った後の両側も誤差で分けられるように)。 */
const HORIZON_EXTRA_DEPTH = 3;
/** 跨ぐとみなす ℓ の幅(跨ぐ点で割った後の端を、もう一度跨ぐと数えない)。 */
const HORIZON_EPS_L = 0.05;

/**
 * 曲線 c の [t0, t1] を、端 a(t0)・b(t1) を投影済みで受け、必要なら2分して out へ **a を除き b まで** の頂点を足す
 * (b は呼び出し側が最後の辺でなければ次の辺の a になる)。
 */
const subdivide = (
  f: ProjFrame, c: Curve, t0: number, t1: number, a: P2, b: P2, tolPx: number, depth: number, out: ProjPathOut, emitB: boolean,
): void => {
  if (depth < PROJ_SHAPE_MAX_DEPTH + HORIZON_EXTRA_DEPTH) {
    // 地平線を跨ぐ辺: 跨ぐ点で必ず分ける(北の頂点は ℓ=0 に寄るので、そこに折れ目がある)。
    let tm = 0.5 * (t0 + t1);
    const la = a.l ?? 0, lb = b.l ?? 0;
    const crosses = (la < -HORIZON_EPS_L && lb > HORIZON_EPS_L) || (lb < -HORIZON_EPS_L && la > HORIZON_EPS_L);
    if (!crosses && depth >= PROJ_SHAPE_MAX_DEPTH) { if (emitB) { out.push(b.x, b.y); noteVertex(out, b); } return; }
    if (crosses) tm = horizonT(f, c, t0, t1, la < 0);
    const m = STACK_M[depth];
    const w = evalCurve(c, tm, W_TMP);
    projVertexInto(f, w.x, w.y, m);
    out.pts++;
    out.noteWorldY(w.y);
    const ex = m.sx - 0.5 * (a.sx + b.sx), ey = m.sy - 0.5 * (a.sy + b.sy);
    const onScr = segOnScreen(f, a, b, m, PROJ_SHAPE_SCREEN_PAD);
    if (onScr && (crosses || ex * ex + ey * ey > tolPx * tolPx)) {
      // m を保存(下の再帰が STACK_M[depth+1..] を使うので depth の m は壊れない)
      subdivide(f, c, t0, tm, a, m, tolPx, depth + 1, out, true);
      subdivide(f, c, tm, t1, m, b, tolPx, depth + 1, out, emitB);
      return;
    }
  }
  if (emitB) { out.push(b.x, b.y); noteVertex(out, b); }
};

const copyP2 = (d: P2, s: P2) => { d.x = s.x; d.y = s.y; d.s = s.s; d.a = s.a; d.sx = s.sx; d.sy = s.sy; d.l = s.l; return d; };

/**
 * 曲線 c を t の列 ts[0..k](底の分け方)で、誤差で2分しながら out の今の輪郭へ足す。
 * closed=true なら最後の点(=最初の点)は足さない。
 */
const emitCurve = (f: ProjFrame, c: Curve, t0: number, t1: number, baseN: number, closed: boolean, tolPx: number, out: ProjPathOut) => {
  const n = Math.max(1, Math.floor(baseN));
  let w = evalCurve(c, t0, W_TMP);
  projVertexInto(f, w.x, w.y, PA);
  out.pts++; out.noteWorldY(w.y);
  out.push(PA.x, PA.y); noteVertex(out, PA);
  for (let i = 1; i <= n; i++) {
    const ti = t0 + ((t1 - t0) * i) / n;
    w = evalCurve(c, ti, W_TMP);
    projVertexInto(f, w.x, w.y, PB);
    out.pts++; out.noteWorldY(w.y);
    const ta = t0 + ((t1 - t0) * (i - 1)) / n;
    subdivide(f, c, ta, ti, PA, PB, tolPx, 0, out, !(closed && i === n));
    copyP2(PA, PB);
  }
};

const tolOf = (tolPx: number) => (tolPx > 0 ? tolPx : PROJ_SHAPE_TOL_PX);

// ---------------------------------------------------------------------------------------------
// 形の純関数(§3-6b の表)
// ---------------------------------------------------------------------------------------------

/**
 * world の折れ線/多角形(flat の [x0,y0,x1,y1,…])→ 表示座標の頂点列(1輪郭)。
 * closed=true なら最後の頂点から最初の頂点へ戻る辺も分ける(最初の点は繰り返さない)。
 */
export const projPathInto = (f: ProjFrame, wpts: ArrayLike<number>, closed: boolean, tolPx: number, out: ProjPathOut): ProjPathOut => {
  const k = Math.floor(wpts.length / 2);
  if (k <= 0) return out;
  out.beginContour();
  const tol = tolOf(tolPx);
  projVertexInto(f, wpts[0], wpts[1], PA);
  out.pts++; out.noteWorldY(wpts[1]);
  out.push(PA.x, PA.y); noteVertex(out, PA);
  const edges = closed ? k : k - 1;
  for (let i = 0; i < edges; i++) {
    const j = (i + 1) % k;
    const ax = wpts[i * 2], ay = wpts[i * 2 + 1], bx = wpts[j * 2], by = wpts[j * 2 + 1];
    projVertexInto(f, bx, by, PB);
    out.pts++; out.noteWorldY(by);
    CURVE.kind = 0; CURVE.ax = ax; CURVE.ay = ay; CURVE.bx = bx; CURVE.by = by;
    // PA は i の点(前の辺の終点)。閉じた多角形の最後の辺は終点(=最初の点)を足さない。
    subdivide(f, CURVE, 0, 1, PA, PB, tol, 0, out, !(closed && i === edges - 1));
    copyP2(PA, PB);
  }
  return out;
};

/** 円の周(1輪郭・閉じた多角形)。 */
export const projCircleInto = (f: ProjFrame, cx: number, cy: number, r: number, tolPx: number, out: ProjPathOut): ProjPathOut =>
  projEllipseInto(f, cx, cy, r, r, 0, tolPx, out);

/** 楕円の周(rx・ry・回転 rot)。1輪郭・閉じた多角形。 */
export const projEllipseInto = (
  f: ProjFrame, cx: number, cy: number, rx: number, ry: number, rot: number, tolPx: number, out: ProjPathOut,
): ProjPathOut => {
  out.beginContour();
  CURVE.kind = 1; CURVE.cx = cx; CURVE.cy = cy; CURVE.rx = Math.max(0, rx); CURVE.ry = Math.max(0, ry);
  CURVE.cr = Math.cos(rot); CURVE.sr = Math.sin(rot);
  emitCurve(f, CURVE, 0, Math.PI * 2, projCircleBaseEdges(Math.max(rx, ry)), true, tolOf(tolPx), out);
  return out;
};

/** 弧(開いた折れ線・a0→a1)。底の辺の数は角の範囲に比例。 */
export const projArcInto = (
  f: ProjFrame, cx: number, cy: number, r: number, a0: number, a1: number, tolPx: number, out: ProjPathOut,
): ProjPathOut => {
  out.beginContour();
  CURVE.kind = 1; CURVE.cx = cx; CURVE.cy = cy; CURVE.rx = Math.max(0, r); CURVE.ry = Math.max(0, r); CURVE.cr = 1; CURVE.sr = 0;
  const frac = Math.min(1, Math.abs(a1 - a0) / (Math.PI * 2));
  emitCurve(f, CURVE, a0, a1, Math.max(2, Math.ceil(projCircleBaseEdges(r) * frac)), false, tolOf(tolPx), out);
  return out;
};

/** 扇(中心+弧・1輪郭・閉じた多角形)。 */
export const projSectorInto = (
  f: ProjFrame, cx: number, cy: number, r: number, a0: number, a1: number, tolPx: number, out: ProjPathOut,
): ProjPathOut => {
  // 中心 → 弧の始点 → 弧 → 終点 → 中心。弧の部分は projArcInto と同じ分け方、2本の半径は直線の分け方。
  const tol = tolOf(tolPx);
  out.beginContour();
  projVertexInto(f, cx, cy, PA);
  out.pts++; out.noteWorldY(cy);
  out.push(PA.x, PA.y); noteVertex(out, PA);
  // 半径1(中心→始点)
  const sx0 = cx + Math.cos(a0) * r, sy0 = cy + Math.sin(a0) * r;
  projVertexInto(f, sx0, sy0, PB); out.pts++; out.noteWorldY(sy0);
  CURVE.kind = 0; CURVE.ax = cx; CURVE.ay = cy; CURVE.bx = sx0; CURVE.by = sy0;
  subdivide(f, CURVE, 0, 1, PA, PB, tol, 0, out, true);
  // 弧(始点は足し済み)
  copyP2(PA, PB);
  CURVE.kind = 1; CURVE.cx = cx; CURVE.cy = cy; CURVE.rx = Math.max(0, r); CURVE.ry = Math.max(0, r); CURVE.cr = 1; CURVE.sr = 0;
  const frac = Math.min(1, Math.abs(a1 - a0) / (Math.PI * 2));
  const n = Math.max(2, Math.ceil(projCircleBaseEdges(r) * frac));
  for (let i = 1; i <= n; i++) {
    const ti = a0 + ((a1 - a0) * i) / n, ta = a0 + ((a1 - a0) * (i - 1)) / n;
    const w = evalCurve(CURVE, ti, W_TMP);
    projVertexInto(f, w.x, w.y, PB); out.pts++; out.noteWorldY(w.y);
    subdivide(f, CURVE, ta, ti, PA, PB, tol, 0, out, true);
    copyP2(PA, PB);
  }
  // 半径2(終点→中心・中心は最初の点なので足さない)
  const ex1 = cx + Math.cos(a1) * r, ey1 = cy + Math.sin(a1) * r;
  projVertexInto(f, cx, cy, PB); out.pts++;
  CURVE.kind = 0; CURVE.ax = ex1; CURVE.ay = ey1; CURVE.bx = cx; CURVE.by = cy;
  subdivide(f, CURVE, 0, 1, PA, PB, tol, 0, out, false);
  return out;
};

// 環の角の並び(外周で1回だけ決める・内周は同じ角)
const ANG: number[] = [];

// 環の角の並び: 外周だけでなく内周(と中間)の円でも誤差を測り、どれかが超えたら2分する
// (内周は外周と投影の歪み方が違う=外周の角だけでは南で内周の弦が 1px を超えることがある)。
const RADS: number[] = [0, 0, 0];
let radN = 0;
const ANG_A: P2[] = [mkP2(), mkP2(), mkP2()];
const ANG_B: P2[] = [mkP2(), mkP2(), mkP2()];
const ANG_STACK: P2[][] = Array.from({ length: PROJ_SHAPE_MAX_DEPTH + 6 }, () => [mkP2(), mkP2(), mkP2()]);
let angN = 0;
const angRec = (f: ProjFrame, cx: number, cy: number, ta: number, tb: number, a: P2[], b: P2[], depth: number, tol: number): void => {
  let crosses = false;
  for (let q = 0; q < radN; q++) {
    const la = a[q].l ?? 0, lb = b[q].l ?? 0;
    if ((la < -HORIZON_EPS_L && lb > HORIZON_EPS_L) || (lb < -HORIZON_EPS_L && la > HORIZON_EPS_L)) crosses = true;
  }
  if (depth < PROJ_SHAPE_MAX_DEPTH || (crosses && depth < PROJ_SHAPE_MAX_DEPTH + HORIZON_EXTRA_DEPTH)) {
    const tm = 0.5 * (ta + tb);
    const m = ANG_STACK[depth]; // 深い再帰は depth+1 以降を使う=m は壊れない
    let split = crosses; // 地平線を跨ぐ(北の頂点は ℓ=0 に寄る=折れ目がある)
    for (let q = 0; q < radN; q++) {
      const r = RADS[q];
      projVertexInto(f, cx + Math.cos(tm) * r, cy + Math.sin(tm) * r, m[q]);
      const ex = m[q].sx - 0.5 * (a[q].sx + b[q].sx), ey = m[q].sy - 0.5 * (a[q].sy + b[q].sy);
      if (ex * ex + ey * ey > tol * tol && segOnScreen(f, a[q], b[q], m[q], PROJ_SHAPE_SCREEN_PAD)) split = true;
    }
    if (split && crosses && !segOnScreen(f, a[0], b[0], m[0], PROJ_SHAPE_SCREEN_PAD)) split = false;
    if (split) {
      angRec(f, cx, cy, ta, tm, a, m, depth + 1, tol);
      angRec(f, cx, cy, tm, tb, m, b, depth + 1, tol);
      return;
    }
  }
  ANG[angN++] = tb;
};

/** 円 r(と内周 rIn)の角 a0→a1 を誤差で分けた角の列を ANG へ書き、数を返す(最初の角 a0 と最後の角 a1 を含む)。 */
const annulusAngles = (f: ProjFrame, cx: number, cy: number, r: number, a0: number, a1: number, tol: number, rIn = -1): number => {
  angN = 0;
  radN = 0;
  RADS[radN++] = r;
  if (rIn > 0 && rIn < r) { RADS[radN++] = rIn; RADS[radN++] = 0.5 * (r + rIn); }
  const frac = Math.min(1, Math.abs(a1 - a0) / (Math.PI * 2));
  const base = Math.max(2, Math.ceil(projCircleBaseEdges(r) * frac));
  ANG[angN++] = a0;
  for (let q = 0; q < radN; q++) projVertexInto(f, cx + Math.cos(a0) * RADS[q], cy + Math.sin(a0) * RADS[q], ANG_A[q]);
  for (let i = 1; i <= base; i++) {
    const tb = a0 + ((a1 - a0) * i) / base, ta = a0 + ((a1 - a0) * (i - 1)) / base;
    for (let q = 0; q < radN; q++) projVertexInto(f, cx + Math.cos(tb) * RADS[q], cy + Math.sin(tb) * RADS[q], ANG_B[q]);
    angRec(f, cx, cy, ta, tb, ANG_A, ANG_B, 0, tol);
    for (let q = 0; q < radN; q++) copyP2(ANG_A[q], ANG_B[q]);
  }
  return angN;
};

/** 角の列 ANG[i0..i1] の環状の扇を1輪郭(外周 i0→i1・内周 i1→i0)で out へ。 */
const emitAnnularPiece = (f: ProjFrame, cx: number, cy: number, r0: number, r1: number, i0: number, i1: number, out: ProjPathOut) => {
  out.beginContour();
  const p = PA;
  for (let i = i0; i <= i1; i++) {
    const a = ANG[i];
    const wy = cy + Math.sin(a) * r1;
    projVertexInto(f, cx + Math.cos(a) * r1, wy, p); out.pts++; out.noteWorldY(wy);
    out.push(p.x, p.y); noteVertex(out, p);
  }
  if (r0 > 0) {
    for (let i = i1; i >= i0; i--) {
      const a = ANG[i];
      const wy = cy + Math.sin(a) * r0;
      projVertexInto(f, cx + Math.cos(a) * r0, wy, p); out.pts++; out.noteWorldY(wy);
      out.push(p.x, p.y); noteVertex(out, p);
    }
  } else {
    projVertexInto(f, cx, cy, p); out.pts++; out.noteWorldY(cy);
    out.push(p.x, p.y); noteVertex(out, p);
  }
};

/**
 * 環・環状の扇(塗り用)。外周の角の並びを1回だけ決め、内周は同じ角で作る(何重でも角の並びが揃う=継ぎ目が出ない)。
 * 角を省くと全周。全周は2つの半分の輪郭に分けて出す(1つの輪郭に穴を開けない=塗りの三角分割が単純な多角形で済む)。
 * angleR を渡すとその半径で角の並びを決める(同心の環を何本も描く時に、一番外の半径で1回だけ決めて共有する)。
 */
export const projAnnulusInto = (
  f: ProjFrame, cx: number, cy: number, r0: number, r1: number, a0: number | undefined, a1: number | undefined,
  tolPx: number, out: ProjPathOut, angleR?: number,
): ProjPathOut => {
  const tol = tolOf(tolPx);
  const full = a0 === undefined || a1 === undefined;
  const s = full ? 0 : a0!, e = full ? Math.PI * 2 : a1!;
  const ri = Math.max(0, Math.min(r0, r1)), ro = Math.max(r0, r1);
  const n = annulusAngles(f, cx, cy, Math.max(ro, angleR ?? 0), s, e, tol, ri);
  if (full) {
    const half = Math.max(1, Math.floor((n - 1) / 2));
    emitAnnularPiece(f, cx, cy, ri, ro, 0, half, out);
    emitAnnularPiece(f, cx, cy, ri, ro, half, n - 1, out);
  } else {
    emitAnnularPiece(f, cx, cy, ri, ro, 0, n - 1, out);
  }
  return out;
};

/** 同心の環を何本も描く時の角の並びを先に決める(projAnnulusRingInto と組で使う)。数を返す。 */
export const projAnnulusAnglesFor = (
  f: ProjFrame, cx: number, cy: number, r: number, a0: number | undefined, a1: number | undefined, tolPx: number, rIn = -1,
): number => annulusAngles(f, cx, cy, r, a0 ?? 0, a1 ?? Math.PI * 2, tolOf(tolPx), rIn);

/** projAnnulusAnglesFor で決めた角の並び(数 n)で、環 [r0, r1] を out へ(全周なら2つの半分)。 */
export const projAnnulusRingInto = (
  f: ProjFrame, cx: number, cy: number, r0: number, r1: number, n: number, full: boolean, out: ProjPathOut,
): ProjPathOut => {
  const ri = Math.max(0, Math.min(r0, r1)), ro = Math.max(r0, r1);
  if (full) {
    const half = Math.max(1, Math.floor((n - 1) / 2));
    emitAnnularPiece(f, cx, cy, ri, ro, 0, half, out);
    emitAnnularPiece(f, cx, cy, ri, ro, half, n - 1, out);
  } else {
    emitAnnularPiece(f, cx, cy, ri, ro, 0, n - 1, out);
  }
  return out;
};

/**
 * 帯の1スライス(今の drawSweepBand の四角と同じ式の4隅)。s0〜s1 は帯の割合、capBack/capFront は端のキャップ(hw ぶん伸ばす)。
 * 4つの辺を誤差で分ける(1輪郭・閉じた多角形)。s0=0・s1=1・両キャップ=今の「判定のカプセルを囲む四角」。
 */
export const projQuadStripInto = (
  f: ProjFrame, fx: number, fy: number, tx: number, ty: number, hw: number, s0: number, s1: number,
  capBack: boolean, capFront: boolean, tolPx: number, out: ProjPathOut,
): ProjPathOut => {
  const ddx = tx - fx, ddy = ty - fy;
  const ddl = Math.hypot(ddx, ddy) || 1;
  const ux = ddx / ddl, uy = ddy / ddl;
  const nx = -uy, ny = ux;
  const bc = capBack ? hw : 0, fc = capFront ? hw : 0;
  const ax = fx + ddx * s0, ay = fy + ddy * s0;
  const bx = fx + ddx * s1, by = fy + ddy * s1;
  QUAD[0] = ax - ux * bc + nx * hw; QUAD[1] = ay - uy * bc + ny * hw;
  QUAD[2] = bx + ux * fc + nx * hw; QUAD[3] = by + uy * fc + ny * hw;
  QUAD[4] = bx + ux * fc - nx * hw; QUAD[5] = by + uy * fc - ny * hw;
  QUAD[6] = ax - ux * bc - nx * hw; QUAD[7] = ay - uy * bc - ny * hw;
  return projPathInto(f, QUAD, true, tolPx, out);
};
const QUAD: number[] = [0, 0, 0, 0, 0, 0, 0, 0];

/**
 * 矩形の窓の1枠(矩形 rect を r0 と r1 だけ広げた2つの矩形の間)。4つの台形の輪郭で出す(穴を開けない)。
 */
export const projRectFrameInto = (
  f: ProjFrame, rect: { x: number; y: number; w: number; h: number }, r0: number, r1: number, tolPx: number, out: ProjPathOut,
): ProjPathOut => {
  const ri = Math.max(0, Math.min(r0, r1)), ro = Math.max(r0, r1);
  const ox0 = rect.x - ro, oy0 = rect.y - ro, ox1 = rect.x + rect.w + ro, oy1 = rect.y + rect.h + ro;
  const ix0 = rect.x - ri, iy0 = rect.y - ri, ix1 = rect.x + rect.w + ri, iy1 = rect.y + rect.h + ri;
  const piece = (a: number, b: number, c: number, d: number, e: number, g: number, h: number, k: number) => {
    QUAD[0] = a; QUAD[1] = b; QUAD[2] = c; QUAD[3] = d; QUAD[4] = e; QUAD[5] = g; QUAD[6] = h; QUAD[7] = k;
    projPathInto(f, QUAD, true, tolPx, out);
  };
  piece(ox0, oy0, ox1, oy0, ix1, iy0, ix0, iy0); // 上
  piece(ox1, oy0, ox1, oy1, ix1, iy1, ix1, iy0); // 右
  piece(ox1, oy1, ox0, oy1, ix0, iy1, ix1, iy1); // 下
  piece(ox0, oy1, ox0, oy0, ix0, iy0, ix0, iy1); // 左
  return out;
};

// ---------------------------------------------------------------------------------------------
// 焼き素材の格子メッシュ(§3-6b projGridInto)
// ---------------------------------------------------------------------------------------------

/** 世界に寝かせた四角(中心・幅・高さ・回転)。素材の (u,v)=(0,0) が四角の左上(回転前)。 */
/** sq=回してから縦(world の Y)を潰す倍率(床に寝た陣を見下ろし角ぶん潰す所・省略=1)。 */
export interface ProjFrame4 { cx: number; cy: number; w: number; h: number; rot: number; sq?: number }

/** 格子の頂点の上限(1辺)= 32 マス+1。メッシュはこの大きさで作り置く。 */
export const PROJ_GRID_MAX = 32;
export const PROJ_GRID_VERTS = (PROJ_GRID_MAX + 1) * (PROJ_GRID_MAX + 1);

/** 作り置きの格子メッシュの添字(33×33 頂点・32×32 マス・三角2枚ずつ)。 */
export const projGridIndices = (maxN: number = PROJ_GRID_MAX): Uint32Array => {
  const w = maxN + 1;
  const idx = new Uint32Array(maxN * maxN * 6);
  let k = 0;
  for (let j = 0; j < maxN; j++) {
    for (let i = 0; i < maxN; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = c;
      idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
  }
  return idx;
};

/** 格子の結果: 使った列と行の数(マス)・投影した点の数・world の Y の範囲。 */
export interface ProjGridResult { nx: number; ny: number; pts: number; wyMin: number; wyMax: number; sMax: number; aMax: number }

const GRID_U: number[] = [];
const GRID_V: number[] = [];
const GRID_L: number[] = [];
const GP = mkP2(), GA = mkP2(), GB = mkP2(), GC = mkP2(), GD = mkP2();

/** 四角の (u,v) → world 点。 */
const frameAt = (fr: ProjFrame4, u: number, v: number, cr: number, sr: number, o: { x: number; y: number }) => {
  const lx = (u - 0.5) * fr.w, ly = (v - 0.5) * fr.h;
  o.x = fr.cx + lx * cr - ly * sr; o.y = fr.cy + (lx * sr + ly * cr) * (fr.sq ?? 1);
  return o;
};

const CORNER_UV: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
const ROW_Y: number[] = [];
const ROW_E: number[] = [];
const ROW_T = [0.0625, 0.25, 0.5, 0.75, 0.9375];
const ROW_TMP: number[] = [];
const CORNER = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];

/**
 * 回転している四角の格子(作る物の9・画面に掛かる所だけ細かく切る): 行を **world の水平線(=投影の行 ℓ が一定)** に取り、
 * ℓ で等間隔(≤ rowPx)・画面(+16px)で切って外は1マスに潰す(回転していない四角と同じ規則)。四角の4隅の行も必ず行に入れる
 * (行と行の間の縁が1本の直線=縁が正しく写る)。各行は四角との交わりの線分で、列はその線分を画面の横で切って等間隔(≤ colPx)。
 * 同じ行の中では投影が x の1次式なので列は細かくしなくてよい。UV は頂点の world 点を四角の向きへ戻して出す(格子は UV で直交しない)。
 * 4隅が画面の外へ出ても(南の延長=数十px で数倍に膨らむ所)、画面に映る所の行・列が 32×32 の上限を食われない。
 */
const projGridRotatedInto = (
  f: ProjFrame, fr: ProjFrame4, rowPx: number, colPx: number, M: number,
  outPos: Float32Array, outUv: Float32Array, cr: number, sr: number, res: ProjGridResult,
): ProjGridResult => {
  const z = f.wgScale > 0 ? f.wgScale : 1;
  const hw = fr.w / 2, hh = fr.h / 2;
  const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let k = 0; k < 4; k++) {
    const lx = cs[k][0] * hw, ly = cs[k][1] * hh;
    CORNER[k].x = fr.cx + lx * cr - ly * sr; CORNER[k].y = fr.cy + (lx * sr + ly * cr) * (fr.sq ?? 1);
  }
  let yMin = Infinity, yMax = -Infinity;
  for (const c of CORNER) { if (c.y < yMin) yMin = c.y; if (c.y > yMax) yMax = c.y; }
  // 行(world Y): 端・4隅・画面の上下の切れ目・ℓ で等間隔
  const l0r = projLocalYOfWorld(f, yMin), l1r = projLocalYOfWorld(f, yMax);
  const l0 = Math.max(0, l0r), l1 = Math.max(0, l1r);
  const pad = PROJ_SHAPE_SCREEN_PAD / z;
  const lTop = (0 - f.wgY) / z - f.shakeY - f.farH - pad;
  const lBot = (f.screenH - f.wgY) / z - f.shakeY - f.farH + pad;
  const c0 = Math.max(l0, Math.min(l1, lTop)), c1 = Math.max(l0, Math.min(l1, lBot));
  const yOfL = (l: number) => (l <= 0 && l0r < 0 ? Math.max(yMin, projWorldYOfLocal(f, 0)) : projWorldYOfLocal(f, l));
  let nt = 0;
  ROW_TMP[nt++] = yMin; ROW_TMP[nt++] = yMax;
  // 隅の行: 画面(+16px)の行の範囲にある隅だけ(範囲の外の隅の行は、外の潰したマス=画面に映らない所に入る)
  for (const c of CORNER) { const lc = projLocalYOfWorld(f, c.y); if (lc > lTop && lc < lBot) ROW_TMP[nt++] = c.y; }
  if (c0 > l0) ROW_TMP[nt++] = yOfL(c0);
  if (c1 < l1) ROW_TMP[nt++] = yOfL(c1);
  // ℓ で等間隔の行は少しだけ(6まで)。残りは下の「行の間の誤差」で、曲がりの強い所(南)へ足す
  const want = Math.max(1, Math.ceil(((c1 - c0) * z) / Math.max(1, rowPx)));
  const ni = Math.max(1, Math.min(6, want));
  if (c1 > c0) for (let k = 0; k <= ni; k++) ROW_TMP[nt++] = yOfL(c0 + ((c1 - c0) * k) / ni);
  ROW_TMP.length = nt;
  ROW_TMP.sort((p, q) => p - q);
  let ny = 0;
  for (let k = 0; k < nt; k++) {
    const y = Math.max(yMin, Math.min(yMax, ROW_TMP[k]));
    if (ny === 0 || y > ROW_Y[ny - 1] + 1e-6) ROW_Y[ny++] = y;
  }
  // 行 y と四角の交わりの線分 [a, b](world x)
  const segAt = (y: number, o: { a: number; b: number }) => {
    let a = Infinity, b = -Infinity;
    for (let k = 0; k < 4; k++) {
      const p = CORNER[k], q = CORNER[(k + 1) & 3];
      const ylo = Math.min(p.y, q.y), yhi = Math.max(p.y, q.y);
      if (y < ylo - 1e-9 || y > yhi + 1e-9) continue;
      const x = yhi - ylo < 1e-9 ? (y === p.y ? p.x : q.x) : p.x + ((q.x - p.x) * (y - p.y)) / (q.y - p.y);
      if (yhi - ylo < 1e-9) { a = Math.min(a, p.x, q.x); b = Math.max(b, p.x, q.x); continue; }
      if (x < a) a = x;
      if (x > b) b = x;
    }
    if (!(b >= a)) { a = b = fr.cx; }
    o.a = a; o.b = b;
    return o;
  };
  while (ny > M + 1) { // 上限を超えたら、隅でも端でもない行を間引く(稀)
    let drop = -1;
    for (let k = 1; k < ny - 1; k++) { const y = ROW_Y[k]; if (!CORNER.some((c) => Math.abs(c.y - y) < 1e-6)) { drop = k; break; } }
    if (drop < 0) drop = 1;
    for (let k = drop; k < ny - 1; k++) ROW_Y[k] = ROW_Y[k + 1];
    ny--;
  }
  if (ny < 2) { ROW_Y[1] = ROW_Y[0]; ny = 2; }
  const SEG = { a: 0, b: 0 };
  const padPx = PROJ_SHAPE_SCREEN_PAD;
  // 行の上の world x → 画面 x は1次式: sx = A + B·x(B = wgScale·s)
  const xClip = (y: number, xa: number, xb: number, o: { a: number; b: number }) => {
    projVertexInto(f, f.cxw, y, GP);
    const B = z * GP.s, A = GP.sx - B * f.cxw;
    if (!(B > 0)) { o.a = xa; o.b = xb; return o; }
    const xl = (-padPx - A) / B, xr = (f.screenW + padPx - A) / B;
    o.a = Math.max(xa, Math.min(xb, xl)); o.b = Math.max(xa, Math.min(xb, xr));
    return o;
  };
  const CL = { a: 0, b: 0 };
  // 行の間の誤差で足す: 行の間の真ん中の行で、四角の縁(左右の端)と行の中央の点の投影が、上下の行の点の中点からずれる量が
  // tol を超える間を、ずれの大きい順に2分する(上限 M+1 行)。画面に掛からない間は測らない。
  const tol = PROJ_SHAPE_TOL_PX;
  const S1 = { a: 0, b: 0 }, S2 = { a: 0, b: 0 };
  const rowErr = (k: number): number => {
    const ya = ROW_Y[k], yb = ROW_Y[k + 1];
    if (yb - ya < 1e-3) return 0;
    const la = projLocalYOfWorld(f, ya), lb = projLocalYOfWorld(f, yb);
    if (lb <= lTop + 1e-6 || la >= lBot - 1e-6 || lb <= 0) return 0; // 画面(+16px)の外の間は測らない(外は潰す)
    // 列の線(上下の行の、画面の横で切った線分の同じ割合の点を結ぶ線=格子の縦の線)の真ん中で、投影と、上下の投影の中点の差
    // 切った線分の5点と、切る前の線分の5点(行の間で画面の横の端が曲がって、四角の端が行の間だけ画面へ入る所も拾う)
    let e = 0;
    // 加えて、マスの対角(上の行の割合 fq と下の行の fq+1/4 を結ぶ線=三角の辺)も測る(行の間が広い所で幅のあるマスが曲がる)
    segAt(ya, S1); xClip(ya, S1.a, S1.b, S1); segAt(yb, S2); xClip(yb, S2.a, S2.b, S2);
    for (let q = 0; q <= 8; q++) {
      const fq = q >= 5 ? (q - 5) / 4 : q / 4, fq2 = q >= 5 ? fq + 0.25 : fq;
      const xa = S1.a + (S1.b - S1.a) * fq, xb = S2.a + (S2.b - S2.a) * fq2;
      projVertexInto(f, xa, ya, GA); projVertexInto(f, xb, yb, GB);
      res.pts += 2;
      for (let tq = 0; tq < 5; tq++) {
        const t = ROW_T[tq];
        projVertexInto(f, xa + (xb - xa) * t, ya + (yb - ya) * t, GC);
        res.pts++;
        // 測るのは点が画面(余白なし)に映る時だけ
        if (GC.sx < 0 || GC.sx > f.screenW || GC.sy < 0 || GC.sy > f.screenH) continue;
        e = Math.max(e, Math.hypot(GC.sx - ((1 - t) * GA.sx + t * GB.sx), GC.sy - ((1 - t) * GA.sy + t * GB.sy)));
      }
    }
    return e;
  };
  for (let k = 0; k < ny - 1; k++) ROW_E[k] = rowErr(k);
  while (ny < M + 1) {
    let wk = -1, we = tol;
    for (let k = 0; k < ny - 1; k++) if (ROW_E[k] > we) { we = ROW_E[k]; wk = k; }
    if (wk < 0) break;
    for (let k = ny; k > wk + 1; k--) ROW_Y[k] = ROW_Y[k - 1];
    for (let k = ny - 1; k > wk + 1; k--) ROW_E[k] = ROW_E[k - 1];
    ROW_Y[wk + 1] = (ROW_Y[wk] + ROW_Y[wk + 2]) / 2;
    ny++;
    ROW_E[wk] = rowErr(wk); ROW_E[wk + 1] = rowErr(wk + 1);
  }
  // 列: どの行でも同じ「線分の割合」[fa, fb] に並べる(列の線=四角の中の world の直線=上下の行で同じ割合の点を結ぶ)。
  // [fa, fb] は画面に映る行の、画面の横で切った割合の和。外の割合 [0, fa]・[fb, 1] は1マスに潰す。数は画面に映る幅の最大 / colPx。
  let nx = 1, fa = 1, fb = 0;
  // 割合は行の上と、行の間(1/4・1/2・3/4)でも測る(行の間だけ画面へ入る所を落とさない)
  for (let jq = 0; jq < ny * 4 - 3; jq++) {
    const j0 = jq >> 2, tq = (jq & 3) / 4;
    const y = tq === 0 ? ROW_Y[j0] : ROW_Y[j0] + (ROW_Y[j0 + 1] - ROW_Y[j0]) * tq;
    const l = projLocalYOfWorld(f, y);
    if (l > lBot || l < lTop) continue;
    segAt(y, SEG); xClip(y, SEG.a, SEG.b, CL);
    if (!(CL.b > CL.a) || !(SEG.b > SEG.a)) continue;
    fa = Math.min(fa, (CL.a - SEG.a) / (SEG.b - SEG.a)); fb = Math.max(fb, (CL.b - SEG.a) / (SEG.b - SEG.a));
    projVertexInto(f, f.cxw, y, GP);
    nx = Math.max(nx, Math.ceil(((CL.b - CL.a) * GP.s * z) / Math.max(1, colPx)));
  }
  // 行と行の間だけ画面に入る所があるので、割合は少し広げる(1/16)
  if (fb > fa) { fa = Math.max(0, fa - 1 / 16); fb = Math.min(1, fb + 1 / 16); } else { fa = 0; fb = 1; }
  const lo = fa > 1e-6, hi = fb < 1 - 1e-6;
  nx = Math.max(1, Math.min(M, nx + (lo ? 1 : 0) + (hi ? 1 : 0)));
  const inner = Math.max(1, nx - (lo ? 1 : 0) - (hi ? 1 : 0));
  res.nx = nx; res.ny = ny - 1;
  // 頂点を書く
  const W = PROJ_GRID_MAX + 1;
  const invW = fr.w !== 0 ? 1 / fr.w : 0, invH = fr.h !== 0 ? 1 / fr.h : 0;
  for (let j = 0; j <= PROJ_GRID_MAX; j++) {
    const jj = Math.min(j, ny - 1);
    const y = ROW_Y[jj];
    segAt(y, SEG);
    for (let i = 0; i <= PROJ_GRID_MAX; i++) {
      const k = (j * W + i) * 2;
      if (j > ny - 1 || i > nx) {
        const src = (jj * W + Math.min(i, nx)) * 2;
        outPos[k] = outPos[src]; outPos[k + 1] = outPos[src + 1];
        outUv[k] = outUv[src]; outUv[k + 1] = outUv[src + 1];
        continue;
      }
      const ii = i - (lo ? 1 : 0);
      const fq = i === 0 ? 0 : i === nx ? 1 : ii <= 0 ? fa : ii >= inner ? fb : fa + ((fb - fa) * ii) / inner;
      const x = SEG.a + (SEG.b - SEG.a) * fq;
      projVertexInto(f, x, y, GP);
      res.pts++;
      if (y < res.wyMin) res.wyMin = y;
      if (y > res.wyMax) res.wyMax = y;
      if (GP.s > res.sMax) res.sMax = GP.s;
      if (GP.a > res.aMax) res.aMax = GP.a;
      outPos[k] = GP.x; outPos[k + 1] = GP.y;
      const dx = x - fr.cx, dy = (y - fr.cy) / (fr.sq ?? 1);
      outUv[k] = Math.max(0, Math.min(1, (dx * cr + dy * sr) * invW + 0.5));
      outUv[k + 1] = Math.max(0, Math.min(1, (-dx * sr + dy * cr) * invH + 0.5));
    }
  }
  return res;
};

/**
 * 焼き素材の絵(世界に寝かせた四角)の格子の頂点(表示座標)と UV を、33×33 の作り置きの配列へ書く。
 * - 回転していない四角: 行は投影後の ℓ で等間隔(≤ rowPx 画面px)、列は投影後の幅で等間隔(≤ colPx)。
 *   どちらも画面(+16px)で切り、外は1マスに潰す。
 * - 回転している四角: 格子の辺の中点のずれが tolPx 以下になるまで縦横を2分(上限 maxN)。
 * 使わない頂点(列・行の数が maxN より少ない時)は最後の列・行に潰す=添字は常に 33×33 のまま。
 */
export const projGridInto = (
  f: ProjFrame, fr: ProjFrame4, rowPx: number, colPx: number, maxN: number,
  outPos: Float32Array, outUv: Float32Array, tolPx: number = PROJ_SHAPE_TOL_PX,
): ProjGridResult => {
  const M = Math.max(1, Math.min(PROJ_GRID_MAX, Math.floor(maxN)));
  const z = f.wgScale > 0 ? f.wgScale : 1;
  const cr = Math.cos(fr.rot), sr = Math.sin(fr.rot);
  const res: ProjGridResult = { nx: 1, ny: 1, pts: 0, wyMin: Infinity, wyMax: -Infinity, sMax: 0, aMax: 0 };
  const rotated = Math.abs(sr) > 1e-6 || cr < 0;
  if (!rotated && fr.sq !== undefined && fr.sq !== 1) fr = { cx: fr.cx, cy: fr.cy, w: fr.w, h: fr.h * fr.sq, rot: 0 }; // 回っていない時の潰し=縦の短い四角
  if (!rotated) {
    // 行: ℓ で等間隔
    const y0 = fr.cy - fr.h / 2, y1 = fr.cy + fr.h / 2;
    const l0r = projLocalYOfWorld(f, y0), l1r = projLocalYOfWorld(f, y1);
    const l0 = Math.max(0, l0r), l1 = Math.max(0, l1r);
    const pad = PROJ_SHAPE_SCREEN_PAD / z;
    const lTop = (0 - f.wgY) / z - f.shakeY - f.farH - pad;
    const lBot = (f.screenH - f.wgY) / z - f.shakeY - f.farH + pad;
    const c0 = Math.max(l0, Math.min(l1, lTop)), c1 = Math.max(l0, Math.min(l1, lBot));
    const extra = (c0 > l0 ? 1 : 0) + (c1 < l1 ? 1 : 0);
    const want = Math.max(1, Math.ceil(((c1 - c0) * z) / Math.max(1, rowPx)));
    const ni = Math.max(1, Math.min(Math.max(1, M - extra), want));
    let nl = 0;
    GRID_L[nl++] = l0;
    if (c0 > l0) GRID_L[nl++] = c0;
    for (let k = 1; k <= ni; k++) GRID_L[nl++] = c0 + ((c1 - c0) * k) / ni;
    if (c1 < l1) GRID_L[nl++] = l1;
    // ℓ → v(v=0 は四角の北の端。地平線より北の部分は頂点の寄せで ℓ=0 に潰れる)
    let nv = 0;
    GRID_V[nv++] = 0;
    for (let k = 0; k < nl; k++) {
      const l = GRID_L[k];
      const v = l >= l1 && l1r >= 0 ? 1 : fr.h > 0 ? Math.max(0, Math.min(1, (projWorldYOfLocal(f, l) - y0) / fr.h)) : 1;
      if (v > GRID_V[nv - 1] + 1e-9 && nv <= M) GRID_V[nv++] = v;
    }
    if (GRID_V[nv - 1] < 1) { if (nv <= M) GRID_V[nv++] = 1; else GRID_V[nv - 1] = 1; }
    res.ny = nv - 1;
    // 列: 投影後の幅で等間隔(一番広い行=南の行の s で数える)
    const sMaxRow = projScaleAtLocal(f, Math.max(l0, l1));
    const nxWant = Math.max(1, Math.ceil((fr.w * sMaxRow * z) / Math.max(1, colPx)));
    res.nx = Math.max(1, Math.min(M, nxWant));
    for (let i = 0; i <= res.nx; i++) GRID_U[i] = i / res.nx;
  } else {
    // ★4隅のどれかが画面(+16px)の外=画面の外(南の延長・左右)へ掛かる四角は、行を world の水平線に取る格子へ(作る物の9)。
    const pad = PROJ_SHAPE_SCREEN_PAD;
    let allOn = true;
    for (const [qu, qv] of CORNER_UV) {
      const w = frameAt(fr, qu, qv, cr, sr, W_TMP); projVertexInto(f, w.x, w.y, GA); res.pts++;
      if (GA.sx < -pad || GA.sx > f.screenW + pad || GA.sy < -pad || GA.sy > f.screenH + pad) { allOn = false; break; }
    }
    if (!allOn) return projGridRotatedInto(f, fr, rowPx, colPx, M, outPos, outUv, cr, sr, res);
    // 回転: 縦横を誤差で2分。測る物=格子の辺の中点のずれ(u 向き・v 向き)と、マスの中心のずれ(三角2枚で描く=対角線の中点で補間される)。
    // 測るマスは端と中央の行・列だけ(全部のマスを測ると重い・ずれは場所でなめらかに変わる)。
    let nx = 1, ny = 1;
    const tol = tolOf(tolPx);
    const at = (u: number, v: number, o: P2) => { const w = frameAt(fr, u, v, cr, sr, W_TMP); projVertexInto(f, w.x, w.y, o); res.pts++; return o; };
    const cellErr = (i: number, j: number, o: { u: number; v: number; d: number }) => {
      const u0 = i / nx, u1 = (i + 1) / nx, v0 = j / ny, v1 = (j + 1) / ny;
      const a = at(u0, v0, GA), b = at(u1, v0, GB), c = at(u0, v1, GC), d = at(u1, v1, GD);
      if (!segOnScreen(f, a, d, b, PROJ_SHAPE_SCREEN_PAD) && !segOnScreen(f, a, d, c, PROJ_SHAPE_SCREEN_PAD)) return;
      const mu = at((u0 + u1) / 2, v0, GP);
      o.u = Math.max(o.u, Math.hypot(mu.sx - 0.5 * (a.sx + b.sx), mu.sy - 0.5 * (a.sy + b.sy)));
      const mv = at(u0, (v0 + v1) / 2, GP);
      o.v = Math.max(o.v, Math.hypot(mv.sx - 0.5 * (a.sx + c.sx), mv.sy - 0.5 * (a.sy + c.sy)));
      const mc = at((u0 + u1) / 2, (v0 + v1) / 2, GP);
      o.d = Math.max(o.d, Math.hypot(mc.sx - 0.5 * (b.sx + c.sx), mc.sy - 0.5 * (b.sy + c.sy)));
      // 下の辺・右の辺も(端の行・列で測る)
      const mu2 = at((u0 + u1) / 2, v1, GP);
      o.u = Math.max(o.u, Math.hypot(mu2.sx - 0.5 * (c.sx + d.sx), mu2.sy - 0.5 * (c.sy + d.sy)));
      const mv2 = at(u1, (v0 + v1) / 2, GP);
      o.v = Math.max(o.v, Math.hypot(mv2.sx - 0.5 * (b.sx + d.sx), mv2.sy - 0.5 * (b.sy + d.sy)));
    };
    const E = { u: 0, v: 0, d: 0 };
    for (let it = 0; it < 12; it++) {
      E.u = 0; E.v = 0; E.d = 0;
      const rows = ny <= 3 ? ny : 3, cols = nx <= 3 ? nx : 3;
      for (let rj = 0; rj < rows; rj++) {
        const j = ny <= 3 ? rj : rj === 0 ? 0 : rj === 1 ? ny >> 1 : ny - 1;
        for (let i = 0; i < nx; i++) cellErr(i, j, E);
      }
      for (let ci = 0; ci < cols; ci++) {
        const i = nx <= 3 ? ci : ci === 0 ? 0 : ci === 1 ? nx >> 1 : nx - 1;
        for (let j = 0; j < ny; j++) cellErr(i, j, E);
      }
      let grew = false;
      if (E.u > tol && nx < M) { nx = Math.min(M, nx * 2); grew = true; }
      if (E.v > tol && ny < M) { ny = Math.min(M, ny * 2); grew = true; }
      if (!grew && E.d > tol) {
        // 対角だけが超える: マスの画面での長い辺の向きを2分
        const a = at(0, 0, GA), b = at(1 / nx, 0, GB), c = at(0, 1 / ny, GC);
        const lu = Math.hypot(b.sx - a.sx, b.sy - a.sy), lv = Math.hypot(c.sx - a.sx, c.sy - a.sy);
        if (lu >= lv && nx < M) { nx = Math.min(M, nx * 2); grew = true; }
        else if (ny < M) { ny = Math.min(M, ny * 2); grew = true; }
        else if (nx < M) { nx = Math.min(M, nx * 2); grew = true; }
      }
      if (!grew) break;
    }
    res.nx = nx; res.ny = ny;
    for (let i = 0; i <= nx; i++) GRID_U[i] = i / nx;
    for (let j = 0; j <= ny; j++) GRID_V[j] = j / ny;
  }
  // 頂点を書く(33×33・使わない列/行は最後に潰す)
  const W = PROJ_GRID_MAX + 1;
  for (let j = 0; j <= PROJ_GRID_MAX; j++) {
    const v = GRID_V[Math.min(j, res.ny)];
    for (let i = 0; i <= PROJ_GRID_MAX; i++) {
      const k = (j * W + i) * 2;
      if (i <= res.nx && j <= res.ny) {
        const u = GRID_U[i];
        const wp = frameAt(fr, u, v, cr, sr, W_TMP);
        projVertexInto(f, wp.x, wp.y, GP);
        res.pts++;
        if (wp.y < res.wyMin) res.wyMin = wp.y;
        if (wp.y > res.wyMax) res.wyMax = wp.y;
        if (GP.s > res.sMax) res.sMax = GP.s;
        if (GP.a > res.aMax) res.aMax = GP.a;
        outPos[k] = GP.x; outPos[k + 1] = GP.y;
        outUv[k] = u; outUv[k + 1] = v;
      } else {
        const src = (Math.min(j, res.ny) * W + Math.min(i, res.nx)) * 2;
        outPos[k] = outPos[src]; outPos[k + 1] = outPos[src + 1];
        outUv[k] = outUv[src]; outUv[k + 1] = outUv[src + 1];
      }
    }
  }
  return res;
};

/**
 * 格子メッシュの1点の補間(テスト・計器用): 書いた格子(nx×ny)で (u,v) を双1次補間した表示座標。
 * 三角2枚の分け方(a,b,c / b,d,c)と同じ補間をする(描画と同じ)。
 */
export const projGridSample = (pos: Float32Array, uv: Float32Array, res: ProjGridResult, u: number, v: number): { x: number; y: number } => {
  // 格子は UV で直交するとは限らない(回転した四角は行が world の水平線)=三角を全部探して、(u,v) を含む三角の重心座標で補間する。
  const W = PROJ_GRID_MAX + 1;
  let best = { x: NaN, y: NaN }, bestOut = Infinity;
  const tri = (a: number, b: number, c: number) => {
    const ax = uv[a], ay = uv[a + 1], bx = uv[b], by = uv[b + 1], cx = uv[c], cy = uv[c + 1];
    const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(det) < 1e-12) return;
    const l1 = ((u - ax) * (cy - ay) - (cx - ax) * (v - ay)) / det;
    const l2 = ((bx - ax) * (v - ay) - (u - ax) * (by - ay)) / det;
    const l0 = 1 - l1 - l2;
    const out = Math.max(0, -l0, -l1, -l2);
    if (out < bestOut) {
      bestOut = out;
      best = { x: pos[a] * l0 + pos[b] * l1 + pos[c] * l2, y: pos[a + 1] * l0 + pos[b + 1] * l1 + pos[c + 1] * l2 };
    }
  };
  for (let j = 0; j < res.ny; j++) {
    for (let i = 0; i < res.nx; i++) {
      const a = (j * W + i) * 2, b = (j * W + i + 1) * 2, c = ((j + 1) * W + i) * 2, d = ((j + 1) * W + i + 1) * 2;
      tri(a, b, c); tri(b, d, c);
      if (bestOut === 0) return best;
    }
  }
  return best;
};

// ---------------------------------------------------------------------------------------------
// 線を頂点ごとの太さの帯で描く(★#23=B の本来の形・監査 A-1)
// ---------------------------------------------------------------------------------------------

/**
 * 線の太さに掛ける s の頭打ち = 画面(+余白 padPx・ズーム後の画面px)の下端の行の s。
 * 画面の外(南)へ表の外まで延長した頂点の s で、画面に映る線が太らないようにする。
 */
export const projLineScaleCap = (f: ProjFrame, padPx: number = PROJ_SHAPE_SCREEN_PAD): number => {
  const z = f.wgScale > 0 ? f.wgScale : 1;
  return projScaleAtLocal(f, Math.max(0, projScreenRowsL(f).bottom + padPx / z));
};

const STRIP_NX: number[] = [];
const STRIP_NY: number[] = [];
const STRIP_H: number[] = [];
const STRIP_A: number[] = [];

/**
 * src の線(輪郭ごと)を、頂点ごとの半幅を持つ帯(塗り用の多角形)にして out へ足す(監査 A-1)。
 * 頂点 i の半幅 = width/2 × projTeleLineScale(min(s_i, 画面の下端の行の s))。下限は minPx(ズーム後の画面px)。
 * 下限に当たった頂点は、本来の太さ/minPx の濃さの掛け率を out.la に書く(下限 PROJ_TELE_LINE_MIN_ALPHA・当たらない頂点は 1)。
 * 1本の線の中で奥は細く・手前は太くなる。開いた線は1輪郭(左の縁→右の縁を逆順)、閉じた線は2つの半分の輪郭
 * (projAnnulusInto と同じ=穴を開けない)。継ぎ目は頂点の留め(miter・角が鋭い所は 1/0.3 倍で頭打ち)。
 */
export const projStrokeStripInto = (
  f: ProjFrame, src: ProjPathOut, closed: boolean, width: number, out: ProjPathOut,
  mode: 'A' | 'B' | 'C' = PROJ_TELE_LINE_MODE, minPx: number = PROJ_TELE_LINE_MIN_PX, fxKMin = -1,
): ProjPathOut => {
  // fxKMin ≥ 0 = 段階3の線の規則(§3-7c): 太さ = 今の太さ × max(s, fxKMin)(判定に揃える線は 0・派手さは s_fx の下限)。
  // 画面で minPx を下回らない(今の太さが既に下限より細い時は今の太さまで=太らせない)・**濃さは落とさない**(la=1)。
  // 負(既定)=★#23=B の予告の線(下限に当たった所は薄くする)。
  const z = f.wgScale > 0 ? f.wgScale : 1;
  const cap = projLineScaleCap(f);
  const hMin = Math.max(0, minPx) / (2 * z);
  const hw = Math.max(0, width) / 2;
  out.pts += src.pts;
  if (src.wyMin < out.wyMin) out.wyMin = src.wyMin;
  if (src.wyMax > out.wyMax) out.wyMax = src.wyMax;
  if (src.aMax > out.aMax) out.aMax = src.aMax;
  for (let c = 0; c < src.cn; c++) {
    const s0 = src.contourStart(c), e0 = src.contourEnd(c);
    const m = e0 - s0;
    if (m < 2) continue;
    const wrap = closed && m >= 3;
    // 頂点ごとの留めの向き(左の法線)と半幅
    for (let k = 0; k < m; k++) {
      const i = s0 + k;
      const x = src.xy[i * 2], y = src.xy[i * 2 + 1];
      let pnx = 0, pny = 0, nnx = 0, nny = 0, hasP = false, hasN = false;
      const ip = k > 0 ? i - 1 : wrap ? e0 - 1 : -1;
      const inx = k < m - 1 ? i + 1 : wrap ? s0 : -1;
      if (ip >= 0) {
        const dx = x - src.xy[ip * 2], dy = y - src.xy[ip * 2 + 1], d = Math.hypot(dx, dy);
        if (d > 1e-9) { pnx = -dy / d; pny = dx / d; hasP = true; }
      }
      if (inx >= 0) {
        const dx = src.xy[inx * 2] - x, dy = src.xy[inx * 2 + 1] - y, d = Math.hypot(dx, dy);
        if (d > 1e-9) { nnx = -dy / d; nny = dx / d; hasN = true; }
      }
      if (!hasP) { pnx = nnx; pny = nny; }
      if (!hasN) { nnx = pnx; nny = pny; }
      let mx = pnx + nnx, my = pny + nny;
      const ml = Math.hypot(mx, my);
      if (ml > 1e-9) { mx /= ml; my /= ml; } else { mx = nnx; my = nny; }
      const cosH = Math.max(0.3, mx * nnx + my * nny);
      const sv = Math.min(src.ss[i] ?? 1, cap);
      if (fxKMin >= 0) {
        const hT = hw * Math.max(Math.max(0, sv), fxKMin);
        STRIP_NX[k] = mx / cosH; STRIP_NY[k] = my / cosH; STRIP_H[k] = Math.max(Math.min(hw, hMin), hT);
        STRIP_A[k] = 1;
        continue;
      }
      const hTrue = hw * projTeleLineScale(sv, mode);
      const h = Math.max(hMin, hTrue);
      STRIP_NX[k] = mx / cosH; STRIP_NY[k] = my / cosH; STRIP_H[k] = h;
      STRIP_A[k] = projTeleLineAlpha(2 * hTrue * z, minPx);
    }
    const piece = (k0: number, k1: number) => {
      // k1 は m を越えてよい(閉じた線の最後の辺 = 最初の頂点へ戻る)
      out.beginContour();
      for (let k = k0; k <= k1; k++) {
        const q = k % m, i = s0 + q;
        out.push(src.xy[i * 2] + STRIP_NX[q] * STRIP_H[q], src.xy[i * 2 + 1] + STRIP_NY[q] * STRIP_H[q]);
        out.ss[out.n - 1] = src.ss[i] ?? 1;
        out.la[out.n - 1] = STRIP_A[q];
        if (STRIP_A[q] < out.laMin) out.laMin = STRIP_A[q];
      }
      for (let k = k1; k >= k0; k--) {
        const q = k % m, i = s0 + q;
        out.push(src.xy[i * 2] - STRIP_NX[q] * STRIP_H[q], src.xy[i * 2 + 1] - STRIP_NY[q] * STRIP_H[q]);
        out.ss[out.n - 1] = src.ss[i] ?? 1;
        out.la[out.n - 1] = STRIP_A[q];
      }
    };
    if (wrap) {
      const half = Math.max(1, Math.floor(m / 2));
      piece(0, half);
      piece(half, m);
    } else {
      piece(0, m - 1);
    }
  }
  return out;
};

/** 線の帯の頂点の濃さの掛け率(テスト・計器用: projStrokeStripInto と同じ式)。 */
export const projStrokeAlpha = (
  f: ProjFrame, s: number, width: number, mode: 'A' | 'B' | 'C' = PROJ_TELE_LINE_MODE, minPx: number = PROJ_TELE_LINE_MIN_PX,
): number => {
  const z = f.wgScale > 0 ? f.wgScale : 1;
  return projTeleLineAlpha(Math.max(0, width) * projTeleLineScale(Math.min(s, projLineScaleCap(f)), mode) * z, minPx);
};

/** 線の帯の頂点 i の半幅(テスト・計器用: projStrokeStripInto と同じ式)。 */
export const projStrokeHalfWidth = (
  f: ProjFrame, s: number, width: number, mode: 'A' | 'B' | 'C' = PROJ_TELE_LINE_MODE, minPx: number = PROJ_TELE_LINE_MIN_PX,
): number => {
  const z = f.wgScale > 0 ? f.wgScale : 1;
  return Math.max(Math.max(0, minPx) / (2 * z), (Math.max(0, width) / 2) * projTeleLineScale(Math.min(s, projLineScaleCap(f)), mode));
};

// ---------------------------------------------------------------------------------------------
// 高さ・濃さ・間引き
// ---------------------------------------------------------------------------------------------

/** 高さを持つ頂点(地面の点 (gx, gy) から上へ h)の表示座標: 投影(gx, gy) − (0, h·s)(§1-3・★#6「浮きの倍率」の推薦=s)。 */
export const projLiftInto = (f: ProjFrame, gx: number, gy: number, h: number, out: { x: number; y: number; s: number }) => {
  projVertexInto(f, gx, gy, GP);
  out.x = GP.x; out.y = GP.y - h * GP.s; out.s = GP.s;
  return out;
};

/**
 * 予告の濃さの行(3-6f): world の範囲 [wyMin, wyMax] に主人公の足元の world Y を寄せ、その点を投影した表示Y と
 * その点の定義域と描く距離のフェード(★#4)を返す。範囲が空(min>max)なら null。
 */
export const projTeleFadeY = (
  f: ProjFrame, wyMin: number, wyMax: number, footY: number, out: { y: number; a: number },
): { y: number; a: number } | null => {
  if (!(wyMax >= wyMin)) return null;
  const wy = Math.max(wyMin, Math.min(footY, wyMax));
  projVertexInto(f, f.cxw, wy, GP);
  out.y = GP.y; out.a = GP.a;
  return out;
};

/**
 * 間引き(3-6b): 形(中心 cx,cy・半径 r)の東西南北の端と中心を投影した箱が、画面(ズーム後の画面px+marginPx)に掛からないなら true。
 * 地平線より北は ℓ=0 に寄せた点で測る(地平線の線に潰れて残る=描く側は頂点の寄せで正しく描く)。
 */
export const projShapeOutside = (f: ProjFrame, cx: number, cy: number, r: number, marginPx: number): boolean => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const take = (x: number, y: number) => {
    projVertexInto(f, x, y, GP);
    if (GP.sx < minX) minX = GP.sx;
    if (GP.sx > maxX) maxX = GP.sx;
    if (GP.sy < minY) minY = GP.sy;
    if (GP.sy > maxY) maxY = GP.sy;
  };
  const rr = Math.max(0, r);
  take(cx, cy); take(cx - rr, cy); take(cx + rr, cy); take(cx, cy - rr); take(cx, cy + rr);
  // 北の端の行は一番狭く南の端の行は一番広い=東西の端は南の行でも測る
  take(cx - rr, cy + rr); take(cx + rr, cy + rr);
  const m = Math.max(0, marginPx);
  return maxX < -m || minX > f.screenW + m || maxY < -m || minY > f.screenH + m;
};

// ---------------------------------------------------------------------------------------------
// テスト・計器用の小物
// ---------------------------------------------------------------------------------------------

/** 点 (x,y) が多角形(out の輪郭 c)の内か(偶奇)。 */
export const projPointInContour = (out: ProjPathOut, c: number, x: number, y: number): boolean => {
  const s = out.contourStart(c), e = out.contourEnd(c);
  let inside = false;
  for (let i = s, j = e - 1; i < e; j = i++) {
    const xi = out.xy[i * 2], yi = out.xy[i * 2 + 1], xj = out.xy[j * 2], yj = out.xy[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
};

/** 点 (x,y) が out のどれかの輪郭の内か。 */
export const projPointInPath = (out: ProjPathOut, x: number, y: number): boolean => {
  for (let c = 0; c < out.cn; c++) if (projPointInContour(out, c, x, y)) return true;
  return false;
};

/** 点と線分の距離。 */
export const projDistToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
};
