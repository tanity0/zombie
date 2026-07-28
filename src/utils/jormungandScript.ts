// PACING_PUZZLE.md §6.28-7 バッチM56: ヨルムンガルド(stage-3 深層)の技選択=純関数。
// レンダラ非依存・store非依存(useGameLoop.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-7 を参照。
//
// 単位: 「壁時計系」(§6.28-1-0)。ここに書くmsは実効msそのもの。
import { pickEligibleMove, pickComboFollowup, phaseForHealth } from './bossScript';

export type JormungandMove = 'radial' | 'burst' | 'dash' | 'coil';

// 間合いの帯(px・中心間距離)。§6.28-7の表から確定。
export const JORM_RANGE = {
  NEAR_MAX: 320,  // 近(うねり専用・Phase2のみ)
  MID_MAX: 620,   // 中(3-way扇まで届く)
  FAR_MAX: 1000,  // 遠(突進/螺旋の上限。giant系と同じ慣例)
} as const;

export const JORM_PHASE_HP_THRESHOLD = 0.6;
export const jormungandPhaseForHealth = (healthFrac: number): 1 | 2 => phaseForHealth(healthFrac, [JORM_PHASE_HP_THRESHOLD]) as 1 | 2;
export const JORM_COMBO_CHANCE = 0.5;

export const jormungandMoveEligible = (move: JormungandMove, distance: number, phase: 1 | 2): boolean => {
  switch (move) {
    case 'coil':   return phase === 2 && distance <= JORM_RANGE.NEAR_MAX;                          // 近(Phase2限定)
    case 'burst':  return distance > JORM_RANGE.NEAR_MAX && distance <= JORM_RANGE.MID_MAX;         // 中
    case 'radial': return distance > JORM_RANGE.NEAR_MAX && distance <= JORM_RANGE.FAR_MAX;         // 中〜遠
    case 'dash':   return distance > 420 && distance <= JORM_RANGE.FAR_MAX;                          // 遠(>420px)
    default: return false;
  }
};

const POOL: JormungandMove[] = ['dash', 'burst', 'radial', 'coil'];

// 間合い+フェーズ+CD明けから等確率で1つ(giant/rafi/uriと同じ作法)。
export const pickJormungandMove = (
  distance: number,
  phase: 1 | 2,
  ready: Record<JormungandMove, boolean>,
  rand: () => number = Math.random,
): JormungandMove | null => pickEligibleMove(
  POOL,
  m => jormungandMoveEligible(m, distance, phase) && ready[m],
  rand,
);

// Phase2限定の2連携(§6.28-7): 突進→うねり(終点で密着した相手を薙ぐ) / 扇→螺旋(逃げた先へ弾幕)。
export const JORM_COMBO_FOLLOWUP: Partial<Record<JormungandMove, JormungandMove>> = {
  dash: 'coil',
  burst: 'radial',
};

export const pickJormungandCombo = (
  justFinished: JormungandMove,
  phase: 1 | 2,
  distance: number,
  rand: () => number = Math.random,
): JormungandMove | null => {
  if (phase !== 2) return null;
  return pickComboFollowup(justFinished, JORM_COMBO_FOLLOWUP, JORM_COMBO_CHANCE, m => jormungandMoveEligible(m, distance, phase), rand);
};

// §6.28-2-2/§6.28-7「予告なしを"規則"で避ける」の本体: 螺旋の回転方向は常に時計回りで固定し、
// フェーズが進んでも反転させない(掟W5)。呼び出し側が渡す1回転あたりの角度(生の定数。符号は問わない)を
// Math.absで正へ丸めてから回数を掛けるため、定数側の符号ミスがあっても実際の回転方向は構造的に反転できない
// (=「回転方向を不変条件としてテストで固定する」の実体)。
export const jormRadialSpinAngle = (volleyIndex: number, spinMagnitudePerVolley: number): number =>
  volleyIndex * Math.abs(spinMagnitudePerVolley);
