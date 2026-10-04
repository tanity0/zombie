// 解放軍群(変異)の純関数(research/LIBERTY_HORDE.md)。store も PixiJS も読まない=ヘッドレスでテストする。
import { variantTextureName } from './enemyVariant';

/** 後ろに連なるバット男の数(社長「常にコイツの後ろに赤レアのバット男が5体連なっている」)。 */
export const LIB_ESCORTS = 5;
/** 列の間隔(旗手から i 体目まで (i+1)×この距離 後ろ)。 */
export const LIB_SLOT_GAP_PX = 56;
/** 足跡を置く間隔。 */
export const LIB_TRAIL_STEP_PX = 20;
/** 足跡を持つ数(5体ぶん+余り)。 */
export const LIB_TRAIL_MAX = Math.ceil(((LIB_ESCORTS + 1) * LIB_SLOT_GAP_PX) / LIB_TRAIL_STEP_PX) + 4;
/** 見失う: 索敵範囲のこの倍より外、または画面外が続いたら。 */
export const LIB_LOSE_RANGE_MULT = 1.5;
export const LIB_LOSE_MS = 3000;
/** 列へ戻るバット男の歩き(px/s)。 */
export const LIB_RETURN_SPEED = 150;
/** 戻り切ったとみなす距離。 */
export const LIB_RETURN_ARRIVE_PX = 30;
/** 補充は旗手の真後ろ(向きの反対側)へこの距離。 */
export const LIB_REFILL_BEHIND_PX = 60;

/**
 * 周回の半径(社長裁定2026-10-04「深層域の位置は推薦で」)= **深層域に (デンジャーゾーンの幅の半分) 入った所**。
 * 英雄(デンジャーゾーンの入口からその幅の半分=輪の真ん中)と同じ取り方。今の境界なら 11250 + 1500 = 12750。
 */
export const libPatrolRadius = (areaThresholds: readonly number[]): number =>
  areaThresholds[3] + (areaThresholds[2] - areaThresholds[1]) / 2;

/**
 * 足跡(古い→新しいの順。最後が旗手のいちばん近く)を、新しい側から `dist` px たどった点。
 * 足跡が足りなければ、いちばん古い点からさらに同じ向きへ延ばした点を返す(出現直後・列が詰まらない)。
 */
export const trailPointAt = (
  trail: readonly { x: number; y: number }[], head: { x: number; y: number }, dist: number,
): { x: number; y: number } => {
  let prev = head;
  let left = dist;
  for (let i = trail.length - 1; i >= 0; i--) {
    const p = trail[i];
    const seg = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (seg >= left && seg > 0) {
      const k = left / seg;
      return { x: prev.x + (p.x - prev.x) * k, y: prev.y + (p.y - prev.y) * k };
    }
    left -= seg;
    prev = p;
  }
  // 足りない: 最後の向き(いちばん古い2点、無ければ head→最古)のまま延ばす。
  const a = trail.length >= 2 ? trail[1] : head;
  const b = trail.length >= 1 ? trail[0] : head;
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l < 1e-6) return { x: b.x, y: b.y + left };
  return { x: b.x + (dx / l) * left, y: b.y + (dy / l) * left };
};

/**
 * バット男の見た目は敵IDのハッシュで男女が決まる(`variantTextureName`)。**男になるまでIDに枝番を付けて引き直す**
 * (品質監査 A-2)。決定的(同じ元IDなら同じ結果)。
 */
export const maleBatId = (baseId: string): string => {
  if (variantTextureName('bat', baseId) === 'bat-male') return baseId;
  for (let k = 1; k < 64; k++) {
    const id = `${baseId}-m${k}`;
    if (variantTextureName('bat', id) === 'bat-male') return id;
  }
  return baseId;
};

/** 輪の上で、ある角度から時計回り側(=反時計回りに進む旗手の後ろ)へ弧長 `back` px の点。出現時の仮の足跡用。 */
export const ringPointBehind = (angle: number, R: number, back: number): { x: number; y: number } => {
  const a = angle + back / Math.max(1, R);
  return { x: Math.cos(a) * R, y: Math.sin(a) * R };
};
