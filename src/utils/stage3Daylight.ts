// ステージ3(医療科学センター・昼の廃都)の光と影(社長承認2026-11-21「ステージ3の光と影も進めて」)。
// 参考画の空気(左上の低い太陽・金色の光の筋・日なたの暖色と青い日陰・木漏れ日・遠くの暖かいかすみ)へ寄せる5つ:
//   1. 低い太陽の光の筋: ステージ1の月明りの筋(utils/moonShafts.ts の柔らかい分布)を金色で、画面の上端の外の太陽から
//      3〜4本(主役は太い1〜2本)。光の当たりの山は画面の左上〜中段左=主人公(画面の真ん中)には集めない。筋の中だけで光る塵。
//   2. 日なたと日陰の差: 世界の色行列1枚。暗部〜中間は青へ、明部(光の当たる所)だけ金へ(スプリットトーン)。黒は潰さない。
//   3. 木漏れ日: 広場の中央は日なたのまま。まだらは画面の縁(手前の茂み・建物の側)と木のある所だけ。
//      「広い薄い影の中に明るい丸い光の粒」。揺れは不規則な突風の時だけ。
//   4. 太陽のまぶしさ: 太陽は画面の上端の外(体力の玉より右)。光の玉の芯は画面に出さず、にじみの縁だけ入れる。明るさは一定。
//   5. 遠くのかすみ: 太陽の側(左)で暖かく、反対(右)は弱く寒色寄り(色だけ・霧の濃さは変えない)。
// 効き具合 mix(0..1)は雨上がり/ステージ1の夜と同じ速さで寄せ、見た目の加減速は easeInOutSine(慣性)。
// mix=0 なら全部厳密にそのまま(単位行列/掛け率1・何も描かない)。見た目だけ(判定・湧き・バランスには触れない)。
// RENDERER-AGNOSTIC: PixiJS を import しない。

import { easeInOutSine, buildWetGradeMatrix, lerpRgb } from './weatherWet';
import type { MoonShaft } from './moonShafts';

/** 昼の廃都の光と影を足すステージ(ステージ3だけ。エンディングは同じ昼でも足さない)。 */
export const STAGE3_DAYLIGHT_STAGES: ReadonlySet<string> = new Set(['stage-3']);
export interface Stage3DaylightCtx {
  stageId: string;
  indoor: boolean;
  corridor: boolean;
  /** 今の遠景のキー(昼の廃都=city の時だけ)。 */
  farKey: string | null;
}
/** ステージ3の昼の光と影がこのフレームで効くか。 */
export const stage3DaylightActive = (c: Stage3DaylightCtx): boolean =>
  STAGE3_DAYLIGHT_STAGES.has(c.stageId) && !c.indoor && !c.corridor && c.farKey === 'city';

const ID: readonly number[] = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const frac = (v: number): number => v - Math.floor(v);
/** 決め打ちの 0..1(同じ k・seed なら毎回同じ)。 */
export const hash01 = (k: number, seed: number): number => frac(Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453);

// ---- 2. 日なたと日陰(世界の色行列) ----
/**
 * 黒の点(LIFT)で暗部〜中間を青へ(青を持ち上げ赤を下げる)、傾き(GAIN)で明部だけを金へ=スプリットトーン。
 * 境目(赤=青)はおよそ明るさ 0.45=暖色は光の当たる所だけ・日陰と中間は青い。青の持ち上げは「黒く潰さない」役も兼ねる。
 */
export const S3D_GRADE_SAT = 1.08;
export const S3D_GRADE_GAIN: readonly [number, number, number] = [1.07, 1.03, 0.9];
export const S3D_GRADE_LIFT: readonly [number, number, number] = [-0.03, 0.004, 0.11];
/** 緑だけをさらに鮮やかにする量(緑 −(赤+青)/2 をこの割合だけ緑へ足す)。草と苔が日を浴びて立つ。 */
export const S3D_GREEN_BOOST = 0.1;
/** 効き具合 mix の時の世界の色行列。mix=0 なら単位行列(=何も変えない)。 */
export const buildStage3GradeMatrix = (mix: number): number[] => {
  const k = easeInOutSine(mix);
  const l = (a: number, b: number) => a + (b - a) * k;
  const m = buildWetGradeMatrix(
    l(1, S3D_GRADE_SAT),
    S3D_GRADE_GAIN.map(g => l(1, g)),
    S3D_GRADE_LIFT.map(v => l(0, v)),
  );
  // 緑の行に「緑 −(赤+青)/2」を足す(入力の色に対して)。灰色(r=g=b)は変わらない=緑みのある色だけ緑が立つ。
  const gb = S3D_GREEN_BOOST * k;
  m[5] -= gb / 2;
  m[6] += gb;
  m[7] -= gb / 2;
  return m;
};

/** 空(遠景の箱)の色行列: 青空の青は少し上げる(1以上)。暖色は全体には掛けず、太陽のにじみ(左上だけ)に任せる。5×4 を1列に。 */
export const S3D_SKY_MATRIX: readonly number[] = [
  1.0, 0.01, 0, 0, 0,
  0, 1.0, 0, 0, 0,
  0, 0, 1.05, 0, 0.01,
  0, 0, 0, 1, 0,
];
/** 効き具合 mix の時の空の色行列(mix=0 で単位行列)。 */
export const buildStage3SkyMatrix = (mix: number): number[] => {
  const k = easeInOutSine(mix);
  return ID.map((v, i) => v + (S3D_SKY_MATRIX[i] - v) * k);
};

// ---- 5. 遠くのかすみ(霧の色だけ・左右の勾配) ----
/** 霧のシート自体は1枚=1色なので、反対側(右)の弱い寒色寄りの色をシートに置き、太陽の側(左)の暖かさは地平の帯の光で足す。 */
export const S3D_FOG_TINT = 0xdfe5ea;
export const S3D_FOG_TINT_MIX = 0.15;
/** 効き具合 mix の時の霧の色(元の色 base から寄せる)。mix=0 なら base のまま。霧の濃さ(α)は変えない。 */
export const stage3FogTint = (base: number, mix: number): number =>
  mix <= 0 ? base : lerpRgb(base, S3D_FOG_TINT, S3D_FOG_TINT_MIX * easeInOutSine(mix));
/** 地平の帯の暖かいかすみ(彩度を落とした蜂蜜色・加算)。左=太陽の側の濃さ、右=反対側の濃さ。 */
export const S3D_HAZE_TINT = 0xf2dcb8;
export const S3D_HAZE_LEFT = 0.5;
export const S3D_HAZE_RIGHT = 0.15;
/** 帯の濃さに掛ける倍率(加算で白く飛ばさない上限)。 */
export const S3D_HAZE_ALPHA = 0.42;
/** 帯の高さ(画面の高さに対する割合・地平線を真ん中に)。 */
export const S3D_HAZE_H = 0.3;
/** 帯の横の位置 u(0=左端・1=右端)の濃さ。左から右へ滑らかに下がる。 */
export const hazeAcross = (u: number): number =>
  S3D_HAZE_RIGHT + (S3D_HAZE_LEFT - S3D_HAZE_RIGHT) * (1 - easeInOutSine(u));
/** 帯の縦の位置 v(0=上端・1=下端)の濃さ。地平線(真ん中)で最も濃く、上下へ滑らかに消える。 */
export const hazeAlong = (v: number): number => {
  const d = Math.abs(v - 0.5) * 2;
  return d >= 1 ? 0 : easeInOutSine(1 - d);
};

// ---- 4. 太陽(画面の上端の外・体力の玉より右) ----
/** 太陽の位置: x=短辺×S3D_SUN_X_S と 幅×S3D_SUN_X_W の小さい方、y=−短辺×S3D_SUN_Y_S(画面の上端の外)。 */
export const S3D_SUN_X_S = 0.38;
export const S3D_SUN_X_W = 0.4;
export const S3D_SUN_Y_S = 0.07;
export const sunPos = (w: number, h: number): { x: number; y: number } => {
  const s = Math.min(w, h);
  return { x: Math.min(s * S3D_SUN_X_S, w * S3D_SUN_X_W), y: -s * S3D_SUN_Y_S };
};
/** にじみ(大きく柔らかい暖色)と光の玉(芯)。寸法は画面の短辺に対する割合。芯の半径は太陽の高さより小さい=芯は画面に出ない。 */
export const S3D_GLARE_HALO_SIZE = 0.9;
export const S3D_GLARE_HALO_ALPHA = 0.6;
export const S3D_GLARE_HALO_TINT = 0xffbf6a;
export const S3D_GLARE_CORE_SIZE = 0.1;
export const S3D_GLARE_CORE_ALPHA = 0.8;
export const S3D_GLARE_CORE_TINT = 0xfff1cf;

// ---- 1. 太陽の光の筋 ----
/** 筋1本の決め(太陽から放射状に。角度は真下から右へ回した度・負=左下へ)。 */
export interface SunShaftSpec {
  ang: number;
  /** 地面側の幅(画面の対角線に対する割合)。 */
  w: number;
  /** 濃さ(いちばん強い筋=1)。 */
  a: number;
  /** 長さ(S3D_SHAFT_SPAN に対する割合)。短め=明るい所は遠景の廃墟の手前(暗い背景)に来て、明るい地面の上では消えていく。 */
  len: number;
  /** 太陽から筋の上端までの距離(画面の対角線に対する割合)。 */
  start: number;
  tex: 0 | 1;
  flip: boolean;
}
/**
 * 4本。主役は左下へ落ちる太い1本(画面の左の縁=暗い所を照らす)と、それに寄り添う中くらいの1本。細い1本と淡い1本は脇役。
 * 間隔はわざと不揃い。画面の真ん中(主人公)へ向かう向きは空けておく。
 */
export const S3D_SHAFT_SPECS: readonly SunShaftSpec[] = [
  { ang: -27, w: 0.3, a: 1.0, len: 0.62, start: 0.02, tex: 0, flip: false },
  { ang: -12, w: 0.13, a: 0.7, len: 0.52, start: 0.03, tex: 1, flip: true },
  { ang: 21, w: 0.045, a: 0.45, len: 0.46, start: 0.04, tex: 1, flip: false },
  { ang: 63, w: 0.1, a: 0.32, len: 0.5, start: 0.03, tex: 0, flip: true },
];
export const S3D_SHAFT_SPAN = 0.95;
/** 筋の色(低い太陽の金)。 */
export const S3D_SHAFT_COLOR = 0xffc566;
/** 筋の芯の濃さ(加算の α・強い筋=1 の時)。 */
export const S3D_SHAFT_ALPHA = 0.55;

// 翳り: 筋は普段一定。数秒〜十数秒に1回(不規則)、1本だけが加減速つきで 70% まで翳って戻る(雲や梢が横切る)。
/** 翳りの区切りの長さ(ms)。区切りごとに起きるか・いつ・どの筋か・長さを決め打ちの乱数で決める=間隔は 1〜17 秒ほどで不揃い。 */
export const S3D_SHADE_SLOT_MS = 9000;
/** 区切りで翳りが起きない割合(起きない区切りが続くと十数秒空く)。 */
export const S3D_SHADE_SKIP = 0.3;
/** 翳る長さ(ms・翳って戻るまで)。 */
export const S3D_SHADE_MS_MIN = 600;
export const S3D_SHADE_MS_MAX = 1000;
/** 翳った時の濃さ(元に対する割合)。 */
export const S3D_SHADE_DEPTH = 0.7;
export interface ShaftShade { index: number; start: number; dur: number }
/** 区切り k の翳り(起きないなら null)。 */
export const shaftShadeAt = (k: number, count = S3D_SHAFT_SPECS.length): ShaftShade | null => {
  if (hash01(k, 1.7) < S3D_SHADE_SKIP) return null;
  const dur = S3D_SHADE_MS_MIN + hash01(k, 2.9) * (S3D_SHADE_MS_MAX - S3D_SHADE_MS_MIN);
  return {
    index: Math.min(count - 1, Math.floor(hash01(k, 4.3) * count)),
    start: k * S3D_SHADE_SLOT_MS + hash01(k, 6.1) * (S3D_SHADE_SLOT_MS - dur),
    dur,
  };
};
/** 筋 i の今の濃さの倍率(普段 1・翳っている間だけ 1→0.7→1 を加減速つきで)。 */
export const sunShaftShade = (i: number, now: number): number => {
  const e = shaftShadeAt(Math.floor(now / S3D_SHADE_SLOT_MS));
  if (!e || e.index !== i) return 1;
  const u = (now - e.start) / e.dur;
  if (u <= 0 || u >= 1) return 1;
  const t = easeInOutSine(u < 0.5 ? u * 2 : 2 - u * 2);
  return 1 - (1 - S3D_SHADE_DEPTH) * t;
};

/** 画面 w×h に筋を置く(月明りの筋と同じ形式=moonShaftLightAt がそのまま読める)。now で翳りが入る。 */
export const layoutSunShafts = (w: number, h: number, now = 0): MoonShaft[] => {
  const diag = Math.hypot(w, h);
  const { x: sx, y: sy } = sunPos(w, h);
  return S3D_SHAFT_SPECS.map((s, i) => {
    const r = (s.ang * Math.PI) / 180;
    const ux = Math.sin(r), uy = Math.cos(r);
    const st = s.start * diag, len = s.len * S3D_SHAFT_SPAN * diag;
    return {
      x: sx + ux * st, y: sy + uy * st, dx: ux * len, dy: uy * len,
      w: s.w * diag, a: s.a * sunShaftShade(i, now), tex: s.tex, flip: s.flip,
    };
  });
};

/** 光の当たりの山(画面の左上〜中段左に置く柔らかい加算の暖色)。位置は画面の幅・高さに対する割合、大きさは短辺に対する割合。 */
export const S3D_LIGHT_MASS = { x: 0.16, y: 0.34, size: 1.0, alpha: 0.16, tint: 0xffcf86 } as const;

// ---- 1b. 筋の中の塵(画面に漂い、筋の中にいる間だけ金色に光る) ----
export const S3D_DUST_COUNT = 34;
export const S3D_DUST_PX = 5;
export const S3D_DUST_ALPHA = 0.85;
export const S3D_DUST_TINT = 0xfff0c4;
export const S3D_DUST_LIT_GAIN = 2.6;
export const S3D_DUST_SPEED_MIN = 4;
export const S3D_DUST_SPEED_MAX = 11;

// ---- 3. 木漏れ日 ----
/** 縁の帯の絵(横に継ぎ目なく繰り返す・縦は縁から内へ薄れる。白地=乗算で無変化)。 */
export const S3D_BAND_TEX_W = 256;
export const S3D_BAND_TEX_H = 256;
/** 影の暗さ(乗算する明るさ。大=薄い)。縁の付け根の広い影と、斑の影。 */
export const S3D_SHADE_DARK_MIN = 0.75;
export const S3D_SHADE_DARK_MAX = 0.85;
/** 影の色(乗算する暗さに掛ける=青い日陰)。 */
export const S3D_DAPPLE_SHADE = { r: 0.84, g: 0.92, b: 1.0 } as const;
/** 乗算の濃さ(α)。帯2枚の手前側・奥側。 */
export const S3D_BAND_ALPHA = 0.48;
export const S3D_BAND_ALPHA_2 = 0.32;
/** 帯の高さ(画面の高さに対する割合)。手前(画面の下の縁=手前の茂み)と奥(地平の際=建物の側)。 */
export const S3D_BAND_NEAR_H = 0.3;
export const S3D_BAND_FAR_H = 0.2;
/** 2枚目のタイルの大きさ(1枚目に対する倍率)と横のずれ(絵の幅に対する割合)=繰り返しを崩す。 */
export const S3D_BAND_SCALE_2 = 1.47;
export const S3D_BAND_SHIFT_2 = 0.37;
/** 斑の細長さの範囲・向き(光の差し込む向きを中心に±)・小さく硬い斑と大きく柔らかい斑の割合。 */
export const S3D_BLOB_STRETCH_MIN = 1.0;
export const S3D_BLOB_STRETCH_MAX = 2.2;
export const S3D_BLOB_ANGLE = Math.atan2(1, 1.25);
export const S3D_BLOB_ANGLE_JITTER = (25 * Math.PI) / 180;
export const S3D_BLOB_HARD_FRAC = 0.45;
export interface DappleBlob {
  x: number; y: number;
  /** 長い方/短い方の半径(px)。 */
  rx: number; ry: number;
  rot: number;
  /** 柔らかさ(0=硬い縁・1=芯から縁までずっと薄れる)。 */
  soft: number;
  /** 影の暗さ(乗算する明るさ)/光の粒は明るさ(1=白)。 */
  dark: number;
}
/** 決め打ちの乱数(同じ seed なら毎回同じ景色)。 */
export const dappleRng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 0x100000000;
};
const blob = (rnd: () => number, x: number, y: number, rMin: number, rMax: number, hard: boolean, dark: number): DappleBlob => {
  const r = rMin + rnd() * (rMax - rMin);
  const st = S3D_BLOB_STRETCH_MIN + rnd() * (S3D_BLOB_STRETCH_MAX - S3D_BLOB_STRETCH_MIN);
  return {
    x, y, rx: r * Math.sqrt(st), ry: r / Math.sqrt(st),
    rot: S3D_BLOB_ANGLE + (rnd() * 2 - 1) * S3D_BLOB_ANGLE_JITTER,
    soft: hard ? 0.15 + rnd() * 0.2 : 0.65 + rnd() * 0.35, dark,
  };
};
/**
 * 縁の帯の絵の中身(w×h px)。縁(v=0 の側)に寄せて「広い薄い影」を置き、その影の中に「明るい丸い光の粒」を抜く。
 * 縁からの距離の重み(縁ほど多い)で縦の位置を引く。
 */
export const bandBlobs = (w: number, h: number, seed: number): { shade: DappleBlob[]; spots: DappleBlob[] } => {
  const rnd = dappleRng(seed);
  const edgeY = () => h * Math.pow(rnd(), 1.8) * 0.85; // 縁ほど多い
  const shade: DappleBlob[] = [];
  for (let i = 0; i < 26; i++) {
    const hard = rnd() < S3D_BLOB_HARD_FRAC;
    const dark = S3D_SHADE_DARK_MIN + rnd() * (S3D_SHADE_DARK_MAX - S3D_SHADE_DARK_MIN);
    shade.push(blob(rnd, rnd() * w, edgeY(), hard ? w * 0.05 : w * 0.11, hard ? w * 0.1 : w * 0.22, hard, dark));
  }
  const spots: DappleBlob[] = [];
  for (let i = 0; i < 30; i++) {
    const hard = rnd() < S3D_BLOB_HARD_FRAC;
    spots.push(blob(rnd, rnd() * w, edgeY(), hard ? w * 0.012 : w * 0.025, hard ? w * 0.03 : w * 0.05, hard, 1));
  }
  return { shade, spots };
};
/** 木の影(梢の影)の絵の中身(size 四方)。楕円の広い薄い影の中に光の粒。 */
export const canopyBlobs = (size: number, seed: number): { shade: DappleBlob[]; spots: DappleBlob[] } => {
  const rnd = dappleRng(seed);
  const c = size / 2;
  const shade: DappleBlob[] = [];
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * size * 0.2;
    const hard = rnd() < 0.3;
    const dark = S3D_SHADE_DARK_MIN + rnd() * (S3D_SHADE_DARK_MAX - S3D_SHADE_DARK_MIN);
    shade.push(blob(rnd, c + Math.cos(a) * d, c + Math.sin(a) * d, size * (hard ? 0.1 : 0.17), size * (hard ? 0.16 : 0.27), hard, dark));
  }
  const spots: DappleBlob[] = [];
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * size * 0.3;
    const hard = rnd() < S3D_BLOB_HARD_FRAC;
    spots.push(blob(rnd, c + Math.cos(a) * d, c + Math.sin(a) * d, size * (hard ? 0.015 : 0.03), size * (hard ? 0.035 : 0.06), hard, 1));
  }
  return { shade, spots };
};
/** 梢の影の置き方(木の絵の幅 w・高さ h に対する割合)。太陽が左上=影は足元から右手前へ落ちる。 */
export const S3D_CANOPY = { dx: 0.3, dy: 0.04, w: 1.7, h: 0.75, rot: 0.14, alpha: 0.45 } as const;
/** 同時に描く梢の影の上限。 */
export const S3D_CANOPY_MAX = 24;

// 揺れ: 普段は動かない(流れない)。不規則な突風の時だけ、2〜10px を加減速つきで行き来する。
/** 突風の区切りの長さ(ms)。区切りごとの目標の強さへ加減速つきで移る。 */
export const S3D_GUST_SLOT_MS = 3800;
/** 区切りが無風になる割合。 */
export const S3D_GUST_CALM = 0.55;
/** 揺れ幅(px)の下限・上限(突風の強さ 0..1 を写す。無風=0)。 */
export const S3D_GUST_PX_MIN = 2;
export const S3D_GUST_PX_MAX = 10;
/** 区切り k の突風の強さ(0=無風・それ以外は 0.15..1)。 */
export const gustTarget = (k: number): number => (hash01(k, 9.1) < S3D_GUST_CALM ? 0 : 0.15 + 0.85 * hash01(k, 3.3));
/** 今の突風の強さ(0..1)。区切りの境で加減速つきで移る(1フレームで跳ばない)。 */
export const gustLevel = (now: number): number => {
  const t = now / S3D_GUST_SLOT_MS;
  const k = Math.floor(t);
  const a = gustTarget(k), b = gustTarget(k + 1);
  return a + (b - a) * easeInOutSine(t - k);
};
/** 揺れのずれ(px)。無風の時は 0。突風の時は揺れ幅 2〜10px を周期の違う2つの sin で行き来する。 */
export const dappleSway = (now: number, seed = 0): { x: number; y: number } => {
  const g = gustLevel(now);
  if (g <= 0) return { x: 0, y: 0 };
  const amp = S3D_GUST_PX_MIN * Math.min(1, g / 0.15) + (S3D_GUST_PX_MAX - S3D_GUST_PX_MIN) * Math.max(0, (g - 0.15) / 0.85);
  return {
    x: amp * Math.sin(now * 0.0031 + seed * 5.1) * (0.7 + 0.3 * Math.sin(now * 0.0013 + seed)),
    y: amp * 0.45 * Math.sin(now * 0.0023 + seed * 2.3 + 1.1),
  };
};
