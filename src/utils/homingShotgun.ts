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

// ── 撃ち出しの扇+慣性つきの誘導(社長指示2026-11-13「さすがに広がらなさすぎるので、撃ち出しは
// 狭めに拡散発射後、慣性を持って誘導されるイメージで」) ──────────────────────────────
// 旧: 撃った1フレーム目から全速(半径40px相当=17.6rad/s)で目標へ折れ曲がるため、9粒がほぼ1本に
// 見えていた。新: ①狭めの扇+粒ごとの小さなばらつきで撃ち出す ②撃ち出し直後は真っすぐ飛ぶ
// ③その後、曲がる速さの上限を発射からの時間でなめらかに0→全速へ上げる(=慣性)。
// 弾の速さ(スカラー)・目標の選び方・旋回半径(全速時)は変えない。数値は叩き台(実機で詰める)。

/** 撃ち出しの扇の全幅(rad)。約23度。旧=T3既定0.36rad(約21度)の等間隔。 */
export const HOMING_PELLET_LAUNCH_SPREAD_RAD = 0.40;
/** 粒ごとの撃ち出し角のばらつき(±rad)。約±1度。等間隔の扇が機械的に見えないための崩し。
 *  粒の間隔(0.40/8=0.05rad)より十分小さく、扇の並び順(=目標の割り振り)は入れ替わらない。 */
export const HOMING_PELLET_LAUNCH_JITTER_RAD = 0.018;
/** 撃ち出し直後に曲がらず真っすぐ飛ぶ時間(ms・gameTime基準)。 */
export const HOMING_PELLET_STRAIGHT_MS = 80;
/** 真っすぐの後、曲がる速さが0から全速へ上がり切るまでの時間(ms・gameTime基準)。 */
export const HOMING_PELLET_TURN_RAMP_MS = 220;

/** 粒ごとのばらつき角(rad)。rand は [0,1) を返す関数(既定 Math.random・テストで差し替える)。 */
export const homingPelletLaunchJitterRad = (rand: () => number = Math.random): number =>
  (rand() * 2 - 1) * HOMING_PELLET_LAUNCH_JITTER_RAD;

/**
 * 発射からの経過(ms)→ 曲がる速さの倍率(0〜1)。真っすぐの間は0、その後 ease-in-out で1へ。
 * elapsedMs が undefined(発射時刻を持たない弾=衛星弾の放つ弾など)は従来どおり常に全速(1)。
 */
export const homingPelletTurnRampFactor = (elapsedMs: number | undefined): number => {
  if (elapsedMs === undefined) return 1;
  if (elapsedMs <= HOMING_PELLET_STRAIGHT_MS) return 0;
  const t = Math.min(1, (elapsedMs - HOMING_PELLET_STRAIGHT_MS) / HOMING_PELLET_TURN_RAMP_MS);
  return t * t * (3 - 2 * t);
};

/**
 * 1フレームぶんの旋回。今の向き(rad)を目標の向き(rad)へ、最大 maxTurnRadPerSec×deltaSec だけ寄せる
 * (行き過ぎない・近い回り方を取る)。返り値は新しい向き(rad)。
 */
export const stepHomingPelletAngle = (
  currentAngleRad: number,
  targetAngleRad: number,
  maxTurnRadPerSec: number,
  deltaSec: number,
): number => {
  const diff = ((targetAngleRad - currentAngleRad) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  const maxTurn = Math.max(0, maxTurnRadPerSec * deltaSec);
  return currentAngleRad + Math.sign(diff) * Math.min(Math.abs(diff), maxTurn);
};
