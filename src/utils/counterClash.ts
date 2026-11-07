/**
 * ★カウンターした地点(社長指示2026-10-01「エフェクトが出るのはカウンターした地点だよ」)。
 *
 * カウンターは「弾いた側(プレイヤー/守護霊/幻影)」が「攻撃(敵の体・弾・爆風・帯)」を受け止めた所で起きる。
 * その場所=**弾いた側の中心から、攻撃が来た方へ出た点**。成立の経路ごとに渡ってくる座標がばらばら
 * (ボスの中心・自機の中心・弾の位置・当たった点)なので、どの経路でも「弾いた側」と「攻撃の位置」の
 * 2点からこの1本で出す=経路によって砕けが敵の上や自機の顔に出る、を無くす。
 * - 間の距離の半分まで、ただし `COUNTER_CLASH_REACH_PX` を超えない(敵が遠くにいても腕の届く所で割れる)。
 * - 2点が重なる(弾いた側の真上で起きた)時は弾いた側の中心。
 */
export const COUNTER_CLASH_REACH_PX = 40;

export const counterClashPoint = (
  fromX: number, fromY: number, attackX: number, attackY: number,
  reachPx: number = COUNTER_CLASH_REACH_PX,
): { x: number; y: number } => {
  const dx = attackX - fromX, dy = attackY - fromY;
  const d = Math.hypot(dx, dy);
  if (!(d > 0.001)) return { x: fromX, y: fromY };
  const k = Math.min(d * 0.5, reachPx) / d;
  return { x: fromX + dx * k, y: fromY + dy * k };
};
