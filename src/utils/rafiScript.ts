// PACING_PUZZLE.md §6.28-8 バッチM57: ラフィ(stage-4 ゲート2)の技選択=純関数。
// レンダラ非依存・store非依存(angelBossTick.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-8 を参照。
import { pickEligibleMove, pickComboFollowup } from './bossScript';

export type RafiMove = 'bone' | 'jump' | 'sweep';

export const RAFI_HANDGUN_DIST = 300;  // 骨刃が撃てる距離(現行)
export const RAFI_SWEEP_RANGE = 200;   // §6.28-8 #4: 薙ぎが撃てる密着帯(Phase2のみ)
export const RAFI_PHASE_HP_THRESHOLD = 0.6;
export const RAFI_COMBO_CHANCE = 0.5;  // 骨刃→飛び掛かり(Phase2)

export const rafiMoveEligible = (move: RafiMove, distance: number, phase: 1 | 2): boolean => {
  switch (move) {
    case 'bone': return distance <= RAFI_HANDGUN_DIST;
    case 'jump': return distance > RAFI_HANDGUN_DIST;
    case 'sweep': return phase === 2 && distance <= RAFI_SWEEP_RANGE;
    default: return false;
  }
};

const ALL_MOVES: RafiMove[] = ['bone', 'jump', 'sweep'];

// 骨刃(0〜300)と薙ぎ(0〜200・Phase2)は密着帯で重なる。設計書は優先順位/配分を明記していないため
// (§6.28-14に記録)、§6.26のジャイアント台本と同じ「該当技から等確率で1つ」(pickEligibleMove)で解く。
// sweepReady: 薙ぎ専用CD(rSweepReadyAt)明けか(骨刃/飛び掛かりは既存の一般行動ゲートのみで足りる)。
export const pickRafiMove = (
  distance: number,
  phase: 1 | 2,
  sweepReady: boolean,
  rand: () => number = Math.random,
): RafiMove | null => pickEligibleMove(
  ALL_MOVES,
  m => rafiMoveEligible(m, distance, phase) && (m !== 'sweep' || sweepReady),
  rand,
);

// §6.28-8 連携(Phase2・確率50%): 骨刃→飛び掛かり(「二正面」の本体)。
export const RAFI_COMBO_FOLLOWUP: Partial<Record<RafiMove, RafiMove>> = { bone: 'jump' };

// 連携時の飛び掛かりは、通常抽選の間合いゲート(>300px)を適用しない(★未決事項に記録)。
// 骨刃は≤300pxで発生するため、通常ゲートのままだと「骨刃の直後に距離が開いていない限り連携が
// 出ない」=設計意図(「骨刃が残る間に本体が跳んでくる=二正面」)とほぼ両立しなくなる。骨刃終了直後は
// 常に連携対象として扱う(気絶/プレイヤー死亡等の停止条件は呼び出し側=angelBossTick.tsが別途見る)。
export const pickRafiCombo = (
  justFinished: RafiMove,
  phase: 1 | 2,
  rand: () => number = Math.random,
): RafiMove | null => {
  if (phase !== 2) return null;
  return pickComboFollowup(justFinished, RAFI_COMBO_FOLLOWUP, RAFI_COMBO_CHANCE, () => true, rand);
};
