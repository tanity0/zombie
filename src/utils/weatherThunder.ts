// 雨の場面の雷(社長指示2026-11-26「雷も入れて」)。★演出だけ=当たり判定・ダメージ・ゲームの状態は持たない(派手さの絵)。
//
// ここは描画に依らない純関数だけ(いつ落ちるか・稲光の明滅の曲線・稲妻の形・雷鳴の遅れ/音量/音程)。
// 描くのは pixi/weatherThunder.ts、鳴らすのは audioManager の playDistantSfx('thunder', …)(PixiStage が繋ぐ)。

/** 次の雷までの間隔(ms)。不規則・連続しない(最短でもこれだけ空く)。叩き台 8〜20秒。 */
export const THUNDER_GAP_MS_MIN = 8000;
export const THUNDER_GAP_MS_MAX = 20000;
/** 出撃して雨の層が立ってから最初の雷までの間隔(ms)。いきなり鳴らない。 */
export const THUNDER_FIRST_MS_MIN = 5000;
export const THUNDER_FIRST_MS_MAX = 11000;
/** 落とせない時(ボスの出現・カットイン・アテンション・止みかけ)に、次に見直すまでの間隔(ms)。明けた瞬間には落とさない。 */
export const THUNDER_RETRY_MS_MIN = 2500;
export const THUNDER_RETRY_MS_MAX = 5000;
/** 雨の強さ(utils/weatherWet の時刻表の値)がこれ未満の間は落ちない(ほぼ止んでいる時に雷は鳴らない)。 */
export const THUNDER_MIN_RAIN = 0.5;
/** 明滅の1回の立ち上がり(ms)。パッと点かない(慣性)。 */
export const THUNDER_RISE_MS = 26;

export interface ThunderPulse {
  /** 稲光の開始からの時刻(ms)。 */
  at: number;
  /** 明るさの頂点(0..1)。 */
  peak: number;
  /** 抜けの時定数(ms)。 */
  tau: number;
}

export interface ThunderStrike {
  /** 0=近い・1=遠い。 */
  dist: number;
  /** 2〜3回の明滅。最後が一番明るく、長く残る。 */
  pulses: ThunderPulse[];
  /** 稲妻の筋を空に走らせるか。 */
  bolt: boolean;
  /** 稲妻の落ちる横位置(画面の幅に対する 0..1)。 */
  boltX: number;
  /** 稲妻の形の種。 */
  seed: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;

/** 次の雷までの間隔。 */
export const thunderNextGapMs = (rnd: () => number): number => lerp(THUNDER_GAP_MS_MIN, THUNDER_GAP_MS_MAX, rnd());

/** 1回の雷の中身(近さ・明滅の並び・稲妻の有無)。 */
export const planThunderStrike = (rnd: () => number): ThunderStrike => {
  const dist = rnd();
  const near = 1 - dist;
  const n = rnd() < 0.55 ? 3 : 2;
  const mainPeak = lerp(0.55, 1, near);
  const pulses: ThunderPulse[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    pulses.push({
      at,
      peak: last ? mainPeak : mainPeak * lerp(0.35, 0.7, rnd()),
      tau: last ? lerp(170, 260, rnd()) : lerp(40, 75, rnd()),
    });
    at += lerp(70, 150, rnd());
  }
  return { dist, pulses, bolt: rnd() < lerp(0.35, 0.85, near), boltX: lerp(0.12, 0.88, rnd()), seed: Math.floor(rnd() * 1e9) };
};

const pulseLevel = (t: number, p: ThunderPulse, tauMul: number): number => {
  const u = t - p.at;
  if (u < 0) return 0;
  const rise = easeOutCubic(u / THUNDER_RISE_MS);
  const decay = Math.exp(-Math.max(0, u - THUNDER_RISE_MS) / (p.tau * tauMul));
  return p.peak * rise * decay;
};

/** 稲光が始まってから終わるまで(ms)。これを過ぎたら 0。 */
export const thunderDurationMs = (s: ThunderStrike): number => {
  const last = s.pulses[s.pulses.length - 1];
  return last.at + THUNDER_RISE_MS + last.tau * 5;
};

/**
 * 経過 t(ms)の稲光の明るさ(0..1)。明滅ごとに立ち上がり→指数で抜ける。重なりは大きい方。
 * 終わり際は 0 へ滑らかに寄せる(最後の5τで残り 0.7% を消す=パッと消えない)。
 */
export const thunderFlash = (t: number, s: ThunderStrike): number => {
  const end = thunderDurationMs(s);
  if (t < 0 || t >= end) return 0;
  let v = 0;
  for (const p of s.pulses) v = Math.max(v, pulseLevel(t, p, 1));
  const tail = clamp01((end - t) / (end * 0.25));
  return v * Math.min(1, tail * 1.5);
};

/** 稲妻の筋の濃さ(0..1)。明滅に合わせて光り、稲光より速く抜ける(筋は一瞬・空の明るさは少し残る)。 */
export const thunderBoltAlpha = (t: number, s: ThunderStrike): number => {
  if (!s.bolt || t < 0) return 0;
  let v = 0;
  for (const p of s.pulses) v = Math.max(v, pulseLevel(t, p, 0.55) / Math.max(1e-6, p.peak) * Math.min(1, 0.55 + p.peak));
  return clamp01(v);
};

/** 決まった種の乱数(稲妻の形を毎フレーム同じにする)。 */
export const thunderRng = (seed: number): (() => number) => {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export interface ThunderBoltShape {
  /** 幹の折れ線(x,y の並び・画面の座標)。 */
  main: number[];
  /** 枝の折れ線。 */
  branches: number[][];
}

/**
 * 稲妻の形。x0 の上 y0 から下 y1 へ、折れながら落ちる幹と、途中から外へ流れる枝 1〜3本。
 * w は横の揺れの基準(画面の幅など)。同じ種なら同じ形。
 */
export const thunderBoltShape = (seed: number, x0: number, y0: number, y1: number, w: number): ThunderBoltShape => {
  const r = thunderRng(seed);
  const len = Math.max(1, y1 - y0);
  const n = 11 + Math.floor(r() * 5);
  const main: number[] = [x0, y0];
  const lean = (r() - 0.5) * 0.35 * w / n; // 全体の傾き(真っ直ぐ下ではない)
  let x = x0, y = y0;
  for (let i = 1; i <= n; i++) {
    y = i === n ? y1 : y + (len / n) * lerp(0.6, 1.4, r());
    if (y > y1) y = y1;
    x += lean + (r() - 0.5) * w * 0.07;
    main.push(x, y);
    if (y >= y1) break;
  }
  const branches: number[][] = [];
  const nb = 1 + Math.floor(r() * 3);
  const pts = main.length / 2;
  for (let b = 0; b < nb && pts > 5; b++) {
    const i = 2 + Math.floor(r() * (pts - 4));
    let bx = main[i * 2], by = main[i * 2 + 1];
    const dir = r() < 0.5 ? -1 : 1;
    const seg = 3 + Math.floor(r() * 4);
    const br: number[] = [bx, by];
    for (let k = 0; k < seg; k++) {
      bx += dir * w * lerp(0.015, 0.05, r());
      by += (len / n) * lerp(0.4, 0.9, r());
      if (by > y1) break;
      br.push(bx, by);
    }
    if (br.length >= 4) branches.push(br);
  }
  return { main, branches };
};

export interface ThunderSoundCue {
  /** 光ってから鳴るまで(ms)。遠いほど遅い。 */
  delayMs: number;
  /** 音量の倍率。遠いほど小さい。 */
  gain: number;
  /** 再生の速さ(=音程)。遠いほど低い・毎回少し揺らす。 */
  rate: number;
  /** こもり(ローパスの周波数 Hz)。遠いほどこもる。 */
  lowpassHz: number;
  /** 左右(-1..1)。稲妻の落ちた側へ少し寄せる。 */
  pan: number;
}

/** 雷鳴の鳴らし方(社長支給の雷SE を1本。遠近は遅れ・音量・音程・こもりで付ける)。 */
export const thunderSoundCue = (s: ThunderStrike, rnd: () => number): ThunderSoundCue => {
  const d = clamp01(s.dist);
  return {
    delayMs: lerp(120, 2600, d) + rnd() * 300,
    gain: lerp(1.0, 0.38, d),
    rate: lerp(1.0, 0.8, d) * lerp(0.94, 1.06, rnd()),
    lowpassHz: lerp(9000, 1300, d),
    pan: (s.boltX - 0.5) * 0.6,
  };
};
