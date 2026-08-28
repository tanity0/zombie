// research/AI_HUMANIZE.md B3(§4「写す」側)。守護霊/幻影がマイクロリズムの分布から実際の値を
// 引くための純関数(専用乱数流+合成既定分布+バケット→値のサンプリング)。ghostDriver.tsから呼ばれる
// (このファイルはghostDriver.tsをimportしない=循環回避。型はmicroRhythm.tsから借りるだけ)。
//
// ★専用乱数流(§4-19): シード=召喚id/敵id(呼び出し側が渡す)。既存rand流(decideGhostのrand引数)とは
// 完全に別系統なので、ここでの抽選は**既存randを1回も消費しない**(§7-4の掟)。
import { mulberry32 } from './botUpgradePolicy';
import {
  type MicroBin3Dist, type MicroHistDist, type MicroOrbitDist, type MicroRhythmProfile,
  STILL_SHORT_MS, STILL_MID_MS, SWING_DENSE_MS, SWING_MID_MS,
  DECISION_FAST_MS, DECISION_MID_MS,
} from './microRhythm';

// ---- 専用乱数流(id文字列→シード→(seed,drawIndex)ごとに独立した値) --------------------------------
/** 文字列→32bit整数(FNV-1a)。召喚id/敵idからシードを作る(§4「シード=召喚id/敵id」)。 */
export const hashSeed = (id: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/**
 * (seed, drawIndex) ごとに決定的な[0,1)値を1つ返す。呼び出し側はdrawIndexを永続化して
 * 引くたびに+1する(GhostSelf.microDrawIndex等)。既存rand()と混ざらない専用流。
 */
export const microRandAt = (seed: number, drawIndex: number): number =>
  mulberry32((seed + drawIndex * 0x9e3779b1) >>> 0)();

/** 1回の意思決定内で複数draw消費するための薄いカーソル(呼び出し側はnextIndex()を次tickへ持ち越す)。 */
export const createMicroRandCursor = (seed: number, startIndex: number): { rand: () => number; nextIndex: () => number } => {
  let i = startIndex;
  return {
    rand: () => { const v = microRandAt(seed, i); i += 1; return v; },
    nextIndex: () => i,
  };
};

// ---- 3ビン分布から1つ引く -----------------------------------------------------------------------
const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** {n,rate0,rate1}からbin0/1/2のどれかを引く(rand消費1回)。欠損はfallbackBin。 */
export const pickBin3 = (dist: MicroBin3Dist | undefined, rand: () => number, fallbackBin: 0 | 1 | 2 = 0): 0 | 1 | 2 => {
  if (!dist || dist.n <= 0) return fallbackBin;
  const b0 = clamp01(dist.rate0);
  const b1 = Math.min(1, b0 + clamp01(dist.rate1));
  const v = rand();
  if (v < b0) return 0;
  if (v < b1) return 1;
  return 2;
};

/** 16ビンヒストグラムからbucket indexを引く(rand消費1回)。欠損はnull。 */
export const pickHistBucket = (dist: MicroHistDist | undefined, rand: () => number): number | null => {
  if (!dist || dist.n <= 0 || dist.rates.length === 0) return null;
  const total = dist.rates.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return null;
  let v = rand() * total;
  for (let i = 0; i < dist.rates.length; i++) {
    v -= Math.max(0, dist.rates[i]);
    if (v <= 0) return i;
  }
  return dist.rates.length - 1;
};

// ---- バケット→実値(叩き台のマッピング。§0-3実測主義=範囲そのものは録り側と揃える) -----------------
/** ①止まりの長さ(ms)。bin内は一様。 */
export const sampleStillMs = (dist: MicroBin3Dist | undefined, rand: () => number): number => {
  const bin = pickBin3(dist, rand, 1);
  if (bin === 0) return STILL_SHORT_MS * rand();
  if (bin === 1) return STILL_SHORT_MS + (STILL_MID_MS - STILL_SHORT_MS) * rand();
  return STILL_MID_MS + STILL_MID_MS * rand(); // long: 600〜1200ms(叩き台=中央値の2倍を上限とする)
};

/** ②攻撃間隔(ms)。 */
export const sampleSwingIntervalMs = (dist: MicroBin3Dist | undefined, rand: () => number): number => {
  const bin = pickBin3(dist, rand, 1);
  if (bin === 0) return SWING_DENSE_MS * (0.4 + 0.6 * rand()); // 密: 200〜500ms
  if (bin === 1) return SWING_DENSE_MS + (SWING_MID_MS - SWING_DENSE_MS) * rand();
  return SWING_MID_MS + SWING_MID_MS * 0.6 * rand(); // 疎: 1200〜1920ms(叩き台)
};

/** ③⑤間合い(px)。16ビン=50px刻み(playerTraits.DIST_BUCKET_PXと同じ・下でexport)。 */
export const DIST_BUCKET_PX = 50;
export const DIST_BUCKET_COUNT = 16;
export const sampleDistPx = (dist: MicroHistDist | undefined, rand: () => number, fallback: number): number => {
  const bucket = pickHistBucket(dist, rand);
  if (bucket === null) return fallback;
  return bucket * DIST_BUCKET_PX + DIST_BUCKET_PX / 2;
};

/** ④回り方の利き: rand<rightRateなら+1、そうでなければ-1。欠損は50/50(rand消費1回)。 */
export const sampleOrbitSign = (dist: MicroOrbitDist | undefined, rand: () => number): 1 | -1 => {
  const rate = dist && dist.n > 0 ? clamp01(dist.rightRate) : 0.5;
  return rand() < rate ? 1 : -1;
};

/** ⑥被弾直後の反応。0=下がる/1=固まる/2=殴り返す。 */
export const sampleHitReact = (dist: MicroBin3Dist | undefined, rand: () => number): 0 | 1 | 2 =>
  pickBin3(dist, rand, 1);

/** ⑦硬直パニッシュの発動遅延(ms)。 */
export const PUNISH_FAST_MS = 150;   // 叩き台
export const PUNISH_NORMAL_MS = 500; // 叩き台
export const samplePunishDelayMs = (dist: MicroBin3Dist | undefined, rand: () => number): number => {
  const bin = pickBin3(dist, rand, 0);
  if (bin === 0) return PUNISH_FAST_MS * rand();
  if (bin === 1) return PUNISH_FAST_MS + (PUNISH_NORMAL_MS - PUNISH_FAST_MS) * rand();
  return PUNISH_NORMAL_MS + PUNISH_NORMAL_MS * rand(); // 様子見: 500〜1000ms(叩き台)
};

/** ⑧判断の間隔(ms)。 */
export const sampleDecisionIntervalMs = (dist: MicroBin3Dist | undefined, rand: () => number): number => {
  const bin = pickBin3(dist, rand, 0);
  if (bin === 0) return DECISION_FAST_MS * (0.3 + 0.7 * rand());
  if (bin === 1) return DECISION_FAST_MS + (DECISION_MID_MS - DECISION_FAST_MS) * rand();
  return DECISION_MID_MS + DECISION_MID_MS * 0.5 * rand(); // 遅い: 1000〜1500ms(叩き台)
};

// ---- 合成既定分布(§3「欠損時は既存スカラーから決定的に合成」・幻影/固定守護霊/データの薄い実プレイヤー共通) ----
/** 合成分布の名目サンプル数(叩き台=「実測ではない」ことが分かる小さい値)。 */
const SYNTH_N = 8;
const bin3Of = (rate0: number, rate1: number): MicroBin3Dist => ({ n: SYNTH_N, rate0: clamp01(rate0), rate1: clamp01(rate1) });

/** 中心distPxを頂点にした三角分布(16ビン・叩き台=幅2バケット)。 */
const triangularHist = (centerPx: number): MicroHistDist => {
  const centerIdx = Math.max(0, Math.min(DIST_BUCKET_COUNT - 1, Math.round(centerPx / DIST_BUCKET_PX)));
  const rates = new Array<number>(DIST_BUCKET_COUNT).fill(0);
  const SPREAD = 2; // 叩き台
  let sum = 0;
  for (let i = 0; i < DIST_BUCKET_COUNT; i++) {
    const w = Math.max(0, SPREAD + 1 - Math.abs(i - centerIdx));
    rates[i] = w;
    sum += w;
  }
  if (sum > 0) for (let i = 0; i < DIST_BUCKET_COUNT; i++) rates[i] /= sum;
  return { n: SYNTH_N, rates };
};

/**
 * §3「合成既定分布」: 止まり←stationaryFrac、攻撃間隔←hitsPerMin、間合い←preferredDist。
 * ④⑥⑦⑧はスカラーからの強い相関が無いため、**旧来の挙動に近い**(=変化を小さく保つ)既定を置く
 * (叩き台。実測が入り次第、実測分布[profile.microRhythm]がこの合成をそのまま上書きする)。
 */
export const synthesizeMicroRhythm = (
  stationaryFrac: number, hitsPerMin: number, preferredDist: number,
): MicroRhythmProfile => {
  const stationary = clamp01(stationaryFrac);
  const dense = clamp01(hitsPerMin / 20); // 叩き台: 20hits/分でほぼ常に密
  return {
    // ①: stationaryFracが高い人ほど長い止まりが多い(短い止まりの逆比例)。
    stillness: bin3Of((1 - stationary) * 0.6, (1 - stationary) * 0.3),
    // ②: hitsPerMinが高い人ほど密な間隔が多い。
    swingInterval: bin3Of(dense, (1 - dense) * 0.5),
    distDist: triangularHist(preferredDist),
    pinchDistDist: triangularHist(preferredDist),
    // ④: 相関する実測が無い=五分五分(既存のorbitSign初期抽選=rand()<0.5と同じ確率のまま)。
    orbit: { n: SYNTH_N, rightRate: 0.5 },
    // ⑥: 相関薄=均等に近い既定(下がる/固まる/殴り返すをほぼ均等・叩き台)。
    hitReact: bin3Of(0.34, 0.33),
    // ⑦: 旧来のpunishRush(遅延0=即詰め)に寄せる=ほとんど「即」(叩き台)。
    punishRecoverSpeed: bin3Of(0.7, 0.2),
    // ⑧: 旧来の毎tick判断(遅延ほぼ0)に寄せる=ほとんど「速い」(叩き台)。
    decisionInterval: bin3Of(0.7, 0.2),
  };
};
