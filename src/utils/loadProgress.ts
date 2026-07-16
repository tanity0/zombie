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

export const subscribeLoadProgress = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
