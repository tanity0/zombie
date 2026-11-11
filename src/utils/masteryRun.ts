// 熟練度: 出撃の間だけ生きる状態(research/MASTERY.md v2 §4-1・§5・§7 / v2.1 A-3・A-4・A-5)。
//
// ★依存の無い葉(store/React/PixiJS を読まない)。読むのは data/mastery(値の台帳の葉)だけ。
//   gameStore・useGameLoop・各 utils のどこから読んでも循環importにならない形に保つ。
//
// 持つ物:
//  ・いまの出どころ(`withMastery` が包んでいる間だけ立つ)
//  ・`pending` = この出撃で貯めた分(リザルトの commitMasteryRun で保存へ足す)
//  ・報告用の表 = ボットの `__BOT_REPORT__.masteryXp`(無視する出撃でも数える・保存へは流さない)
//  ・無視する出撃の旗(resetGame の時に1回だけ決め、beginMasteryRun で渡す)
import { isGrowingMasteryKey, MASTERY_PENDING_KEY, type GrowingMasteryKey, type MasteryKey } from '../data/mastery';

export type MasteryXpTable = Partial<Record<GrowingMasteryKey, number>>;

let source: MasteryKey | null = null;
let sourceExecute = false;
let pending: MasteryXpTable = {};
let report: MasteryXpTable = {};
let ignored = false;
let committed = false;

/** リザルトでの確定(utils/mastery.ts の commitMasteryRun)の1キーぶん。 */
export interface MasteryCommitEntry { before: number; after: number; levelBefore: number; levelAfter: number }
export type MasteryCommitResult = Partial<Record<GrowingMasteryKey, MasteryCommitEntry>>;
/** 直前の commitMasteryRun の結果。持ち主はここ(beginMasteryRun で空にするため)。 */
let lastCommit: MasteryCommitResult = {};
/** commitMasteryRun が結果を置く(utils/mastery.ts だけが呼ぶ)。 */
export const setLastMasteryCommit = (r: MasteryCommitResult): void => { lastCommit = { ...r }; };
/** 直前の commitMasteryRun の結果(写し)。 */
export const getLastMasteryCommit = (): MasteryCommitResult => ({ ...lastCommit });

/**
 * `fn` を呼んでいる間だけ「いまの出どころ」を `key` にする。入れ子は内側が勝つ。
 * 例外が出ても必ず元へ戻す。戻り値は `fn` の戻り値。
 */
export const withMastery = <T>(key: MasteryKey, fn: () => T, opts?: { execute?: boolean }): T => {
  const prev = source;
  const prevExecute = sourceExecute;
  source = key;
  sourceExecute = opts?.execute === true;
  try {
    return fn();
  } finally {
    source = prev;
    sourceExecute = prevExecute;
  }
};

/** いまの出どころ(包まれていなければ null)。 */
export const currentMasterySource = (): MasteryKey | null => source;
/**
 * いまの当たりが処刑(即死)か(`withMastery(key, fn, { execute: true })` で包んだ間だけ true)。
 * 処刑は熟練度の倍率が掛かっていない=中央の口は割り戻さず、残り体力までを量にする。
 */
export const currentMasteryExecute = (): boolean => sourceExecute;

/**
 * 出撃の始まり(resetGame から1回)。貯めた分・報告用の表を空にし、無視する出撃の旗を立てる/降ろす。
 * 旗は出撃の途中・リザルトで判定し直さない(v2.1 A-3)。
 */
export const beginMasteryRun = (opts: { ignored: boolean }): void => {
  ignored = opts.ignored;
  committed = false;
  pending = {};
  report = {};
  lastCommit = {}; // 直前の確定結果も空に(リザルトを通らなかった出撃の後に、前の出撃の結果が見えないように)
};

/** この出撃が熟練度を無視する出撃か(beginMasteryRun で立てた旗)。 */
export const isMasteryRunIgnored = (): boolean => ignored;

/** この出撃で commitMasteryRun が既に呼ばれたか。 */
export const isMasteryRunCommitted = (): boolean => committed;
/** commitMasteryRun が確定した時に立てる(utils/mastery.ts だけが呼ぶ)。 */
export const markMasteryRunCommitted = (): void => { committed = true; };

const addTo = (t: MasteryXpTable, key: GrowingMasteryKey, amount: number): void => {
  t[key] = (t[key] ?? 0) + amount;
};

/**
 * 貯める。育つキーだけ・四捨五入・0以下は捨てる。
 * 報告用の表には常に足す。`pending` へは、無視する出撃では足さない(v2 §7)。
 */
export const noteMasteryDamage = (key: MasteryKey | null | undefined, amount: number): void => {
  if (!isGrowingMasteryKey(key)) return;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return;
  const n = Math.round(amount);
  if (n <= 0) return;
  addTo(report, key, n);
  if (!ignored) addTo(pending, key, n);
};

/** この出撃で貯めた分(写し)。 */
export const getPendingMastery = (): MasteryXpTable => ({ ...pending });
/** 貯めた分を空にする。 */
export const clearPendingMastery = (): void => { pending = {}; };
/** 貯めた分に1つでも量があるか。 */
export const hasPendingMastery = (): boolean => Object.values(pending).some(v => (v ?? 0) > 0);

/** 報告用の表(写し)。ボットの `__BOT_REPORT__.masteryXp`。 */
export const getMasteryReport = (): MasteryXpTable => ({ ...report });
/** 報告用の表を空にする。 */
export const clearMasteryReport = (): void => { report = {}; };

/**
 * 退避(一時停止・裏へ回った時・ページを閉じる時)。メモリの `pending` を退避のキーへ**上書き**する
 * (足し込まない・空なら消す)。無視する出撃では何もしない(v2.1 A-3・A-4)。
 */
export const stashMasteryPending = (): void => {
  if (ignored) return;
  if (typeof localStorage === 'undefined') return;
  try {
    if (hasPendingMastery()) localStorage.setItem(MASTERY_PENDING_KEY, JSON.stringify({ xp: pending }));
    else localStorage.removeItem(MASTERY_PENDING_KEY);
  } catch { /* ignore (quota / private mode) */ }
};
