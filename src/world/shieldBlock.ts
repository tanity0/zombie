// シールドで技を防ぐ(research/SHIELD_BLOCK.md・社長 2026-10-17/18)。判定だけの純関数(描画は import しない)。
//
// 「影」= 判定源から相手の中心への線分が、味方の盾の矩形を通ること(壁の陰 `segmentBlocked` と同じ式)。
//   円・扇 = 影 かつ 相手の体と盾の距離が 40px 以内 / 帯・突進・レーザー = 影だけ。
//   相手の中心か判定源が盾の中にある時は「後ろ」が決まらない=防がない。
import { segmentIntersectsRect, type Rect } from './obstacles';
import { distToBandRect, distToSegment } from '../utils/geometry'; // 依存ゼロの葉モジュール(循環しない)

/** 円・扇の攻撃を盾が防ぐ距離(相手の体の矩形と盾の矩形の間・px)。社長「シールドから40px以内」。 */
export const SHIELD_AREA_GUARD_PX = 40;

/** 盾として読む欄(projectiles の一部)。 */
export interface ShieldLike {
  weaponType?: string;
  hostile?: boolean;
  x: number; y: number; width: number; height: number;
}

/** 味方の盾(プレイヤー・守護霊が置いた物=hostile でない)の矩形。世界に最大1枚。無ければ null。 */
export const friendlyShieldRect = (projectiles: readonly ShieldLike[]): Rect | null => {
  for (const p of projectiles) {
    if (p.weaponType === 'shield' && p.hostile !== true) return { x: p.x, y: p.y, width: p.width, height: p.height };
  }
  return null;
};

const inside = (x: number, y: number, r: Rect): boolean =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

/** 判定源 src から相手の中心 (tx,ty) を見て、盾の影に居るか。 */
export const inShieldShadow = (srcX: number, srcY: number, tx: number, ty: number, shield: Rect | null): boolean => {
  if (!shield) return false;
  if (inside(srcX, srcY, shield) || inside(tx, ty, shield)) return false;
  return segmentIntersectsRect(srcX, srcY, tx, ty, shield);
};

/** 2つの矩形の間の距離(重なっていれば 0)。 */
export const rectGap = (a: Rect, b: Rect): number => {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.hypot(dx, dy);
};

/** 円・扇の攻撃: 影 かつ 盾から 40px 以内なら防ぐ。 */
export const shieldBlocksArea = (srcX: number, srcY: number, target: Rect, shield: Rect | null): boolean => {
  if (!shield) return false;
  if (!inShieldShadow(srcX, srcY, target.x + target.width / 2, target.y + target.height / 2, shield)) return false;
  return rectGap(target, shield) <= SHIELD_AREA_GUARD_PX;
};

/** 帯・突進・レーザーの攻撃: 影なら防ぐ(距離なし)。 */
export const shieldBlocksLine = (srcX: number, srcY: number, target: Rect, shield: Rect | null): boolean =>
  !!shield && inShieldShadow(srcX, srcY, target.x + target.width / 2, target.y + target.height / 2, shield);

/**
 * 光線の絵の長さ: 起点 (ox,oy) から向き (ux,uy)(単位ベクトル)へ len 進む中心線が、盾に最初に当たる所までの長さ。
 * 当たらなければ len のまま。起点が盾の中なら切らない。
 */
export const clipBeamAtShield = (ox: number, oy: number, ux: number, uy: number, len: number, shield: Rect | null): number => {
  if (!shield || !(len > 0)) return len;
  if (inside(ox, oy, shield)) return len;
  // スラブ法: 中心線と矩形の入りの t(0..len)。
  let t0 = 0, t1 = len;
  const slab = (o: number, d: number, lo: number, hi: number): boolean => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
    let a = (lo - o) / d, b = (hi - o) / d;
    if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    return t0 <= t1;
  };
  if (!slab(ox, ux, shield.x, shield.x + shield.width)) return len;
  if (!slab(oy, uy, shield.y, shield.y + shield.height)) return len;
  return Math.max(0, Math.min(len, t0));
};

/**
 * 光線(帯)の終点を、盾に入る所で切る(research/SHIELD_BLOCK.md §2「レーザー=壁」)。
 * roundHalfWidth: 先が丸い判定/絵(`distToBandRect` や丸い線の先端=終点から半幅ぶん先まで光る)の時は半幅を渡す。
 *   到達距離を len+半幅 として盾に当て、終点は半幅ぶん手前=光が盾の面より先へ届かない。丸くなければ 0。
 * 切れなければ終点はそのまま(clipped=false)。盾が無い・起点が盾の中・長さ0も切らない。
 */
export const clipBeamEnd = (
  fx: number, fy: number, tx: number, ty: number, shield: Rect | null, roundHalfWidth = 0,
): { x: number; y: number; clipped: boolean } => {
  if (!shield) return { x: tx, y: ty, clipped: false };
  const dx = tx - fx, dy = ty - fy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: tx, y: ty, clipped: false };
  const ux = dx / len, uy = dy / len;
  const reach = len + roundHalfWidth;
  const c = clipBeamAtShield(fx, fy, ux, uy, reach, shield);
  if (c >= reach) return { x: tx, y: ty, clipped: false };
  const e = Math.max(0, c - roundHalfWidth);
  return { x: fx + ux * e, y: fy + uy * e, clipped: true };
};

/** 共通路の爆風(pumpkinBlasts)の形のうち、盾の判定に要る欄だけ。 */
export interface BlastShapeLike {
  x: number; y: number;
  capsule?: { fx: number; fy: number; tx: number; ty: number; halfWidth: number };
  fan?: { cx: number; cy: number };
  origin?: { x: number; y: number };
  beam?: boolean;
}

/**
 * 共通路の爆風が target(プレイヤーの体)に届く前に盾で止まるか。レーザー(`beam` かつ capsule)は壁=終点を切る側
 * (clipBeamEnd)で扱うので、ここでは false を返す。
 *   扇 = 扇の要から / 長さ0の帯 = 円として帯の始点から / 円 = 爆心から : shieldBlocksArea(影 かつ 40px 以内)
 *   帯 = 起点(origin、無ければ始点)から : shieldBlocksLine(影だけ)
 */
export const blastBlockedByShield = (b: BlastShapeLike, target: Rect, shield: Rect | null): boolean => {
  if (!shield) return false;
  if (b.fan) return shieldBlocksArea(b.fan.cx, b.fan.cy, target, shield);
  const c = b.capsule;
  if (c) {
    if (b.beam) return false;
    if (c.fx === c.tx && c.fy === c.ty) return shieldBlocksArea(c.fx, c.fy, target, shield);
    return shieldBlocksLine(b.origin?.x ?? c.fx, b.origin?.y ?? c.fy, target, shield);
  }
  return shieldBlocksArea(b.x, b.y, target, shield);
};

/**
 * 回る光線(巨人の g-sweepbeam: 中心 (cx,cy) から向き angle へ、懐 inner を空けて長さ length・半幅 halfWidth)を盾で切った形。
 * 起点は回転の中心 (cx,cy)。懐の中で盾に当たる/切った先が懐に届かない時は丸ごと塞がれる(blocked)。
 * 判定(store)と絵(pixiScene)が同じこの関数を読む=見えている光と当たりが一致する。
 */
export const clipSweepBeam = (
  cx: number, cy: number, angle: number, inner: number, length: number, halfWidth: number, shield: Rect | null,
): { nearX: number; nearY: number; farX: number; farY: number; blocked: boolean; clipped: boolean } => {
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const nearX = cx + ux * inner, nearY = cy + uy * inner;
  const farX = cx + ux * (inner + length), farY = cy + uy * (inner + length);
  const e = clipBeamEnd(cx, cy, farX, farY, shield, halfWidth);
  if (!e.clipped) return { nearX, nearY, farX, farY, blocked: false, clipped: false };
  if (Math.hypot(e.x - cx, e.y - cy) <= inner) return { nearX, nearY, farX: nearX, farY: nearY, blocked: true, clipped: true };
  return { nearX, nearY, farX: e.x, farY: e.y, blocked: false, clipped: true };
};

// ---------------------------------------------------------------------------------------------
// 光線の幅 × 盾の影(research/SHIELD_BLOCK.md §8・社長 2026-10-18「判定も幅で切る」)
// 盾が作る影は盾そのものの幅(光線の向きに垂直な方向への盾の広がり)だけ。光線がそれより太ければ、影の外の縁は
// 盾の脇をそのまま通り抜けて当たる。身体が丸ごと影の帯の中(盾の向こう側)にある時だけ安全。
// 光線を「影に入った中央の帯(盾の面で止まる)」と「影の外の縁の帯(全長のまま)」に割り、絵も判定も同じ帯の並びを読む。
// ---------------------------------------------------------------------------------------------

/** 割った光線の1本の帯(中心線 f→t・半幅)。判定は distToBandRect(両端を半幅ぶん伸ばす四角)か distToSegment(丸い)で読む。 */
export interface BeamStrip { fx: number; fy: number; tx: number; ty: number; halfWidth: number }

export interface BeamShieldSplit {
  /** 割った帯の並び(0〜3本)。懐(startOffset)の中で塞がれた中央の帯は含まない。 */
  strips: BeamStrip[];
  /** 影が光線の中心線を覆っているか(中央が止まっているか)。 */
  centerStopped: boolean;
  /** 影が覆っている光線の横幅(px)。盾が光線を受けている幅。 */
  coverPx: number;
  /** 光線が盾の面に当たる点(影の帯の真ん中)と、光線の向き(u)・盾の面に沿う横向き(s)。演出の場所。 */
  contact: { x: number; y: number; ux: number; uy: number; sx: number; sy: number };
}

/**
 * 光線(起点 f → 終点 t・半幅 halfWidth)を盾の影で割る。盾が無い・起点が盾の中・影が光線に掛からない・盾の面が光線の
 * 届く先より遠い時は null(=割らない=呼び出し側は元の光線をそのまま使う=盾が無い時と1bitも変わらない)。
 *   tipExt: 判定/絵の先端が半幅ぶん伸びる形(distToBandRect・丸い先端)なら true。止まる帯の終点を自分の半幅ぶん手前にする。
 *   startOffset: 起点から光が出始めるまでの懐(回る光線)。懐の中で止まった帯は含めない。
 */
export const splitBeamAtShield = (
  fx: number, fy: number, tx: number, ty: number, halfWidth: number, shield: Rect | null, tipExt: boolean, startOffset = 0,
): BeamShieldSplit | null => {
  if (!shield) return null;
  const dx = tx - fx, dy = ty - fy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  if (inside(fx, fy, shield)) return null;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  // 盾の横の広がり(光線の向きに垂直・起点基準)。
  let s0 = Infinity, s1 = -Infinity;
  for (const [cx, cy] of [[shield.x, shield.y], [shield.x + shield.width, shield.y], [shield.x, shield.y + shield.height], [shield.x + shield.width, shield.y + shield.height]] as const) {
    const s = (cx - fx) * nx + (cy - fy) * ny;
    if (s < s0) s0 = s;
    if (s > s1) s1 = s;
  }
  const hw = Math.max(0, halfWidth);
  const lo = Math.max(-hw, s0), hi = Math.min(hw, s1);
  if (hi < lo || (hw > 0 && hi - lo < 0.5)) return null;
  const m = (lo + hi) / 2, w = (hi - lo) / 2;
  const ox = fx + nx * m, oy = fy + ny * m;
  const reach = len + (tipExt ? w : 0);
  const c = clipBeamAtShield(ox, oy, ux, uy, reach, shield);
  if (c >= reach) return null;
  const strips: BeamStrip[] = [];
  const ext = (sw: number): number => (tipExt ? hw - sw : 0); // 細い帯でも先端が元の光線の先端に揃う分の延長
  // 止まる中央の帯: 盾の面で終わる(先端が伸びる形なら自分の半幅ぶん手前)。
  const endD = Math.max(0, c - (tipExt ? w : 0));
  if (startOffset <= 0 ? true : endD > startOffset) {
    const st = Math.max(0, startOffset) - ext(w);
    strips.push({ fx: ox + ux * st, fy: oy + uy * st, tx: ox + ux * Math.max(endD, st), ty: oy + uy * Math.max(endD, st), halfWidth: w });
  }
  // 影の外の縁の帯: 全長のまま通り抜ける。
  const side = (a: number, b: number): void => {
    if (b - a < 0.5) return;
    const sm = (a + b) / 2, sw = (b - a) / 2;
    const px = fx + nx * sm, py = fy + ny * sm;
    const st = Math.max(0, startOffset) - ext(sw);
    strips.push({ fx: px + ux * st, fy: py + uy * st, tx: tx + nx * sm + ux * ext(sw), ty: ty + ny * sm + uy * ext(sw), halfWidth: sw });
  };
  side(-hw, lo);
  side(hi, hw);
  return {
    strips,
    centerStopped: lo <= 0 && hi >= 0,
    coverPx: hi - lo,
    contact: { x: ox + ux * c, y: oy + uy * c, ux, uy, sx: nx, sy: ny },
  };
};

/** 割った帯の並びのどれかに、中心 (cx,cy)・半径 r の相手が触れるか。rectEnds=distToBandRect(四角)/ false=distToSegment(丸い)。 */
export const beamStripsHit = (strips: readonly BeamStrip[], cx: number, cy: number, r: number, rectEnds: boolean): boolean => {
  for (const b of strips) {
    const d = rectEnds
      ? distToBandRect({ x: cx, y: cy }, { x: b.fx, y: b.fy }, { x: b.tx, y: b.ty }, b.halfWidth)
      : distToSegment({ x: cx, y: cy }, { x: b.fx, y: b.fy }, { x: b.tx, y: b.ty }) - b.halfWidth;
    if (d <= r) return true;
  }
  return false;
};

/**
 * 判定源 (srcX,srcY) → 相手の中心 (tx,ty) の線分が、盾の矩形に入る点(盾の面の、攻撃した側)と、攻撃の進む向き(単位)。
 * 当たらない/盾が無い時は盾の中心。演出をそこに置くための純関数。
 */
export const shieldContactPoint = (
  srcX: number, srcY: number, tx: number, ty: number, shield: Rect,
): { x: number; y: number; dx: number; dy: number } => {
  const len = Math.hypot(tx - srcX, ty - srcY);
  const scx = shield.x + shield.width / 2, scy = shield.y + shield.height / 2;
  if (len < 1e-6) return { x: scx, y: scy, dx: 0, dy: 1 };
  const dx = (tx - srcX) / len, dy = (ty - srcY) / len;
  const c = clipBeamAtShield(srcX, srcY, dx, dy, len, shield);
  if (c >= len) return { x: scx, y: scy, dx, dy };
  return { x: srcX + dx * c, y: srcY + dy * c, dx, dy };
};

// ---------------------------------------------------------------------------------------------
// 光線の「絵」の計画(研究 SHIELD_BLOCK.md §8 の見た目・第2回クリエイティブ監査 2026-10-18)
// 判定は上の splitBeamAtShield(帯の並び)のまま。絵は帯を貼り直さず、**元の1本の断面**を盾の影で切った形で描く:
//   盾に当たるまでは1本の光線(元の層・元の幅)、盾の向こう側だけ影の外の縁が残る(元の断面のその横位置の切り出し)。
// 描画側(pixiScene)はこの計画を読んで多角形を作るだけ。ここは判定を1ミリも変えない純関数(描画は import しない)。
// ---------------------------------------------------------------------------------------------

export interface BeamDrawPlan {
  /** 起点・向き(単位)・横向き(単位・n = (-uy, ux))。 */
  fx: number; fy: number; ux: number; uy: number; nx: number; ny: number;
  /** 起点→終点の長さ。 */
  len: number;
  /** 盾の影が覆う横の範囲(光線の中心線を 0・n 向きが正)。**盾そのものの広がり**で、光線の太さでは切らない(広い層ほど縁が残る)。 */
  s0: number; s1: number;
  /** 判定側と同じ割り(strips が空 = 丸ごと塞がれた)。 */
  split: BeamShieldSplit;
  /** 横位置 l(中心線からの距離)の線が盾の面に入る距離(起点から)。当たらなければ maxLen。 */
  faceAt: (l: number, maxLen: number) => number;
  /** 中心線(横 0)が盾の面で止まる距離。影が中心線を覆っていなければ len。 */
  centerEnd: number;
}

/**
 * 光線の絵の計画。splitBeamAtShield が null(盾が無い・影が掛からない・面が先端より遠い)なら null=元の1本をそのまま描く。
 * 引数は splitBeamAtShield と同じ(絵と判定が必ず同じ「割る/割らない」を読む)。
 */
export const beamDrawPlan = (
  fx: number, fy: number, tx: number, ty: number, halfWidth: number, shield: Rect | null, tipExt: boolean, startOffset = 0,
): BeamDrawPlan | null => {
  if (!shield) return null;
  const split = splitBeamAtShield(fx, fy, tx, ty, halfWidth, shield, tipExt, startOffset);
  if (!split) return null;
  const dx = tx - fx, dy = ty - fy;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  let s0 = Infinity, s1 = -Infinity;
  for (const [cx, cy] of [[shield.x, shield.y], [shield.x + shield.width, shield.y], [shield.x, shield.y + shield.height], [shield.x + shield.width, shield.y + shield.height]] as const) {
    const s = (cx - fx) * nx + (cy - fy) * ny;
    if (s < s0) s0 = s;
    if (s > s1) s1 = s;
  }
  const faceAt = (l: number, maxLen: number): number =>
    clipBeamAtShield(fx + nx * l, fy + ny * l, ux, uy, maxLen, shield);
  const centerEnd = s0 <= 0 && s1 >= 0 ? Math.min(len, faceAt(0, len)) : len;
  return { fx, fy, ux, uy, nx, ny, len, s0, s1, split, faceAt, centerEnd };
};
