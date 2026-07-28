// PACING_PUZZLE.md §6.28-9 バッチM58: スカジ(stage-4 深層)の技選択=純関数。
// レンダラ非依存・store非依存(useGameLoop.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-9 を参照。
//
// 単位: 「壁時計系」(§6.28-1-0)。ここに書くmsは実効msそのもの。
import { pickEligibleMove, pickComboFollowup, phaseForHealth } from './bossScript';

export type SkadiMove = 'ice' | 'blade' | 'dash' | 'burst' | 'radial' | 'cage';

// 間合いの帯(px・中心間距離)。ice/blade/cageは「全帯」(§6.28-9の表どおり=距離を問わない)。
export const SKADI_RANGE = {
  NEAR_MAX: 320,  // burst/radialの下限(=中帯の始まり)
  MID_MAX: 620,   // 中(burst/radialの上限)
  FAR_MAX: 1000,  // 遠(dashの上限。giant系と同じ慣例)
} as const;

// 3相(§6.28-9フェーズ表): Phase1=100〜70% / Phase2=70〜35% / Phase3=35〜0%。
export const SKADI_PHASE_HP_THRESHOLDS = [0.7, 0.35] as const;
export const skadiPhaseForHealth = (healthFrac: number): 1 | 2 | 3 =>
  phaseForHealth(healthFrac, SKADI_PHASE_HP_THRESHOLDS) as 1 | 2 | 3;

// 氷攻撃(ice/blade)を選ぶ確率(既存 SKADI_ATTACK_CHANCE=0.5 の踏襲・据え置き=社長指示済みの値)。
export const SKADI_ATTACK_CHANCE = 0.5;
// 連携確率: Phase2=50% / Phase3=60%(§6.28-9フェーズ表)。
export const skadiComboChance = (phase: 1 | 2 | 3): number => (phase >= 3 ? 0.6 : 0.5);

export const skadiMoveEligible = (move: SkadiMove, distance: number, phase: 1 | 2 | 3): boolean => {
  switch (move) {
    case 'ice':
    case 'blade':  return true; // 全帯(§6.28-9)
    case 'cage':   return phase === 3; // 全帯・Phase3のみ
    case 'burst':
    case 'radial': return distance > SKADI_RANGE.NEAR_MAX && distance <= SKADI_RANGE.MID_MAX; // 中
    case 'dash':   return distance > 420 && distance <= SKADI_RANGE.FAR_MAX;                   // 遠(>420px)
    default: return false;
  }
};

// 技の抽選: 既存構造を維持(まずcage=Phase3の大技を優先チェック→氷攻撃45を確率で選ぶ→
// 残りは間合い+CD明けの等確率プール)。ice/blade/cageは常に間合い適格なので、この関数の外側
// (呼び出し側)がCDで頻度を絞る。dash/burst/radialだけが新設の帯ゲートで絞られる。
export const pickSkadiMove = (
  distance: number,
  phase: 1 | 2 | 3,
  ready: Record<SkadiMove, boolean>,
  rand: () => number = Math.random,
): SkadiMove | null => {
  if (skadiMoveEligible('cage', distance, phase) && ready.cage) return 'cage';
  if (ready.ice && ready.blade && rand() < SKADI_ATTACK_CHANCE) {
    return rand() < 0.5 ? 'ice' : 'blade';
  }
  return pickEligibleMove(
    ['dash', 'burst', 'radial'] as SkadiMove[],
    m => skadiMoveEligible(m, distance, phase) && ready[m],
    rand,
  );
};

// Phase2以降の2連携(§6.28-9): 氷塊→氷刃(逃げた先へ刃) / 突進→氷塊(終点に置く)。
export const SKADI_COMBO_FOLLOWUP: Partial<Record<SkadiMove, SkadiMove>> = {
  ice: 'blade',
  dash: 'ice',
};

export const pickSkadiCombo = (
  justFinished: SkadiMove,
  phase: 1 | 2 | 3,
  distance: number,
  rand: () => number = Math.random,
): SkadiMove | null => {
  if (phase < 2) return null;
  return pickComboFollowup(justFinished, SKADI_COMBO_FOLLOWUP, skadiComboChance(phase), m => skadiMoveEligible(m, distance, phase), rand);
};
