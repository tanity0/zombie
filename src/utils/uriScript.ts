// PACING_PUZZLE.md §6.28-17 バッチM61: ウリ(stage-5 ゲート2)の技選択=純関数。
// レンダラ非依存・store非依存(angelBossTick.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-17 を参照。
import { pickEligibleMove } from './bossScript';

export type UriMove = 'sweep' | 'downslash' | 'thrust' | 'bolt';

// 間合いの帯(px・中心間距離)。§6.26-6のジャイアント帯をそのまま流用(新しい数字を発明しない)。
export const URI_RANGE = {
  NEAR_MAX: 320,  // これ以下=近(専用技なし・bolt=全帯のみ届く=「懐が安全」の主題そのもの)
  MID_MAX: 620,   // 中
  FAR_MAX: 1000,  // 遠
} as const;

export const URI_PHASE_HP_THRESHOLD = 0.5; // §6.28-17: フェーズ2 = HP50%
// §6.28-17 #1「大薙ぎの内径」: Phase1=140px / Phase2=90px(技は増やさず精度だけ上げる)。
export const uriSweepInnerRadius = (phase: 1 | 2): number => phase === 2 ? 90 : 140;

export const URI_COMBO_CHANCE = 0.6; // ①大薙ぎ→②振り下ろし

export const uriMoveEligible = (move: UriMove, distance: number): boolean => {
  switch (move) {
    case 'sweep':     return distance > URI_RANGE.NEAR_MAX && distance <= URI_RANGE.FAR_MAX; // 中〜遠
    case 'downslash': return distance > URI_RANGE.NEAR_MAX && distance <= URI_RANGE.MID_MAX; // 中
    case 'thrust':    return distance > URI_RANGE.MID_MAX && distance <= URI_RANGE.FAR_MAX;  // 遠
    case 'bolt':       return true; // 全帯(密着含む=ハメ間合いを作らない唯一の担い手)
    default: return false;
  }
};

const ALL_MOVES: UriMove[] = ['sweep', 'downslash', 'thrust', 'bolt'];

export const pickUriMove = (
  distance: number,
  rand: () => number = Math.random,
): UriMove | null => pickEligibleMove(ALL_MOVES, m => uriMoveEligible(m, distance), rand);

// §6.28-17 連携: ①大薙ぎ→②振り下ろし(60%)。「懐に入って避けた直後、同じ場所に内径なしが降る」ため、
// 追撃の振り下ろしは通常の間合いゲート(中320〜620)を適用しない(★未決事項に記録・rafiScript.tsの
// bone→jumpと同じ理由=直後の間合いが必ずしも「中」帯に収まらないため)。
export const pickUriCombo = (
  justFinished: UriMove,
  rand: () => number = Math.random,
): UriMove | null => {
  if (justFinished !== 'sweep') return null;
  return rand() < URI_COMBO_CHANCE ? 'downslash' : null;
};
