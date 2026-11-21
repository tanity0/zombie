// ステージ1の森の蛍(晴れた夜の魅力=光と色・社長指示2026-11-21「光や色で」)。描画に依らない決めごと。
// - 1匹ずつ自分の間合いで、ゆっくり灯って消える(点く/消えるは加減速=慣性 MUST)
// - 暖かい黄緑と、少しだけ涼しい水色
// - 雨上がりの間は数を減らし、本降りではほぼ0
// RENDERER-AGNOSTIC: PixiJS を import しない。

import { easeInOutSine, RAIN_INTENSITY_LOW_MAX, RAIN_INTENSITY_HIGH_MIN } from './weatherWet';

/** 灯る周期(ms)の幅。1匹ずつこの間で決まる。 */
export const FIREFLY_BLINK_MS_MIN = 2600;
export const FIREFLY_BLINK_MS_MAX = 5200;
/** 1周期のうち、灯り始め→最も明るい→消え終わり の位置(0..1)。残りは暗いまま漂う。 */
export const FIREFLY_RISE_END = 0.16;
export const FIREFLY_HOLD_END = 0.4;
export const FIREFLY_FALL_END = 0.64;
/** 暗い間も消え切らない明るさ(ほんのり居るのが分かる)。 */
export const FIREFLY_DIM_FLOOR = 0.06;
/** ステージ1の森の蛍の数(画面と周りの余白に散らす=灯っているのが画面に8〜12匹前後・社長指示2026-11-21「蛍が多すぎる」で96から減らした)。 */
export const FIREFLY_S1_COUNT = 40;
/** 水色の蛍の割合と色。暖かい黄緑の色。 */
export const FIREFLY_CYAN_FRAC = 0.22;
export const FIREFLY_WARM_TINT = 0xd6ff6a;
export const FIREFLY_CYAN_TINT = 0x8ff0ff;
/** 灯った時の芯の大きさ(画面 px)・光の輪の大きさ(芯の何倍)・輪の濃さ。 */
export const FIREFLY_CORE_PX = 7.5;
export const FIREFLY_HALO_MUL = 7;
export const FIREFLY_HALO_ALPHA = 0.62;
/** 漂う速さ(px/s)・向きの変わり方。 */
export const FIREFLY_SPEED_MIN = 8;
export const FIREFLY_SPEED_MAX = 17;
/** 速度を目標へ寄せる速さ(1/s・慣性)。 */
export const FIREFLY_STEER = 1.4;
/** プレイヤーが近くを通ると散る: 半径(world px)・押す強さ(px/s²)・散った勢いが抜ける速さ(1/s)。 */
export const FIREFLY_SCATTER_R = 90;
export const FIREFLY_SCATTER_ACC = 520;
export const FIREFLY_SCATTER_DECAY = 1.8;
/** 画面の外で入れ替わる時、花の近くへ置き直す割合。 */
export const FIREFLY_NEAR_FLOWER_P = 0.5;
/** 雨上がりの止みかけの時の数の割合(本降りでは0へ・間は雨の強さに沿って滑らかに)。 */
export const FIREFLY_WET_FRAC = 0.4;
/** 1匹ずつの出る/消える(数の割合が変わった時)を寄せる速さ(1/s)。 */
export const FIREFLY_ON_EASE = 0.9;

const frac = (x: number) => x - Math.floor(x);

/** 時刻 now の明るさ(0..1)。phase01 は 0..1 の位相・periodMs は周期。 */
export const fireflyBlink = (now: number, phase01: number, periodMs: number): number => {
  const u = frac(now / Math.max(1, periodMs) + phase01);
  let lit: number;
  if (u < FIREFLY_RISE_END) lit = easeInOutSine(u / FIREFLY_RISE_END);
  else if (u < FIREFLY_HOLD_END) lit = 1;
  else if (u < FIREFLY_FALL_END) lit = 1 - easeInOutSine((u - FIREFLY_HOLD_END) / (FIREFLY_FALL_END - FIREFLY_HOLD_END));
  else lit = 0;
  return FIREFLY_DIM_FLOOR + (1 - FIREFLY_DIM_FLOOR) * lit;
};

/** 出す蛍の割合(0..1)。晴れの夜は1・雨上がりは雨の強さで減らす(本降りで0)。 */
export const fireflyActiveFrac = (wet: boolean, rain: number): number => {
  if (!wet) return 1;
  const t = Math.min(1, Math.max(0, (rain - RAIN_INTENSITY_LOW_MAX) / Math.max(1e-6, RAIN_INTENSITY_HIGH_MIN - RAIN_INTENSITY_LOW_MAX)));
  return FIREFLY_WET_FRAC * (1 - easeInOutSine(t));
};

/** 漂う向き(ラジアン)。ゆっくり回りつつ、ときどき向きを揺らす(機械的な円を描かない)。 */
export const fireflyHeading = (now: number, seed: number): number =>
  seed * 6.283 + now * 0.00021 * (seed > 0.5 ? 1 : -1) + 1.4 * Math.sin(now * (0.00037 + seed * 0.0003) + seed * 11);

/** プレイヤーから離れる向きの加速度(px/s²)。半径の外は0・近いほど強い(縁で0から立ち上がる=急に弾かれない)。 */
export const fireflyScatterAcc = (dx: number, dy: number): { ax: number; ay: number } => {
  const d = Math.hypot(dx, dy);
  if (d >= FIREFLY_SCATTER_R || d < 1e-3) return { ax: 0, ay: 0 };
  const k = easeInOutSine(1 - d / FIREFLY_SCATTER_R) * FIREFLY_SCATTER_ACC;
  return { ax: (dx / d) * k, ay: (dy / d) * k };
};
