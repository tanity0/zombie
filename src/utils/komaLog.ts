// コマ査定の**生データ収集**(社長指示v0.25.2356)。ランク査定をスコア制へ作り替えるにあたり、
// 「式をゲームに実装する前に、実測ログの上で係数と閾値を掃引して決める」ための計測層。
//
// 掟:
// - **ゲームの判定には一切使わない。** ここは記録するだけで、誰も読んで分岐しない。
//   (査定の正本は rankAssessor.assessKomaDelta / combineCycleDelta のまま=挙動は完全に不変)
// - 既定は**無効**。`enable()` を呼んだ時だけ溜める(通常プレイ/実機で無駄なメモリを使わない)。
// - 上限つきリングではなく単純な配列。ヘッドレスのラン単位で reset して使う想定。
//   暴走時の保険として MAX_RECORDS で頭打ちにする。
import type { KomaAssessmentInput } from './rankAssessor';

/** コマ1つぶんの記録。査定に使う量 + それがどんな状況だったか。 */
export interface KomaLogRecord {
  /** 何ラン目か(呼び出し側が採番。ヘッドレスの掃引でランを跨いで集計するため)。 */
  run: number;
  /** ラン開始からの経過ms(コマ終了時点)。 */
  atMs: number;
  /** このコマの種別。査定されるのは normal / peak のみ。 */
  kind: 'relax' | 'harvest' | 'normal' | 'peak';
  /** このコマ終了時点のランク(1..7)。 */
  rank: number;
  /** 原点からの距離(px=m扱い)。エリア(深さ)の逆進性を見るために要る。 */
  dist: number;
  /** 最大HP(dmgRatio の分母。HPビルドの影響を後から外すために生値も残す)。 */
  maxHealth: number;
  /** このコマの査定入力そのもの(hits を含む)。 */
  input: KomaAssessmentInput;
  /** 現行式が出した判定(-1/0/+1)。新旧の比較用。 */
  delta: -1 | 0 | 1;
  /**
   * M50(§6.27): 連続査定(RankPaceState)のこの記録時点のスナップショット(較正用・任意)。
   * コマ境界とは無関係に常時進む量なので、コマ側の記録に「その瞬間どうだったか」を添えるだけ
   * (このログ自体はここでも判定に使わない=記録専用)。
   */
  pace?: { windowsAtRank: number; windowsClearing: number; hitStreakMs: number };
}

const MAX_RECORDS = 20000;

/**
 * 実機からの有効化(社長指示v0.25.2370「実機テストの改良」)。**`?komalog=1` の時だけ収集する**。
 *
 * なぜ要るのか: ランク査定の較正に必要な「人間が1分に何体捌くか」は、**ヘッドレスのボットでは測れない**
 * (実測: master が4分で10体しか倒せず、被弾もほぼ0で降格側は一度も発火しなかった)。
 * 実機で社長が普通に遊んだ1ランのログが、いちばん確かな較正データになる。
 *
 * 既定は無効なので、通常プレイでは1バイトも溜まらない(記録も判定も一切行わない)。
 * SSR/ヘッドレスでは `window` が無いので false から始まり、テストハーネスが `enableKomaLog()` を呼ぶ。
 */
const komaLogParamOn = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('komalog') === '1';
  } catch { return false; }
};

let enabled = komaLogParamOn();
let records: KomaLogRecord[] = [];

/** 収集を有効化(ヘッドレスの計測ラン。実機は `?komalog=1` で自動的に有効)。 */
export const enableKomaLog = (): void => { enabled = true; };
export const isKomaLogEnabled = (): boolean => enabled;
export const resetKomaLog = (): void => { records = []; };
export const getKomaLog = (): readonly KomaLogRecord[] => records;

/** 1コマぶん記録する。無効時は**何もしない**(通常プレイのコストをゼロにする)。 */
export const recordKoma = (r: KomaLogRecord): void => {
  if (!enabled || records.length >= MAX_RECORDS) return;
  records.push(r);
};

/** JSONL(1行1レコード)へ。ヘッドレスの出力用。 */
export const komaLogToJsonl = (): string => records.map(r => JSON.stringify(r)).join('\n');

/**
 * 実機でログを取り出すための窓口(社長指示v0.25.2370)。`?komalog=1` の時だけ生える。
 * 既存の `window.__BOT_REPORT__`(M26-L)と同じ作法で、**開発者ツールのコンソールから読める**ようにする。
 *   `__KOMA_LOG__.jsonl()` … 全レコードをJSONL文字列で
 *   `__KOMA_LOG__.summary()` … 1ランの要約(較正に必要な数字だけ)
 * ラン終了時に呼び出し側が `logKomaSummary()` を1回叩く(コンソールにも出す=コピペで送れる)。
 */
export const exposeKomaLog = (): void => {
  if (!enabled || typeof window === 'undefined') return;
  (window as unknown as Record<string, unknown>).__KOMA_LOG__ = {
    jsonl: () => komaLogToJsonl(),
    records: () => records,
    summary: () => komaLogSummary(),
  };
};

/** 較正に必要な数字だけの要約。実機の社長がコンソールからコピーして渡せる粒度にする。 */
export const komaLogSummary = (): Record<string, number> => {
  const n = records.length;
  if (n === 0) return { koma: 0 };
  const last = records[n - 1];
  const sum = (f: (r: KomaLogRecord) => number): number => records.reduce((a, r) => a + f(r), 0);
  return {
    koma: n,
    finalRank: last.rank,
    maxRank: records.reduce((a, r) => Math.max(a, r.rank), 1),
    maxDist: Math.round(records.reduce((a, r) => Math.max(a, r.dist), 0)),
    runMinutes: Math.round((last.atMs / 60000) * 10) / 10,
    hitsTotal: sum(r => r.input.hits ?? 0),
    // M50の較正で見たい2つ。窓の達成率が「昇格に必要な50%」に対してどこにいるか。
    windowsAtRank: last.pace?.windowsAtRank ?? 0,
    windowsClearing: last.pace?.windowsClearing ?? 0,
    clearRatePct: last.pace && last.pace.windowsAtRank > 0
      ? Math.round((last.pace.windowsClearing / last.pace.windowsAtRank) * 1000) / 10
      : 0,
  };
};

/** ラン終了時に1回だけ呼ぶ。コンソールへ要約を出す(社長がそのままコピーして渡せる)。 */
export const logKomaSummary = (): void => {
  if (!enabled) return;
  console.log('[KOMA_LOG]', JSON.stringify(komaLogSummary()));
};

/**
 * 何ラン目かの採番。ヘッドレスのハーネスがラン開始ごとに `.current` を進める。
 * ref 形式にしているのは、directorTick が毎tick読む側で、値の差し替えを1箇所で行いたいため。
 */
export const komaLogRunRef: { current: number } = { current: 0 };
