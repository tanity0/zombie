// チュートリアルの随行NPC(軍人→衛生兵)の追従チェーン(社長指示v0.25.1823「基本プレイヤーに
// ついてくる。軍人、衛生兵の順番」)。純関数=useGameLoopから毎フレーム呼ぶ(規律4: 配線ロジックの
// 判定部は utils の純関数+ユニットテスト)。
//
// 仕様(叩き台):
// - 先頭(軍人)はリーダー(プレイヤー中心)を、2人目(衛生兵)は軍人を追う(数珠つなぎ)。
// - 相手との距離が gap を超えた分だけ近づく(gap 以内では停止=押し合わない)。
// - 1フレームの移動量は speed×dt でクランプ(ワープしない)。
// - face は移動した時だけ移動方向で更新。moving は「このフレーム動いたか」(描画の歩行アニメ切替用)。

export interface FollowAgent {
  x: number;
  y: number;
  face: number;   // 1=右 / -1=左
  moving?: boolean;
}

export const FOLLOW_GAP_PX = 64;      // 追従の目標間隔(叩き台)
export const FOLLOW_SPEED_MULT = 1.15; // リーダー速度に対する追いつき係数(離されないよう少し速く)

// followers[0] が leader を、followers[i] が followers[i-1] を追う。新しい配列を返す(不変更新)。
export const stepFollowChain = (
  leader: { x: number; y: number },
  followers: readonly FollowAgent[],
  dtSec: number,
  speedPxPerSec: number,
  gapPx: number = FOLLOW_GAP_PX,
): FollowAgent[] => {
  const out: FollowAgent[] = [];
  let target = leader;
  for (const f of followers) {
    const dx = target.x - f.x;
    const dy = target.y - f.y;
    const d = Math.hypot(dx, dy);
    if (d > gapPx && d > 0) {
      const step = Math.min(speedPxPerSec * dtSec, d - gapPx);
      const nx = f.x + (dx / d) * step;
      const ny = f.y + (dy / d) * step;
      out.push({ x: nx, y: ny, face: Math.abs(dx) > 0.5 ? (dx < 0 ? -1 : 1) : f.face, moving: step > 0.1 });
    } else {
      out.push({ x: f.x, y: f.y, face: f.face, moving: false });
    }
    target = out[out.length - 1];
  }
  return out;
};
