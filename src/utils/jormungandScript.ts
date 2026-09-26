// PACING_PUZZLE.md §6.28-7 バッチM56: ヨルムンガルド(stage-3 深層)の技選択=純関数。
// レンダラ非依存・store非依存(useGameLoop.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-7 を参照。
//
// 単位: 「壁時計系」(§6.28-1-0)。ここに書くmsは実効msそのもの。
// ==== v0.25.2609(ボス動き横断監査・バッチ1「死に技の解放」) ====================================
// 旧実装は距離ハードゲート(近0-320=coil専用 / 中620 / 遠1000で頭打ち)だった。実測(純関数掃引)で
// **密着帯 coil 100%**(他3技はゲートで弾かれる)。ヨルムンガルドの中立は moveToward()=直進で
// 速度90×1.2=108 > プレイヤー104.4 なので必ず密着へ張り付き、coilはCD7秒。
// ⇒ 「7秒に1回薙ぐだけ、あとは歩いてぶつかってくる」ボスになっていた。
// 対策: 城ボス裁定(BOSS_RANGE_REWORK.md v0.25.2455)の「ゾーン×重み表」を適用。
import { pickComboFollowup, phaseForHealth, pickWeightedMove, bossZoneForDistance, type BossMoveWeights } from './bossScript';

export type JormungandMove = 'radial' | 'burst' | 'dash' | 'coil';

export const JORM_PHASE_HP_THRESHOLD = 0.6;
export const jormungandPhaseForHealth = (healthFrac: number): 1 | 2 => phaseForHealth(healthFrac, [JORM_PHASE_HP_THRESHOLD]) as 1 | 2;
export const JORM_COMBO_CHANCE = 0.6;

// ==== 4技×距離ゾーンの重み表(v0.25.2609) ====================================================
// 是正の狙い: 密着を coil100% → **coil55 / burst20 / radial25** の3本立てへ(coilのCD7秒の空白を埋める)。
// radial(螺旋)は蛇の主砲なので全ゾーンで顔を出す。dashは追いつき技として遠で圧倒的優先(城ボス準拠)。
// 【設計裁定・§6.28-7 #4の踏襲】うねりは「近接帯のハメを塞ぐ」技なのでPhase1から使える
// (帯=重みはフェーズ非依存。Phase2で増えるのは連携だけ)。旧FAR_MAX(1000)の頭打ちは撤廃。
export const JORM_MOVE_WEIGHTS: BossMoveWeights<JormungandMove> = {
  coil:   { melee: 55, near: 40, mid: 0,  far: 0 },
  burst:  { melee: 20, near: 25, mid: 30, far: 10 },
  radial: { melee: 25, near: 35, mid: 40, far: 25 },
  dash:   { melee: 0,  near: 0,  mid: 30, far: 65 },
};

/** 技×距離→実効重み(ヨルムンガルドはフェーズで重みが変わらない=帯はフェーズ非依存の裁定どおり)。 */
export const jormungandMoveWeight = (
  move: JormungandMove,
  distance: number,
  weights: BossMoveWeights<JormungandMove> = JORM_MOVE_WEIGHTS,
): number => weights[move][bossZoneForDistance(distance)];

// 各技の適格判定=「現在ゾーンの重み>0」(旧ハードゲートの後継)。phase引数は呼び出し側の互換のため
// 残すが、上の裁定どおり帯はフェーズ非依存なので参照しない。
export const jormungandMoveEligible = (move: JormungandMove, distance: number, _phase: 1 | 2 = 1): boolean =>
  jormungandMoveWeight(move, distance) > 0;

const POOL: JormungandMove[] = ['dash', 'burst', 'radial', 'coil'];

/** CD明けかつ現在ゾーンの重み>0の技から重み比例で1つ。該当無しはnull。 */
export const pickJormungandMove = (
  distance: number,
  phase: 1 | 2,
  ready: Record<JormungandMove, boolean>,
  rand: () => number = Math.random,
): JormungandMove | null => {
  void phase; // 帯・重みはフェーズ非依存(§6.28-7 #4の設計裁定)。差が出るのは連携だけ。
  return pickWeightedMove(POOL, m => jormungandMoveWeight(m, distance), ready, rand);
};

// Phase2限定の2連携(§6.28-7): 突進→うねり(終点で密着した相手を薙ぐ) / 扇→螺旋(逃げた先へ弾幕)。
export const JORM_COMBO_FOLLOWUP: Partial<Record<JormungandMove, JormungandMove>> = {
  dash: 'coil',
  coil: 'burst',
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
