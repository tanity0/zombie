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

// --- 実行中の読み込み本数(v0.25.2230の事故対策) ---------------------------------
// 「進捗が一定時間動かない=停滞」でローディングを解除する保険(v0.25.2225)は、**並列ダウンロード**では
// 誤作動する: 7ファイルを同時に落とすと全部が完了するまで done が1つも増えず、遅い回線では
// 数秒〜十数秒「進捗ゼロ」に見えてしまい、読み込み途中で画面を出していた(社長報告v0.25.2230)。
// そこで「まだ返ってきていない通信が1本でもあるか」を別に数え、**在れば停滞と見なさない**。
let inFlight = 0;
export const loadRequestBegin = (): void => { inFlight++; };
export const loadRequestEnd = (): void => { inFlight = Math.max(0, inFlight - 1); };
export const getLoadInFlight = (): number => inFlight;
// 進行中の通信をひとまとめに追跡するヘルパ(begin/end の呼び忘れを防ぐ)。
export const trackLoad = <T>(p: Promise<T>): Promise<T> => {
  loadRequestBegin();
  return p.finally(loadRequestEnd);
};
