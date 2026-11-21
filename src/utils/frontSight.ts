// 前方の扇の視界(社長裁定2026-10-05「解放軍と英雄、見つけるのは前方扇状で、後方は見ない。攻撃されると気付く」)。
// 葉モジュール(store も PixiJS も読まない)。解放軍(libertyTick)と英雄(heroTick)が同じ1本を引く。

/** 見つける距離(前方の扇の半径)。 */
export const FRONT_SIGHT_PX = 900;
/** 扇の半角(度)。左右60度=120度の扇。 */
export const FRONT_SIGHT_HALF_DEG = 60;
/** 見失う距離(見つける距離×1.5)。気づいた後は相手の方を向くので、扇ではなく距離で見失う。 */
export const FRONT_SIGHT_LOSE_PX = FRONT_SIGHT_PX * 1.5;
/** 殴られてからこの間(ms)は「気づいた」扱い。 */
export const STRUCK_NOTICE_MS = 600;
const COS = Math.cos((FRONT_SIGHT_HALF_DEG * Math.PI) / 180);

/**
 * (fx,fy)にいて(faceX,faceY)を向く者が、(tx,ty)を前方の扇で見つけるか。後ろと横は、すぐ隣でも見ない。
 * 向きが0なら何も見えない。
 */
export const frontConeSees = (
  fx: number, fy: number, faceX: number, faceY: number, tx: number, ty: number,
  range: number = FRONT_SIGHT_PX,
): boolean => {
  const dx = tx - fx, dy = ty - fy;
  const d = Math.hypot(dx, dy);
  if (d > range) return false;
  const fl = Math.hypot(faceX, faceY);
  if (fl < 1e-6) return false;
  if (d < 1e-6) return true;
  return (dx * faceX + dy * faceY) / (d * fl) >= COS;
};
