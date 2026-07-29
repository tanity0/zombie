// MOVEMENT_REWORK.md 仕様1(速度ボーナスのランプ+切り返しリセット・社長裁定 v0.25.2442)。
// 「速度ボーナス(基礎速度より上の部分)」は同じ方向へ走り続けた時間で立ち上がり、鋭い方向転換
// (RAMP_RESET_ANGLE_DEG 以上)または停止でゼロへ戻る。基礎速度・スケーターの×3は対象外(呼び出し側
// = gameStore.ts の movePlayer が別枠で乗算する)。純関数のみ(副作用なし・Date.now/Math.random不使用)
// =ヘッドレスでユニットテスト可能(規律4)。

export interface SpeedRampState {
  sustainMs: number;
  lastDirX: number;
  lastDirY: number;
}

export const createSpeedRampState = (): SpeedRampState => ({
  sustainMs: 0,
  lastDirX: 0,
  lastDirY: 0,
});

// 数値は全て定数化(実機調整前提・MOVEMENT_REWORK.md記載値)。
export const RAMP_RESET_ANGLE_DEG = 75;
export const RAMP_FULL_MS = 1500;

export interface StepSpeedRampInput {
  dtMs: number;
  moving: boolean;
  dirX: number;
  dirY: number;
}

// 2ベクトルのなす角(度)。どちらかが零ベクトルなら「比較不能」として 0(=リセットしない)を返す
// (動き出した最初の1フレームは「前回方向」が無いので、切り返し判定ではなく素直に積み増す)。
const angleBetweenDeg = (ax: number, ay: number, bx: number, by: number): number => {
  const al = Math.hypot(ax, ay);
  const bl = Math.hypot(bx, by);
  if (al <= 0 || bl <= 0) return 0;
  const dot = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (al * bl)));
  return Math.acos(dot) * (180 / Math.PI);
};

// 状態を1tickぶん進める。呼び出し側(movePlayer)は「プレイヤーの入力方向」だけを渡すこと
// (ノックバック/ダッシュ等の強制移動による実座標の変化は見ない=意図しないリセット防止)。
export const stepSpeedRamp = (state: SpeedRampState, input: StepSpeedRampInput): SpeedRampState => {
  const { dtMs, moving, dirX, dirY } = input;
  if (!moving) {
    return { sustainMs: 0, lastDirX: 0, lastDirY: 0 };
  }
  const turned = angleBetweenDeg(state.lastDirX, state.lastDirY, dirX, dirY) >= RAMP_RESET_ANGLE_DEG;
  return {
    sustainMs: turned ? 0 : state.sustainMs + dtMs,
    lastDirX: dirX,
    lastDirY: dirY,
  };
};

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// sustainMs → 0..1 の素のランプ割合(切り返しリセット等は stepSpeedRamp 側で反映済み)。
export const rampFracOf = (state: SpeedRampState): number => clamp01(state.sustainMs / RAMP_FULL_MS);

// 復帰フラグ `?speedramp=0` 用: enabled=false ならランプ無視で常時フル(旧挙動=ボーナス即時全開)。
// 状態機械そのもの(stepSpeedRamp)はフラグに関わらず一貫して進める。
export const effectiveRampFrac = (state: SpeedRampState, enabled: boolean): number =>
  enabled ? rampFracOf(state) : 1;

// 「対象倍率の積 P」に対するランプ後の実効倍率: 1 + (P - 1) × rampFrac。
// 基礎速度は即応のまま、ボーナス部分(Pのうち1を超える分)だけがランプに乗る。
export const rampedBonusMult = (p: number, rampFrac: number): number => 1 + (p - 1) * rampFrac;
