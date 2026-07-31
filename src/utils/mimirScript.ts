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
//
// ==== v0.25.2609(ボス動き横断監査・バッチ1「死に技の解放」) ====================================
// 旧実装は距離ハードゲート(密着0-200=bite専用 / 近320 / 中620 / 遠1000で頭打ち)だった。
// 実測(純関数掃引20,000回・DEVELOPMENT_LOG v0.25.2609)で判明した問題:
//   - ミーミルの中立は useGameLoop の moveToward()=プレイヤーへ直進。速度90×1.2=108 >
//     プレイヤー104.4 なので**必ず密着帯へ張り付く**。
//   - その密着帯の技構成が **bite 100%**(他4技はゲートで弾かれる)。しかもbiteはCD6秒。
//     ⇒ 実戦では「6秒に1回噛むだけ、あとは歩いてぶつかってくる」ボスになっていた。
// 対策: 城ボスで社長裁定済み(BOSS_RANGE_REWORK.md v0.25.2455)の「距離ハードゲート廃止→
// ゾーン×重み表」をそのまま適用。ゾーン境界は全ボス共通の BOSS_RANGE(120/300/600・上限なし)。
import { pickComboFollowup, phaseForHealth, pickWeightedMove, bossZoneForDistance, type BossMoveWeights } from './bossScript';

export type MimirMove = 'bite' | 'radial' | 'burst' | 'laser' | 'dash';

export const MIMIR_PHASE_HP_THRESHOLD = 0.6;
export const mimirPhaseForHealth = (healthFrac: number): 1 | 2 => phaseForHealth(healthFrac, [MIMIR_PHASE_HP_THRESHOLD]) as 1 | 2;

// ==== 5技×距離ゾーンの重み表(v0.25.2609) ====================================================
// 重み0=そのゾーンでは出ない(ハードゲートと同じ意味)。数字はこの表1箇所だけで管理する。
// 是正の狙い(旧実測 → 新設計):
//   - 密着(=実戦の主戦場)を bite100% → **bite50 / radial20 / burst15 / laser15 の4本立て**へ。
//     biteはCD6秒なので、CD中に「候補ゼロ=何も出ない」空白が消えるのが最大の効果。
//   - laser を全ゾーンで出す(城ボスのboltと同じ思想=遠くも近くも「安全な間合い」を作らせない)。
//   - dash は「追いつき技」の役割を維持=遠で圧倒的優先(城ボスの dash 0/0/15/70 に倣う)。
//   - 旧FAR_MAX(1000)の頭打ちは撤廃(遠ゾーンに上限なし)=引き撃ちで完全に安全な距離を作らない。
export const MIMIR_MOVE_WEIGHTS: BossMoveWeights<MimirMove> = {
  bite:   { melee: 50, near: 30, mid: 0,  far: 0 },
  radial: { melee: 20, near: 30, mid: 25, far: 0 },
  burst:  { melee: 15, near: 20, mid: 25, far: 10 },
  laser:  { melee: 15, near: 20, mid: 35, far: 30 },
  dash:   { melee: 0,  near: 0,  mid: 15, far: 60 },
};

// フェーズ表(§6.28-5)の「レーザーの抽選確率が0.34→0.50へ上がる」を、専用の確率ロールではなく
// **重みの倍率**で表現する(抽選方式が重み表へ変わったため)。比 0.50/0.34 ≒ 1.47 を 1.5 に丸めた。
export const MIMIR_LASER_PHASE2_WEIGHT_MULT = 1.5;

/** 技×距離×フェーズ→実効重み。0=出ない。CD(readyAt)は呼び出し側(useGameLoop.ts)が見る。 */
export const mimirMoveWeight = (
  move: MimirMove,
  distance: number,
  phase: 1 | 2,
  weights: BossMoveWeights<MimirMove> = MIMIR_MOVE_WEIGHTS,
): number => {
  const w = weights[move][bossZoneForDistance(distance)];
  if (move === 'laser' && phase >= 2) return w * MIMIR_LASER_PHASE2_WEIGHT_MULT;
  return w;
};

// 各技の適格判定=「現在ゾーンの実効重み>0」(旧ハードゲートの後継)。
// pickMimirCombo の「まだその技の間合いに居るなら」判定もここを通るので読み替えが自動で効く。
// ※旧シグネチャは (move, distance)。laserのフェーズ倍率のためphaseを足したが、倍率は正数なので
//   「>0かどうか」はフェーズに依存しない=既定値1のまま従来どおり呼べる。
export const mimirMoveEligible = (move: MimirMove, distance: number, phase: 1 | 2 = 1): boolean =>
  mimirMoveWeight(move, distance, phase) > 0;

const ALL_MOVES: MimirMove[] = ['bite', 'radial', 'burst', 'laser', 'dash'];

/** CD明けかつ現在ゾーンの重み>0の技から重み比例で1つ。該当無しはnull(=通常チェイスへ)。 */
export const pickMimirMove = (
  distance: number,
  phase: 1 | 2,
  ready: Record<MimirMove, boolean>,
  rand: () => number = Math.random,
): MimirMove | null => pickWeightedMove(ALL_MOVES, m => mimirMoveWeight(m, distance, phase), ready, rand);

// Phase2限定の2連携(§6.28-5): 突進→噛みつき(終点で密着した相手を狩る) / 全方位→レーザー(逃げた先へ直線)。
// giant(6.26-9 #8)と同じ作法=「まだその技の間合いに居るなら」を距離の再チェックで表現する。
export const MIMIR_COMBO_FOLLOWUP: Partial<Record<MimirMove, MimirMove>> = {
  dash: 'bite',
  radial: 'laser',
};
export const MIMIR_COMBO_CHANCE = 0.4;

export const pickMimirCombo = (
  justFinished: MimirMove,
  phase: 1 | 2,
  distance: number,
  rand: () => number = Math.random,
): MimirMove | null => {
  if (phase !== 2) return null;
  return pickComboFollowup(justFinished, MIMIR_COMBO_FOLLOWUP, MIMIR_COMBO_CHANCE, m => mimirMoveEligible(m, distance, phase), rand);
};
