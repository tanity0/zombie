// 投影の段階4「形を持つもの」の描く部品(research/PERSPECTIVE_PROJECTION.md §3-6b・3-6j 作る物2)。
// `?proj=1` の時だけ、呼び出し側が **投影する図形の所でだけ** 呼ぶ:
//   const f = this.projFrame; if (f) projCircle(g, f, x, y, r, …); else g.circle(x, y, r).fill(…);
// else の側は今の行のまま(`?proj=0` の経路は1字も変えない)。部品は world の形の頂点を投影して表示座標で描く
// (中で utils/projShape.ts の純関数を呼ぶ)。
//
// 部品は、書いた命令の数(Graphics の fill/stroke の数)と、書いた頂点の world Y の範囲を、描いている Graphics ごとに記録する
// (計器の「直書きの漏れ」・予告の濃さ 3-6f が読む)。わざと投影しない命令は projKeep で申告する。

import { GraphicsPath, Matrix, MeshSimple, type Graphics, type Texture, type FillInput, type StrokeStyle } from 'pixi.js';
import { PROJ_FX_MIN_S, PROJ_FX_SIZE_MODE } from '../utils/projFx';
import type { ProjFrame } from '../utils/perspectiveProjection';
import {
  ProjPathOut, projCircleInto, projEllipseInto, projArcInto, projSectorInto, projAnnulusInto, projAnnulusAnglesFor,
  projAnnulusRingInto, projFlatCircleInto, projFlatEllipseInto, projFlatArcInto, projGridFlatInto, projFlatCircleDev, projQuadStripInto, projRectFrameInto, projPathInto, projGridInto, projGridIndices, projVertexInto,
  projLiftInto, projTeleLineScale, projStrokeStripInto, projTeleAlphaBucket, projGlyphMinSize, projGlyphStrokeLook, PROJ_SHAPE_TOL_PX, PROJ_GRID_VERTS, PROJ_GRID_MAX, PROJ_TELE_LINE_MODE,
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
  if (projCircleDevStat.on) devFrameReset();
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

/**
 * 計器 `?projaudit=1` の circle dev(社長 2026-11-24 裁定=案A): 真円を倒した楕円で描いた円(判定の無い円だけ)ごとに、楕円の縁と厳密に投影した縁の最大のずれ(画面px)を測る。
 * on は pixiScene が PROJ_AUDIT の時だけ立てる(?proj=0・計器なしでは1回も測らない)。1フレームに測る円は CIRCLE_DEV_CAP 個まで。
 */
export const projCircleDevStat = {
  on: false,
  /** 今フレームに測った円の数・ずれの最大(画面px)・内側/外側の最大。 */
  n: 0, max: 0, inner: 0, outer: 0,
  /** 今フレームで一番ずれた円の半径(world)と、基準点からの南北(world px)・部品の名。 */
  worstR: 0, worstDy: 0, worstWhat: '',
  /** 計測を始めてからの最大。 */
  maxAll: 0, innerAll: 0, outerAll: 0, worstAll: '',
};
const CIRCLE_DEV_CAP = 12;
const devFrameReset = () => {
  const d = projCircleDevStat;
  d.n = 0; d.max = 0; d.inner = 0; d.outer = 0; d.worstR = 0; d.worstDy = 0; d.worstWhat = '';
};
/** 楕円にした円を1つ測る(計器が on の時だけ)。 */
export const projCircleDevNote = (f: ProjFrame, cx: number, cy: number, r: number, what: string): void => {
  const d = projCircleDevStat;
  if (!d.on || d.n >= CIRCLE_DEV_CAP || !(r > 0)) return;
  const v = projFlatCircleDev(f, cx, cy, r, 96);
  d.n++;
  if (v.inner > d.inner) d.inner = v.inner;
  if (v.outer > d.outer) d.outer = v.outer;
  if (v.max > d.max) {
    d.max = v.max; d.worstR = r; d.worstWhat = what;
    d.worstDy = Math.round(cy - f.wRef); // 基準点(主人公の行)からの world の南北(px・南が正)
  }
  if (v.inner > d.innerAll) d.innerAll = v.inner;
  if (v.outer > d.outerAll) d.outerAll = v.outer;
  if (v.max > d.maxAll) { d.maxAll = v.max; d.worstAll = `${what} r=${Math.round(r)} dy=${Math.round(cy - f.wRef)}`; }
};

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
const strokeLine = (g: Graphics, out: ProjPathOut, st: StrokeStyle, closed: boolean, look: ProjLineLook = 'tele') => {
  const f = paintFrame;
  if ((LINE_AS_STROKE && look === 'tele') || !f) { trace(g, out, closed); g.stroke(st); return; }
  STRIP.reset();
  if (look !== 'tele') {
    // 段階3の線の規則(§3-7c): 太さ × k(判定に揃える線=s・派手さ=s_fx)・画面で 1px の下限・濃さは落とさない
    projStrokeStripInto(f, out, closed, st.width ?? 1, STRIP, PROJ_TELE_LINE_MODE, PROJ_TELE_LINE_MIN_PX, projLineLookKMin(look));
    if (STRIP.cn === 0) return;
    trace(g, STRIP, true);
    g.fill({ color: st.color, alpha: st.alpha } as FillInput);
    return;
  }
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

/**
 * 線の見た目の規則。'tele'=段階4の予告の線(★#23=B・下限に当たった所は薄くする=既定)。
 * 's'/'fx'=段階3の線の規則(§3-7c・判定に揃える線=s/派手さ=s_fx・画面で 1px の下限・**濃さは落とさない**)。
 */
export type ProjLineLook = 'tele' | 's' | 'fx';
/** 段階3の線の k の下限(s=0・fx=★#24 の下限。★#24 の案 A は 0・C は今の太さのまま=1 を下限に)。 */
export const projLineLookKMin = (look: ProjLineLook): number =>
  look === 's' ? 0 : PROJ_FX_SIZE_MODE === 'A' ? 0 : PROJ_FX_SIZE_MODE === 'C' ? 1 : PROJ_FX_MIN_S;

const paint = (g: Graphics, out: ProjPathOut, fill: FillInput | undefined, stroke: StrokeStyle | undefined, closed: boolean, f?: ProjFrame, look: ProjLineLook = 'tele') => {
  if (fill !== undefined) { trace(g, out, closed); g.fill(fill); }
  if (stroke !== undefined) { paintFrame = f ?? null; strokeLine(g, out, stroke, closed, look); paintFrame = null; }
};

// 円の形の部品は2組(社長 2026-11-24 裁定=案A「判定のある円だけ今の形のまま、判定の無い円を真円を倒した楕円にする」):
// - projCircle/projEllipse/projArcLine/projSector/projAnnulus/projRingsBegin+projRing/projCircleLifted = **厳密**(頂点ごとに投影)。
//   判定の半径そのものを描く円(赤い予告・紫の範囲・カウンターの届く距離・判定を持つ床 等=危険を伝える絵)と、入ると何かが起きる/中に居る間
//   進む範囲の円(囲い・二人組の待機の円・帰還・祠・拠点・商人の円と、その滞在の弧=store の距離の判定と同じ半径)はこちら。
// - projFlatCircle/projFlatEllipse/projFlatArcLine = **真円を倒した楕円**(中心を投影し、中心の s と中心の行の縦の詰めで一様に潰す)。
//   判定の無い円(影・地面の跡・派手さの輪・満ちた後に広がる輪 等)はこちら。呼び出し元で選ぶ。

/** 円(縁は projCircleInto の頂点列=厳密)。 */
export const projCircle = (g: Graphics, f: ProjFrame, wx: number, wy: number, r: number, fill?: FillInput, stroke?: StrokeStyle, look: ProjLineLook = 'tele'): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projCircleInto(f, wx, wy, r, TOL, OUT);
  paint(g, OUT, fill, stroke, true, f, look);
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
  g: Graphics, f: ProjFrame, wx: number, wy: number, rx: number, ry: number, rot: number, fill?: FillInput, stroke?: StrokeStyle, look: ProjLineLook = 'tele',
): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projEllipseInto(f, wx, wy, rx, ry, rot, TOL, OUT);
  paint(g, OUT, fill, stroke, true, f, look);
  record(g, n0, OUT);
};

/** 弧の線(Pixi の arc と同じ向き: a0→a1)。 */
export const projArcLine = (g: Graphics, f: ProjFrame, cx: number, cy: number, r: number, a0: number, a1: number, stroke: StrokeStyle, look: ProjLineLook = 'tele'): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projArcInto(f, cx, cy, r, a0, a1, TOL, OUT);
  paint(g, OUT, undefined, stroke, false, f, look);
  record(g, n0, OUT);
};

/** 扇(中心+弧)。 */
export const projSector = (
  g: Graphics, f: ProjFrame, cx: number, cy: number, r: number, a0: number, a1: number, fill?: FillInput, stroke?: StrokeStyle, look: ProjLineLook = 'tele',
): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projSectorInto(f, cx, cy, r, a0, a1, TOL, OUT);
  paint(g, OUT, fill, stroke, true, f, look);
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
 * 判定の無い円=真円を倒した楕円(utils/projShape.ts の projFlatCircleInto・中心が地平線より北の円だけ頂点ごとの投影)。
 * what=計器 circle dev に出す名(楕円にした円のずれだけ測る)。
 */
export const projFlatCircle = (
  g: Graphics, f: ProjFrame, wx: number, wy: number, r: number, fill?: FillInput, stroke?: StrokeStyle, look: ProjLineLook = 'tele', what = 'flatCircle',
): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projFlatCircleInto(f, wx, wy, r, TOL, OUT);
  projCircleDevNote(f, wx, wy, r, what);
  paint(g, OUT, fill, stroke, true, f, look);
  record(g, n0, OUT);
};

/** 判定の無い楕円(world の楕円 rx・ry・回転を真円を倒した写しで一様に潰す・projFlatEllipseInto)。影・煙・暗い幕など。 */
export const projFlatEllipse = (
  g: Graphics, f: ProjFrame, wx: number, wy: number, rx: number, ry: number, rot: number, fill?: FillInput, stroke?: StrokeStyle, look: ProjLineLook = 'tele',
): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projFlatEllipseInto(f, wx, wy, rx, ry, rot, TOL, OUT);
  if (rx === ry) projCircleDevNote(f, wx, wy, rx, 'flatEllipse');
  paint(g, OUT, fill, stroke, true, f, look);
  record(g, n0, OUT);
};

/** 判定の無い弧の線(真円を倒した楕円の上の弧・projFlatArcInto)。滞在の進捗の弧・派手さの弧など。 */
export const projFlatArcLine = (
  g: Graphics, f: ProjFrame, cx: number, cy: number, r: number, a0: number, a1: number, stroke: StrokeStyle, look: ProjLineLook = 'tele',
): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projFlatArcInto(f, cx, cy, r, a0, a1, TOL, OUT);
  paint(g, OUT, undefined, stroke, false, f, look);
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
export const projLine = (g: Graphics, f: ProjFrame, wpts: ArrayLike<number>, stroke: StrokeStyle, closed = false, look: ProjLineLook = 'tele'): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projPathInto(f, wpts, closed, TOL, OUT);
  paint(g, OUT, undefined, stroke, closed, f, look);
  record(g, n0, OUT);
};

const SEG: number[] = [0, 0, 0, 0];
/** 細い線の1区間(moveTo(a).lineTo(b).stroke の置き換え)。 */
export const projSeg = (g: Graphics, f: ProjFrame, ax: number, ay: number, bx: number, by: number, stroke: StrokeStyle, look: ProjLineLook = 'tele'): void => {
  SEG[0] = ax; SEG[1] = ay; SEG[2] = bx; SEG[3] = by;
  projLine(g, f, SEG, stroke, false, look);
};

/** 多角形(塗り・縁)。 */
export const projPoly = (g: Graphics, f: ProjFrame, wpts: ArrayLike<number>, fill?: FillInput, stroke?: StrokeStyle, look: ProjLineLook = 'tele'): void => {
  const n0 = g.context.instructions.length;
  OUT.reset(); projPathInto(f, wpts, true, TOL, OUT);
  paint(g, OUT, fill, stroke, true, f, look);
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
/**
 * 記号の線(終点の輪・楕円の印の縁)。線の幅にも記号と同じ倍率 k(★#23=s)を掛け(北の縁は細く)、その幅が画面で 1px を
 * 下回るなら 1px に止めて薄くする(§3-6g3・監査 A-1)。a=中心のフェード、diamAlpha=直径の下限の濃さの掛け率。
 * 濃さの下げは「直径の下限」と「線幅の下限」の強い方の1回だけ(掛け合わせて二重に薄くしない)。
 */
const projGlyphStrokeStyle = (st: StrokeStyle, a: number, k: number, z: number, diamAlpha = 1): StrokeStyle => {
  const o = projGlyphStrokeLook(st.width ?? 1, a, k, z, diamAlpha);
  return { ...st, width: o.width, alpha: (st.alpha ?? 1) * o.alpha };
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
  if (stroke !== undefined) g.circle(q.x, q.y, rr).stroke(projGlyphStrokeStyle(stroke, q.a, q.k, f.wgScale, m.alpha));
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
  if (stroke !== undefined) g.ellipse(q.x, q.y, rx * kk, ry * kk).stroke(projGlyphStrokeStyle(stroke, q.a, q.k, f.wgScale, m.alpha));
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
  // MeshSimple の onRender(毎フレーム位置バッファを update)を外す: destroy 後も RenderGroup に残って
  // this.geometry=null で毎フレーム投げ、画面が真っ暗になった(iPhone Safari)。位置の update は projMeshGrid が自分で呼ぶ。
  m.onRender = null;
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
  /** 円の絵(予告の輪・届く距離の輪・陣・光だまり 等)=真円を倒した写し(projGridFlatInto・社長 2026-11-24「やはり真円にしたい」)。 */
  flat = false,
): ProjGridResult => {
  if (mesh.destroyed || !mesh.geometry) return { nx: 0, ny: 0, pts: 0, wyMin: 0, wyMax: 0, sMax: 0, aMax: 0 }; // destroy 済みは書かない
  const posBuf = mesh.geometry.getBuffer('aPosition');
  const pos = posBuf.data as Float32Array;
  const uvBuf = mesh.geometry.getBuffer('aUV');
  const uv = uvBuf.data as Float32Array;
  const res = flat ? projGridFlatInto(f, fr, grid.rowPx, grid.colPx, maxN, pos, uv) : projGridInto(f, fr, grid.rowPx, grid.colPx, maxN, pos, uv);
  // 左右/上下に返した絵(Sprite の scale が負)は UV を返す(頂点の位置はそのまま=四角は同じ)
  if (flipU || flipV) for (let k = 0; k < uv.length; k += 2) { if (flipU) uv[k] = 1 - uv[k]; if (flipV) uv[k + 1] = 1 - uv[k + 1]; }
  posBuf.update();
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
  grid: { rowPx: number; colPx: number } = PROJ_GRID_SOFT, dScale = 1, g?: Graphics, flat = false,
): ProjGridResult | null => {
  if (mesh.destroyed || !mesh.geometry) return null; // destroy 済みは触らない
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
  return projMeshGrid(mesh, f, { cx, cy, w, h, rot }, grid, PROJ_GRID_MAX, g, sx < 0, sy < 0, flat);
};

// ---- 段階3: 描いた命令をまとめて相似で写す(§3-7c・3-7l 作る物2 の projOnBody を命令の範囲へ) ----

const SIM_M = new Matrix();
const SIM_TMP = new GraphicsPath();
const SIM_PATHS = new Set<GraphicsPath>();
const SIM_STYLES = new Map<object, object>();
/** 範囲の外の命令と共有していた path → 写す側の複製(範囲の中で同じ path を使う命令は同じ複製=1回だけ写す・監査2巡目 B-1)。 */
const SIM_CLONES = new Map<GraphicsPath, GraphicsPath>();
/** 写せない形を含む path(その path は全部写さない・監査2巡目 B-2)。 */
const SIM_BAD = new Set<GraphicsPath>();
/** 形の命令の data の中の変換行列の添字(GraphicsPath の circle/rect/ellipse/poly/roundRect/regularPoly/chamferRect)。 */
const SIM_XF_AT: Record<string, number> = { circle: 3, rect: 4, ellipse: 4, poly: 2, roundRect: 5, regularPoly: 5, chamferRect: 5 };
/** 点の列の命令(Pixi の GraphicsPath.transform で写す)。 */
const SIM_PT_ACTS = new Set(['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arcToSvg', 'closePath']);
/** 自分の行列を持たない形と arcTo(相似の時だけ数で写せる)。 */
const SIM_SIMILAR_ONLY = new Set(['roundPoly', 'filletRect', 'roundShape', 'arcTo']);

type SimPI = { action: string; data: unknown[] };
type SimAff = { a: number; b: number; c: number; d: number; tx: number; ty: number; k: number; similar: boolean };
const SIM_A: SimAff = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, k: 1, similar: true };

/** path(addPath の入れ子も)が全部写せる形か(1つでも外があれば false=その path は全部写さない・監査2巡目 B-2)。 */
const simPathOk = (path: GraphicsPath, similar: boolean): boolean => {
  const pis = path.instructions as unknown as SimPI[];
  for (let j = 0; j < pis.length; j++) {
    const act = pis[j].action;
    if (act === 'arc' || SIM_XF_AT[act] !== undefined || SIM_PT_ACTS.has(act)) continue; // arc は相似でなければ折れ線に直す
    if (SIM_SIMILAR_ONLY.has(act)) { if (similar) continue; return false; }
    if (act === 'addPath') {
      const sub = pis[j].data[0] as GraphicsPath | undefined;
      const t = pis[j].data[1] as Matrix | undefined;
      if (!sub || (t && !t.isIdentity()) || !simPathOk(sub, similar)) return false; // 入れ子の行列つきは写さない(掛ける順が合わない)
      continue;
    }
    return false;
  }
  return true;
};

/** arc を Pixi の buildArc と同じ点の列にする(相似でない写し=楕円に潰す・監査2巡目 B-2)。作り置きの配列に world の点を書いて返す。 */
const SIM_ARC: number[] = [];
const simArcPoints = (x: number, y: number, r: number, start: number, end: number, ccw: boolean): number[] => {
  const out = SIM_ARC;
  out.length = 0;
  let dist = Math.abs(start - end);
  if (!ccw && start > end) dist = 2 * Math.PI - dist;
  else if (ccw && end > start) dist = 2 * Math.PI - dist;
  const steps = Math.max(3, Math.max(6, Math.floor(6 * Math.pow(Math.max(0, r), 1 / 3) * (dist / Math.PI))));
  const f = (dist / steps) * (ccw ? -1 : 1);
  let t = start;
  for (let i = 0; i < steps + 1; i++) { out.push(x + Math.cos(t) * r, y + Math.sin(t) * r); t += f; }
  return out;
};

/**
 * path の命令を A で写す(simPathOk が通った path だけ)。own=false は data の中の行列・点の物を元の path と共有している(複製を写す)。
 * addPath の入れ子は深く複製してから写す(入れ子の path は元の path と命令の物を共有している=元を動かさない・監査2巡目 B-1)。
 */
const simXfPath = (path: GraphicsPath, own: boolean, A: SimAff): void => {
  const pis = path.instructions as unknown as SimPI[];
  let poly = false; // 開いている線の列があるか(arc を折れ線に直す時の最初の点=lineTo か moveTo か=Pixi の arc と同じつなぎ方)
  for (let j = 0; j < pis.length; j++) {
    const pi = pis[j];
    const a = pi.data as number[];
    const act = pi.action;
    if (act === 'arc') { // [x, y, r, a0, a1, ccw]
      if (A.similar) { // 相似(回転なし)なら中心を写して半径を k 倍
        const x0 = a[0], y0 = a[1];
        a[0] = A.a * x0 + A.c * y0 + A.tx; a[1] = A.b * x0 + A.d * y0 + A.ty; a[2] *= A.k;
      } else { // 相似でない=同じ点の列の折れ線にして写す(楕円に潰れる)
        const pts = simArcPoints(a[0], a[1], a[2], a[3], a[4], !!a[5]);
        const rep: SimPI[] = [];
        for (let q = 0; q < pts.length; q += 2) {
          const x = pts[q], y = pts[q + 1];
          rep.push({ action: q === 0 && !poly ? 'moveTo' : 'lineTo', data: [A.a * x + A.c * y + A.tx, A.b * x + A.d * y + A.ty] });
        }
        pis.splice(j, 1, ...rep);
        j += rep.length - 1;
      }
      poly = true;
    } else if (act === 'arcTo') { // [x1, y1, x2, y2, r](相似の時だけ=simPathOk)
      const x1 = a[0], y1 = a[1], x2 = a[2], y2 = a[3];
      a[0] = A.a * x1 + A.c * y1 + A.tx; a[1] = A.b * x1 + A.d * y1 + A.ty; a[2] = A.a * x2 + A.c * y2 + A.tx; a[3] = A.b * x2 + A.d * y2 + A.ty; a[4] *= A.k;
      poly = true;
    } else if (SIM_XF_AT[act] !== undefined) {
      // 形の命令(circle・rect・ellipse・poly 等)は自分の変換行列を持つ(Pixi の transform は ellipse の添字を誤る=自前で写す)
      const at = SIM_XF_AT[act];
      const m = pi.data[at] as Matrix | undefined;
      pi.data[at] = m ? (own ? m : m.clone()).prepend(SIM_M) : SIM_M.clone();
      poly = false;
    } else if (SIM_PT_ACTS.has(act)) {
      SIM_TMP.instructions.length = 0;
      SIM_TMP.instructions.push(pi as never);
      SIM_TMP.transform(SIM_M);
      SIM_TMP.instructions.length = 0;
      poly = act !== 'closePath';
    } else if (act === 'addPath') { // [path, transform](行列つきは simPathOk で外した)
      const sub = (pi.data[0] as GraphicsPath).clone(true);
      pi.data[0] = sub;
      simXfPath(sub, false, A);
      poly = false;
    } else if (act === 'roundPoly') { // [x, y, radius, sides, corner, rotation](相似の時だけ)
      const x0 = a[0], y0 = a[1];
      a[0] = A.a * x0 + A.tx; a[1] = A.d * y0 + A.ty; a[2] *= A.k; a[4] *= A.k;
      poly = false;
    } else if (act === 'filletRect') { // [x, y, w, h, fillet](相似の時だけ)
      const x0 = a[0], y0 = a[1];
      a[0] = A.a * x0 + A.tx; a[1] = A.d * y0 + A.ty; a[2] *= A.k; a[3] *= A.k; a[4] *= A.k;
      poly = false;
    } else if (act === 'roundShape') { // [points{x, y, radius?}[], radius, ...](相似の時だけ)
      let pts = pi.data[0] as { x: number; y: number; radius?: number }[];
      if (!own) { pts = pts.map(q => ({ ...q })); pi.data[0] = pts; }
      for (const q of pts) { q.x = A.a * q.x + A.tx; q.y = A.d * q.y + A.ty; if (typeof q.radius === 'number') q.radius *= A.k; }
      pi.data[1] = ((pi.data[1] as number) ?? 0) * A.k;
      poly = false;
    }
  }
  (path as unknown as { _dirty: boolean })._dirty = true;
};

/** 監査2巡目 B-2: 写せない形を含んで写さなかった命令の数(累計・番人テストと計器が読む)。 */
export const PROJ_AFFINE_SKIPPED = { n: 0 };

/**
 * Graphics の命令 n0 から今まで(このフレームに描いた分)を、world の点 X → P + k·(X − F) の相似で写す
 * (体の部位の飾り=持ち主の体の相似 k=s/d・地面の点の派手さ=付け根の相似 k=s_fx)。線の太さは kLine 倍。
 * 頂点ごとの投影ではない(相似=小さな絵を付け根の点で置く「点」「体」の型)。写した命令は部品の命令として数える
 * (計器の「直書きの漏れ」に出さない)。`?proj=1` の時だけ呼ぶ。
 */
export const projSimFrom = (
  g: Graphics, n0: number, fx: number, fy: number, px: number, py: number, k: number, kLine: number = k, alphaMul = 1, n1In = -1,
): void => {
  projAffineFrom(g, n0, k, 0, 0, k, px - k * fx, py - k * fy, kLine, alphaMul, n1In);
};

/**
 * projSimFrom の一般形: 命令 n0 から今まで(または n1)を、アフィン X → [a c; b d]·X + (tx, ty) で写す(杭の「両」=根元と先を別々の点へ)。
 * 弧(arc)は相似なら中心を写して半径を sqrt|det| 倍・相似でなければ同じ点の列の折れ線にして写す(楕円に潰れる)。arcTo と
 * 自分の行列を持たない形(roundPoly・filletRect・roundShape)は相似の時だけ写す。写せない形を1つでも含む path は全部写さない
 * (半分だけ写さない・数えない=計器の漏れに残る・監査2巡目 B-2)。線の太さは kLine 倍。
 * path の共有の守り(監査2巡目 B-1): 範囲の始まりの前(n0−1)・終わりの後(n1)の命令と同じ path を使う命令は複製を写す
 * (範囲の中で同じ path を使う命令=fill→stroke→fill は同じ複製を1回だけ写す)。addPath の入れ子は深く複製してから写す。
 */
export const projAffineFrom = (
  g: Graphics, n0: number, ma: number, mb: number, mc: number, md: number, tx: number, ty: number, kLine = 1, alphaMul = 1, n1In = -1,
): void => {
  const ins = g.context.instructions;
  const n1 = n1In >= 0 ? Math.min(n1In, ins.length) : ins.length;
  if (n1 <= n0) return;
  SIM_M.set(ma, mb, mc, md, tx, ty);
  const A = SIM_A;
  A.a = ma; A.b = mb; A.c = mc; A.d = md; A.tx = tx; A.ty = ty;
  A.k = Math.sqrt(Math.abs(ma * md - mb * mc));
  // 相似(回転なし・縦横同じ正の倍率)か
  A.similar = Math.abs(mb) < 1e-12 && Math.abs(mc) < 1e-12 && Math.abs(ma - md) < 1e-9 && ma > 0;
  // 監査 B-2 ①・2巡目 B-1: fill/stroke は _tick===0 の時に直前の命令と同じ path を共有する(Pixi の GraphicsContext.fill/stroke・続けて何回でも)。
  // 範囲をまたいで共有していれば、範囲の外の命令は必ず境目の隣(n0−1 か n1)にいる=その2つの path を使う命令は複製を写す
  const pathAt = (i: number) => (ins[i] as { data?: { path?: GraphicsPath } } | undefined)?.data?.path;
  const before = n0 > 0 ? pathAt(n0 - 1) : undefined;
  const after = n1 < ins.length ? pathAt(n1) : undefined;
  SIM_PATHS.clear(); SIM_STYLES.clear(); SIM_CLONES.clear(); SIM_BAD.clear();
  let skipped = 0;
  for (let i = n0; i < n1; i++) {
    const it = ins[i] as { action: string; data: { path?: GraphicsPath; style?: { width?: number; alpha?: number }; transform?: Matrix; alpha?: number } };
    const d = it.data;
    if (it.action === 'texture') {
      // 行列は命令ごとの複製(GraphicsContext.texture が clone している)=その場で掛けてよい(毎フレームの複製をやめる・監査 B-1)
      if (d.transform) d.transform.prepend(SIM_M);
      if (alphaMul !== 1 && typeof d.alpha === 'number') d.alpha *= alphaMul; // 監査 B-2 ④: 絵の命令にも濃さを掛ける
      continue;
    }
    if (it.action !== 'fill' && it.action !== 'stroke') { skipped++; continue; } // 許可リスト(cut 等は写さない=計器の漏れに残る)
    let path = d.path;
    if (!path || SIM_BAD.has(path)) { skipped++; continue; }
    let own = true;
    if (path === before || path === after) { // 範囲の外と共有=複製を写す(命令ごとの data まで複製=clone(true))
      let c = SIM_CLONES.get(path);
      if (!c) {
        if (!simPathOk(path, A.similar)) { SIM_BAD.add(path); skipped++; continue; }
        c = path.clone(true); SIM_CLONES.set(path, c);
      }
      d.path = c; path = c; own = false;
    }
    if (!SIM_PATHS.has(path)) {
      if (own && !simPathOk(path, A.similar)) { SIM_BAD.add(path); skipped++; continue; } // 写せない形を含む=全部写さない(数える)
      SIM_PATHS.add(path);
      simXfPath(path, own, A);
    }
    const st = d.style;
    if (st && (it.action === 'stroke' ? kLine !== 1 || alphaMul !== 1 : alphaMul !== 1)) {
      // 線の太さ・濃さ(style は命令の間で共有されることがある=写した物を使い回す)
      let ns = SIM_STYLES.get(st);
      if (!ns) {
        ns = { ...st, ...(it.action === 'stroke' ? { width: (st.width ?? 1) * kLine } : {}), alpha: (st.alpha ?? 1) * alphaMul };
        SIM_STYLES.set(st, ns);
      }
      d.style = ns as typeof st;
    }
  }
  SIM_PATHS.clear(); SIM_STYLES.clear(); SIM_CLONES.clear(); SIM_BAD.clear();
  // onUpdate は GraphicsContext の protected(命令を直に書き換えた後に描き直しを知らせる唯一の口)。
  (g.context as unknown as { onUpdate(): void }).onUpdate();
  if (skipped > 0) PROJ_AFFINE_SKIPPED.n += skipped;
  statOf(g).cmds += n1 - n0 - Math.min(n1 - n0, skipped);
};

/** 番人テスト用(監査 B-2): projAffineFrom が写す命令と形の種類(許可リスト)。 */
export const PROJ_AFFINE_ALLOWED = {
  cmds: ['fill', 'stroke', 'texture'],
  shapes: ['arc', ...Object.keys(SIM_XF_AT), 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arcToSvg', 'closePath', 'addPath'],
  similarOnly: ['roundPoly', 'filletRect', 'roundShape', 'arcTo'],
} as const;
