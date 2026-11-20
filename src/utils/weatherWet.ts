// ステージの天候「雨上がり」(research/WEATHER_WET.md)の、描画に依らない決めごと。
// - いつ効くか(`?weather=wet` かつステージ1の屋外)
// - 波紋・雫・光の線の動き(すべて加速/減速つき=慣性 MUST)
// RENDERER-AGNOSTIC: PixiJS を import しない。

/** URL の `?weather=` を読む。今は 'wet'(雨上がり)だけ。それ以外・未指定は null(=何も変えない)。 */
export const parseWeather = (search: string): 'wet' | null => {
  const v = new URLSearchParams(search).get('weather');
  return v === 'wet' ? 'wet' : null;
};

/** 雨上がりを出すステージ(今はステージ1だけ・設計書 §0)。 */
export const WEATHER_WET_STAGES: ReadonlySet<string> = new Set(['stage-1']);

export interface WeatherWetCtx {
  weather: 'wet' | null;
  stageId: string;
  indoor: boolean;
  corridor: boolean;
}

/** 雨上がりがこのフレームで効くか。屋内・廊下(洋館)・対象外ステージは常に false。 */
export const weatherWetActive = (c: WeatherWetCtx): boolean =>
  c.weather === 'wet' && WEATHER_WET_STAGES.has(c.stageId) && !c.indoor && !c.corridor;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** 立ち上がりが速く、終わりで止まる(慣性の減速側)。 */
export const easeOutCubic = (t: number): number => { const u = 1 - clamp01(t); return 1 - u * u * u; };
/** 止まった所から動き出す(慣性の加速側)。 */
export const easeInQuad = (t: number): number => { const u = clamp01(t); return u * u; };
/** 加速して減速する(光の線が面を渡る動き)。 */
export const easeInOutSine = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));

/** 波紋1つの尺(ms)。叩き台。 */
export const RIPPLE_MS = 900;
/** 波紋の広がりの最初と最後の大きさ(絵の倍率に掛ける)。 */
export const RIPPLE_SCALE_FROM = 0.55;
export const RIPPLE_SCALE_TO = 1.35;
/** 波紋の帯のコマ数(素材の ripple-*-0..2)。 */
export const RIPPLE_FRAMES = 3;

export interface RipplePose {
  /** 0..RIPPLE_FRAMES-1。 */
  frame: number;
  scale: number;
  alpha: number;
}

/**
 * 経過 t(ms)の波紋の姿。広がりは減速(easeOutCubic)・消え方は終盤で加速して抜ける。
 * 尺を過ぎたら null(=プールへ返す)。
 */
export const ripplePose = (t: number): RipplePose | null => {
  if (t < 0 || t >= RIPPLE_MS) return null;
  const k = t / RIPPLE_MS;
  const spread = easeOutCubic(k);
  const frame = Math.min(RIPPLE_FRAMES - 1, Math.floor(spread * RIPPLE_FRAMES));
  // 出だしは 0.12 で薄く立ち上がる(パッと出ない)→ 0.25 で最大 → 終盤は二乗で抜ける。
  const fadeIn = clamp01(k / 0.12);
  const fadeOut = 1 - easeInQuad((k - 0.25) / 0.75);
  return { frame, scale: RIPPLE_SCALE_FROM + (RIPPLE_SCALE_TO - RIPPLE_SCALE_FROM) * spread, alpha: easeOutCubic(fadeIn) * fadeOut };
};

/** 雫の落下の尺(ms)と高さ(world px)。叩き台。 */
export const DRIP_FALL_MS = 420;
export const DRIP_FALL_H = 70;

/** 雫の落下: 経過 t(ms)の地面からの高さ。重力で加速(easeInQuad)。落ち切ったら null(=そこで波紋)。 */
export const dripHeight = (t: number): number | null => {
  if (t < 0 || t >= DRIP_FALL_MS) return null;
  return DRIP_FALL_H * (1 - easeInQuad(t / DRIP_FALL_MS));
};

/** 水面を渡る光の線の尺(ms)。ときどき・ゆっくり。 */
export const GLINT_MS = 2600;

/**
 * 光の線の進み(-1..1=水面の左端の外→右端の外)と明るさ。加速して減速して渡り、
 * 明るさは中央で最大(端で 0=パッと出ない)。尺の外は null。
 */
export const glintPose = (t: number): { pos: number; alpha: number } | null => {
  if (t < 0 || t >= GLINT_MS) return null;
  const k = t / GLINT_MS;
  return { pos: -1 + 2 * easeInOutSine(k), alpha: Math.sin(Math.PI * k) ** 2 };
};

// ---- ポツポツ雨(小雨・設計書「追加: ポツポツ雨」) ----
/** 雨粒の密度(1秒・world 100万px² あたりの粒数)。標準ズームの可視域(約 0.9〜1.2M px²)で画面に数本が見える程度=小雨。叩き台。 */
export const RAIN_DROPS_PER_MPX_S = 13;
/** 雨粒(落ちている線)の同時上限。最大引き(0.4)で可視域が広がっても、ここで止まる。 */
export const RAIN_MAX = 40;
/** 1フレームで生む粒の上限(重いフレーム・タブ復帰で一度に降ってこない)。 */
export const RAIN_SPAWN_PER_FRAME = 3;
/** 落下の尺(ms)の幅。 */
export const RAIN_FALL_MS_MIN = 380;
export const RAIN_FALL_MS_MAX = 560;
/** 落ち始めの速さの割合(0=止まった所から・1=等速)。雨粒は画面の外から既に落ちて来ているので0にはしない=少しだけ加速。 */
export const RAIN_V0 = 0.55;
/** 斜め(横へ流れる量/落ちる量)。 */
export const RAIN_SLANT = 0.2;

export interface RainDropSpec {
  /** 落下の尺(ms)。 */
  fallMs: number;
  /** 着地点から見た落ち始めの高さ(world px・遠近を掛ける前)。 */
  height: number;
  /** 線の長さ(world px・遠近を掛ける前)の基準。 */
  len: number;
  /** 濃さの基準(0..1)。 */
  alpha: number;
  /** 斜めの量(粒ごとに少し揺らす)。 */
  slant: number;
}

/** 粒ごとの個性(尺・長さ・濃さ・斜め)。rnd は 0..1 の乱数(テストで固定できるように渡す)。 */
export const rainDropSpec = (rnd: () => number): RainDropSpec => {
  const fallMs = RAIN_FALL_MS_MIN + (RAIN_FALL_MS_MAX - RAIN_FALL_MS_MIN) * rnd();
  // 長い粒ほど少ない(二乗で短い側へ寄せる=全部同じ長さに見えない)。
  const lr = rnd();
  const len = 13 + 20 * lr * lr;
  // 濃い粒は少し(手前の粒がたまに光る)。
  const ar = rnd();
  const alpha = 0.34 + 0.42 * ar * ar * ar;
  return { fallMs, height: 260 + 140 * rnd(), len, alpha, slant: RAIN_SLANT * (0.8 + 0.4 * rnd()) };
};

/** 次の粒までの間隔(ms)。可視域の広さ(world px²)に比例して増やし、間隔は指数分布でばらつかせる(機械的な等間隔にしない)。 */
export const rainNextGapMs = (viewArea: number, rnd: () => number): number => {
  const perMs = (RAIN_DROPS_PER_MPX_S * Math.max(0, viewArea) / 1e6) / 1000;
  if (perMs <= 0) return Infinity;
  const u = Math.min(0.999, Math.max(1e-4, rnd()));
  return -Math.log(1 - u) / perMs;
};

export interface RainPose {
  /** 着地点からの高さ(world px・遠近前)。 */
  h: number;
  /** 線の長さ(world px・遠近前)。速くなるほど伸びる。 */
  len: number;
  /** 濃さ(0..1・spec.alpha に掛ける前の係数)。 */
  alpha: number;
}

/**
 * 経過 t(ms)の雨粒の姿。少し加速して落ちる(初速 RAIN_V0・あとは重力で増える)、
 * 出だしは薄く立ち上がる(パッと出ない)。着いたら null(=そこで波紋/跳ね)。
 */
export const rainPose = (t: number, s: RainDropSpec): RainPose | null => {
  if (t < 0 || t >= s.fallMs) return null;
  const k = t / s.fallMs;
  const fallen = RAIN_V0 * k + (1 - RAIN_V0) * k * k; // 0..1・速さは RAIN_V0 から 2-RAIN_V0 へ増える
  const speed = RAIN_V0 + 2 * (1 - RAIN_V0) * k;       // 平均を1とした今の速さ
  return { h: s.height * (1 - fallen), len: s.len * (0.75 + 0.25 * speed), alpha: easeOutCubic(k / 0.2) };
};
