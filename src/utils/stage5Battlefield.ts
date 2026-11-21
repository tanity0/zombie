// ステージ5(戦場)の光・色・コントラスト(社長承認2026-11-21「光、色、コントラスト」・ステージごとに順に・ステージ5から)。
// ステージ1の森の夜(weatherWet.ts の S1N_*・pixi/stage1Night.ts)と同じ型を、戦場の性格で値を決め直して掛ける:
//   - 世界の色行列1枚: 黒を深く沈め、明るい所を赤橙へ押し上げる(焼けた戦場の明暗差)
//   - 空(遠景の箱)の色行列1枚: 焦げた赤黒い地平の空へ
//   - 煙(霧)と近景の残骸の色: 火に照らされた煙の暖色へ(霧の濃さはそのまま=色だけ)
//   - 夜の寒色の乗算(GRADE_TINT)の色を焦げた暖色の暗さへ(濃さはそのまま)
//   - 松明の足元の地面に赤橙の火の溜まり(柔らかい丸の絵・加算・使い回し)。影を落とす光ではない
//   - 火の粉(既存の EMBER_MOTE_COUNT 粒)を world 座標へ移し、遠近と被写界深度・地平線の覆いを他の物と揃える
// 効き具合 mix(0..1)は雨上がり/ステージ1の夜と同じ速さで寄せ、見た目の加減速は easeInOutSine(慣性)。
// mix=0 なら全部厳密にそのまま(他ステージ・効いていない時は単位行列/倍率1)。
// RENDERER-AGNOSTIC: PixiJS を import しない。

import { easeInOutSine, buildWetGradeMatrix } from './weatherWet';

/** 戦場の見た目を足すステージ(ステージ5だけ)。 */
export const STAGE5_BATTLE_STAGES: ReadonlySet<string> = new Set(['stage-5']);
export interface Stage5BattleCtx {
  stageId: string;
  indoor: boolean;
  corridor: boolean;
  /** 今の遠景のキー(戦場=stage5 の時だけ)。 */
  farKey: string | null;
  daylight: boolean;
}
/** ステージ5の戦場の見た目がこのフレームで効くか。 */
export const stage5BattleActive = (c: Stage5BattleCtx): boolean =>
  STAGE5_BATTLE_STAGES.has(c.stageId) && !c.indoor && !c.corridor && c.farKey === 'stage5' && !c.daylight;

const ID: readonly number[] = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const lerpMatrix = (target: readonly number[], mix: number): number[] => {
  const k = easeInOutSine(mix);
  return ID.map((v, i) => v + (target[i] - v) * k);
};

/** 1. 世界の色行列: 黒の点を下げ(焦げた黒)、明るい所は赤を強く・青を抜く(火の照り)。彩度も少し上げる。 */
export const S5B_GRADE_SAT = 1.15;
export const S5B_GRADE_GAIN: readonly [number, number, number] = [1.68, 1.56, 1.2];
export const S5B_GRADE_LIFT: readonly [number, number, number] = [-0.1, -0.1, -0.1];
/** 効き具合 mix の時の世界の色行列。mix=0 なら単位行列(=何も変えない)。 */
export const buildStage5GradeMatrix = (mix: number): number[] => {
  const k = easeInOutSine(mix);
  const l = (a: number, b: number) => a + (b - a) * k;
  return buildWetGradeMatrix(
    l(1, S5B_GRADE_SAT),
    S5B_GRADE_GAIN.map(g => l(1, g)),
    S5B_GRADE_LIFT.map(v => l(0, v)),
  );
};

/** 2. 空(遠景の箱)の色行列: 赤を立て、緑と青を抜き、暗い所を黒へ沈める=焦げた赤黒い地平の空。5×4 を1列に。 */
export const S5B_SKY_MATRIX: readonly number[] = [
  1.42, 0.08, 0, 0, -0.06,
  0.02, 0.66, 0, 0, -0.06,
  0, 0, 0.48, 0, -0.055,
  0, 0, 0, 1, 0,
];
/** 効き具合 mix の時の空の色行列(mix=0 で単位行列)。 */
export const buildStage5SkyMatrix = (mix: number): number[] => lerpMatrix(S5B_SKY_MATRIX, mix);

/** 3. 煙(霧)の色: 火に照らされた煙の暖色へ(青灰を抜く)。濃さは変えない。 */
export const S5B_FOG_TINT_MUL = { r: 0.96, g: 0.76, b: 0.62 } as const;
/** 夜の寒色の乗算(GRADE_TINT)の色を、焦げた暖色の暗さへ寄せる(濃さはそのまま)。青を沈め、赤を残す=影が赤黒く締まる。 */
export const S5B_NIGHT_GRADE_TINT = 0xa87480;
/** 近景の残骸(世界の色行列が掛からない層)を、影絵として暗く赤く沈める。 */
export const S5B_FRONT_TINT_MUL = { r: 0.82, g: 0.6, b: 0.52 } as const;
/** 色の掛け率 mul を、効き具合 mix(0..1・加減速つき)ぶん効かせた掛け率。mix=0 なら 1,1,1。 */
export const stage5TintMul = (mul: { r: number; g: number; b: number }, mix: number): { r: number; g: number; b: number } => {
  const k = easeInOutSine(mix);
  return { r: 1 + (mul.r - 1) * k, g: 1 + (mul.g - 1) * k, b: 1 + (mul.b - 1) * k };
};

/** 4. 火の溜まり(松明の足元の地面に落ちる赤橙の光)。2枚重ね=芯(熱い橙)と外側(広く赤い)。寸法は world px・遠近前。 */
export interface FirePoolSpec { w: number; h: number; up: number; alpha: number; tint: number; tintMix: number }
export const S5B_FIRE_POOLS: readonly FirePoolSpec[] = [
  { w: 720, h: 220, up: 6, alpha: 0.6, tint: 0xc0200a, tintMix: 0.8 }, // 外側: 広く赤い(焼けた地面の照り返し)
  { w: 320, h: 100, up: 2, alpha: 0.5, tint: 0xff5a14, tintMix: 0.6 }, // 芯: 熱い橙
];
/** 炎の揺らぎ(既存の松明の光だまりの強さ 0..1)を溜まりの濃さへ寄せる割合(1フレームあたり・慣性)。 */
export const S5B_FIRE_POOL_EASE = 0.14;

/** 5. 火の粉の遠近: world に置いた時の大きさ(元の粒の大きさ px に掛ける)。遠近 depthScale を更に掛ける。 */
export const S5B_EMBER_SIZE_MUL = 0.85;
/** 火の粉の大きさ(world px)。元の粒の大きさ size・遠近 ds。 */
export const stage5EmberSize = (size: number, ds: number): number => size * S5B_EMBER_SIZE_MUL * ds;
