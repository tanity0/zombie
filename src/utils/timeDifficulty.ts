// 社長指示v0.25.3328「時間での変化が欲しい。距離による強さの変化のベクトルが時間でも迫ってくる形」:
//
// 強さの新機軸は作らず、**距離(エリア0..4)の強さ軸に時間からも合わせにいく**。
// - 時間だけで進む「仮想エリア」が 0 → 4 へ直線で進み、**8:00 でピーク(=最深部相当)**。
// - 実効エリア = max(実エリア, 仮想エリア)。初期地でボーッとしていても敵の強さが迫ってくる。
//   距離を稼げば max() が実エリア側で立つ=自らそれを早められる。
// - 対象: 敵のHP/攻撃(AREA_BASE_DIFFICULTY)・速度/弾速(AREA_SPEED_MULT)・
//   アイテムのTier抽選(トレジャーランク/武器箱Tier率)。
// - **対象外(社長指示)**: 色付き(レア)個体の出現率=COLOR_RATE_BY_AREAは実エリア固定のまま。
//   固定強度タイプ(ジャイアント/死神/裏ボス/天使/アイドル/ラボ敵)も従来どおり不変。
//
// 純関数のみ(renderer非依存・store非依存)。テーブルの中間は線形補間=時間でなめらかに迫る。

export const TIME_DIFFICULTY_PEAK_MS = 8 * 60 * 1000; // 8:00で最深部相当(社長「８分をピークに一旦」)

/** 時間だけで進む仮想エリア(0..4の連続値)。0:00=0 → 8:00以降=4。 */
export const timeVirtualArea = (gameTimeMs: number): number =>
  4 * Math.max(0, Math.min(1, gameTimeMs / TIME_DIFFICULTY_PEAK_MS));

/** 実効エリア = max(実エリア, 仮想エリア)。強さ/アイテムTierの参照に使う(レア率には使わない)。 */
export const effectiveDifficultyArea = (area: number, gameTimeMs: number): number =>
  Math.max(area, timeVirtualArea(gameTimeMs));

/** エリア添字テーブル(長さ5)を連続値の実効エリアで線形補間して引く。 */
export const lerpAreaTable = (table: readonly number[], virtualArea: number): number => {
  const i = Math.max(0, Math.min(table.length - 1, virtualArea));
  const lo = Math.floor(i);
  const hi = Math.min(table.length - 1, lo + 1);
  return table[lo] + (table[hi] - table[lo]) * (i - lo);
};
