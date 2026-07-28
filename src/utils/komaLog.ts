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

/**
 * 「いま現在」の較正値(v0.25.2374)。**コマ境界とは無関係に毎tick上書きする**。
 *
 * なぜ要るのか(実機テストチャットの指摘①): コマは `relax→harvest→normal→peak` の順で巡回し、
 * 記録されるのは normal/peak の**終了時だけ**。コマ長は base 40秒なので**最初の1件が出るまで最短2分**で、
 * 実測では **99.5秒で死んだランが `{koma:0}`**(=成果ゼロ)になった。
 * しかし較正に本当に要る量(窓の達成率・撃破数・被弾)は**コマ境界と無関係に常時進んでいる**。
 * ここに毎tick焼いておけば、**コマが1つも閉じていないランからでも数字が取れる**。
 */
export interface KomaLiveSnapshot {
  atMs: number;
  rank: number;
  dist: number;
  windowsAtRank: number;
  windowsClearing: number;
  hitStreakMs: number;
  /** ラン累計の撃破数(較正の主役)。 */
  kills: number;
  /** ラン累計の被弾数(無敵700msがあるので「ダメージが入ったフレーム」=1被弾)。 */
  hitsTotal: number;
}

let enabled = komaLogParamOn();
let records: KomaLogRecord[] = [];
let live: KomaLiveSnapshot | null = null;
let liveHits = 0;
let loggedThisRun = false;

/** 収集を有効化(ヘッドレスの計測ラン。実機は `?komalog=1` で自動的に有効)。 */
export const enableKomaLog = (): void => { enabled = true; };
export const isKomaLogEnabled = (): boolean => enabled;
export const resetKomaLog = (): void => { records = []; live = null; liveHits = 0; loggedThisRun = false; };
export const getKomaLog = (): readonly KomaLogRecord[] => records;

/**
 * 毎tickの現況を焼く(無効時は**何もしない**)。呼ぶのは `directorTick` の1箇所だけ。
 * `atMs` が**巻き戻ったら新しいランが始まった**と見なして自動でリセットする
 * (1回のページ読み込みで死亡→リトライを繰り返しても、要約が前のランと混ざらない)。
 */
export const tickKomaLive = (s: Omit<KomaLiveSnapshot, 'hitsTotal'> & { hitThisFrame: boolean }): void => {
  if (!enabled) return;
  if (live && s.atMs < live.atMs) { records = []; liveHits = 0; loggedThisRun = false; }
  if (s.hitThisFrame) liveHits += 1;
  live = {
    atMs: s.atMs, rank: s.rank, dist: s.dist,
    windowsAtRank: s.windowsAtRank, windowsClearing: s.windowsClearing, hitStreakMs: s.hitStreakMs,
    kills: s.kills, hitsTotal: liveHits,
  };
};

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

/**
 * 較正に必要な数字だけの要約。実機の社長がそのままコピーして渡せる粒度にする。
 *
 * **正本は `live`(毎tickの現況)で、コマ記録は `koma` 件数と最大値の補強にしか使わない**(v0.25.2374)。
 * 旧版は「records が空なら `{koma:0}` を返して終わり」だったため、**2分未満のランが丸ごと無駄**になっていた。
 */
export const komaLogSummary = (): Record<string, number> => {
  const n = records.length;
  if (n === 0 && !live) return { koma: 0 };
  const last = n > 0 ? records[n - 1] : null;
  const atMs = live?.atMs ?? last?.atMs ?? 0;
  const windowsAtRank = live?.windowsAtRank ?? last?.pace?.windowsAtRank ?? 0;
  const windowsClearing = live?.windowsClearing ?? last?.pace?.windowsClearing ?? 0;
  return {
    koma: n,
    finalRank: live?.rank ?? last?.rank ?? 0,
    maxRank: records.reduce((a, r) => Math.max(a, r.rank), live?.rank ?? 0),
    maxDist: Math.round(records.reduce((a, r) => Math.max(a, r.dist), live?.dist ?? 0)),
    runMinutes: Math.round((atMs / 60000) * 10) / 10,
    // 較正の主役。「1つの窓(30秒)で何体捌けたら昇格に値するか」を決めるための実測値。
    kills: live?.kills ?? 0,
    hitsTotal: live?.hitsTotal ?? records.reduce((a, r) => a + (r.input.hits ?? 0), 0),
    hitStreakMs: Math.round(live?.hitStreakMs ?? 0),
    // M50の較正で見たい2つ。窓の達成率が「昇格に必要な50%」に対してどこにいるか。
    windowsAtRank,
    windowsClearing,
    clearRatePct: windowsAtRank > 0
      ? Math.round((windowsClearing / windowsAtRank) * 1000) / 10
      : 0,
  };
};

/**
 * ラン終了時に呼ぶ。コンソールへ要約を出す(社長がそのままコピーして渡せる)。
 * **同じランで何度呼ばれても1回しか出さない**(死亡の瞬間とリザルト画面の両方から呼ばれるため)。
 */
export const logKomaSummary = (): void => {
  if (!enabled || loggedThisRun) return;
  loggedThisRun = true;
  console.log('[KOMA_LOG]', JSON.stringify(komaLogSummary()));
};

/**
 * 何ラン目かの採番。ヘッドレスのハーネスがラン開始ごとに `.current` を進める。
 * ref 形式にしているのは、directorTick が毎tick読む側で、値の差し替えを1箇所で行いたいため。
 */
export const komaLogRunRef: { current: number } = { current: 0 };
