// PACING_PUZZLE.md §6.28-19 バッチM63: アクラシエル(stage-ex1 ゲート2)の技選択=純関数。
// レンダラ非依存・store非依存(angelBossTick.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-19 を参照。
// 再構築では、脚がなくてもプレイヤーとの距離は変わるため距離帯の役割を追加した。
// 5技は候補から消さず、密着=爆発 / 中距離=放射棘 / 遠距離=槍・転移・凝視の比重を上げる。
import { bossZoneForDistance, phaseForHealth, pickComboFollowup, pickWeightedMove, type BossMoveWeights } from './bossScript';

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

export const ACRASIEL_MOVE_WEIGHTS: BossMoveWeights<AcrasielMove> = {
  spike: { melee: 25, near: 35, mid: 45, far: 30 },
  spear: { melee: 20, near: 30, mid: 35, far: 45 },
  warp:  { melee: 10, near: 20, mid: 25, far: 35 },
  burst: { melee: 35, near: 20, mid: 10, far: 0 },
  gaze:  { melee: 10, near: 15, mid: 20, far: 30 },
};

// 全技は候補から消さず、距離帯とPhase3の主題(棘→槍)で重みだけを変える。
export const pickAcrasielMove = (
  distance: number,
  phase: 1 | 2 | 3,
  rand: () => number = Math.random,
): AcrasielMove | null => pickWeightedMove(
  ALL_MOVES,
  m => {
    const base = ACRASIEL_MOVE_WEIGHTS[m][bossZoneForDistance(distance)];
    if (phase >= 3 && m === 'spike') return base * 1.4;
    if (phase >= 3 && m === 'spear') return base * 1.3;
    return base;
  },
  { spike: true, spear: true, warp: true, burst: true, gaze: true },
  rand,
);

// §6.28-19 Phase3: 「①放射棘と②結晶の槍が同時に出る」を、放射棘の直後に確率100%で結晶の槍へ
// 直結する強制連携として実装する(★未決事項に記録=「隙間の隙間」の厳密な同時発生ではない近似)。
export const ACRASIEL_COMBO_FOLLOWUP: Partial<Record<AcrasielMove, AcrasielMove>> = { spike: 'spear', spear: 'warp' };
export const ACRASIEL_PHASE3_COMBO_CHANCE = 1;

export const pickAcrasielCombo = (
  justFinished: AcrasielMove,
  phase: 1 | 2 | 3,
  rand: () => number = Math.random,
): AcrasielMove | null => {
  if (phase !== 3) return null;
  return pickComboFollowup(justFinished, ACRASIEL_COMBO_FOLLOWUP, ACRASIEL_PHASE3_COMBO_CHANCE, () => true, rand);
};
