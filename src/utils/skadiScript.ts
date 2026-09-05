// PACING_PUZZLE.md §6.28-9 バッチM58: スカジ(stage-4 深層)の技選択=純関数。
// レンダラ非依存・store非依存(useGameLoop.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-9 を参照。
//
// 単位: 「壁時計系」(§6.28-1-0)。ここに書くmsは実効msそのもの。
// ==== v0.25.2609(ボス動き横断監査・バッチ1「死に技の解放」) ====================================
// 旧実装の問題(純関数掃引20,000回で実測):
//   - 密着帯で **「候補なし」50% / ice25% / blade25%**。dash/burst/radialは帯ゲートで完全に死んでいた
//     (スカジの中立は moveToward()=直進で速度90×1.2=108 > プレイヤー104.4=必ず密着へ張り付くため)。
//   - **Phase3は cage 100%**(cageが最優先の早期returnで、CD明けの瞬間に必ず選ばれる)。
// 対策: 城ボス裁定(BOSS_RANGE_REWORK.md v0.25.2455)の「ゾーン×重み表」を適用し、
// 「cageの無条件優先」と「氷攻撃50%の専用ロール」を**重みへ畳み込む**(抽選の入口を1本にする)。
import { pickComboFollowup, phaseForHealth, pickWeightedMove, bossZoneForDistance, type BossMoveWeights } from './bossScript';

export type SkadiMove = 'ice' | 'blade' | 'dash' | 'burst' | 'radial' | 'cage';

// 3相(§6.28-9フェーズ表): Phase1=100〜70% / Phase2=70〜35% / Phase3=35〜0%。
export const SKADI_PHASE_HP_THRESHOLDS = [0.7, 0.35] as const;
export const skadiPhaseForHealth = (healthFrac: number): 1 | 2 | 3 =>
  phaseForHealth(healthFrac, SKADI_PHASE_HP_THRESHOLDS) as 1 | 2 | 3;

// 連携確率: Phase2=50% / Phase3=60%(§6.28-9フェーズ表・不変)。
export const skadiComboChance = (phase: 1 | 2 | 3): number => (phase >= 3 ? 0.6 : 0.5);

// ==== 6技×距離ゾーンの重み表(v0.25.2609) ====================================================
// 是正の狙い:
//   - 密着の「候補なし50%」を消す(重み表なので候補ゼロにならない)。密着は ice33/blade33/burst17/radial17。
//   - ice/blade は §6.28-9 どおり全帯。合計重みが各ゾーンでおよそ半分=旧 SKADI_ATTACK_CHANCE=0.5
//     (社長指示済みの値)の意味を**重みの配分として保存**する。
//   - burst/radial の帯ゲート(旧320〜620のみ)を撤廃し、密着・遠でも薄く出す=張り付きの安全地帯を消す。
//   - dash は追いつき技として遠で優先(城ボス準拠)。
//   - cage は Phase3 のみ(下の skadiMoveWeight のフェーズ制約)。旧「無条件で最優先」から
//     **重み12(≒11%)**へ格下げ。実頻度は CD 12秒(SKADI_CAGE_CD_MS)が引き続き主に決める。
export const SKADI_MOVE_WEIGHTS: BossMoveWeights<SkadiMove> = {
  ice:    { melee: 30, near: 25, mid: 20, far: 15 },
  blade:  { melee: 30, near: 25, mid: 20, far: 15 },
  burst:  { melee: 15, near: 20, mid: 25, far: 10 },
  radial: { melee: 15, near: 20, mid: 25, far: 15 },
  dash:   { melee: 0,  near: 0,  mid: 20, far: 55 },
  cage:   { melee: 12, near: 12, mid: 12, far: 12 },
};

/** 技×距離×フェーズ→実効重み。cageはPhase3限定(§6.28-9)。 */
export const skadiMoveWeight = (
  move: SkadiMove,
  distance: number,
  phase: 1 | 2 | 3,
  weights: BossMoveWeights<SkadiMove> = SKADI_MOVE_WEIGHTS,
): number => {
  if (move === 'cage' && phase < 3) return 0; // 氷結の檻はPhase3で解禁(従来どおり)
  return weights[move][bossZoneForDistance(distance)];
};

/** 各技の適格判定=「現在ゾーンの実効重み>0」(旧ハードゲートの後継)。 */
export const skadiMoveEligible = (move: SkadiMove, distance: number, phase: 1 | 2 | 3): boolean =>
  skadiMoveWeight(move, distance, phase) > 0;

const ALL_MOVES: SkadiMove[] = ['ice', 'blade', 'dash', 'burst', 'radial', 'cage'];

/** CD明けかつ現在ゾーンの重み>0の技から重み比例で1つ。該当無しはnull。 */
export const pickSkadiMove = (
  distance: number,
  phase: 1 | 2 | 3,
  ready: Record<SkadiMove, boolean>,
  rand: () => number = Math.random,
): SkadiMove | null => pickWeightedMove(ALL_MOVES, m => skadiMoveWeight(m, distance, phase), ready, rand);

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
