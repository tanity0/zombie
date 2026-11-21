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
/** 雨粒(落ちている線)の同時上限。最大引き(0.4)で可視域が広がっても、ここで止まる。
 *  本降り(強さ RAIN_INTENSITY_MAX)が引きの画でも薄まらないよう 40→70(社長指示2026-11-21「雨量の上下もっとハッキリ」)。 */
export const RAIN_MAX = 70;
/** 今の強さで次の粒までが長すぎる時(止みかけ・強さ0)は、この間隔で強さを見直す
 *  (指数分布は記憶が無いので、見直して引き直しても降り方の統計は変わらない=止みかけから本降りへ移る時に待たされない)。 */
export const RAIN_RECHECK_MS = 400;
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

// ---- 雨の強弱(30秒〜1分おきに、ランダムな間隔で次の強さを決め、数秒かけて寄せる) ----
/** 次の強さを決めるまでの間隔(ms)の幅。毎回この中でランダム=決まった周期にしない。 */
export const RAIN_INTENSITY_HOLD_MS_MIN = 30000;
export const RAIN_INTENSITY_HOLD_MS_MAX = 60000;
/** 強さの幅。1 = これまでの小雨(RAIN_DROPS_PER_MPX_S そのまま)。
 *  社長指示2026-11-21「雨量の上下もっとハッキリさせたい」: 目標はほとんど「ほぼ止む(LOW)」か「はっきり強い(HIGH)」の
 *  どちらか=二つの山。間(MID)はたまにだけ。 */
export const RAIN_INTENSITY_MIN = 0.03;
export const RAIN_INTENSITY_LOW_MAX = 0.2;
export const RAIN_INTENSITY_HIGH_MIN = 3.0; // 社長指示2026-11-21「もっと土砂降りに」→はい(1.6〜2.2 の約1.5〜2倍)
export const RAIN_INTENSITY_MAX = 4.0;
/** 目標が本降り(HIGH)になる確率・間(MID=LOW_MAX..HIGH_MIN の中ほど)になる確率。残りは止みかけ(LOW)。 */
export const RAIN_INTENSITY_HIGH_P = 0.45;
export const RAIN_INTENSITY_MID_P = 0.1;
/** 次の強さへ寄せる尺(ms)。加速して減速する(慣性)。HOLD_MS_MIN より短い=区間の終わりには必ず目標に着いている。
 *  上下の差が大きくなったぶん、移り変わりも少し速く(9秒→6秒)=「変わった」と分かる。 */
export const RAIN_INTENSITY_RAMP_MS = 11000; // 幅が4まで広がったので、1フレームで跳ばない(テストで固定)長さへ
/** 葉先の雫が雨の強さに遅れて付いてくる時定数(ms)=雨が弱まっても、しばらく雫は落ち続ける。 */
export const DRIP_LAG_TAU_MS = 9000;
/** 雫の平均間隔(ms・強さ1の時)と同時上限。雨粒より少ない「ときどきの粒」。 */
export const DRIP_EVERY_MS = 1000;
export const DRIP_MAX = 4;

/** 0..1 の決定的な値(seed と区間番号 k と小さな番号 j から)。 */
const hash01 = (seed: number, k: number, j: number): number => {
  const x = Math.sin(seed * 12.9898 + k * 78.233 + j * 37.719) * 43758.5453;
  return x - Math.floor(x);
};

export interface RainSegment {
  /** この区間の長さ(ms・HOLD_MS_MIN..MAX)。 */
  len: number;
  /** この区間で寄せていく強さ。 */
  target: number;
}

/** k 番目の区間(seed で決まる=同じ seed なら同じ天気の移り変わり)。 */
export const rainSegment = (seed: number, k: number): RainSegment => {
  const len = RAIN_INTENSITY_HOLD_MS_MIN + (RAIN_INTENSITY_HOLD_MS_MAX - RAIN_INTENSITY_HOLD_MS_MIN) * hash01(seed, k, 1);
  const b = hash01(seed, k, 2);
  const r = hash01(seed, k, 3);
  let target: number;
  if (b < RAIN_INTENSITY_HIGH_P) target = RAIN_INTENSITY_HIGH_MIN + (RAIN_INTENSITY_MAX - RAIN_INTENSITY_HIGH_MIN) * r; // 本降り
  else if (b < RAIN_INTENSITY_HIGH_P + RAIN_INTENSITY_MID_P) target = 0.5 + 0.7 * r; // たまに間(0.5..1.2)
  else target = RAIN_INTENSITY_MIN + (RAIN_INTENSITY_LOW_MAX - RAIN_INTENSITY_MIN) * r; // ほぼ止む
  return { len, target };
};

/** 区間の始まりから t ms 経った時の強さ。前の区間の目標から、RAMP_MS かけて加速→減速で寄せる。 */
export const rainIntensityInSegment = (prevTarget: number, target: number, t: number): number =>
  prevTarget + (target - prevTarget) * easeInOutSine(t / RAIN_INTENSITY_RAMP_MS);

/**
 * 雨の強さの時刻表。start から k 番目の区間に居る。advance で今の時刻まで区間を進め、強さを返す。
 * 区間0の「前の目標」は1(=これまでの小雨から始まる)。
 */
export interface RainSchedule { seed: number; k: number; start: number; prev: number }
export const makeRainSchedule = (seed: number, now: number): RainSchedule => ({ seed, k: 0, start: now, prev: 1 });
export const advanceRainSchedule = (s: RainSchedule, now: number): number => {
  let seg = rainSegment(s.seed, s.k);
  // 長く止まっていた(タブ復帰)時も、区間を順に進めるだけ(1区間 ≥ 30秒なので回数は小さい)。
  while (now - s.start >= seg.len) {
    s.start += seg.len; s.prev = seg.target; s.k += 1;
    seg = rainSegment(s.seed, s.k);
  }
  return rainIntensityInSegment(s.prev, seg.target, now - s.start);
};

/** 次の雨粒の予定: 引いた間隔が RAIN_RECHECK_MS より長ければ「粒を出さずに見直す」予定にする。 */
export const rainNextEvent = (gapMs: number): { dt: number; spawn: boolean } =>
  gapMs > RAIN_RECHECK_MS ? { dt: RAIN_RECHECK_MS, spawn: false } : { dt: gapMs, spawn: true };

// ---- 水たまりの雨の波紋(雨が強いほど水面が忙しく波立つ・止みかけでは0) ----
/** 強さ1の時の、水面 1000 world px² あたり1秒の波紋の数。 */
export const PUDDLE_RIPPLE_PER_KPX2_S = 0.6;
/** これ以下の強さでは雨の波紋を出さない(止みかけ=水面は静か)。 */
export const PUDDLE_RIPPLE_LEVEL_FLOOR = 0.25;
/** 強さ level・水面の広さ areaPx2(world px²)の水たまりに、1ms あたり何個の波紋が立つか。 */
export const puddleRippleRate = (level: number, areaPx2: number): number => {
  const gain = Math.max(0, level - PUDDLE_RIPPLE_LEVEL_FLOOR) / (1 - PUDDLE_RIPPLE_LEVEL_FLOOR);
  return PUDDLE_RIPPLE_PER_KPX2_S * (Math.max(0, areaPx2) / 1000) * gain / 1000;
};

/** 遅れて付いてくる値を dt ms 進める(指数の追従=急に跳ばない)。 */
export const followLag = (prev: number, target: number, dtMs: number, tauMs: number): number =>
  prev + (target - prev) * (1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, tauMs)));

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

// ---- 水たまりに映る風景(設計書「追加: 水たまりに風景を映す」) ----
/** 映りの縦の倍率(遠景の帯の高さ→映りの帯の高さ)。1未満=見下ろした水面の映りは縦に縮む(小さな水たまりにも稜線と空が一緒に入る)。叩き台。 */
export const LANDSCAPE_REFLECT_STRETCH = 0.38;

export interface LandscapeBand {
  /** 遠景の帯(画面の上端〜地平線)の高さ。 */
  srcH: number;
  /** 映りの帯の高さ(= srcH × 伸び)。水たまりごとの寸法は puddleReflection が更に縮める。 */
  bandH: number;
}

/**
 * 遠景(画面の上端〜地平線)を地平線を軸に上下反転した帯の寸法(画面座標)。横(x)は触らない=遠景の視差(横の流れ)がそのまま映る。
 */
export const landscapeBand = (horizonY: number, topY: number, stretch = LANDSCAPE_REFLECT_STRETCH): LandscapeBand => {
  const srcH = Math.max(1, horizonY - topY);
  return { srcH, bandH: srcH * Math.max(0.1, stretch) };
};

// ---- 水たまりごとの映り(設計書「追加: 映り込みの木を水たまりの奥の縁に吊るす」) ----
/** 水面の深さが「遠景の帯の高さ(srcH)×この割合」以上の水たまりは、映りの縦の倍率が LANDSCAPE_REFLECT_STRETCH そのまま。
 *  これより浅い(小さい・遠い)ほど比例して縮む=小さな水たまりには背の低い木が映る。帯の高さ÷深さ = STRETCH ÷ この割合(上限まで一定)
 *  =引き(0.4)で水たまりも遠景も小さく映っても、水面の中の木と空の割合は変わらない。叩き台。 */
export const LANDSCAPE_REF_DEPTH_FRAC = 0.45;
/** 逆さの稜線(木の根元)を、水面の奥の縁(画面で上の縁)から深さのこの割合だけ内側へ下げる
 *  (水面の形の上端は楕円の頂点なので、根元が縁の外へ切れて見えないように)。叩き台。 */
export const LANDSCAPE_FAR_EDGE_INSET = 0.06;
/** 帯の下端(空の上端)が水面の手前の縁より上で終わった時、続きを埋める空の写しの元=焼きの下端からこの割合
 *  (空の上の方・雲と星だけ。稜線を含まない)を、帯の継ぎ目を軸に鏡写しにして手前の縁まで伸ばす。叩き台。 */
export const LANDSCAPE_SKY_SAMPLE = 0.22;

export interface PuddleReflection {
  /** 逆さの稜線(木の根元=焼きの上端)を置く画面の y。 */
  ridgeY: number;
  /** 映りの縦の倍率(遠景の縦px → 映りの縦px)。 */
  scaleY: number;
  /** 帯全体(稜線〜空の上端)の高さ。 */
  bandH: number;
  /** 水面の内側に出す帯の高さ(手前の縁で切る)と、それが帯全体の何割か(焼きの上から何割を使うか)。 */
  bandVisH: number;
  bandVisFrac: number;
  /** 帯の下に続ける空の写し(鏡写し)の始まりの y と高さ(0 なら無し)。 */
  skyY: number;
  skyH: number;
}

/**
 * 1つの水たまりの風景の映りの縦の配置(画面座標・y は下向き)。farY=水面の奥の縁(上)・nearY=手前の縁(下)・srcH=遠景の帯の高さ。
 * 逆さの稜線の根元を奥の縁に吊るし、木は下(手前)へ垂れる。稜線より手前は空だけ(帯の残り→足りなければ空の鏡写し)。
 * 2本目の稜線・地面は出さない(帯は1本だけ・空の写しは焼きの下端=空の上端だけから取る)。
 */
export const puddleReflection = (
  farY: number, nearY: number, srcH: number,
  opts: { stretch?: number; refDepthFrac?: number; inset?: number } = {},
): PuddleReflection => {
  const stretch = Math.max(0.01, opts.stretch ?? LANDSCAPE_REFLECT_STRETCH);
  const src = Math.max(1, srcH);
  const refDepth = Math.max(1e-6, src * Math.max(0.01, opts.refDepthFrac ?? LANDSCAPE_REF_DEPTH_FRAC));
  const inset = clamp01(opts.inset ?? LANDSCAPE_FAR_EDGE_INSET);
  const depth = Math.max(0, nearY - farY);
  const ridgeY = farY + depth * inset;
  const scaleY = stretch * Math.min(1, Math.max(0.02, depth / refDepth));
  const bandH = Math.max(1e-6, src * scaleY);
  const room = Math.max(0, nearY - ridgeY);
  const bandVisH = Math.min(bandH, room);
  const skyY = ridgeY + bandVisH;
  return { ridgeY, scaleY, bandH, bandVisH, bandVisFrac: bandVisH / bandH, skyY, skyH: Math.max(0, nearY - skyY) };
};

// ---- 雲の影と月明りの強まり(雨上がり=雲が切れて、影と月明りの差がはっきりする) ----
/** 雨上がりの間、地面を流れる雲の影の濃さに掛ける倍率(>1=濃く)。叩き台。 */
export const WET_CLOUD_SHADOW_MULT = 1.35; // 旧 1.8=地面の中間が影で潰れた(社長「地面全体が暗く潰れちゃってる」)
/** 本降りの時の雲の影の倍率(社長指示2026-11-21「雨量に合わせて1.8まで」)。止みかけ(強さ ≤ RAIN_INTENSITY_LOW_MAX)は
 *  WET_CLOUD_SHADOW_MULT、本降り(≥ RAIN_INTENSITY_HIGH_MIN)でこの値。間は今の雨の強さ(時刻表で加減速して動く)に沿って滑らかに。 */
export const WET_CLOUD_SHADOW_MULT_HEAVY = 1.8;
/** 今の雨の強さ rain の時の、雨上がりの雲の影の倍率(雨上がりの効き具合を掛ける前)。 */
export const wetCloudShadowMult = (rain: number): number => {
  const t = clamp01((rain - RAIN_INTENSITY_LOW_MAX) / Math.max(1e-6, RAIN_INTENSITY_HIGH_MIN - RAIN_INTENSITY_LOW_MAX));
  return WET_CLOUD_SHADOW_MULT + (WET_CLOUD_SHADOW_MULT_HEAVY - WET_CLOUD_SHADOW_MULT) * easeInOutSine(t);
};
/** 雨上がりの間、月明りの筋の明るさに掛ける倍率(>1=明るく)。叩き台。 */
export const WET_MOON_SHAFT_MULT = 1.7;
/** 雨上がりの間の月明りの筋の色(夜の既定 0xc9d6ff より青い=藍の夜の月光。灰色の靄に見えないように)。叩き台。 */
export const WET_MOON_SHAFT_COLOR = 0xa6bbff;
/** 2色を t(0..1)で混ぜる(0xRRGGBB)。 */
export const lerpRgb = (a: number, b: number, t: number): number => {
  const k = clamp01(t);
  const ch = (sh: number) => Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
/** 雨上がりへ入る/抜ける時、上の倍率が効き切るまでの尺(ms)。パッと切り替えない(慣性)。 */
export const WET_LIGHT_FADE_MS = 1800;

/** 効き具合(0..1)を1フレーム進める。active へ向けて一定の速さで寄せる(見た目の加減速は wetLightMult 側の easeInOutSine)。 */
export const stepWetLightMix = (mix: number, active: boolean, dtMs: number): number => {
  const step = Math.max(0, dtMs) / WET_LIGHT_FADE_MS;
  return active ? Math.min(1, mix + step) : Math.max(0, mix - step);
};

/** 効き具合 mix(0..1)の時の倍率。mix=0(雨上がりでない)なら必ず 1(=何も変えない)。 */
export const wetLightMult = (mix: number, mult: number): number => 1 + (mult - 1) * easeInOutSine(mix);

// ---- 参考画に寄せる(設計書「追加: 参考画に寄せる」・雨上がりの間だけ) ----
// 1. 霧: 藍へ寄せる(灰色の平たい幕に見えない)。濃さは通常のまま(社長指示2026-11-21「薄めなくていい」=遠景と手前の霧の柔らかさと、
//    くっきりしたプレイ面の対比で見せる)。霧の元の濃さ・色に掛ける倍率。
export const WET_FOG_ALPHA_MUL = 1;
export const WET_FOG_TINT_MUL = { r: 0.56, g: 0.6, b: 1 } as const;
/** 近景の森(世界の色行列が掛からない層)の色の倍率=色行列と同じ藍の夜へ揃える。 */
export const WET_FRONT_TINT_MUL = { r: 0.72, g: 0.78, b: 1 } as const;

// 2. 世界の色行列: 彩度を上げ、青/藍へ寄せて深い夜にする。暗部は青だけわずかに持ち上げる(黒が灰にならない・キャラの輪郭は残す)。
/** 彩度(1=そのまま・>1=鮮やか)。 */
export const WET_GRADE_SAT = 1.12;
/** チャンネルごとの明るさ(R, G, B)。赤と緑を少し沈めて青を上げる=藍の夜(旧 0.8/0.88/1.16=地面の中間が潰れた)。 */
export const WET_GRADE_GAIN: readonly [number, number, number] = [0.9, 0.96, 1.2];
/** 暗部の持ち上げ(R, G, B・-1..1)。負=黒の点を下げる(白っぽい幕を締めて黒を深く)。青だけごくわずか=影は藍に沈む(旧 0.01/0.012/0.045)。 */
export const WET_GRADE_LIFT: readonly [number, number, number] = [-0.008, -0.008, 0.008];

/** 雨上がりの世界の色行列(5×4 を1列に並べた 20 要素・値は 0..1 の単位)。 */
export const buildWetGradeMatrix = (
  sat = WET_GRADE_SAT, gain: readonly number[] = WET_GRADE_GAIN, lift: readonly number[] = WET_GRADE_LIFT,
): number[] => {
  const lr = 0.299 * (1 - sat), lg = 0.587 * (1 - sat), lb = 0.114 * (1 - sat);
  const satM = [
    [lr + sat, lg, lb],
    [lr, lg + sat, lb],
    [lr, lg, lb + sat],
  ];
  const m: number[] = [];
  for (let c = 0; c < 3; c++) {
    const k = gain[c] * (1 - lift[c]);
    m.push(satM[c][0] * k, satM[c][1] * k, satM[c][2] * k, 0, lift[c]);
  }
  m.push(0, 0, 0, 1, 0);
  return m;
};

/** 色行列を1色(0..1 の rgb)に掛ける(テストと見積もり用)。 */
export const applyColorMatrix = (m: readonly number[], r: number, g: number, b: number): [number, number, number] => [
  m[0] * r + m[1] * g + m[2] * b + m[4],
  m[5] * r + m[6] * g + m[7] * b + m[9],
  m[10] * r + m[11] * g + m[12] * b + m[14],
];

// 7. 月: 暈とグローを大きく明るく(雲が切れて澄んだ空)。元の大きさ・濃さに掛ける倍率。
export const WET_MOON_GLOW_ALPHA_MUL = 1.6;
export const WET_MOON_GLOW_SCALE_MUL = 1.3;
export const WET_MOON_HALO_ALPHA_MUL = 2.2;
export const WET_MOON_HALO_SCALE_MUL = 1.45;

// 4. 松明の光の映り: 濡れた地面に、松明の足元のすぐ手前へ落ちる暖色の「光だまり」(参考画=松明の背丈ほどの、
//    台座より幅の広い短い溜まり)。柔らかい丸の絵を横長の楕円に置いた1枚+途切れた横の光の欠片(水面のさざなみ)。
//    欠片は足元の近くに集まり、手前ほど少なく薄い。
/** 光だまりの縦の広がり(欠片が散る範囲)・横幅(world px・遠近と松明の大きさを掛ける前)。 */
export const TORCH_STREAK_LEN = 64;
export const TORCH_STREAK_W = 84;
/** 光だまりの濃さ(松明の光だまりの強さ 0..1 に掛ける)。 */
export const TORCH_STREAK_ALPHA = 0.85;
/** 光だまりの上端を足元からどれだけ下げるか(world px・遠近前)=台座の真下から始まる。 */
export const TORCH_STREAK_TOP = 6;
/** 横の光の欠片の本数・幅(world px・遠近前)・太さ・濃さ。 */
export const TORCH_STREAK_DASHES = 10;
export const TORCH_STREAK_DASH_W = 40;
export const TORCH_STREAK_DASH_H = 4.5;
export const TORCH_STREAK_DASH_ALPHA = 1;
/** 松明の裏の光(社長確認2026-11-21「参考の松明って、光が松明の裏にいる？」→はい): 足元の少し奥(画面の上)の
 *  地面=苔と草が温かく照らされ、三脚がその明るい地面の前に黒い影絵で立つ。松明の絵より下の層(地面の層)に置く
 *  柔らかい丸の絵1枚(加算)。影を落とす光ではない。寸法は world px・遠近前。 */
export const TORCH_BACK_UP = 12;
export const TORCH_BACK_W = 200;
export const TORCH_BACK_H = 52;
export const TORCH_BACK_ALPHA = 0.9;
/** 裏の光の色: 炎の色から、苔を照らした黄色へ寄せる割合と、その黄色。 */
export const TORCH_BACK_TINT = 0xffc24e;
export const TORCH_BACK_TINT_MIX = 0.45;
/** 筋の濃さを目標へ寄せる割合(1フレームあたり)=点く/消える時にパッと変わらない(慣性)。 */
export const TORCH_STREAK_EASE = 0.14;

// 8. 濡れた土: 地面の絵(帯)の色を、湿って色の深い土へ寄せる(色行列の層は足さない=帯の tint に掛けるだけ)。
//    世界の色調整(WET_GRADE_GAIN=赤0.8・緑0.88)が地面の赤と緑を沈めて潰すので、地面の側だけ赤と緑を持ち上げて返す
//    (乗算なので黒は黒のまま=中間の明るさと土・苔の色だけが戻る)。青は据え置き=最後に温かい焦げ茶と苔の緑に残る。
//    夜の地面の tint(0x9e9e9e)に掛ける倍率。255 で頭打ち。
export const WET_SOIL_MUL: readonly [number, number, number] = [1.6, 1.52, 1.12];
/** 夜の地面の tint(env)に、効き具合 mix(0..1・加減速つき)ぶん湿った土の掛け率を掛けた tint。 */
export const wetSoilTint = (env: number, mix: number): number => {
  const k = easeInOutSine(mix);
  const ch = (shift: number, m: number) => Math.min(255, Math.round(((env >> shift) & 255) * (1 + (m - 1) * k)));
  return (ch(16, WET_SOIL_MUL[0]) << 16) | (ch(8, WET_SOIL_MUL[1]) << 8) | ch(0, WET_SOIL_MUL[2]);
};

// 8b. 夜の暗さを雨上がりの間だけ弱める(社長承認2026-11-21・参考画の地面の明るさへ寄せる)。どちらも乗算の掛け率を緩めるだけ
//     =黒は黒のまま(締まりは残る)。霧の濃さ・被写界深度は触らない。効き具合 mix=0(雨上がりでない)なら厳密にそのまま。
/** 世界に掛ける寒色の乗算(GRADE_TINT)の濃さに掛ける倍率。 */
export const WET_NIGHT_GRADE_ALPHA_MUL = 0.45;
/** 夜の環境の tint(ENV_TINT=地面・水たまりの縁)に掛ける倍率(255 で頭打ち)。 */
export const WET_NIGHT_ENV_MUL = 1.15;
/** 寒色の乗算の濃さ(alpha)を、効き具合 mix(0..1・加減速つき)ぶん弱めた値。 */
export const wetNightGradeAlpha = (alpha: number, mix: number): number =>
  alpha * (1 + (WET_NIGHT_GRADE_ALPHA_MUL - 1) * easeInOutSine(mix));
/** 夜の環境の tint を、効き具合 mix ぶん明るくした tint。 */
export const wetNightEnvTint = (env: number, mix: number): number => {
  const k = 1 + (WET_NIGHT_ENV_MUL - 1) * easeInOutSine(mix);
  const ch = (shift: number) => Math.min(255, Math.round(((env >> shift) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

// 9. 濡れた地面の照り: 地面の上(キャラの下)に、まだらな照りの絵を1枚敷く(加算・薄く)。松明の足元では温かく強く照る。
/** 照りの濃さ・色。 */
export const WET_GLOSS_ALPHA = 0.4;
export const WET_GLOSS_TINT = 0xffffff; // 色は焼いた絵の側(苔の黄緑・月明りの青白)
/** 照りの絵1枚(焼いた 128px)を世界の何 px に引き伸ばすか。 */
export const WET_GLOSS_TILE_WORLD = 220;
/** 月明りの筋の脈動(1 前後)を照りの濃さへどれだけ移すか。 */
export const WET_GLOSS_SHAFT_GAIN = 2.5;
/** 松明の足元の照り(world px・遠近前)と濃さ。 */
export const WET_GLOSS_TORCH_W = 230;
export const WET_GLOSS_TORCH_H = 120;
export const WET_GLOSS_TORCH_ALPHA = 0.55;

/**
 * 照りの絵のずれ(world px)と、きらめきの濃さの倍率。ごくゆっくり行って戻る(正弦=動き始めと終わりで減速=慣性)。
 * 周期の違う正弦を足すので、決まった往復に見えない。
 */
export const wetGlossDrift = (now: number): { x: number; y: number; shimmer: number } => ({
  x: 14 * Math.sin(now / 9100) + 6 * Math.sin(now / 3700 + 1.3),
  y: 5 * Math.sin(now / 7300 + 0.4),
  shimmer: 1 + 0.18 * Math.sin(now / 2300) * Math.sin(now / 5100 + 0.8),
});

// 11. 月明りの縁: 月明りの筋の中にある水たまりの縁と小物を、月明りの絵へ寄せる(筋の形はそのまま読むだけ・光は足さない)。
/** 筋1本の形(筋の絵の座標)。上端は x1..x1+w の水平線、下端は (x2-0.68w)..(x2+0.32w)。a=筋どうしの濃さの比(強い筋=1)。 */
export interface ShaftPoly { x1: number; y1: number; x2: number; y2: number; w: number; a: number }
/** 筋の縁の柔らかさ(幅に対する割合)。縁から内へこの幅で 0→1。 */
export const MOON_RIM_EDGE = 0.25;
/** 縁の絵が月明りへ寄る速さ(1フレームの割合)。筋が流れても絵がパッと切り替わらない(慣性)。 */
export const MOON_RIM_EASE = 0.05;
/** 点 (x, y)(筋の絵の座標)に落ちている月明りの量(0..1)。 */
export const shaftLightAt = (x: number, y: number, polys: readonly ShaftPoly[]): number => {
  let best = 0;
  for (const q of polys) {
    const dy = q.y2 - q.y1;
    if (dy === 0) continue;
    const t = (y - q.y1) / dy;
    if (t < 0 || t > 1) continue;
    const left = q.x1 + t * (q.x2 - 0.68 * q.w - q.x1);
    const right = q.x1 + q.w + t * (q.x2 + 0.32 * q.w - q.x1 - q.w);
    if (x <= left || x >= right) continue;
    const u = (x - left) / (right - left);
    const e = easeInOutSine(Math.min(u, 1 - u) / MOON_RIM_EDGE);
    best = Math.max(best, e * Math.min(1, q.a));
  }
  return best;
};

export interface StreakDash {
  /** 筋の上端からの位置(0..1)。 */
  t: number;
  /** 幅の倍率(TORCH_STREAK_DASH_W に掛ける)。 */
  w: number;
  /** 濃さ(0..1)。 */
  a: number;
  /** 横のずれ(幅の倍率に対する -0.7..0.7)。 */
  dx: number;
}

/**
 * 光だまりの i 本目の光の欠片(さざなみの照り返し)。位置は足元寄りに詰め、等間隔にせず少し揺らし、幅と濃さは
 * それぞれ違う周期の正弦でゆっくり伸び縮みする(正弦=始まりと終わりで減速する=慣性)。
 * 遠い(下の)欠片ほど薄い。seed は松明ごとの値(全部の松明が同じ拍で揺れない)。
 */
export const torchStreakDash = (i: number, n: number, now: number, seed: number): StreakDash => {
  // 足元の近くに詰めて置く(1.5乗=手前ほど間が開く)。
  const base = ((i + 0.5) / Math.max(1, n)) ** 1.5;
  const t = clamp01(base + 0.05 * Math.sin(now / (900 + 130 * i) + seed * 3.1 + i * 2.3));
  const sw = Math.sin(now / (520 + 70 * i) + seed + i * 1.7);
  const w = 0.35 + 0.65 * sw * sw;
  const tw = Math.sin(now / (380 + 55 * i) + seed * 1.9 + i * 0.9);
  const a = (1 - t) ** 1.3 * (0.6 + 0.4 * tw * tw);
  const dx = 0.7 * Math.sin(now / (1300 + 170 * i) + seed * 0.7 + i * 2.9);
  return { t, w, a, dx };
};

// 5. 葉先から垂れる雫: 木の枝葉の高さで雫が膨らんで(ぶら下がって)から、重力で加速して地面へ落ちる。
/** 雫がぶら下がっている尺(ms)の幅。 */
export const LEAF_DRIP_HANG_MS_MIN = 420;
export const LEAF_DRIP_HANG_MS_MAX = 1100;
/** 雫が生まれる高さ(木の絵の高さに対する割合)。枝葉の帯。 */
export const LEAF_DRIP_H_MIN = 0.5;
export const LEAF_DRIP_H_MAX = 0.86;
/** 雫が生まれる横の幅(木の絵の幅に対する割合・中心から片側)。 */
export const LEAF_DRIP_X_SPREAD = 0.38;

export interface LeafTree {
  footX: number;
  footY: number;
  /** 画面に出ている木の絵の幅・高さ(world px・遠近込み)。 */
  w: number;
  h: number;
}
export interface LeafDripSpec {
  /** 着地点(world)。 */
  x: number;
  y: number;
  /** 着地点からの生まれる高さ(world px・遠近込み)。 */
  height: number;
  hangMs: number;
  fallMs: number;
}

/** 雫1粒の生まれ方。rnd は 0..1 の乱数(テストで固定できるように渡す)。 */
export const leafDripSpec = (t: LeafTree, rnd: () => number): LeafDripSpec => {
  const height = Math.max(8, t.h * (LEAF_DRIP_H_MIN + (LEAF_DRIP_H_MAX - LEAF_DRIP_H_MIN) * rnd()));
  const x = t.footX + (rnd() * 2 - 1) * LEAF_DRIP_X_SPREAD * t.w;
  // 着地は幹の足元の少し手前〜奥(枝の真下の地面)。
  const y = t.footY + (rnd() * 1.4 - 0.4) * t.h * 0.08;
  const hangMs = LEAF_DRIP_HANG_MS_MIN + (LEAF_DRIP_HANG_MS_MAX - LEAF_DRIP_HANG_MS_MIN) * rnd();
  // 落ちる尺は高さの平方根に比例(重力=高いほど長く落ちる)。基準は DRIP_FALL_H を DRIP_FALL_MS で落ちる速さ。
  const fallMs = DRIP_FALL_MS * Math.sqrt(height / DRIP_FALL_H);
  return { x, y, height, hangMs, fallMs };
};

export interface LeafDripPose {
  /** 着地点からの高さ(world px)。 */
  h: number;
  /** 雫の膨らみ(0..1)。ぶら下がっている間に育つ。落ち始めたら1。 */
  swell: number;
  /** 落ちている時の尾の長さの割合(0..1・速くなるほど伸びる)。ぶら下がっている間は0。 */
  tail: number;
  /** 濃さ(0..1)。 */
  alpha: number;
  falling: boolean;
}

/**
 * 経過 t(ms)の雫の姿。ぶら下がり(膨らみは減速して育つ・重みで少し下がる)→ 落下(止まった所から重力で加速)。
 * 落ち切ったら null(=そこで波紋)。
 */
export const leafDripPose = (t: number, s: LeafDripSpec): LeafDripPose | null => {
  if (t < 0) return null;
  if (t < s.hangMs) {
    const k = t / s.hangMs;
    const swell = easeOutCubic(k);
    // 重みで少しだけ垂れる(最後に加速して千切れる手前)。
    return { h: s.height - 3 * easeInQuad(k), swell, tail: 0, alpha: easeOutCubic(k / 0.35), falling: false };
  }
  const tf = t - s.hangMs;
  if (tf >= s.fallMs) return null;
  const k = tf / s.fallMs;
  const top = s.height - 3;
  return { h: top * (1 - easeInQuad(k)), swell: 1, tail: k, alpha: 1, falling: true };
};
