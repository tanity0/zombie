// 踏み込み回避(research/LUNGE_DODGE.md)の純関数。store も PixiJS も読まない葉モジュール
// (記録側 habitEpisode と再生側 ghostDriver の両方から引く=外向きの式を1本に保つ)。
import type { Rect } from '../world/obstacles';
import type { CounterReachShape } from './counterReach';

/** 踏み込みの向きの分類(コマの `lg`)。0=踏み込まない / 1=外へ / 2=横へ / 3=内へ。 */
export type LungeDirClass = 0 | 1 | 2 | 3;

/** 外/内とみなす角度の境目(外向きとの内積)。cos60°=0.5。 */
const LUNGE_CLASS_COS = 0.5;

const unit = (x: number, y: number): { x: number; y: number } | null => {
  const l = Math.hypot(x, y);
  return l > 1e-6 ? { x: x / l, y: y / l } : null;
};

/**
 * (x,y)にいる者にとっての、その技の図形の**外向き**(単位ベクトル)。§2-1:
 * 円=中心→自分 / 帯=いちばん近い帯の軸から自分のいる側への垂直 / 体=矩形の最近点→自分(中なら中心→自分)。
 * 決められない(中心ぴったり・紫)時は null。
 */
export const lungeOutward = (
  shape: CounterReachShape, bossRect: Rect, x: number, y: number,
): { x: number; y: number } | null => {
  if (shape.kind === 'none') return null;
  if (shape.kind === 'circle' || shape.kind === 'circle-or-body') return unit(x - shape.cx, y - shape.cy);
  if (shape.kind === 'band') {
    let best = Infinity;
    let out: { x: number; y: number } | null = null;
    for (const b of shape.bands) {
      const dx = b.tx - b.fx, dy = b.ty - b.fy;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const ux = dx / len, uy = dy / len;
      const rx = x - b.fx, ry = y - b.fy;
      const t = Math.max(0, Math.min(len, rx * ux + ry * uy));
      const perp = -rx * uy + ry * ux;
      const d = Math.hypot(rx - ux * t, ry - uy * t);
      if (d < best) {
        best = d;
        // 軸の左右どちらにいるか(perp の符号)で、その側への垂直。軸ぴったりなら左側を外とする。
        const s = perp >= 0 ? 1 : -1;
        out = { x: -uy * s, y: ux * s };
      }
    }
    return out;
  }
  // 体: 矩形の最近点→自分。中なら中心→自分。
  const nx = Math.max(bossRect.x, Math.min(x, bossRect.x + bossRect.width));
  const ny = Math.max(bossRect.y, Math.min(y, bossRect.y + bossRect.height));
  if (nx !== x || ny !== y) return unit(x - nx, y - ny);
  return unit(x - (bossRect.x + bossRect.width / 2), y - (bossRect.y + bossRect.height / 2));
};

/**
 * 踏み込みの向き(dirX,dirY)を、その位置での外向きに対して分類する。向きが0なら 0(踏み込まない)。
 * 外向きが決められない時は 3(内)扱い=再生で今どおり「ボスの方へ」へ落ちる側。
 */
export const lungeDirClass = (
  shape: CounterReachShape, bossRect: Rect, x: number, y: number, dirX: number, dirY: number,
): LungeDirClass => {
  const d = unit(dirX, dirY);
  if (!d) return 0;
  const o = lungeOutward(shape, bossRect, x, y);
  if (!o) return 3;
  const c = d.x * o.x + d.y * o.y;
  if (c >= LUNGE_CLASS_COS) return 1;
  if (c <= -LUNGE_CLASS_COS) return 3;
  return 2;
};
