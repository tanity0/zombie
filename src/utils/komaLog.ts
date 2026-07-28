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
let enabled = false;
let records: KomaLogRecord[] = [];

/** 収集を有効化(ヘッドレスの計測ランだけで呼ぶ)。 */
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
 * 何ラン目かの採番。ヘッドレスのハーネスがラン開始ごとに `.current` を進める。
 * ref 形式にしているのは、directorTick が毎tick読む側で、値の差し替えを1箇所で行いたいため。
 */
export const komaLogRunRef: { current: number } = { current: 0 };
