// ★ゆっくり送る会話の行(ステージ4のジュンの離脱の一言)の「今、何文字出ているか」(コード監査2026-10-23 UI B-2③・社長承認)。
//
// 旧: 1文字ごとに setTimeout を鎖で張っていた=重い時にタイマーが後回しにされると、**名前だけ出て本文が空**のまま止まった。
// いまは表示を始めてからの経過時間(実時間)からこの関数で文字数を出し、描画の周期(rAF)で読み直す。
// 送りの速さ・三点リーダの溜めは旧実装と同じ: 1文字目は SLOW_CHAR_MS 後、以後は1文字ごとに SLOW_CHAR_MS、
// ただし「次に出す文字が三点リーダ」の時だけ SLOW_ELLIPSIS_PAUSE_MS 待つ(言い淀み)。

export const SLOW_CHAR_MS = 120;
export const SLOW_ELLIPSIS_PAUSE_MS = 520;

/** `chars`(Array.from 済み)のうち、表示開始から `elapsedMs` 経った時点で出ている文字数。 */
export const slowLineVisibleChars = (chars: readonly string[], elapsedMs: number): number => {
  let at = SLOW_CHAR_MS; // 1文字目が出る時刻
  let n = 0;
  while (n < chars.length && elapsedMs >= at) {
    n += 1;
    if (n >= chars.length) break;
    at += chars[n] === '…' ? SLOW_ELLIPSIS_PAUSE_MS : SLOW_CHAR_MS;
  }
  return n;
};
