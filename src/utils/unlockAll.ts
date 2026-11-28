// 開発用「すべて解放」スイッチ(社長指示2026-11-28「資料や技、武器など、全てを解放、解除するオプションほしい」)。
//
// ★掟: **保存されている進行の記録は1バイトも書き換えない。** オンの間だけ、各「解放されているか」の判定が
// 「本来の判定 || isUnlockAllOn()」になる=全部解放済みに見える。オフにすれば元の進み具合に戻る。
// - 書き込み側(初めて解放した時だけ true を返す mark 系・年表・実績)は**本来の記録だけ**を見る。
//   ここを通すと「既に解放済み」と誤読して本物の記録が書かれなくなる(=オフにした時に進行が消えて見える)。
// - 依存ゼロの葉(store / PixiJS / data を読まない)=どこから読んでも循環しない。
// - 入力のたびに引かれる判定(格闘の技など)があるので、読み込みは1回だけ・書くたびにメモリも更新する。

export const UNLOCK_ALL_KEY = 'dev.unlockAll.v1';

let cache: boolean | null = null;

/** 開発用「すべて解放」がオンか。 */
export const isUnlockAllOn = (): boolean => {
  if (cache !== null) return cache;
  let v = false;
  try { v = typeof localStorage !== 'undefined' && localStorage.getItem(UNLOCK_ALL_KEY) === '1'; } catch { v = false; }
  cache = v;
  return v;
};

/** 切り替える(オプション画面の開発用の項目から)。 */
export const setUnlockAllOn = (on: boolean): void => {
  cache = on;
  try {
    if (typeof localStorage === 'undefined') return;
    if (on) localStorage.setItem(UNLOCK_ALL_KEY, '1');
    else localStorage.removeItem(UNLOCK_ALL_KEY);
  } catch { /* 書けなくてもこの起動中はメモリの値で効く */ }
};

/** テスト用: メモリの値を捨てて localStorage から読み直す。 */
export const resetUnlockAllCacheForTest = (): void => { cache = null; };

/** 本来の集合に、オンの間だけ全部を足した集合(元の集合は変えない=コピーを返す)。 */
export const withUnlockAll = <T>(real: Iterable<T>, all: Iterable<T>): Set<T> => {
  const out = new Set<T>(real);
  if (isUnlockAllOn()) for (const v of all) out.add(v);
  return out;
};
