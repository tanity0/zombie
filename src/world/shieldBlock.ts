// シールドで技を防ぐ(research/SHIELD_BLOCK.md・社長 2026-10-17/18)。判定だけの純関数(描画は import しない)。
//
// 「影」= 判定源から相手の中心への線分が、味方の盾の矩形を通ること(壁の陰 `segmentBlocked` と同じ式)。
//   円・扇 = 影 かつ 相手の体と盾の距離が 40px 以内 / 帯・突進・レーザー = 影だけ。
//   相手の中心か判定源が盾の中にある時は「後ろ」が決まらない=防がない。
import { segmentIntersectsRect, type Rect } from './obstacles';

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
