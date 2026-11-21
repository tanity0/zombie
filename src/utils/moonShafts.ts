// ステージ1の森の夜(晴れ・雨上がり)の月明りの筋と、筋の中だけで光る塵。描画に依らない決めごと。
// 社長指示2026-11-21「月光の線がなんか安っぽいなー」→ 承認された作り直し:
// - 縁が柔らかい(芯から両脇へ滑らかに消える・角の立った台形にしない)
// - 不揃い(本数を減らし、幅・間隔・濃さを1本ずつ変える=等間隔の縞にしない)
// - 長さ方向に細る(空の側は細く淡く、地面へ向けて広がり、地面の手前で消える)
// - 筋の中にだけ、ごく細かい塵がゆっくり漂って光る
// RENDERER-AGNOSTIC: PixiJS を import しない。

import { easeInOutSine, RAIN_INTENSITY_LOW_MAX, RAIN_INTENSITY_HIGH_MIN, type ShaftPoly } from './weatherWet';

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** 筋1本の決め(並びの1周期の中での置き方)。 */
export interface MoonShaftSpec {
  /** 上端の芯の横位置(1周期の幅に対する割合)。 */
  off: number;
  /** 地面側の幅(画面の幅に対する割合)。 */
  w: number;
  /** 濃さ(いちばん強い筋=1)。 */
  a: number;
  /** 傾き(下へ1進む間に右へ進む量)。筋ごとに少しずつ違う=平行な縞に見せない。 */
  tilt: number;
  /** 長さ(MOON_SHAFT_SPAN に対する割合)。 */
  len: number;
  /** どの焼いた絵を使うか(中の細い筋の模様が違う2枚)。 */
  tex: 0 | 1;
  /** 絵を左右反転して使うか(模様の見分けをさらに減らす)。 */
  flip: boolean;
}

/** 並びの1周期の幅(画面の幅の倍数)。画面より長くして、同じ並びの繰り返しが1画面に入らないようにする。 */
export const MOON_SHAFT_PERIOD = 2.1;
/**
 * 1周期の中の筋。太く淡い筋・細く明るい筋・寄り添う細い筋・間の空いた所、を混ぜる(等間隔にしない)。
 * 並びは決め打ち(毎回同じ景色)。
 */
export const MOON_SHAFT_SPECS: readonly MoonShaftSpec[] = [
  { off: 0.03, w: 0.5, a: 0.6, tilt: 0.40, len: 1.0, tex: 0, flip: false },
  { off: 0.18, w: 0.22, a: 1.0, tilt: 0.45, len: 0.93, tex: 1, flip: false },
  { off: 0.27, w: 0.11, a: 0.7, tilt: 0.43, len: 0.8, tex: 0, flip: true },
  { off: 0.56, w: 0.36, a: 0.85, tilt: 0.38, len: 0.97, tex: 1, flip: true },
  { off: 0.83, w: 0.16, a: 0.5, tilt: 0.47, len: 0.86, tex: 0, flip: false },
];
/** 筋の上端の高さ(画面の高さに対する割合・負=画面の上の外から差し込む)。 */
export const MOON_SHAFT_TOP = -0.08;
/** 筋の縦の長さ(画面の高さに対する割合・len=1 の時)。 */
export const MOON_SHAFT_SPAN = 0.98;
/** 空の側の端の幅(地面側の幅に対する割合)。 */
export const MOON_SHAFT_TAPER = 0.34;
/** 長さ方向で最も明るい所(0=空の側の端・1=地面側の端)。 */
export const MOON_SHAFT_PEAK_AT = 0.4;
/** 筋の芯の濃さに掛ける倍率(塗り=柔らかい分布の最も濃い所)。 */
export const MOON_SHAFT_GAIN = 1.15;

/** 画面に置いた筋1本(筋の絵の座標)。(x, y)=空の側の端の芯、(dx, dy)=そこから地面側の端の芯まで。 */
export interface MoonShaft {
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** 地面側の端の幅(px)。 */
  w: number;
  a: number;
  tex: 0 | 1;
  flip: boolean;
}

/** 長さ方向 v(0..1)の位置の幅(地面側の幅に対する割合)。空の側ほど細い。 */
export const moonShaftWidthFrac = (v: number): number =>
  MOON_SHAFT_TAPER + (1 - MOON_SHAFT_TAPER) * Math.pow(clamp01(v), 0.85);

/** 長さ方向 v(0..1)の明るさ。空の側の端は 0 から淡く立ち上がり、中ほどで最も明るく、地面側の端で 0 へ消える。 */
export const moonShaftAlong = (v: number): number => {
  if (v <= 0 || v >= 1) return 0;
  if (v < MOON_SHAFT_PEAK_AT) return Math.pow(easeInOutSine(v / MOON_SHAFT_PEAK_AT), 1.4);
  return 1 - easeInOutSine((v - MOON_SHAFT_PEAK_AT) / (1 - MOON_SHAFT_PEAK_AT));
};

/** 横方向 u(-1..1・その高さの幅の端が ±1)の明るさ。芯が最も明るく、縁へ向けて滑らかに 0 へ(角を作らない)。 */
export const moonShaftAcross = (u: number): number => {
  const a = Math.abs(u);
  if (a >= 1) return 0;
  return Math.pow(0.5 + 0.5 * Math.cos(Math.PI * a), 1.5);
};

/** 筋の中のゆるい濃淡の模様(0.76..1)。u は横の位置(-1..1)。幅の細る絵の中で使うので、空の側へ向けて寄り集まる=光が射し込む向きに見える。 */
export const moonShaftStreak = (u: number, seed: number): number => {
  const s = Math.sin(u * 4.3 + seed * 3.7) * 0.6 + Math.sin(u * 9.7 + seed * 9.1) * 0.4;
  return 0.88 + 0.12 * s;
};

/** 焼いた絵の1画素の濃さ(0..1)。px, py は画素の位置・texW×texH は絵の寸法。縦=筋の長さ方向(上が空の側)。 */
export const moonShaftTexel = (px: number, py: number, texW: number, texH: number, seed: number): number => {
  const v = (py + 0.5) / texH;
  const xn = ((px + 0.5) / texW) * 2 - 1;
  const u = xn / moonShaftWidthFrac(v);
  if (Math.abs(u) >= 1) return 0;
  return moonShaftAcross(u) * moonShaftAlong(v) * moonShaftStreak(u, seed);
};

/** 画面 w×h に筋を並べる。横に流しても隙間が出ないよう、画面の左右に1周期ずつ余分に置く。 */
export const layoutMoonShafts = (w: number, h: number): { period: number; shafts: MoonShaft[] } => {
  const period = Math.max(240, w * MOON_SHAFT_PERIOD);
  const shafts: MoonShaft[] = [];
  const y = h * MOON_SHAFT_TOP;
  for (let base = -period; base <= w + period; base += period) {
    for (const s of MOON_SHAFT_SPECS) {
      const dy = h * MOON_SHAFT_SPAN * s.len;
      shafts.push({ x: base + s.off * period, y, dx: dy * s.tilt, dy, w: w * s.w, a: s.a, tex: s.tex, flip: s.flip });
    }
  }
  return { period, shafts };
};

/** 点 (x, y)(筋の絵の座標)に落ちている筋の明るさ(0..1・塗りと同じ柔らかい分布・強い筋=1)。 */
export const moonShaftLightAt = (x: number, y: number, shafts: readonly MoonShaft[]): number => {
  let best = 0;
  for (const s of shafts) {
    const l2 = s.dx * s.dx + s.dy * s.dy;
    if (l2 <= 0) continue;
    const rx = x - s.x, ry = y - s.y;
    const v = (rx * s.dx + ry * s.dy) / l2;
    if (v <= 0 || v >= 1) continue;
    const half = (s.w * moonShaftWidthFrac(v)) / 2;
    if (half <= 0) continue;
    const u = (rx * s.dy - ry * s.dx) / Math.sqrt(l2) / half;
    const lit = moonShaftAcross(u) * moonShaftAlong(v) * s.a;
    if (lit > best) best = lit;
  }
  return best;
};

/** 地面の溜まり・水たまりの縁が読む筋の形(従来の形式)。幅は地面側の明るい所の幅・芯の線は筋と同じ。 */
export const MOON_SHAFT_POLY_WIDTH_AT = 0.7;
/** 溜まりの形は筋の芯の線をこの倍まで先へ延ばす(筋が地面の手前で消えても、溜まりは途中で切れずに画面の下まで続く)。 */
export const MOON_SHAFT_POLY_EXTEND = 1.6;
export const moonShaftPolys = (shafts: readonly MoonShaft[]): ShaftPoly[] =>
  shafts.map(s => {
    const pw = s.w * moonShaftWidthFrac(MOON_SHAFT_POLY_WIDTH_AT);
    const ex = MOON_SHAFT_POLY_EXTEND;
    return { x1: s.x - pw / 2, y1: s.y, x2: s.x + s.dx * ex + 0.18 * pw, y2: s.y + s.dy * ex, w: pw, a: s.a };
  });

// ---- 地面の月明りの溜まり(筋の芯の線に沿った柔らかい帯・絵1枚を回して置く=縁に段を作らない) ----
/** 溜まりの帯の幅(溜まりの形の幅に対する倍率。縁へ向けて 0 へ消える分、少し広く置く)。 */
export const MOON_POOL_STRIP_WIDTH = 1.5;
/** 溜まりの帯1本(溜まりの絵の座標)。(x, y)=地面の上端の側の芯、(dx, dy)=そこから下の端の芯まで。 */
export interface MoonPoolStrip { x: number; y: number; dx: number; dy: number; w: number; a: number }
/** 筋1本の、地面の上端 topY から下端 bottomY までの溜まりの帯。地面に掛からなければ null。 */
export const moonPoolStrip = (s: MoonShaft, topY: number, bottomY: number): MoonPoolStrip | null => {
  if (s.dy <= 0 || bottomY <= topY) return null;
  const yEnd = Math.min(bottomY, s.y + s.dy * MOON_SHAFT_POLY_EXTEND);
  const y0 = Math.max(topY, s.y);
  if (yEnd <= y0) return null;
  const k = s.dx / s.dy;
  return {
    x: s.x + (y0 - s.y) * k, y: y0, dx: (yEnd - y0) * k, dy: yEnd - y0,
    w: s.w * moonShaftWidthFrac(MOON_SHAFT_POLY_WIDTH_AT) * MOON_POOL_STRIP_WIDTH, a: Math.min(1, s.a),
  };
};
/** 溜まりの絵の1画素の濃さ(0..1)。横は芯から縁へ滑らかに消え、縦は上端から fade の割合をかけて 0→1 に立ち上がる(地平の際で切れない)。 */
export const moonPoolTexel = (px: number, py: number, texW: number, texH: number, fade: number): number => {
  const v = (py + 0.5) / texH;
  const u = ((px + 0.5) / texW) * 2 - 1;
  const rise = fade > 0 && v < fade ? easeInOutSine(v / fade) : 1;
  return moonShaftAcross(u) * rise;
};

// ---- 筋の中の塵(ごく細かい粒がゆっくり漂い、筋の中にいる間だけ光る) ----
/** 粒の数(画面と周りの余白に散らす。光るのは筋の中にいる粒だけ)。 */
export const MOON_DUST_COUNT = 44;
/** 粒の芯の大きさ(画面 px・遠近を掛ける前)。 */
export const MOON_DUST_PX = 6.5;
/** 最も明るい時の濃さ。 */
export const MOON_DUST_ALPHA = 0.95;
/** 粒の色(月明りの青白)。 */
export const MOON_DUST_TINT = 0xe6f6ff;
/** 筋の明るさ(芯=1)を粒の明るさへ移す倍率(筋の縁の方でも見えるように持ち上げてから 1 で頭打ち)。 */
export const MOON_DUST_LIT_GAIN = 2.4;
/** 漂う速さ(world px/s)。 */
export const MOON_DUST_SPEED_MIN = 2.5;
export const MOON_DUST_SPEED_MAX = 7;
/** 速さを目標へ寄せる速さ(1/s・慣性)。 */
export const MOON_DUST_STEER = 0.5;
/** 地面からの浮き(world px・遠近を掛ける前)。 */
export const MOON_DUST_LIFT_MIN = 10;
export const MOON_DUST_LIFT_MAX = 150;
/** 地面の上端(奥)から、地面の高さのこの割合をかけて塵を 0→1 に出す(奥は被写界深度で大きくぼけ、粒が四角い靄に見えるため)。 */
export const MOON_DUST_FAR_FADE = 0.22;
/** 画面の y(筋の絵の座標)の時の、奥の塵の出方(0..1)。topY=地面の上端・bottomY=画面の下端。 */
export const moonDustFarFade = (y: number, topY: number, bottomY: number): number =>
  easeInOutSine((y - topY) / Math.max(1, (bottomY - topY) * MOON_DUST_FAR_FADE));
/** 1粒ずつの出る/消える(数の割合が変わった時・置き直した時)を寄せる速さ(1/s)。 */
export const MOON_DUST_ON_EASE = 0.7;
/** 雨上がりの止みかけの時の数の割合(本降りではさらに減らす)。 */
export const MOON_DUST_WET_FRAC = 0.55;
/** 本降りの時に残す割合(止みかけの数に対して)。 */
export const MOON_DUST_HEAVY_KEEP = 0.25;

/** 出す塵の割合(0..1)。晴れの夜は1・雨上がりは減らし、本降りではさらに減らす(0 にはしない=雨の合間にも月明りの塵は少し見える)。 */
export const moonDustActiveFrac = (wet: boolean, rain: number): number => {
  if (!wet) return 1;
  const t = clamp01((rain - RAIN_INTENSITY_LOW_MAX) / Math.max(1e-6, RAIN_INTENSITY_HIGH_MIN - RAIN_INTENSITY_LOW_MAX));
  return MOON_DUST_WET_FRAC * (1 - (1 - MOON_DUST_HEAVY_KEEP) * easeInOutSine(t));
};

/** 漂う向き(ラジアン)。ごくゆっくり回り、ときどき揺れる(機械的な円を描かない)。 */
export const moonDustHeading = (now: number, seed: number): number =>
  seed * 6.283 + now * 0.00009 * (seed > 0.5 ? 1 : -1) + 1.1 * Math.sin(now * (0.00019 + seed * 0.00017) + seed * 13);

/** きらめき(0.55..1)。周期の違う正弦の積=決まった拍で瞬かない。 */
export const moonDustTwinkle = (now: number, seed: number): number => {
  const k = Math.sin(now * (0.0011 + seed * 0.0009) + seed * 17) * Math.sin(now * (0.00043 + seed * 0.0003) + seed * 5);
  return 0.775 + 0.225 * k;
};
