// UNIQUE_WEAPONS.md §16-2(バッチC-2「誘導散弾ショットガン」shotgun-t3-homing・2026-09-07 C-2検収A-3で確定)。
// 「各ペレットが近くの敵へ誘導。敵が複数なら分散・1体なら全弾集中」の対象割り振りと、
// ペレット専用の旋回速度を担う純関数(旋回そのものはgameStore.tsのhoming-missileと同じ式を
// 再利用=homingPelletフラグで開く。UNIQUE_WEAPONS.md §16-2「旋回そのものはホーミング弾に在るが
// 分岐に閉じているので開く必要」)。
//
// ★検収A-3の経緯: 既存のホーミング(誘導ロケット)の旋回速度をそのまま流用すると曲がれない。
// 誘導ロケットは弾速200px/sで旋回5rad/s=半径40px(=speed/turnRate)。このペレットは弾速705px/s
// なので同じ5rad/sだと半径141px=ショットガンの射程140pxより大きく、別方位の敵へ割り当てられた
// ペレットが曲がり切れずに素通りする。⇒ ペレット専用に「半径40px相当」の旋回速度を持つ(弾速÷40)。
//
// 対象の割り振りも「近い順round-robin」だと、真横の敵へ端のペレット(拡散角が一番外側)が
// 飛ばされてしまう(旋回半径はあっても曲がる角度が大きすぎて外す)。⇒ ペレットを拡散角の順、
// 対象をプレイヤーから見た方位角の順に並べ、近い方位どうしを対応させる(round-robinは維持)。

/** 誘導ペレットの旋回半径(px)。誘導ロケットと同じ曲がり具合(=speed/turnRate=40)。 */
export const HOMING_PELLET_TURN_RADIUS_PX = 40;

/** ペレットの旋回速度(rad/s)。弾速(px/s)÷旋回半径(px) = 誘導ロケットと同じ半径になる旋回速度。 */
export const homingPelletTurnRateRadPerSec = (speedPxPerSec: number): number =>
  speedPxPerSec > 0 ? speedPxPerSec / HOMING_PELLET_TURN_RADIUS_PX : 0;

/** 方位角つきの対象(プレイヤーから見た絶対角・atan2(dy,dx)・rad)。 */
export interface HomingShotgunAzimuthTarget { id: string; azimuthRad: number }

/**
 * ペレットの拡散角(rad・昇順=左〜右)と対象の方位角(rad)を、どちらも昇順に並べ替えてから
 * round-robinで対応させる(=「近い方位どうしを対応させる」)。真横の敵へ端のペレットが飛ばされる
 * 事故(近い順round-robinの弱点)を、拡散角と方位角の並び順を合わせることで防ぐ。
 * pelletOffsetsRad.length が返り値の長さ(=count)。targets が空なら全ペレットundefined。
 */
export const assignHomingShotgunTargetsByAzimuth = (
  pelletOffsetsRad: readonly number[],
  targets: readonly HomingShotgunAzimuthTarget[],
): (string | undefined)[] => {
  const count = pelletOffsetsRad.length;
  if (targets.length === 0) return new Array(count).fill(undefined);
  // ペレットは「元の(拡散角昇順の)並び順」のまま対象を割り当てる——computeShotAngleOffsetsが
  // 既に昇順(左〜右)で返すため、ここで並べ替えたインデックスを元の位置へ戻す必要が無い。
  const sortedTargets = [...targets].sort((a, b) => a.azimuthRad - b.azimuthRad);
  return pelletOffsetsRad.map((_offset, i) => sortedTargets[i % sortedTargets.length].id);
};
