// PACING_PUZZLE.md §6.28-10 バッチM59: トール(stage-5 深層)の技選択=純関数。
// レンダラ非依存・store非依存(useGameLoop.ts からのみ import される。giantScript.tsと同じ流儀)。
// 数値の根拠は PACING_PUZZLE.md §6.28-10 を参照。
//
// 前提(最重要・繰り返し): トールの既存数値(リード/射程/半幅/追従率/旋回/バックステップ/スロー歩き)は
// 社長指示が大量に埋まっている(v0.25.1321/1331/1334/1610/1617/1621/1622/1626/1627)。
// **1つも変えない。** ここが足すのは「硬直後に連携するかどうか・どちらへ分岐するか」の判断だけ。
//
// 単位: 「壁時計系」(§6.28-1-0)。ここに書くmsは実効msそのもの。
import { bossZoneForDistance, pickWeightedMove, type BossMoveWeights } from './bossScript';

// research/THOR_ISSEN_REWORK.md §4: 新技「突進」(dash・ミゲル型)を追加。
export type ThorMove = 'issen' | 'tsuki' | 'harai' | 'dash';

// 払いが候補に入る間合いの上限(px)。社長指示v0.25.1626の HARAI_TRIGGER_DIST と同じ値。
// ★v0.25.3780: 旧名 `THOR_COMBO_NEAR_MAX`。連携表(pickThorCombo/thorComboChance)は
// **どこからも呼ばれていない死にコード**だったので撤去し(連携の正本は bossChoreography.ts の
// `SCRIPTS.thor`)、この定数だけを生きている用途=「払いの間合いゲート」の名前へ改めた。
export const THOR_HARAI_MAX_DIST = 250;

// §6.28-10フェーズ表: Phase1=100〜60% / Phase2=60〜40% / Phase3=40〜0%。
// 40%は既存 THOR_LOWHP_FRAC をそのまま流用(新しい数字を発明しない・§6.28-10注記)。
// この配列はuseGameLoop.ts側のTHOR_LOWHP_FRAC(=0.4)と値を一致させること(重複管理は既存の
// giant/rafi等と同じ慣例=フックファイルへ逆importしないための割り切り)。
export const THOR_PHASE_HP_THRESHOLDS = [0.6, 0.4] as const;

export const thorPhaseForHealth = (healthFrac: number): 1 | 2 | 3 => {
  if (healthFrac <= THOR_PHASE_HP_THRESHOLDS[1]) return 3;
  if (healthFrac <= THOR_PHASE_HP_THRESHOLDS[0]) return 2;
  return 1;
};

// 既存の技選択プール(useGameLoop.ts の chase 抽選と同一・値は不変)を純関数化しただけ(実装精度の規律4)。
// 払いは HARAI_TRIGGER_DIST(250px)以内のみ候補に入る(社長指示v0.25.1626・既存のまま)。
export const pickThorPool = (canHarai: boolean): ThorMove[] => {
  const pool: ThorMove[] = ['issen', 'tsuki'];
  if (canHarai) pool.push('harai');
  return pool;
};

export const THOR_MOVE_WEIGHTS: BossMoveWeights<ThorMove> = {
  // 一閃=遠くから間合いを切る、突き=中距離の主砲、払い=近距離の読み合い。
  issen: { melee: 15, near: 30, mid: 55, far: 70 },
  tsuki: { melee: 25, near: 40, mid: 45, far: 30 },
  harai: { melee: 60, near: 50, mid: 0, far: 0 },
  // 突進(新技・§4)。**叩き台**: スカジ/ミーミルの突進の行をそのまま流用(新しい数字を発明しない)。
  // 中〜遠の間合い詰め=一閃と役割が重なるので、実機で配分を見る前提。
  // ★**research/THOR_ISSEN_REWORK.md §9-1 で社長裁定待ち**(結論として読まないこと)——far:55 は
  // 指定なしで入れた値で、遠距離の一閃が45%まで落ちる。推薦は far を 30 へ(突きと同格)。
  dash: { melee: 0, near: 0, mid: 20, far: 55 },
};

export const pickThorMove = (
  distance: number,
  phase: 1 | 2 | 3,
  rand: () => number = Math.random,
  // §4: 突進の専用CD(thorDashReadyAt)は呼び出し側(useGameLoop.ts)が見る。
  // 未指定=true は「CDの概念が無かった頃と同じ」= 既存テストが無改修で通る既定。
  dashReady = true,
): ThorMove => {
  const canHarai = distance <= THOR_HARAI_MAX_DIST;
  const ready = { issen: true, tsuki: true, harai: canHarai, dash: dashReady };
  const picked = pickWeightedMove(
    ['issen', 'tsuki', 'harai', 'dash'] as const,
    m => {
      const base = THOR_MOVE_WEIGHTS[m][bossZoneForDistance(distance)];
      // Phase3は新しい技を消さず、決闘の看板である刀技の圧だけを少し足す。
      return phase >= 3 && (m === 'issen' || m === 'harai') ? base * 1.2 : base;
    },
    ready,
    rand,
  );
  return picked ?? 'tsuki';
};
