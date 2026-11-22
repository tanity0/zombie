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

/**
 * 1. 世界の色行列: 黒の点を下げ(焦げた黒)、明るい所は赤を強く・青を抜く(火の照り)。彩度も少し上げる。
 * 暖色は主に黒の点(LIFT)の側で付ける=暗部〜中間が赤黒く焦げ、明部の傾きは3色で近い。
 * 傾き(GAIN)を赤だけ大きくすると、松明の光や淡い色(主人公の青い髪)が赤から先に天井へ当たって黄白に飛ぶ
 * (社長の実機報告2026-11-21「松明の光が強すぎる」)。
 */
export const S5B_GRADE_SAT = 1.15;
export const S5B_GRADE_GAIN: readonly [number, number, number] = [1.37, 1.27, 1.19];
export const S5B_GRADE_LIFT: readonly [number, number, number] = [-0.06, -0.1, -0.14];
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

/**
 * 4. 火の溜まり(松明の足元の地面に落ちる赤橙の光)。2枚重ね=芯(熱い橙)と外側(広く赤い)。寸法は world px・遠近前。
 * 中心は足元より奥(画面の上)=松明の裏の光(utils/torchBackLight.ts・社長承認2026-11-21)。台座が照らされた地面の前に影絵で立つ。
 * 加算で、しかも上の世界の色行列で持ち上げられる=松明の既存の光だまり・暈に重なって白く飛びやすい。濃さは控えめに置く
 * (社長の実機報告2026-11-21「松明の光が強すぎる」)。
 */
export interface FirePoolSpec { w: number; h: number; up: number; alpha: number; tint: number; tintMix: number }
export const S5B_FIRE_POOLS: readonly FirePoolSpec[] = [
  { w: 720, h: 220, up: 50, alpha: 0.3, tint: 0xc0200a, tintMix: 0.8 }, // 外側: 広く赤い(焼けた地面の照り返し)
  { w: 320, h: 100, up: 22, alpha: 0.25, tint: 0xff5a14, tintMix: 0.6 }, // 芯: 熱い橙
];
/** 炎の揺らぎ(既存の松明の光だまりの強さ 0..1)を溜まりの濃さへ寄せる割合(1フレームあたり・慣性)。 */
export const S5B_FIRE_POOL_EASE = 0.14;

/** 5. 火の粉の遠近: world に置いた時の大きさ(元の粒の大きさ px に掛ける)。遠近 depthScale を更に掛ける。 */
export const S5B_EMBER_SIZE_MUL = 0.85;
/** 火の粉の大きさ(world px)。元の粒の大きさ size・遠近 ds。 */
export const stage5EmberSize = (size: number, ds: number): number => size * S5B_EMBER_SIZE_MUL * ds;

/**
 * 6. 燃える残骸(社長指示2026-11-21「燃える残骸足して」)。どれが燃えるかは world/burningWrecks.ts。
 * 炎は松明と同じ8コマの絵を置物の大きさに合わせて1〜3本。寸法は world px・遠近前。見た目だけ(判定なし)。
 */
/** 同時に描く燃える残骸の上限(画面の中心に近い順)。最大引きでも画面内はふつう十数個。 */
export const S5B_WRECK_MAX = 16;
/** 点く/消える時に濃さを寄せる割合(1フレームあたり・慣性)。 */
export const S5B_WRECK_EASE = 0.1;
/** 足元の火の溜まりの光源の色(松明の光だまりと同じ橙)。 */
export const S5B_WRECK_LIGHT_COLOR = 0xff9f1c;
/** 炎を置物のどれだけ奥に並べるか(zIndex の差)。置物のすぐ奥=残骸が炎を背に影絵で立つ。 */
export const S5B_WRECK_Z_BEHIND = 0.01;
/**
 * 燃える残骸の炎の zIndex。★置物の絵の並び順(zIndex)から決める=置物のすぐ奥。
 * 炎を置く位置(?proj=1 では投影後の足元)から決めてはいけない: 置物とアクターは world の足元Yで並ぶので、
 * 投影後のYを使うと置物より手前へ出る(v0.25.5735 の段階1で起きた)。
 */
export const burningWreckZIndex = (propZIndex: number): number => propZIndex - S5B_WRECK_Z_BEHIND;

const frac = (v: number): number => v - Math.floor(v);

/** 炎の揺らぎ(0.85..1.1あたり・2つの周期の合成=単調なサインに見せない)。 */
export const burningWreckFlicker = (now: number, seed: number): number =>
  0.95 + 0.09 * Math.sin(now / 131 + seed * 40) + 0.05 * Math.sin(now / 57 + seed * 91);

export interface WreckFlame { dx: number; base: number; h: number }
/**
 * 置物の絵(幅 artW・高さ artH)に乗る炎(1〜3本)。dx=足元からの横ずれ、base=足元から炎の根元までの高さ、h=炎の高さ。
 * 絵が広いほど本数が増え、真ん中の1本が一番高い。高さは揺らぎで少し伸び縮みする。
 */
export const burningWreckFlames = (artW: number, artH: number, seed: number, now: number): WreckFlame[] => {
  const n = artW >= 110 ? 3 : artW >= 56 ? 2 : 1;
  const out: WreckFlame[] = [];
  const hMain = Math.max(40, Math.min(140, artH * (1.3 + 0.35 * frac(seed * 7.3))));
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const main = n === 1 || (n === 3 ? i === 1 : i === Math.floor(frac(seed * 3.7) * 2));
    const jitter = (frac(seed * 13.1 + i * 0.61) - 0.5) * artW * 0.1;
    const dx = (t - 0.5) * artW * 0.58 + jitter;
    const base = artH * (0.3 + 0.18 * frac(seed * 5.9 + i * 0.37));
    const sway = 1 + 0.08 * Math.sin(now / (150 + i * 37) + seed * 20 + i * 1.7);
    out.push({ dx, base, h: hMain * (main ? 1 : 0.62 + 0.14 * frac(seed * 2.1 + i)) * sway });
  }
  return out;
};

export interface WreckSmoke { dx: number; rise: number; size: number; rot: number; alpha: number }
/**
 * 炎の上から昇る煙の j 番目(周期で生まれ直す)。昇り方は加速(ゆっくり出て速く抜ける)・広がりながら薄れる=慣性。
 * rise=炎の上端からの高さ、size=絵の一辺。
 */
export const burningWreckSmoke = (artW: number, seed: number, j: number, now: number): WreckSmoke => {
  const period = 3800 + 900 * frac(seed * 4.3 + j * 0.5);
  const t = frac(now / period + seed + j * 0.5);
  const w = Math.max(0.7, Math.min(1.6, artW / 90));
  return {
    dx: Math.sin(now / 1700 + seed * 30 + j * 2) * 10 * w + t * t * 26 * w,
    rise: (0.55 * t + 0.45 * t * t) * 150 * w,
    size: (46 + 110 * t) * w,
    rot: seed * 6.28 + j * 2.1 + t * 0.7,
    alpha: 0.5 * Math.pow(Math.sin(Math.PI * t), 1.3),
  };
};
