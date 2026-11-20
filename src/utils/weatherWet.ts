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
