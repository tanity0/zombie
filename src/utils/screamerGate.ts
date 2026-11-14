// 叫喚型(screamer)の叫びの関所(純関数・store にも描画にも依存しない)。
// 社長報告2026-11-11「叫喚型が遠くに居てもずっと叫んでる」: 叫びは距離を見ずに一定の間隔で始まっていた=画面の外の遠い個体でも、
// 画面全体の緑の明滅・揺れ・「叫喚!」・強化が出ていた。叫びは「画面に見えている時だけ」始める。

/** 画面の外で叫ぶ時刻を過ぎた個体は、画面に入ってからこの長さだけ待って溜め始める(入った瞬間にいきなり叫ばない)。 */
export const SCREAMER_OFFSCREEN_HOLD_MS = 1500;

/**
 * 溜めを始めるか。nextScream=次に溜め始める予定の時刻(gameTime)/ inView=体の中心が画面(ズームの可視域)に入っているか。
 *  - 予定の時刻より前: 始めない(予定はそのまま)。
 *  - 予定を過ぎていて画面の中: 始める。
 *  - 予定を過ぎていて画面の外: 始めない。予定を「今+SCREAMER_OFFSCREEN_HOLD_MS」へ送り続ける。
 */
export const screamerStartGate = (nextScream: number, gameTime: number, inView: boolean): { start: boolean; next: number } => {
  if (gameTime < nextScream) return { start: false, next: nextScream };
  if (inView) return { start: true, next: nextScream };
  return { start: false, next: gameTime + SCREAMER_OFFSCREEN_HOLD_MS };
};

/**
 * 画面の縁の方角の印を出す距離(px・プレイヤーの中心から叫喚型の中心まで)。これより遠い個体には印を出さない
 * (社長指示2026-11-11「叫喚型、遠くに離れたらマップ表示からマーク消えて良い気がする」)。賞金首の印の有効距離(BOUNTY_MARK_MAX_DIST_PX)と同じ値。
 */
export const SCREAMER_MARK_MAX_DIST_PX = 1200;
export const screamerMarkVisible = (px: number, py: number, sx: number, sy: number): boolean =>
  Math.hypot(sx - px, sy - py) <= SCREAMER_MARK_MAX_DIST_PX;


/** 叫喚型を進む先へ動かしてから、次に動かしてよくなるまでの間(ms・gameTime)。同じ個体を続けて動かさない。 */
export const SCREAMER_WARP_GAP_MS = 3000;

/**
 * 置き去りの叫喚型を「進む先の辺の外」へ動かす時か(社長指示2026-11-11「進行方向にワープさせる」)。
 *  - プレイヤーの中心から叫喚型の中心までが SCREAMER_MARK_MAX_DIST_PX を超えている時だけ(方角の印が消える距離と同じ)。
 *  - 叫びの溜めの最中(aiPhase === 'scream')は動かさない。
 *  - 前に動かしてから(lastWarpAt)SCREAMER_WARP_GAP_MS 経っていなければ動かさない(未設定=まだ動かしていない)。
 * 置き先が見えている範囲に入るかどうかは呼ぶ側(directorTick)で見る。
 */
export const screamerWarpDue = (
  px: number, py: number, sx: number, sy: number,
  aiPhase: string | undefined, lastWarpAt: number | undefined, gameTime: number,
): boolean => {
  if (aiPhase === 'scream') return false;
  if (lastWarpAt !== undefined && gameTime - lastWarpAt < SCREAMER_WARP_GAP_MS) return false;
  return Math.hypot(sx - px, sy - py) > SCREAMER_MARK_MAX_DIST_PX;
};
