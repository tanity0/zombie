// ベンチの計測コア(純関数)。**フレームの時刻列だけ**を入力にして統計を出す。
//
// ★なぜ書き直したか(v0.25.2690):
// 旧実装は `useGameLoop` の `fps`(**1秒に1回しか更新されない**フレーム数カウンタ)を
// 500ms 間隔でサンプリングしていた。つまり1段(計測2.4秒)で得られる**独立した観測は2〜3個**だけで、
// しかも同じ値を2回ずつ拾っていた。この解像度で「avg」「min」「drops」を出していたので、
// 同じ負荷を測り直すたびに数字が跳ねた(実際 G12 は 35.0 / 35.8 / 37.0 / 39.6 / 58.8 と暴れた)。
// → **自前の rAF でフレーム時刻を全部記録**し、そこから統計を出す(1段あたり100〜200観測)。
//
// もう1つの柱が **Δms(基準段との1フレームあたりの差)**。fps は 60 で頭打ちになる上に非線形なので、
// 端末が熱で遅くなった後半の段と、冷えている単独計測の段を**そのまま比べてはいけない**。
// フレーム時間(ms)は加算的なので、直前に測った基準段(canary)との差を取れば
// 「この負荷が1フレームに何ms足したか」が残る。これが系統・実行順・熱をまたいで比較できる唯一の量。

export interface FrameStats {
  avgFps: number;
  /** スライド1秒窓の最悪 fps(=体感の落ち込み)。 */
  minFps: number;
  /** 95パーセンタイルのフレーム時間(ms)。スパイクの指標。 */
  p95Ms: number;
  /** フレーム時間の標準偏差(ms)。**2つの計測が有意に違うかの判断に使う**。 */
  sdMs: number;
  /** 観測フレーム数(旧実装の「サンプル数2〜3」に対する解像度の証拠)。 */
  frames: number;
  spanMs: number;
}

export const EMPTY_FRAME_STATS: FrameStats = {
  avgFps: 0, minFps: 0, p95Ms: 0, sdMs: 0, frames: 0, spanMs: 0,
};

/** 連続フレームの間隔(ms)。時刻列は昇順前提(rAF の timestamp をそのまま積む)。 */
export const frameIntervals = (times: number[]): number[] => {
  const out: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    const dt = times[i] - times[i - 1];
    if (dt > 0) out.push(dt);
  }
  return out;
};

/**
 * スライド1秒窓の最悪 fps。旧実装の「1秒カウンタの最小値」と同じ意味だが、
 * **窓を250msずつずらして全部見る**ので、2.4秒の計測でも窓が6個取れる(旧は2個)。
 */
export const slidingMinFps = (times: number[], windowMs = 1000, stepMs = 250): number => {
  if (times.length < 2) return 0;
  const first = times[0];
  const last = times[times.length - 1];
  const span = last - first;
  // 計測窓が1秒に満たない時は、全体のレートをそのまま返す(窓が作れない)。
  if (span <= windowMs) return ((times.length - 1) * 1000) / span;
  let worst = Infinity;
  for (let s = first; s + windowMs <= last + 1e-6; s += stepMs) {
    const end = s + windowMs;
    let count = 0;
    for (let i = 0; i < times.length; i += 1) {
      const t = times[i];
      if (t < s) continue;
      if (t >= end) break;
      count += 1;
    }
    if (count < worst) worst = count;
  }
  return Number.isFinite(worst) ? worst : 0;
};

export const summarizeFrames = (times: number[]): FrameStats => {
  const intervals = frameIntervals(times);
  if (intervals.length === 0) return { ...EMPTY_FRAME_STATS };
  const spanMs = times[times.length - 1] - times[0];
  const mean = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
  const variance = intervals.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / intervals.length;
  const sorted = [...intervals].sort((a, b) => a - b);
  const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(0.95 * (sorted.length - 1)))];
  return {
    avgFps: mean > 0 ? 1000 / mean : 0,
    minFps: slidingMinFps(times),
    p95Ms,
    sdMs: Math.sqrt(variance),
    frames: times.length,
    spanMs,
  };
};

/**
 * 目標fpsより遅いフレームの割合(0..1)。旧実装の `drops`(1秒サンプルのうち40fps未満の個数)の
 * 置き換え。**個数だと計測長やfpsで意味が変わる**ので割合にする。
 */
export const slowFrameRatio = (times: number[], fpsFloor = 40): number => {
  const intervals = frameIntervals(times);
  if (intervals.length === 0) return 0;
  const floorMs = 1000 / fpsFloor;
  // 浮動小数の誤差で「ちょうど60fps」が遅い側に落ちないよう、わずかに余裕を持たせる。
  const slow = intervals.filter(v => v > floorMs + 1e-6).length;
  return slow / intervals.length;
};

/** fps → 1フレームの時間(ms)。0以下は0扱い(未計測)。 */
export const frameCostMs = (fps: number): number => (fps > 0 ? 1000 / fps : 0);

/**
 * 基準段(canary)からの増分コスト。**この段の負荷が1フレームに何ms足したか**。
 * 熱で端末全体が遅くなっても、基準段も同じだけ遅くなるので差は残る=実行順をまたいで比較できる。
 */
export const stageDeltaMs = (stageFps: number, canaryFps: number): number => {
  if (stageFps <= 0 || canaryFps <= 0) return 0;
  return frameCostMs(stageFps) - frameCostMs(canaryFps);
};

/**
 * 基準段の系列から「計測中に端末がどれだけ遅くなったか」を出す(熱ドリフト)。
 * 正の値=遅くなった(1フレームあたり+Xms)。**全系統の後半の段が信用できるかの判定に使う**。
 */
export const canaryDriftMs = (canaryFps: number[]): number => {
  const valid = canaryFps.filter(v => v > 0);
  if (valid.length < 2) return 0;
  return frameCostMs(valid[valid.length - 1]) - frameCostMs(valid[0]);
};

/**
 * ★熱ダレ補正(v0.25.2694)。
 *
 * 段は**重→軽の順**に走るので、**軽い段ほど熱い状態で測られる**。実測では1本(20〜30秒)の中で
 * 端末が +4.5〜+8.5ms 遅くなっており、これは強glow12個ぶんのコストに匹敵する=無視できない。
 *
 * 基準段でこれを打ち消したかったが、**この端末は強glow以外の負荷を全部60fpsで回してしまう**ので、
 * 頭打ちしない非glow基準段が作れなかった(v0.25.2692実測)。そこで**検算段(最初の段を最後に
 * もう一度)で実測した増加量 `shiftMs` を、経過時間で線形に按分して各段から引く**。
 *
 * 仮定: ドリフトは時間に対して線形。実際は頭打ちする曲線なので**近似**だが、
 * 「補正しない(=軽い段ほど不当に重く出る)」よりは確実に良い。**生値も併記して両方見せる。**
 */
export const driftAdjustedDeltaMs = (
  deltaMs: number,
  stageElapsedMs: number,
  spanMs: number,
  shiftMs: number
): number => {
  if (spanMs <= 0) return deltaMs;
  const ratio = Math.min(1, Math.max(0, stageElapsedMs / spanMs));
  return deltaMs - shiftMs * ratio;
};

/**
 * 2つの計測が有意に違うか。フレーム時間の標準偏差から標準誤差を出して比べる
 * (±2fps を一律の有意線にしていた運用の置き換え。**観測数が増えたので統計で言える**)。
 */
export const isSignificantDelta = (a: FrameStats, b: FrameStats): boolean => {
  if (a.frames < 8 || b.frames < 8) return false;
  const seA = a.sdMs / Math.sqrt(Math.max(1, a.frames - 1));
  const seB = b.sdMs / Math.sqrt(Math.max(1, b.frames - 1));
  const diff = Math.abs(frameCostMs(a.avgFps) - frameCostMs(b.avgFps));
  return diff > 2 * Math.sqrt(seA * seA + seB * seB);
};
