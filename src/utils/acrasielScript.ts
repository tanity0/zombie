// PACING_PUZZLE.md §6.28-19 バッチM63: アクラシエル(stage-ex1 ゲート2)の技選択=純関数。
// レンダラ非依存・store非依存(angelBossTick.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-19 を参照。
// 注意: §6.28-19の技表にも「帯」列が無い(アクラシエルは脚が無く歩かない=間合いを選べないため、
// 台本自体が距離で技を出し分けない設計と解釈した。★未決事項に記録)。5技はすべて常時候補とし、
// pickEligibleMove(§6.26流用)で等確率抽選する。
import { phaseForHealth, pickComboFollowup } from './bossScript';

export type AcrasielMove = 'spike' | 'spear' | 'warp' | 'burst' | 'gaze';

export const ACRASIEL_PHASE_THRESHOLDS = [0.6, 0.3] as const; // Phase2=60%・Phase3=30%
export const acrasielPhaseForHealth = (healthFrac: number): 1 | 2 | 3 =>
  phaseForHealth(healthFrac, ACRASIEL_PHASE_THRESHOLDS) as 1 | 2 | 3;

// §6.28-19: 放射棘の「空き」セクター数。Phase1=2・Phase2以降=1(「隙間の隙間」はPhase3の
// spike→spear強制連携で表現=下記)。
export const acrasielSpikeGapCount = (phase: 1 | 2 | 3): number => phase === 1 ? 2 : 1;

export const ACRASIEL_SECTOR_COUNT = 8;

// 8方向から gapCount 個を重複無しで選び、ビットマスク(bit0..7=1で空き)として返す。
// 溜め開始時に1回だけ呼び、実行まで固定する(掟W4)。
export const pickSpikeGapMask = (
  gapCount: number,
  rand: () => number = Math.random,
): number => {
  const pool = Array.from({ length: ACRASIEL_SECTOR_COUNT }, (_, i) => i);
  let mask = 0;
  const n = Math.max(0, Math.min(gapCount, pool.length));
  for (let i = 0; i < n; i++) {
    const pick = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
    const idx = pool.splice(pick, 1)[0];
    mask |= (1 << idx);
  }
  return mask;
};

export const isSpikeGapSector = (mask: number, sector: number): boolean => (mask & (1 << sector)) !== 0;

const ALL_MOVES: AcrasielMove[] = ['spike', 'spear', 'warp', 'burst', 'gaze'];

// 全技が常時候補(距離ゲート無し)。pickEligibleMoveの等確率抽選をそのまま流用。
export const pickAcrasielMove = (
  rand: () => number = Math.random,
): AcrasielMove | null => {
  const pool = ALL_MOVES;
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
};

// §6.28-19 Phase3: 「①放射棘と②結晶の槍が同時に出る」を、放射棘の直後に確率100%で結晶の槍へ
// 直結する強制連携として実装する(★未決事項に記録=「隙間の隙間」の厳密な同時発生ではない近似)。
export const ACRASIEL_COMBO_FOLLOWUP: Partial<Record<AcrasielMove, AcrasielMove>> = { spike: 'spear' };
export const ACRASIEL_PHASE3_COMBO_CHANCE = 1;

export const pickAcrasielCombo = (
  justFinished: AcrasielMove,
  phase: 1 | 2 | 3,
  rand: () => number = Math.random,
): AcrasielMove | null => {
  if (phase !== 3) return null;
  return pickComboFollowup(justFinished, ACRASIEL_COMBO_FOLLOWUP, ACRASIEL_PHASE3_COMBO_CHANCE, () => true, rand);
};
