// PACING_PUZZLE.md §6.28-20 バッチM64: idol(stage-2 隠しボス)の技選択=純関数。
// レンダラ非依存・store非依存(useGameLoop.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-20 を参照。
//
// 「全ボスの逆」= 近づくほど安全。他の全ボスは間合いが遠いほど安全(離れれば避けられる)だが、
// idolは間合いが近いほど安全(近距離の技はどちらも硬直が長い=弱い)。段のラダーには入らない
// (積み上げではなく反転のため・§6.28-20/§6.28-21)。
//
// 単位: 「壁時計系」(mimir/jormungand/skadi/thorと同じ・§6.28-1-0)。ここに書くmsは実効msそのもの。
import { pickEligibleMove, phaseForHealth } from './bossScript';

export type IdolMove = 'aim' | 'fan' | 'roll' | 'punch';

// 間合いの帯(px・中心間距離)。§6.28-20の表から確定。
export const IDOL_RANGE = {
  NEAR_MAX: 140,  // 近(離脱ローリング/至近の殴り)
  MID_MAX: 340,   // 中(連射)
} as const; // 遠 = MID_MAXより外(狙い撃ち。上限なし=遠いほど強い担い手なので頭打ちにしない)

export const IDOL_PHASE_HP_THRESHOLD = 0.5;
export const idolPhaseForHealth = (healthFrac: number): 1 | 2 => phaseForHealth(healthFrac, [IDOL_PHASE_HP_THRESHOLD]) as 1 | 2;

// 連射の扇の本数(Phase2で3→5・§6.28-20)。近距離技(roll/punch)は一切変えない(掟の精神=読みを裏切らない)。
export const idolFanCount = (phase: 1 | 2): number => (phase === 2 ? 5 : 3);

export const idolMoveEligible = (move: IdolMove, distance: number): boolean => {
  switch (move) {
    case 'aim':   return distance > IDOL_RANGE.MID_MAX;                                    // 遠(>340)
    case 'fan':   return distance > IDOL_RANGE.NEAR_MAX && distance <= IDOL_RANGE.MID_MAX;  // 中(140〜340)
    case 'roll':
    case 'punch': return distance <= IDOL_RANGE.NEAR_MAX;                                    // 近(<140)
    default: return false;
  }
};

const ALL_MOVES: IdolMove[] = ['aim', 'fan', 'roll', 'punch'];

// 近帯はroll/punchが重複するため等確率抽選で解く(§6.28-14に記録した既存の慣例=
// ラフィ骨刃⇔薙ぎ/スリィエル4技と同じ「設計書が優先順位/配分を明記していない」ケース)。
export const pickIdolMove = (
  distance: number,
  ready: Record<IdolMove, boolean>,
  rand: () => number = Math.random,
): IdolMove | null => pickEligibleMove(ALL_MOVES, m => idolMoveEligible(m, distance) && ready[m], rand);
