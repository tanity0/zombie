/**
 * ★「落ちたら勝手にタイトルへ戻る」を観測するための記録(v0.25.4349)。
 *
 * 社長報告「**落ちた時はトップに戻っちゃうのでステータスなんて見れないよ**」。
 * そのとおりで、**ページごと再読み込みされる=画面の計測器は道連れで消える**。
 * これは JS の例外ではなく、**端末のメモリ天井でタブが落とされた時の形**
 * (`pixiTextures.ts` にこのプロジェクト自身の前例が記録されている)。
 *
 * ⇒ 生きている間の値を **localStorage へ置いておき、次の起動でそれを読んで画面に出す**。
 * 落ちた瞬間そのものは撮れなくても、**落ちる直前の数字**は必ず残る。
 * 書き込みは2秒に1回の小さな文字列1本(プレイ中の負荷にはならない)。
 */
const KEY = 'zombie:lastbeat';

let prev: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/** 起動時に1回。前回の最後の記録を拾って保持する(表示は Game.tsx の左下)。 */
export const loadPrevBeat = (): void => {
  try { prev = window.localStorage.getItem(KEY); } catch { prev = null; }
};

/** 前回の最後の記録(無ければ null)。 */
export const prevBeatText = (): string | null => prev;

/**
 * 生存記録を刻み始める。`sample()` は「今の状態を短い文字列で」返す関数。
 * 呼び側(Game.tsx)が、版数・経過・表示物の数・テクスチャの見積りを詰める。
 */
export const startCrashWatch = (sample: () => string): void => {
  if (timer !== null) return;
  timer = setInterval(() => {
    try { window.localStorage.setItem(KEY, sample()); } catch { /* 容量/プライベートモードでは黙って諦める */ }
  }, 2000);
};

export const stopCrashWatch = (): void => {
  if (timer !== null) { clearInterval(timer); timer = null; }
};
