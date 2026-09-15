// PACING_PUZZLE.md §14-4-2(新死神・着手前監査 重大4/5): プレイヤーの「実効移動速度」を
// movePlayer(gameStore.ts)から切り出した純関数。movePlayer は毎tickこれを呼び、結果を
// player.effectiveMoveSpeed へ保存する(CLAUDE.md 実装精度の規律4「配線ロジックは純関数に
// 切り出してテスト」)。
//
// ★この値に MOVE_SPEED_MULT(ゲーム全体のテンポ倍率・useGameLoop.ts)は含まれない。
// movePlayer は呼び出し側で既に `deltaTime * MOVE_SPEED_MULT` を受け取っているため、ここで
// 計算する速度は「ムーバに掛けられる前のベース値」。死神本体の移動もこれを踏襲し、
// `speed × deltaTime × MOVE_SPEED_MULT` の形で自前に掛ける(二重掛かり禁止=§14-4-2)。
//
// ★「素の実効速度」(死神本体が使う値)と「実効速度(バフ込み)」(死神の技「使者」が使う値)は別物:
//   本体 = PLAYER_BASE_SPEED × ランプ/トラップ/PvP等を除いた素の player.speed のみ
//         (スキル・スケーター・一時バフの「プラス分」は反映しない=社長の言葉)。
//   使者 = この関数が返す実効値(スキル/スケーター/ダッシュ等の全バフ込み)×1.2。
// 本体側の値は呼び出し側(useGameLoop)が player.speed をそのまま使う=この関数を経由しない。

export interface EffectiveMoveSpeedInput {
  /** dashOverride(ワイヤー高速移動/スラム後ホップ/一閃ダッシュ/一閃着地硬直)が出す速度。無ければ null。 */
  dashOverrideSpeed: number | null;
  /** 四神スライド中の固定速度。dashOverride より下位。無ければ null。 */
  slidingSpeed: number | null;
  /** リロード中か(RELOAD_MOVE_SPEED_MULTの分岐に使う)。 */
  reloading: boolean;
  reloadMoveSpeedMult: number;
  /** プレイヤーの素の足(player.speed=基礎+恒久強化。一時バフは含まない)。 */
  playerSpeed: number;
  /** スケーター搭乗中か(hasSkill('skater') && player.skaterRiding)。 */
  skaterActive: boolean;
  /** ランナー×マークスマン×消費カード×装備の移動速度倍率の積(ランプ前・スケーター/素の足は含まない)。 */
  bonusMult: number;
  /** speedRamp.effectiveRampFrac の結果。 */
  rampFrac: number;
  /** 対人トラップ効果中(社長指示2026-08-25): 「移動は等倍のみ」の頭打ちを掛けるか。 */
  trapDebuffed: boolean;
  /** PvP体勢による移動倍率(pvpMoveMult)。通常時は1。 */
  pvpMult: number;
}

/** ランプ済みボーナス倍率。speedRamp.rampedBonusMult と同一式(移設先を増やさないための再掲)。 */
const rampedBonus = (p: number, rampFrac: number): number => 1 + (p - 1) * rampFrac;

/**
 * movePlayer の速度計算(dashOv/sliding/reloading/トラップ頭打ち/PvP減速の合成)そのもの。
 * 挙動は1bitも変えていない(移設のみ)。
 */
export const computeEffectiveMoveSpeed = (input: EffectiveMoveSpeedInput): number => {
  const {
    dashOverrideSpeed, slidingSpeed, reloading, reloadMoveSpeedMult, playerSpeed,
    skaterActive, bonusMult, rampFrac, trapDebuffed, pvpMult,
  } = input;
  const rawMoveSpeed = dashOverrideSpeed !== null
    ? dashOverrideSpeed
    : slidingSpeed !== null
    ? slidingSpeed
    : reloading
    ? playerSpeed * reloadMoveSpeedMult * (skaterActive ? 3 : 1) * rampedBonus(bonusMult, rampFrac)
    : playerSpeed * (skaterActive ? 3 : 1) * rampedBonus(bonusMult, rampFrac);
  return (trapDebuffed ? Math.min(rawMoveSpeed, playerSpeed) : rawMoveSpeed) * pvpMult;
};
