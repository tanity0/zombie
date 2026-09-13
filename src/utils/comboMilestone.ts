// コンボの節目(社長指示2026-09-13「コンボカウント(どれも)10毎に数字を大きく飛び出させる」・承認「はい」)。
// 対象=画面に数字が出ている2つ: HUD左の COMBO(近接フィニッシュ連続数)と頭上の「N HITS」(多段ヒット)。
// 10・20・30…の瞬間だけ数字が普段の約2倍まで飛び出して行き過ぎて戻る(慣性MUST)。節目が上がるごとに少し大きく、50で頭打ち。
// 描画・SEだけ=判定・スコアには触れない。純関数(HUD の CSS 変数と pixiScene の両方が同じ数を読む)。
export const COMBO_MILESTONE_STEP = 10;
export const COMBO_MILESTONE_MAX_TIER = 5;
/** 節目の段(1=10, 2=20 … 5=50以上)。節目でなければ 0。 */
export const comboMilestoneTier = (count: number): number => {
  if (!Number.isFinite(count) || count < COMBO_MILESTONE_STEP || count % COMBO_MILESTONE_STEP !== 0) return 0;
  return Math.min(COMBO_MILESTONE_MAX_TIER, Math.floor(count / COMBO_MILESTONE_STEP));
};
/** 飛び出しの振幅(ピーク倍率−1)。段1=0.8(≒2倍弱)…段5=1.4。0=節目でない。 */
export const comboMilestoneAmp = (tier: number): number => (tier <= 0 ? 0 : 0.8 + 0.15 * (Math.min(COMBO_MILESTONE_MAX_TIER, tier) - 1));
/** 減衰ばね(t=0..1): 1 → 行き過ぎ(負) → 0。ピークが最初、0.45付近で約−10%の戻り過ぎ。 */
export const milestoneSpring = (t: number): number => {
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  return Math.exp(-5 * t) * Math.cos(7 * t);
};
/** 白→本来の色へ戻る割合(最初の30%で戻り切る)。0=白・1=本来の色。 */
export const milestoneTintMix = (t: number): number => Math.max(0, Math.min(1, t / 0.3));
