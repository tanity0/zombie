// PACING_PUZZLE.md §6.28-5 バッチM54: ミーミル(stage-1 深層)の技選択=純関数。
// レンダラ非依存・store非依存(useGameLoop.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-5/§6.28-15 を参照。
//
// 注意(§6.28-15 見た目→動きの裁定): 「踏み潰し」は不成立(ミーミルに脚は無い)。
// 役割(密着帯を塞ぐ)・図形(T2即時円)・リード・硬直は不変のまま、「群体の噛みつき」(bite)へ
// 意味だけ差し替える(判定/CD/半径は据え置き=stompという語をbiteへ改名しただけ)。
//
// 注意(単位): mimir/jormungand/skadi/thorは「壁時計系」(§6.28-1-0)。ここに書くmsは
// 実効msそのもの(ENEMY_ATTACK_SPEED_MULTは掛けない)。呼び出し側(useGameLoop.ts)もそのまま使う。
import { pickEligibleMove, pickComboFollowup, phaseForHealth } from './bossScript';

export type MimirMove = 'bite' | 'radial' | 'burst' | 'laser' | 'dash';

// 間合いの帯(px・中心間距離)。§6.28-5の表から確定(密着=噛みつき専用・現状ハメだった帯を埋める)。
export const MIMIR_RANGE = {
  MELEE_MAX: 200,  // 密着(噛みつき専用)
  NEAR_MAX: 320,   // 近(全方位のみ)
  MID_MAX: 620,    // 中(弾3連まで届く)
  FAR_MAX: 1000,   // 遠(レーザー/突進の上限。giant/rafi/uriと同じ慣例で頭打ちにする)
} as const;

export const MIMIR_PHASE_HP_THRESHOLD = 0.6;
export const mimirPhaseForHealth = (healthFrac: number): 1 | 2 => phaseForHealth(healthFrac, [MIMIR_PHASE_HP_THRESHOLD]) as 1 | 2;

// レーザーの抽選確率(Phase2で0.34→0.50・§6.28-5フェーズ表)。
export const mimirLaserChance = (phase: 1 | 2): number => (phase === 2 ? 0.5 : 0.34);

export const MIMIR_COMBO_CHANCE = 0.4;

export const mimirMoveEligible = (move: MimirMove, distance: number): boolean => {
  switch (move) {
    case 'bite':   return distance <= MIMIR_RANGE.MELEE_MAX;
    case 'radial': return distance > MIMIR_RANGE.MELEE_MAX && distance <= MIMIR_RANGE.MID_MAX; // 近〜中
    case 'burst':  return distance > MIMIR_RANGE.NEAR_MAX && distance <= MIMIR_RANGE.MID_MAX;  // 中
    case 'laser':  return distance > MIMIR_RANGE.NEAR_MAX && distance <= MIMIR_RANGE.FAR_MAX;  // 中〜遠
    case 'dash':   return distance > 420 && distance <= MIMIR_RANGE.FAR_MAX;                    // 遠(>420px)
    default: return false;
  }
};

// 技の抽選: レーザーだけ従来どおり専用の確率ロール(既存 MIMIR_LASER_CHANCE の踏襲・フェーズで変わる値)。
// 外れる/対象外の場合は、残り(噛みつき/突進/弾3連/全方位)から間合い+CD明けの等確率抽選(giant/rafi/uriと同じ作法)。
// 噛みつきは密着帯限定なのでその帯では自動的にこのプールの唯一の候補になる=専用の優先分岐は不要。
export const pickMimirMove = (
  distance: number,
  phase: 1 | 2,
  ready: Record<MimirMove, boolean>,
  rand: () => number = Math.random,
): MimirMove | null => {
  if (mimirMoveEligible('laser', distance) && ready.laser && rand() < mimirLaserChance(phase)) return 'laser';
  return pickEligibleMove(
    ['bite', 'dash', 'burst', 'radial'] as MimirMove[],
    m => mimirMoveEligible(m, distance) && ready[m],
    rand,
  );
};

// Phase2限定の2連携(§6.28-5): 突進→噛みつき(終点で密着した相手を狩る) / 全方位→レーザー(逃げた先へ直線)。
// giant(6.26-9 #8)と同じ作法=「まだその技の間合いに居るなら」を距離の再チェックで表現する。
export const MIMIR_COMBO_FOLLOWUP: Partial<Record<MimirMove, MimirMove>> = {
  dash: 'bite',
  radial: 'laser',
};

export const pickMimirCombo = (
  justFinished: MimirMove,
  phase: 1 | 2,
  distance: number,
  rand: () => number = Math.random,
): MimirMove | null => {
  if (phase !== 2) return null;
  return pickComboFollowup(justFinished, MIMIR_COMBO_FOLLOWUP, MIMIR_COMBO_CHANCE, m => mimirMoveEligible(m, distance), rand);
};
