// PACING_PUZZLE.md §6.28-18 バッチM62: スリィエル(stage-6 ゲート2)の技選択=純関数。
// レンダラ非依存・store非依存(angelBossTick.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-18 を参照。
// 注意: §6.28-18の技表には「帯」列が無い(ジャイアント/ウリと違い距離での出し分けを明示していない)。
// 「近接拒否」(②)「環が離れている間だけ使う」(③)という備考だけが根拠なので、それぞれを既存語彙
// (密着帯=140px・§6.26-6のGIANT_RANGE.MELEE_MAXと同値)で具体化した(★未決事項に記録)。
import { pickEligibleMove } from './bossScript';

export type SurielMove = 'ringshot' | 'ringspin' | 'sweep' | 'gaze';

export const SURIEL_RINGSPIN_RANGE = 140; // 「近接拒否」=密着帯(GIANT_RANGE.MELEE_MAXと同値を流用)
export const SURIEL_PHASE_HP_THRESHOLD = 0.5; // §6.28-18: フェーズ2 = HP50%
export const SURIEL_COMBO_CHANCE = 0.7;   // ①環の射出→③本体の薙ぎ

// phase2で環が2本になる(§6.28-18)。技構成・確率は変えない=数だけ増える。
export const surielRingCount = (phase: 1 | 2): number => phase === 2 ? 2 : 1;

export const surielMoveEligible = (move: SurielMove, distance: number, ringDeployed: boolean): boolean => {
  switch (move) {
    case 'ringshot': return true; // 既定技(常時選べる)
    case 'ringspin': return distance <= SURIEL_RINGSPIN_RANGE; // 近接拒否
    case 'sweep':     return ringDeployed; // 環が離れている間だけ使う
    case 'gaze':      return true; // 小技(全帯)
    default: return false;
  }
};

const ALL_MOVES: SurielMove[] = ['ringshot', 'ringspin', 'sweep', 'gaze'];

export const pickSurielMove = (
  distance: number,
  ringDeployed: boolean,
  rand: () => number = Math.random,
): SurielMove | null => pickEligibleMove(ALL_MOVES, m => surielMoveEligible(m, distance, ringDeployed), rand);

// §6.28-18 連携: ①環の射出→③本体の薙ぎ(70%)。射出直後は環が必ず離れているため、通常の
// surielMoveEligible('sweep', ..., ringDeployed=true) がそのまま満たされる(rafi/uriと違い
// 追撃側の間合いゲートを別扱いする必要が無い)。
export const pickSurielCombo = (
  justFinished: SurielMove,
  rand: () => number = Math.random,
): SurielMove | null => {
  if (justFinished !== 'ringshot') return null;
  return rand() < SURIEL_COMBO_CHANCE ? 'sweep' : null;
};
