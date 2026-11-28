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

// ★止まり中に入れた向きを覚えて、次の振りの振り始めでその向きへ振る(社長裁定2026-11-27「止まり中に入れた向きを覚えて、次の段の振り始めでその向きへ振る」)。
//  - 「覚える間」= 振りの最中(PLAYER_MELEE_SWING_MS)か、攻撃の後で止まっている間(facingLockedAfterAttack)。この間の向きの入力は絵を振り返らせず(今のまま)、覚えておく。
//  - その間に次の振りが出たら(ナイフの段の先行入力・刀の着地の硬直中の振り等)、振り始めの向き(lastDirection)を覚えた向きにする=踏み込み・弧・判定もその向き。
//  - 覚える間が明けたら覚えた向きは捨てる(明けた後は今どおり=入力の向きへ歩き出して向く)。指を離した(向き無し)の入力は覚えた向きを消さない。
/** 覚えておく向き(未設定=覚えていない)。 */
export type HeldFacing = { x: number; y: number } | undefined;

/** 向きの入力を覚える間か。swingAt=直近の振りの起点・swingMs=振りの最中の長さ・lockedAfterAttack=facingLockedAfterAttack の結果。 */
export const facingHoldActive = (swingAt: number | undefined, nowMs: number, swingMs: number, lockedAfterAttack: boolean): boolean => {
  const at = swingAt ?? 0;
  const since = nowMs - at;
  return (at > 0 && since >= 0 && since < swingMs) || lockedAfterAttack;
};

/** 覚える間に入った向きの入力を覚える(長さのある向きだけ・向き無し=前の覚えを残す)。 */
export const holdFacingInput = (prev: HeldFacing, dir: { x: number; y: number } | null | undefined): HeldFacing => {
  if (!dir) return prev;
  const m = Math.hypot(dir.x, dir.y);
  if (!(m > 1e-3)) return prev;
  return { x: dir.x, y: dir.y };
};

/** 振り始めの向き: 覚える間に覚えた向きがあればそれ・無ければ今の向き。 */
export const swingStartFacing = <T extends { x: number; y: number } | null>(last: T, held: HeldFacing, holdActive: boolean): T | { x: number; y: number } =>
  holdActive && held ? { x: held.x, y: held.y } : last;

/** 毎フレーム: 覚える間が明けたら覚えた向きを捨てる。 */
export const heldFacingAfterTick = (held: HeldFacing, holdActive: boolean): HeldFacing => (holdActive ? held : undefined);

/**
 * 振り始めに覚えた向きへ向き直した時の照準(aimX/aimY)。照準の長さ(スティックの傾き)はそのまま、向きだけ合わせる。
 * 振りの間は照準が止まる(movePlayer)ので、手元の弧・手のナイフ(照準の向きで描く)が古い向きに残らないよう振り始めで揃える。
 */
export const aimForSwingFacing = (aimX: number, aimY: number, face: { x: number; y: number }): { aimX: number; aimY: number } => {
  const fm = Math.hypot(face.x, face.y);
  const am = Math.hypot(aimX, aimY);
  if (!(fm > 1e-3) || !(am > 1e-3)) return { aimX, aimY };
  return { aimX: (face.x / fm) * am, aimY: (face.y / fm) * am };
};
