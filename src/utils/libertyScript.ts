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
/** 戻り切ったとみなす距離(手前で減速して寄せるので小さくてよい=列へ吸い付く跳びを作らない)。 */
export const LIB_RETURN_ARRIVE_PX = 6;
/** 戻りの減速: 残り距離×この係数(/s)を速さの上限にする(手前でゆるむ=慣性MUST)。 */
export const LIB_RETURN_EASE_PER_S = 4;
/** 旗手の歩き出し/止まりの加減速(px/s²)。周回の速さ(約48px/s)まで約0.3秒。 */
export const LIB_BEARER_ACCEL = 150;
/** 叫喚の発生点=足元からこの高さ(絵の口〜旗の根元あたり。絵は約230px)。 */
export const LIB_HEAD_PX = 185;
/** 叫喚の輪・発光の寸法の倍率(叫喚型の絵は約105px・旗手は約230px)。 */
export const LIB_SCREAM_FX_SCALE = 1.7;
/** 殴られてからこの間(ms・実時間=lastHit と同じ時計)は「見つけた」扱い。 */
export const LIB_HIT_ALERT_MS = 600;
/** 列のばらつき(1体ごとに決まった遅れ・横ズレの最大量)。同じ個体はいつも同じだけずれる=癖。 */
export const LIB_JITTER_PX = 10;
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

/**
 * 列の1体ごとの癖(遅れ・横ズレ。どちらも ±LIB_JITTER_PX)。敵IDから決まる=同じ個体はいつも同じ。
 * 定規で引いたような等間隔の列にしない(クリエイティブ監査 #6)。
 */
export const hordeJitter = (id: string): { gap: number; lat: number } => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  const a = ((h >>> 0) % 1000) / 999, b = (((h >>> 10) >>> 0) % 1000) / 999;
  return { gap: (a * 2 - 1) * LIB_JITTER_PX, lat: (b * 2 - 1) * LIB_JITTER_PX };
};
