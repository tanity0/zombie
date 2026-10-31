/**
 * 焼き置き(影・縁・白)が天井に張り付いた時の焼き直しの間引き(社長実機2026-10-22「ステージ4で急に重くなった。すごくカクカク」)。
 *
 * 天井に達すると「古い物を捨てて新しく焼く」を繰り返す。敵の歩きのコマ×光の向き×倍率など、**今使う物の総量が天井より多い**場面では
 * 捨てた物をすぐ焼き直すことになり、焼き(フィルタつきの描き込み)が毎フレーム数回走る=急に重くなる
 * (ヘッドレス実測: 影の天井に張り付くと 1フレーム 0回 → 約5回)。天井に達するまでは焼き置きが効くので軽い=「途中までは快適」。
 * ⇒ **天井に張り付いている間だけ**、焼き直しを `BAKE_SATURATED_INTERVAL_MS` に1回まで。間に合わない物は、影は直前のコマの影、
 *   縁は出さない、白は光らせない(どれも一瞬・立ち物は消えない)。天井に届いていない時は従来どおり。
 */
export const BAKE_SATURATED_INTERVAL_MS = 150;

export interface BakeGovernor { lastAt: number }
export const newBakeGovernor = (): BakeGovernor => ({ lastAt: -Infinity });

/** 天井に張り付いている(full)時に、今焼いてよいか。よければ時刻を打つ。張り付いていなければ常に true(打たない)。 */
export const allowBake = (g: BakeGovernor, full: boolean, now: number, intervalMs = BAKE_SATURATED_INTERVAL_MS): boolean => {
  if (!full) return true;
  if (now - g.lastAt < intervalMs) return false;
  g.lastAt = now;
  return true;
};
