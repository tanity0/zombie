// 起動ローディングの進捗カウンタ(社長指示v0.25.1776「ローディングの%表示を実装」)。
// 各ローダ(テクスチャ/背景/音声/フォント)が開始時に担当ユニット数を loadProgressBegin で
// 登録し、1ユニット完了ごとに loadProgressDone を呼ぶ。UI(TitleScreen)は subscribe で
// 読むだけ。ユニット=ファイル1個(サイズ非考慮の近似)だが、登録は全ローダとも
// ensurePreload の同一tick内=%が後から下がらない(単調増加)ことは保証される。
let total = 0;
let done = 0;
const listeners = new Set<() => void>();
const emit = () => { for (const fn of listeners) fn(); };

export const loadProgressBegin = (units: number): void => {
  if (units > 0) { total += units; emit(); }
};

export const loadProgressDone = (units = 1): void => {
  if (units > 0) { done += units; emit(); }
};

// 0..1。未登録(total=0)は 0 を返す。done がなんらかの理由で total を超えても 1 で止める。
export const getLoadProgress = (): number => (total <= 0 ? 0 : Math.min(1, done / total));

// --- 出撃ローディング用の「ウィンドウ」(v0.25.1827・社長指示「出撃ローディングにも%表示」) ---
// リセット時点を基準(base)にし、それ以降に登録された begin/done だけで%を出す。
// 起動時ロードで total/done が既に進んでいても、出撃時に 0% から始められる。
let baseTotal = 0;
let baseDone = 0;
export const loadProgressResetWindow = (): void => { baseTotal = total; baseDone = done; emit(); };
export const getLoadProgressWindow = (): number => {
  const t = total - baseTotal;
  const d = done - baseDone;
  return t <= 0 ? 0 : Math.min(1, d / t);
};

export const subscribeLoadProgress = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
