// ボス級(英雄・賞金首)が持ち場へ戻る時の速さ(社長指示2026-10-24「高速である程度だけ戻る(完全には戻らないが、
// 自分もある程度戻らないと射程がはずれるくらいの距離)」)。依存ゼロの葉(英雄・賞金首の両方から読む)。
//
// 戻り始めにプレイヤーが撃てる距離に居る間だけ高速で離れ、撃てる距離の外へ出たら従来のゆっくりした歩きに戻す。
// =戻る背中を撃ち続けることはできず、撃ちたければプレイヤーも持ち場の方へ詰める必要がある。持ち場の近くで撃たれれば
// 振り返って戦う(英雄 heroHomingReengage / 賞金首 decideBountyLeash)。

/** 撃てる距離の目安(px)。銃の自動射撃の最長(ライフル 250 を最大の引き 0.6 で補正≈420)に少し余裕を足した値。 */
export const BOSS_HOMING_ESCAPE_PX = 450;

/** 撃てる距離の外でこの幅をかけて速さを緩める(急に歩きへ落とさない=慣性)。 */
export const BOSS_HOMING_EASE_PX = 150;
/** 戻る速さ(純関数): プレイヤーが撃てる距離に居る間は fast、その外 BOSS_HOMING_EASE_PX をかけて normal へ緩める。 */
export const bossHomingSpeed = (playerDistPx: number, normal: number, fast: number): number => {
  const t = Math.max(0, Math.min(1, (playerDistPx - BOSS_HOMING_ESCAPE_PX) / BOSS_HOMING_EASE_PX));
  const e = t * t * (3 - 2 * t);
  return fast + (normal - fast) * e;
};
