// ★攻撃の後で体が止まっている間は、移動の入力で向き(lastDirection=絵の左右)を変えない
// (社長指示2026-11-27「攻撃後に止まってる時に振り返れちゃうのは変だ」)。判定だけを置く純関数。
//  - 「止まっている」= 攻撃の後の歩く速さ(utils/meleeAfterMove の meleeAfterMoveMult)がちょうど 0 の間
//    (ナイフの振りの後の硬直・ナイフ/鞭の3段目の後の隙のうち 0 の区間)と、刀の着地の硬直(katana-recovery=居合一閃の溜め・殺陣を含む)・
//    燕返しのしゃがみ。明けて少しでも動けるようになったら(倍率 > 0)、今どおり入力の向きへ向く。
//  - 振りの最中(PLAYER_MELEE_SWING_MS)と格闘の段・技の間は、今までどおり呼び手の側の判定で止まる(ここでは見ない)。
//  - ワイヤー/一閃の走り・四神舞の滑りの間は止めない(その間は硬直の倍率が掛からない=速度が向きを決める・今どおり)。
//  - 攻撃そのものが向きを決める処理(振り始め・格闘の狙い・被弾反撃の向き直し等)は store が lastDirection を直接書くので、これには掛からない。
import type { DashLocomotionState } from '../types/game';
import { dashModeAt } from './dashLocomotion';
import { isTsubameCrouching } from './katanaTsubame';
import { meleeAfterMoveMult, type MeleeAfterMoveInput } from './meleeAfterMove';

export interface FacingLockAfterAttackInput extends MeleeAfterMoveInput {
  /** 一閃・ワイヤーの走りの器(Player がそのまま満たす)。 */
  dash: DashLocomotionState;
  /** 燕返しのしゃがみの終わり(`player.tsubameCrouchUntil`)。 */
  tsubameCrouchUntil: number | undefined;
  /** 四神舞の滑りの終わり(`player.shijinSlideUntil`)。 */
  shijinSlideUntil: number | undefined;
}

/** 攻撃の後で体が止まっていて、移動の入力で向きを変えてはいけない間なら true。 */
export const facingLockedAfterAttack = (i: FacingLockAfterAttackInput): boolean => {
  const mode = dashModeAt(i.dash, i.nowMs);
  if (mode === 'katana-recovery') return true; // 刀の着地の硬直(居合一閃の溜め・殺陣も同じ欄)
  if (mode === 'katana-dash') return isTsubameCrouching({ tsubameCrouchUntil: i.tsubameCrouchUntil }, i.nowMs); // 燕返しのしゃがみ=その場で止まる
  if (mode !== null) return false; // ワイヤーの走り・ホップ=強制移動の速度が向きを決める(今どおり)
  if (i.nowMs < (i.shijinSlideUntil ?? 0)) return false; // 四神舞の滑り(硬直の倍率が掛からない)
  return meleeAfterMoveMult(i) <= 0;
};
