// 投影の段階4「形を持つもの」の描く部品(research/PERSPECTIVE_PROJECTION.md §3-6b・3-6j 作る物2)。
// `?proj=1` の時だけ、呼び出し側が **投影する図形の所でだけ** 呼ぶ:
//   const f = this.projFrame; if (f) projCircle(g, f, x, y, r, …); else g.circle(x, y, r).fill(…);
// else の側は今の行のまま(`?proj=0` の経路は1字も変えない)。部品は world の形の頂点を投影して表示座標で描く
// (中で utils/projShape.ts の純関数を呼ぶ)。
//
// 部品は、書いた命令の数(Graphics の fill/stroke の数)と、書いた頂点の world Y の範囲を、描いている Graphics ごとに記録する
// (計器の「直書きの漏れ」・予告の濃さ 3-6f が読む)。わざと投影しない命令は projKeep で申告する。

import { MeshSimple, type Graphics, type Texture, type FillInput, type StrokeStyle } from 'pixi.js';
import type { ProjFrame } from '../utils/perspectiveProjection';
import {
  ProjPathOut, projCircleInto, projEllipseInto, projArcInto, projSectorInto, projAnnulusInto, projAnnulusAnglesFor,
  projAnnulusRingInto, projQuadStripInto, projRectFrameInto, projPathInto, projGridInto, projGridIndices, projVertexInto,
  projLiftInto, projTeleLineScale, projStrokeStripInto, projTeleAlphaBucket, projGlyphMinSize, PROJ_SHAPE_TOL_PX, PROJ_GRID_VERTS, PROJ_GRID_MAX, PROJ_TELE_LINE_MODE,
  PROJ_TELE_LINE_MIN_PX, type ProjFrame4, type ProjGridResult,
} from '../utils/projShape';

/** 1つの Graphics の今フレームの記録。 */
export interface ProjDrawStat {
  frame: number;
  /** 部品が書いた命令の数。 */
  cmds: number;
  /** projKeep で申告した「わざと投影しない」命令の数。 */
  keep: number;
  wyMin: number;
  wyMax: number;
  pts: number;
}

const stats = new WeakMap<Graphics, ProjDrawStat>();
let frameNo = -1;
let ptsFrame = 0;
let ptsMax = 0;

/** フレームの頭に1回(pixiScene の projFrameNo を渡す)。 */
export const projDrawBeginFrame = (no: number): void => {
  frameNo = no;
  if (ptsFrame > ptsMax) ptsMax = ptsFrame;
  ptsFrame = 0;
};
/** 今フレームに予告で投影した点の数と、その最大(計器・負荷の材料 3-6l)。 */
export const projDrawPoints = (): { now: number; max: number } => ({ now: ptsFrame, max: Math.max(ptsMax, ptsFrame) });
export const projDrawResetMax = (): void => { ptsMax = 0; };

const statOf = (g: Graphics): ProjDrawStat => {
  let s = stats.get(g);
  if (!s) { s = { frame: frameNo, cmds: 0, keep: 0, wyMin: Infinity, wyMax: -Infinity, pts: 0 }; stats.set(g, s); }
  if (s.frame !== frameNo) { s.frame = frameNo; s.cmds = 0; s.keep = 0; s.wyMin = Infinity; s.wyMax = -Infinity; s.pts = 0; }
  return s;
};

/** 今フレームの記録(無ければ null)。 */
export const projDrawStat = (g: Graphics): ProjDrawStat | null => {
  const s = stats.get(g);
  return s && s.frame === frameNo ? s : null;
};

/** 直書きの漏れ: 今フレームの命令の総数 − 部品が書いた命令の数 − 申告した数。Graphics はフレームの頭で clear されている前提。 */
export const projDrawLeak = (g: Graphics): number => {
  const total = g.context.instructions.length;
  const s = projDrawStat(g);
  return total - (s ? s.cmds + s.keep : 0);
};

/** わざと投影しない命令の数を申告する(混在の Graphics の「投影しない」の列)。 */
export const projKeep = (g: Graphics, n: number): void => { statOf(g).keep += Math.max(0, n); };
/** n0(呼ぶ前の命令の数)から今までに増えた命令を「投影しない」として申告する。 */
export const projKeepFrom = (g: Graphics, n0: number): void => { projKeep(g, g.context.instructions.length - n0); };
/** 命令の数(projKeepFrom と組で使う)。 */
export const projCmdCount = (g: Graphics): number => g.context.instructions.length;

/** 予告の world Y の範囲を記録だけする(メッシュ・点で置く絵など Graphics に書かない物=予告の濃さ 3-6f が読む)。 */
export const projNoteWorldY = (g: Graphics, wyMin: number, wyMax: number): void => {
  const s = statOf(g);
  if (wyMin < s.wyMin) s.wyMin = wyMin;
  if (wyMax > s.wyMax) s.wyMax = wyMax;
};

const OUT = new ProjPathOut();
const TOL = PROJ_SHAPE_TOL_PX;

const record = (g: Graphics, n0: number, out: ProjPathOut) => {
  const s = statOf(g);
  s.cmds += g.context.instructions.length - n0;
  if (out.wyMin < s.wyMin) s.wyMin = out.wyMin;
  if (out.wyMax > s.wyMax) s.wyMax = out.wyMax;
  s.pts += out.pts;
  ptsFrame += out.pts;
};

/** out の輪郭を Graphics の道へ(閉じる/開く)。 */
const trace = (g: Graphics, out: ProjPathOut, closed: boolean) => {
  for (let c = 0; c < out.cn; c++) {
    const s = out.contourStart(c), e = out.contourEnd(c);
    if (e - s < 2) continue;
    g.moveTo(out.xy[s * 2], out.xy[s * 2 + 1]);
    for (let i = s + 1; i < e; i++) g.lineTo(out.xy[i * 2], out.xy[i * 2 + 1]);
    if (closed) g.closePath();
  }
};

/** 線の太さが画面の上で今のまま(★#23 が A で下限なし)なら Graphics の線のまま描く。 */
const LINE_AS_STROKE = PROJ_TELE_LINE_MODE === 'A' && !(PROJ_TELE_LINE_MIN_PX > 0);
const STRIP = new ProjPathOut();
let paintFrame: ProjFrame | null = null;

/**
 * 線(★#23「予告の線の太さと遠近」・監査 A-1): B/C は頂点ごとの半幅の帯として塗る(1本の中で奥は細く・手前は太い)。
 * s は画面(+余白)の下端の行の値で頭打ち=画面の外へ延長した頂点に太さを引っ張られない。
 */
const strokeLine = (g: Graphics, out: ProjPathOut, st: StrokeStyle, closed: boolean) => {
  const f = paintFrame;
  if (LINE_AS_STROKE || !f) { trace(g, out, closed); g.stroke(st); return; }
  STRIP.reset();
  projStrokeStripInto(f, out, closed, st.width ?? 1, STRIP);
  if (STRIP.cn === 0) return;
  const fs: { color?: StrokeStyle['color']; alpha?: number } = {};
  if (st.color !== undefined) fs.color = st.color;
  if (STRIP.laMin >= 1) {
    trace(g, STRIP, true);
    if (st.alpha !== undefined) fs.alpha = st.alpha;
    g.fill(fs as FillInput);
    return;
  }
  // 線の下限(1px・§3-6g3)に当たった所は薄くする: 区間の濃さを 0.1 刻みにまとめ、同じ濃さの区間ごとに1回塗る
  const a0 = st.alpha ?? 1;
  for (let bi = 0; bi < BUCKETS.length; bi++) {
    const bv = BUCKETS[bi];
    if (bv < STRIP.laMin - 0.051) continue;
    if (traceBucket(g, STRIP, bv)) { fs.alpha = a0 * bv; g.fill({ ...fs } as FillInput); }
  }
};

/** 濃さの刻み(projTeleAlphaBucket が返し得る値)。 */
const BUCKETS: number[] = (() => {
  const o: number[] = [];
  for (const v of [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, projTeleAlphaBucket(0)]) if (!o.includes(v)) o.push(v);
  return o;
})();
/**
 * 線の帯(輪郭ごとに「左の縁 L 点 → 右の縁 L 点を逆順」)のうち、区間の濃さの刻みが bv の区間を、続いている所ごとに1つの多角形として道へ足す。
 * 足した区間があれば true。
 */
const traceBucket = (g: Graphics, out: ProjPathOut, bv: number): boolean => {
  let any = false;
  for (let c = 0; c < out.cn; c++) {
    const s = out.contourStart(c), e = out.contourEnd(c);
    const L = (e - s) >> 1;
    if (L < 2) continue;
    const segB = (j: number) => projTeleAlphaBucket(0.5 * ((out.la[s + j] ?? 1) + (out.la[s + j + 1] ?? 1)));
    let j = 0;
    while (j < L - 1) {
      if (segB(j) !== bv) { j++; continue; }
      let j1 = j;
      while (j1 + 1 < L - 1 && segB(j1 + 1) === bv) j1++;
      // 区間 j..j1(頂点 j..j1+1)
      g.moveTo(out.xy[(s + j) * 2], out.xy[(s + j) * 2 + 1]);
      for (let q = j + 1; q <= j1 + 1; q++) g.lineTo(out.xy[(s + q) * 2], out.xy[(s + q) * 2 + 1]);
      for (let q = j1 + 1; q >= j; q--) { const r = e - 1 - q; g.lineTo(out.xy[r * 2], out.xy[r * 2 + 1]); }
      g.closePath();
      any = true;
      j = j1 + 1;
    }
  }
  return any;
};

const paint = (g: Graphics, out: ProjPathOut, fill: FillInput | undefined, stroke: StrokeStyle | undefined, closed: boolean, f?: ProjFrame) => {
  if (fill !== undefined) { trace(g, out, closed); g.fill(fill); }
  if (stroke !== undefined) { paintFrame = f ?? null; strokeLine(g, out, stroke, closed); paintFrame = null; }
};

/** 円(縁は projCircleInto の頂点列)。 */
export const projCircle = (g: Graphics, f: ProjFrame, wx: number, wy: number, r: number, fill?: FillInput, stroke?: StrokeStyle): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projCircleInto(f, wx, wy, r, TOL, OUT);
  paint(g, OUT, fill, stroke, true, f);
  record(g, n0, OUT);
};

/**
 * 高さ h だけ持ち上げた円(3-6e の projLift・デコイの落下の drop など)。地面の円を頂点ごとに投影し、
 * 中心の高さの持ち上げ(h·s)を全頂点に同じだけ足す(落下の間の短い間だけの高さ)。h=0 なら projCircle と同じ。
 */
export const projCircleLifted = (
  g: Graphics, f: ProjFrame, wx: number, wy: number, r: number, h: number, fill?: FillInput, stroke?: StrokeStyle,
): void => {
  if (!(h > 0)) { projCircle(g, f, wx, wy, r, fill, stroke); return; }
  const n0 = g.context.instructions.length;
  OUT.reset(); projCircleInto(f, wx, wy, r, TOL, OUT);
  projVertexInto(f, wx, wy, Q4L);
  const dy = -h * Q4L.s;
  for (let i = 0; i < OUT.n; i++) OUT.xy[i * 2 + 1] += dy;
  paint(g, OUT, fill, stroke, true, f);
  record(g, n0, OUT);
};
const Q4L = { x: 0, y: 0, s: 1, a: 1, sx: 0, sy: 0 };

/** 楕円(rx・ry・回転)。 */
export const projEllipse = (
  g: Graphics, f: ProjFrame, wx: number, wy: number, rx: number, ry: number, rot: number, fill?: FillInput, stroke?: StrokeStyle,
): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projEllipseInto(f, wx, wy, rx, ry, rot, TOL, OUT);
  paint(g, OUT, fill, stroke, true, f);
  record(g, n0, OUT);
};

/** 弧の線(Pixi の arc と同じ向き: a0→a1)。 */
export const projArcLine = (g: Graphics, f: ProjFrame, cx: number, cy: number, r: number, a0: number, a1: number, stroke: StrokeStyle): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projArcInto(f, cx, cy, r, a0, a1, TOL, OUT);
  paint(g, OUT, undefined, stroke, false, f);
  record(g, n0, OUT);
};

/** 扇(中心+弧)。 */
export const projSector = (
  g: Graphics, f: ProjFrame, cx: number, cy: number, r: number, a0: number, a1: number, fill?: FillInput, stroke?: StrokeStyle,
): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projSectorInto(f, cx, cy, r, a0, a1, TOL, OUT);
  paint(g, OUT, fill, stroke, true, f);
  record(g, n0, OUT);
};

/** 環・環状の扇(塗り)。 */
export const projAnnulus = (
  g: Graphics, f: ProjFrame, cx: number, cy: number, r0: number, r1: number, a0: number | undefined, a1: number | undefined, fill: FillInput,
): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projAnnulusInto(f, cx, cy, r0, r1, a0, a1, TOL, OUT);
  paint(g, OUT, fill, undefined, true, f);
  record(g, n0, OUT);
};

/**
 * 同心の環を何本も塗る時の角の並びを1回だけ決める(projRing と組)。rIn=一番内の半径(内周の誤差も測る)。
 * 隣の環と頂点の列を共有する=継ぎ目なし(drawSweepCircleFill の14本の環)。
 */
export const projRingsBegin = (
  f: ProjFrame, cx: number, cy: number, rOut: number, rIn: number, a0?: number, a1?: number,
): { cx: number; cy: number; n: number; full: boolean } =>
  ({ cx, cy, n: projAnnulusAnglesFor(f, cx, cy, rOut, a0, a1, TOL, rIn), full: a0 === undefined || a1 === undefined });

/** projRingsBegin で決めた角の並びで環 [r0, r1] を塗る。 */
export const projRing = (g: Graphics, f: ProjFrame, rs: { cx: number; cy: number; n: number; full: boolean }, r0: number, r1: number, fill: FillInput): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projAnnulusRingInto(f, rs.cx, rs.cy, r0, r1, rs.n, rs.full, OUT);
  paint(g, OUT, fill, undefined, true, f);
  record(g, n0, OUT);
};

/**
 * 面の帯(今の四角の帯と同じ4隅・判定の幅 hw を投影する)。s0〜s1=帯の割合・capBack/capFront=端を hw ぶん伸ばす。
 * 太さが判定の幅を表す線も、線ではなくこれで描く(3-6g)。
 */
export const projBand = (
  g: Graphics, f: ProjFrame, fx: number, fy: number, tx: number, ty: number, hw: number, fill: FillInput,
  s0 = 0, s1 = 1, capBack = true, capFront = true, stroke?: StrokeStyle,
): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projQuadStripInto(f, fx, fy, tx, ty, hw, s0, s1, capBack, capFront, TOL, OUT);
  paint(g, OUT, fill, stroke, true, f);
  record(g, n0, OUT);
};

/**
 * 「太さが判定の幅を表す線」の置き換え(3-6g): moveTo(a)→lineTo(b).stroke({width}) を、半幅 width/2 の面の帯で描く。
 * cap が 'round'/'square' なら端を半幅ぶん伸ばす(線の端の形と同じ長さ)。
 */
export const projThickLine = (
  g: Graphics, f: ProjFrame, ax: number, ay: number, bx: number, by: number, st: StrokeStyle,
): void => {
  const w = st.width ?? 1;
  const capped = st.cap === 'round' || st.cap === 'square';
  projBand(g, f, ax, ay, bx, by, w / 2, { color: st.color, alpha: st.alpha }, 0, 1, capped, capped);
};

/** 細い線(折れ線を誤差で分けて投影。太さは ★#23「予告の線の太さと遠近」)。wpts=flat の world 点。 */
export const projLine = (g: Graphics, f: ProjFrame, wpts: ArrayLike<number>, stroke: StrokeStyle, closed = false): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projPathInto(f, wpts, closed, TOL, OUT);
  paint(g, OUT, undefined, stroke, closed, f);
  record(g, n0, OUT);
};

const SEG: number[] = [0, 0, 0, 0];
/** 細い線の1区間(moveTo(a).lineTo(b).stroke の置き換え)。 */
export const projSeg = (g: Graphics, f: ProjFrame, ax: number, ay: number, bx: number, by: number, stroke: StrokeStyle): void => {
  SEG[0] = ax; SEG[1] = ay; SEG[2] = bx; SEG[3] = by;
  projLine(g, f, SEG, stroke, false);
};

/** 多角形(塗り・縁)。 */
export const projPoly = (g: Graphics, f: ProjFrame, wpts: ArrayLike<number>, fill?: FillInput, stroke?: StrokeStyle): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projPathInto(f, wpts, true, TOL, OUT);
  paint(g, OUT, fill, stroke, true, f);
  record(g, n0, OUT);
};

/** 矩形(塗り・縁)= 4隅の多角形。 */
const RECT: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
export const projRect = (g: Graphics, f: ProjFrame, x: number, y: number, w: number, h: number, fill?: FillInput, stroke?: StrokeStyle): void => {
  RECT[0] = x; RECT[1] = y; RECT[2] = x + w; RECT[3] = y; RECT[4] = x + w; RECT[5] = y + h; RECT[6] = x; RECT[7] = y + h;
  projPoly(g, f, RECT, fill, stroke);
};

/**
 * 矩形を道だけ足す(塗りは呼び出し側が projFill でまとめて掛ける=同じ濃さの四角を1つの塗りにまとめる所用)。
 * 小さな四角(光線の先端の段・粒)用: 4隅を投影するだけ(分けない)。
 */
const Q4 = { x: 0, y: 0, s: 1, a: 1, sx: 0, sy: 0 };
export const projRectPath = (g: Graphics, f: ProjFrame, x: number, y: number, w: number, h: number): void => {
  projVertexInto(f, x, y, Q4); g.moveTo(Q4.x, Q4.y);
  projVertexInto(f, x + w, y, Q4); g.lineTo(Q4.x, Q4.y);
  projVertexInto(f, x + w, y + h, Q4); g.lineTo(Q4.x, Q4.y);
  projVertexInto(f, x, y + h, Q4); g.lineTo(Q4.x, Q4.y);
  g.closePath();
  ptsFrame += 4;
  projNoteWorldY(g, Math.min(y, y + h), Math.max(y, y + h));
};
/** projRectPath で足した道をまとめて塗る(部品の命令として数える)。 */
export const projFill = (g: Graphics, fill: FillInput): void => {
  const n0 = g.context.instructions.length;
  g.fill(fill);
  statOf(g).cmds += g.context.instructions.length - n0;
};

/** 矩形の窓の枠(矩形を r0〜r1 広げた間)。 */
export const projRectFrame = (
  g: Graphics, f: ProjFrame, rect: { x: number; y: number; w: number; h: number }, r0: number, r1: number, fill: FillInput,
): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projRectFrameInto(f, rect, r0, r1, TOL, OUT);
  paint(g, OUT, fill, undefined, true, f);
  record(g, n0, OUT);
};

/** 中心だけ投影する記号の置き場(表示座標・s・定義域と描く距離のフェード a)。大きさは ★#23 の倍率 k を掛けて使う。 */
export interface ProjGlyphPt { x: number; y: number; s: number; a: number; sx: number; sy: number; l?: number; k: number }
const GLY: ProjGlyphPt = { x: 0, y: 0, s: 1, a: 1, sx: 0, sy: 0, k: 1 };
/**
 * 中心だけ投影する記号(潰れた楕円の印・頭の輝点・終点の輪・地雷の赤い点滅の点)。記号の形と大きさは今のまま描く(k=★#23 の倍率)。
 * g を渡すと world Y を予告の範囲として記録する。返す入れ物は次の呼び出しで上書きされる。
 */
export const projGlyph = (f: ProjFrame, wx: number, wy: number, g?: Graphics): ProjGlyphPt => {
  projVertexInto(f, wx, wy, GLY);
  GLY.k = projTeleLineScale(GLY.s);
  ptsFrame++;
  if (g) projNoteWorldY(g, wy, wy);
  return GLY;
};

/** 記号の塗り/線の alpha に、中心の定義域と描く距離のフェード a(地平線の外の消え方)を掛ける(監査12)。 */
const glyphFill = (fill: FillInput, a: number): FillInput => {
  if (a >= 1) return fill;
  if (typeof fill === 'number' || typeof fill === 'string') return { color: fill, alpha: a };
  if (fill && typeof fill === 'object' && !Array.isArray(fill) && ('color' in fill || 'alpha' in fill)) {
    const o = fill as { alpha?: number };
    return { ...(fill as object), alpha: (o.alpha ?? 1) * a } as FillInput;
  }
  return fill;
};
/** 記号の線(終点の輪・楕円の印の縁)。線の幅が画面で 1px を下回るなら 1px に止めて薄くする(§3-6g3)。 */
const glyphStroke = (st: StrokeStyle, a: number, z = 1): StrokeStyle => {
  const w = st.width ?? 1;
  const m = projGlyphMinSize(w, z);
  const aa = a * m.alpha;
  if (aa >= 1 && m.grow === 1) return st;
  return { ...st, width: w * m.grow, alpha: (st.alpha ?? 1) * aa };
};

/** 中心だけ投影した円の記号(頭の輝点・終点の輪)。半径は今のまま(★#23 の倍率 k を掛ける)。 */
export const projGlyphCircle = (g: Graphics, f: ProjFrame, wx: number, wy: number, r: number, fill?: FillInput, stroke?: StrokeStyle): void => {
  const n0 = g.context.instructions.length;
  const q = projGlyph(f, wx, wy, g);
  if (!(q.a > 0)) return; // 地平線より北・描く距離の先=描かない
  // 線の下限(1px・§3-6g3): 直径が画面で 1px を下回るなら 1px に止めて薄くする
  const m = projGlyphMinSize(2 * Math.max(0, r) * q.k, f.wgScale);
  const rr = r * q.k * m.grow, aa = q.a * m.alpha;
  if (fill !== undefined) g.circle(q.x, q.y, rr).fill(glyphFill(fill, aa));
  if (stroke !== undefined) g.circle(q.x, q.y, rr).stroke(glyphStroke(stroke, aa, f.wgScale));
  statOf(g).cmds += g.context.instructions.length - n0;
};
/** 中心だけ投影した潰れた楕円の印(突進の線の終点の印・ゾンビの印)。形と大きさは今のまま(★#23 の倍率 k を掛ける)。 */
export const projGlyphEllipse = (
  g: Graphics, f: ProjFrame, wx: number, wy: number, rx: number, ry: number, fill?: FillInput, stroke?: StrokeStyle,
): void => {
  const n0 = g.context.instructions.length;
  const q = projGlyph(f, wx, wy, g);
  if (!(q.a > 0)) return;
  // 線の下限(1px・§3-6g3): 短い方の直径が画面で 1px を下回るなら、形の比を保って 1px に止めて薄くする
  const m = projGlyphMinSize(2 * Math.max(0, Math.min(rx, ry)) * q.k, f.wgScale);
  const kk = q.k * m.grow, aa = q.a * m.alpha;
  if (fill !== undefined) g.ellipse(q.x, q.y, rx * kk, ry * kk).fill(glyphFill(fill, aa));
  if (stroke !== undefined) g.ellipse(q.x, q.y, rx * kk, ry * kk).stroke(glyphStroke(stroke, aa, f.wgScale));
  statOf(g).cmds += g.context.instructions.length - n0;
};

const DOT = { x: 0, y: 0, s: 1 };
/**
 * 点で置く小さな絵(判定を持たない熾火・花弁・粒など・§3-6e の方針⑥): 地面の点 (wx, wy) から高さ h の点を投影し、
 * 大きさは s を掛ける(段階1の置き物と同じ「点+s」)。円。
 */
export const projDotCircle = (g: Graphics, f: ProjFrame, wx: number, wy: number, r: number, fill: FillInput, h = 0): void => {
  const n0 = g.context.instructions.length;
  projLiftInto(f, wx, wy, h, DOT);
  g.circle(DOT.x, DOT.y, r * DOT.s).fill(fill);
  ptsFrame++;
  const s = statOf(g); s.cmds += g.context.instructions.length - n0;
  projNoteWorldY(g, wy, wy);
};
/** 点で置く小さな四角(左上が点・大きさは s・round=画素に揃える)。 */
export const projDotRect = (
  g: Graphics, f: ProjFrame, wx: number, wy: number, w: number, hgt: number, fill: FillInput, h = 0, round = false,
): void => {
  const n0 = g.context.instructions.length;
  projLiftInto(f, wx, wy, h, DOT);
  const x = round ? Math.round(DOT.x) : DOT.x, y = round ? Math.round(DOT.y) : DOT.y;
  g.rect(x, y, w * DOT.s, hgt * DOT.s).fill(fill);
  ptsFrame++;
  const s = statOf(g); s.cmds += g.context.instructions.length - n0;
  projNoteWorldY(g, wy, wy);
};

const LIFT = { x: 0, y: 0, s: 1 };
/** 高さを持つ頂点(地面の点 (gx, gy) から上へ h)の表示座標(3-6e)。返す入れ物は次の呼び出しで上書きされる。 */
export const projLift = (f: ProjFrame, gx: number, gy: number, h: number): { x: number; y: number; s: number } => {
  ptsFrame++;
  return projLiftInto(f, gx, gy, h, LIFT);
};

// ---- 焼き素材の格子メッシュ ----

/** 段階4のメッシュの名札(計器・役の表)。 */
export interface ProjMeshTagged { projTag?: string }

/** 格子メッシュの添字(全メッシュで1本を共有・書き換えない・監査 B-2)。初めて要る時に作る(`?proj=0` では作らない)。 */
let sharedGridIndices: Uint32Array | null = null;
const gridIndices = (): Uint32Array => (sharedGridIndices ??= projGridIndices(PROJ_GRID_MAX));

/** 作り置きの格子メッシュ(33×33 頂点)。`?proj=1` の時に初めて作る(遅延生成)。添字の配列は全メッシュで共有。 */
export const makeProjGridMesh = (tex: Texture, tag: string): MeshSimple & ProjMeshTagged => {
  const m = new MeshSimple({
    texture: tex,
    vertices: new Float32Array(PROJ_GRID_VERTS * 2),
    uvs: new Float32Array(PROJ_GRID_VERTS * 2),
    indices: gridIndices(),
  }) as MeshSimple & ProjMeshTagged;
  m.projTag = tag;
  m.label = 'proj:' + tag;
  return m;
};

/** 素材の絵の格子の細かさ(3-6b): 予告の縁の意匠=12/24・柔らかい光の絵=24/48。 */
export const PROJ_GRID_SHARP = { rowPx: 12, colPx: 24 } as const;
export const PROJ_GRID_SOFT = { rowPx: 24, colPx: 48 } as const;

/**
 * 焼き素材の格子メッシュの頂点と UV を、世界に寝かせた四角 fr から書く。g を渡すと world Y の範囲をその Graphics の
 * 予告の範囲として記録する(予告の濃さ 3-6f)。
 */
export const projMeshGrid = (
  mesh: MeshSimple, f: ProjFrame, fr: ProjFrame4, grid: { rowPx: number; colPx: number } = PROJ_GRID_SHARP,
  maxN = PROJ_GRID_MAX, g?: Graphics, flipU = false, flipV = false,
): ProjGridResult => {
  const pos = mesh.geometry.getBuffer('aPosition').data as Float32Array;
  const uvBuf = mesh.geometry.getBuffer('aUV');
  const uv = uvBuf.data as Float32Array;
  const res = projGridInto(f, fr, grid.rowPx, grid.colPx, maxN, pos, uv);
  // 左右/上下に返した絵(Sprite の scale が負)は UV を返す(頂点の位置はそのまま=四角は同じ)
  if (flipU || flipV) for (let k = 0; k < uv.length; k += 2) { if (flipU) uv[k] = 1 - uv[k]; if (flipV) uv[k + 1] = 1 - uv[k + 1]; }
  uvBuf.update();
  ptsFrame += res.pts;
  if (g) projNoteWorldY(g, res.wyMin, res.wyMax);
  return res;
};

/**
 * 世界に寝かせた Sprite(回転なし・親は world と同じ座標)の四角を、同じ素材の格子メッシュで頂点ごとに投影して置く(段階4・地面の絵)。
 * Sprite の今の位置・大きさ(scale の符号=返し)・アンカーから world の四角を出す。dInv=Sprite の大きさに掛かっている旧い遠近の倍率の逆数
 * (掛かっていなければ 1)=足元の点を支点に world の寸法へ戻してから投影する(二重に縮めない)。素材・tint・alpha・合成・見える/見えないは写す。
 * 呼んだ後、呼び出し側が Sprite を隠す。
 */
export const projMeshFromSprite = (
  mesh: MeshSimple, f: ProjFrame, sp: { position: { x: number; y: number }; scale: { x: number; y: number }; anchor: { x: number; y: number }; texture: Texture; tint: number | string | unknown; alpha: number; blendMode: unknown; visible: boolean; rotation?: number },
  grid: { rowPx: number; colPx: number } = PROJ_GRID_SOFT, dScale = 1, g?: Graphics,
): ProjGridResult | null => {
  const tw = sp.texture.width, th = sp.texture.height;
  const sx = sp.scale.x * dScale, sy = sp.scale.y * dScale;
  const w = Math.abs(tw * sx), h = Math.abs(th * sy);
  if (mesh.texture !== sp.texture) mesh.texture = sp.texture;
  mesh.tint = sp.tint as number;
  mesh.alpha = sp.alpha;
  (mesh as { blendMode: unknown }).blendMode = sp.blendMode;
  mesh.visible = sp.visible && w > 0 && h > 0;
  if (!mesh.visible) return null;
  // アンカーの点=sp.position。四角の中心は (0.5 − anchor)·(符号つきの幅) だけ(回転して)ずれる
  const rot = sp.rotation ?? 0, c = Math.cos(rot), sn = Math.sin(rot);
  const ox = (0.5 - sp.anchor.x) * tw * sx, oy = (0.5 - sp.anchor.y) * th * sy;
  const cx = sp.position.x + ox * c - oy * sn, cy = sp.position.y + ox * sn + oy * c;
  return projMeshGrid(mesh, f, { cx, cy, w, h, rot }, grid, PROJ_GRID_MAX, g, sx < 0, sy < 0);
};
