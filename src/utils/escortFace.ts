// 進軍NPC(護衛軍人)の向きのヒステリシス(社長指摘2026-10-12「敵が密集してると進軍NPCが、右左を高速で向く。ヒステリシス必要」)。
// 向きは「撃つ相手」「動く向き」「近接の向き」など何箇所もが毎フレーム決める。敵が左右に散っていると撃つ相手が
// 1発ごとに入れ替わり、向きが毎フレーム反転していた。⇒ **最後の書き込みの直前に1回だけ**通す:
// 一度振り向いたら ESCORT_FACE_HOLD_MS は向きを保つ。近接の振り始めだけは即座に振り向く(体と刃の向きが割れないように)。
// 純関数(store/Pixi を import しない)。時計は gameTime(ms)。

/** 一度振り向いたら、この間は逆を向かない(ms)。 */
export const ESCORT_FACE_HOLD_MS = 350;

export const stabilizeEscortFace = (
  prevFace: number, prevFlipAt: number | undefined, wantFace: number, now: number, force = false,
): { face: number; flipAt: number | undefined } => {
  const prev = prevFace < 0 ? -1 : 1;
  const want = wantFace < 0 ? -1 : 1;
  if (want === prev) return { face: prev, flipAt: prevFlipAt };
  if (force || prevFlipAt === undefined || now - prevFlipAt >= ESCORT_FACE_HOLD_MS) return { face: want, flipAt: now };
  return { face: prev, flipAt: prevFlipAt };
};
