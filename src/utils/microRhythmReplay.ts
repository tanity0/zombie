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

// ---- ①占有率の保存(B3検収・重大1): 止まりエピソード化で「動いているtick率」を旧来と揃える ----------
/**
 * ①止まりの長さ(ms)の期待値(=sampleStillMsが実際に返す値の平均。bin内一様分布の中点の加重和)。
 * 欠損/n<=0はSTILL_MID_MS(中間ビンの代表値)を返す(呼び出し側は分布が無ければこの関数自体を呼ばない
 * ので実際には使われないフォールバック)。
 */
export const meanStillMs = (dist: MicroBin3Dist | undefined): number => {
  if (!dist || dist.n <= 0) return STILL_MID_MS;
  const e0 = STILL_SHORT_MS / 2;                  // bin0: 一様[0, STILL_SHORT_MS)の平均
  const e1 = (STILL_SHORT_MS + STILL_MID_MS) / 2; // bin1: 一様[STILL_SHORT_MS, STILL_MID_MS)の平均
  const e2 = STILL_MID_MS * 1.5;                  // bin2: 一様[STILL_MID_MS, 2*STILL_MID_MS)の平均(sampleStillMsのlongと同じ範囲)
  const r0 = clamp01(dist.rate0);
  const r1 = clamp01(dist.rate1);
  const r2 = Math.max(0, 1 - r0 - r1);
  return r0 * e0 + r1 * e1 + r2 * e2;
};

/** 占有率導出の基準tick長(ms・叩き台=GHOST_ORBIT_FLIP_CHANCE等と同じ60fps規約)。 */
export const MICRO_STILL_TICK_MS = 1000 / 60;

/**
 * ★占有率の保存(B3検収・重大1): 止まりを「エピソード化」(1回数百ms)する時に、時間占有率
 * (動いているtick率)を旧`ghostMoveChance(mobility, stationaryFrac)`の値と一致させるための
 * 「1tickあたりの止まり開始確率」を逆算する。
 *
 * 導出(交互再生過程=alternating renewal process): 「動いている」区間の平均長Ta・「止まっている」
 * 区間の平均長Ts(=meanStillMs(dist))として、サイクル平均の占有率が
 *   targetOcc = Ta / (Ta + Ts)                         … (1)
 * を満たすようにしたい(targetOcc = 旧ghostMoveChanceの値=保存したい占有率)。
 * 「動いている」区間は、周期dtMsの各tickごとに確率pで止まりエピソードを開始する幾何試行なので、
 * 開始(=成功)までに費やす「動いている」tick数の期待値は幾何分布の平均 (1-p)/p 回、
 * これにdtMsを掛けたものがTa:
 *   Ta = dtMs * (1-p) / p                               … (2)
 * (2)を(1)へ代入してpについて解く:
 *   Ta = targetOcc/(1-targetOcc) * Ts =: K
 *   dtMs*(1-p)/p = K  ⇔  1/p = 1 + K/dtMs  ⇔  p = dtMs / (dtMs + K)
 * 境界確認: targetOcc→1(K→∞)でp→0(=止まらない)、targetOcc→0(K→0)でp→1(=毎tick止まる)と、
 * 直感どおりの極限に一致する。受け入れ条件(占有率が旧ghostMoveChanceの±10%以内)はこの式が
 * 保証する(旧: 発生率にmobilityをそのまま採用していたため、長さだけ伸びて占有率が反転していた
 * =実測62.5%→4.8%の事故)。
 */
export const stillStartChance = (targetOcc: number, meanStillDurationMs: number, dtMs: number): number => {
  const occ = clamp01(targetOcc);
  if (occ >= 1) return 0; // 常に動く=止まりを一度も開始しない
  if (dtMs <= 0) return clamp01(1 - occ); // 退避(理論上到達しない)
  const ts = Math.max(0, meanStillDurationMs);
  if (ts <= 0) return 0; // 止まりの長さが0なら「止まる」意味が無い=常に動く扱い
  const k = (occ * ts) / (1 - occ);
  return dtMs / (dtMs + k);
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
  // ★B3検収(中2): 録り側(playerTraits.ts)のbucket化はMath.floor(dist/DIST_BUCKET_PX)。ここも
  // 同じ丸めに揃える(旧Math.roundだと合成中心が最大+45pxズレ、録り側と写し側で間合いの噛み合わせが
  // ずれていた)。
  const centerIdx = Math.max(0, Math.min(DIST_BUCKET_COUNT - 1, Math.floor(centerPx / DIST_BUCKET_PX)));
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
