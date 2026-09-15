// コンボの節目(社長指示2026-09-13「コンボカウント(どれも)10毎に数字を大きく飛び出させる」・承認「はい」)。
// 対象=画面に数字が出ている2つ: HUD左の COMBO(近接フィニッシュ連続数=積み上がる数)と頭上の「N HITS」(一振りの多段=一発の数)。
// 描画・SEだけ=判定・スコアには触れない。純関数(HUD の CSS 変数と pixiScene の両方が同じ数を読む)。
// v0.25.4276(クリエイティブ監査反映): 節目は「跨いだか」で判定(9→11 でも出る)/ 出だしに立ち上がり(t0)を持つばね/ 白抜けは最初に急に抜ける。
export const COMBO_MILESTONE_STEP = 10;
export const COMBO_MILESTONE_MAX_TIER = 5;
const clampTier = (n: number): number => Math.max(0, Math.min(COMBO_MILESTONE_MAX_TIER, Math.floor(n)));
/** 積み上がる数(COMBO)が prev→next で節目を跨いだか。跨いだ一番上の段(1=10 … 5=50以上)。跨いでいなければ 0。 */
export const comboMilestoneCrossed = (prev: number, next: number): number => {
  if (!Number.isFinite(prev) || !Number.isFinite(next) || next <= prev) return 0;
  const a = Math.floor(prev / COMBO_MILESTONE_STEP), b = Math.floor(next / COMBO_MILESTONE_STEP);
  return b > a ? clampTier(b) : 0;
};
/** 一発の数(N HITS)の段: 10以上で 1、20以上で 2 … 50以上で 5。10未満は 0。 */
export const multiHitMilestoneTier = (count: number): number =>
  (!Number.isFinite(count) || count < COMBO_MILESTONE_STEP) ? 0 : clampTier(count / COMBO_MILESTONE_STEP);
/** 飛び出しの振幅(ピーク倍率−1)。段1=0.8(≒2倍弱)…段5=1.4。0=節目でない。★等差か・50に段差を付けるかは社長へ戻し中。 */
export const comboMilestoneAmp = (tier: number): number => (tier <= 0 ? 0 : 0.8 + 0.15 * (clampTier(tier) - 1));
/**
 * 立ち上がり→減衰ばね(t=0..1): 最初の rise で 0→1 に加速して登り、以降は行き過ぎ(負)を経て 0 へ。
 * 2つの性格(社長裁定2026-09-13「はい」): 'soft'=左上の COMBO(積み上がる流れ=峰が遅く・減衰が緩く・揺れる)/
 * 'hard'=頭上の倒した数(一撃の衝撃=峰が早く・減衰が速い・硬い)。同じ演出を同じ顔にしない。
 */
export type SpringProfile = 'soft' | 'hard';
export const MILESTONE_RISE = 0.12;
const SPRING: Record<SpringProfile, { rise: number; k: number; w: number }> = {
  soft: { rise: 0.12, k: 5, w: 7 },
  hard: { rise: 0.07, k: 7.5, w: 9.5 },
};
export const milestoneSpring = (t: number, profile: SpringProfile = 'soft'): number => {
  const p = SPRING[profile];
  if (t <= 0) return 0;
  if (t >= 1) return 0;
  if (t < p.rise) { const u = t / p.rise; return 1 - (1 - u) * (1 - u); } // ease-out で登る
  const s = (t - p.rise) / (1 - p.rise);
  return Math.exp(-p.k * s) * Math.cos(p.w * s);
};
/** 白→本来の色へ戻る割合(最初に急に抜けて尾を引く・最初の30%で戻り切る)。0=白・1=本来の色。 */
export const milestoneTintMix = (t: number): number => {
  const x = Math.max(0, Math.min(1, t / 0.3));
  return 1 - (1 - x) * (1 - x);
};
/** 節目の尺(ms)。普段(620)より長く、峰の後に一拍止めて末尾で消える(pixiScene が alpha を後半に寄せる)。50(段5)だけ更に一拍長い。 */
export const MULTI_HIT_MILESTONE_MS = 900;
export const MULTI_HIT_NORMAL_MS = 620;
export const MAX_TIER_HOLD_MULT = 1.4; // 段5(50)だけ尺 ×1.4=「到達点」に段差を付ける(社長裁定2026-09-13)
export const multiHitDurationMs = (count: number): number => {
  const tier = multiHitMilestoneTier(count);
  return tier > 0 ? Math.round(MULTI_HIT_MILESTONE_MS * (tier >= COMBO_MILESTONE_MAX_TIER ? MAX_TIER_HOLD_MULT : 1)) : MULTI_HIT_NORMAL_MS;
};
/** 頭上の「倒した数」の帯の尺(ms)=連続撃破の窓(2.5秒)。倒すたびに置き直されるので、途切れるまで数字が居続ける。 */
export const KILL_BANNER_MS = 1500;
export const killBannerDurationMs = (tier: number): number => Math.round(KILL_BANNER_MS * (tier >= COMBO_MILESTONE_MAX_TIER ? MAX_TIER_HOLD_MULT : 1));
/** 節目の α: 60% までは満・残り 40% で落とす(節目でない時は従来の 1−t)。 */
export const milestoneAlpha = (t: number): number => (t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4));
/** 節目の音の高さ(段ごとに半音弱ずつ上げる=10 と 50 を同じ音にしない)。段5(50)だけ更に一段高い(段差)。 */
export const milestoneSfxRate = (tier: number): number => {
  const c = clampTier(tier);
  return 1 + 0.05 * (c - 1) + (c >= COMBO_MILESTONE_MAX_TIER ? 0.1 : 0);
};
