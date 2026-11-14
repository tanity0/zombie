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

/**
 * ★このタブで描画器(PixiStage)を作った回数(2026-10-17・社長実機「何度もリプレイしてたら落ちた。蓄積されてる」)。
 * 出撃・もう一度プレイ・コンテキストロストのたびに作り直す。「前回最後」の行に載せ、**何回目で落ちたか**を残す
 * (Chrome では何度作り直しても積み上がらない=実機の行だけが手がかり)。
 */
let rendererMounts = 0;
export const noteRendererMount = (): void => { rendererMounts++; };
export const rendererMountCount = (): number => rendererMounts;
/**
 * ★描画器を失った回数(WebGL のコンテキストロスト・2026-11-11・社長実機 v0.25.5480「格闘で通常プレイしてたら落ちた」=1回の出撃で 描画器6代目)。
 * 「何代目」だけでは、出撃を重ねたのか、遊んでいる最中に端末が描画のメモリを取り上げたのかが見分けられない=回数を別に残す。
 */
let contextLosts = 0;
export const noteContextLost = (): void => { contextLosts++; };
export const contextLostCount = (): number => contextLosts;
/** 格闘の秘奥義を出した回数(このタブで)。重い演出の直後に落ちたのかを見分ける手がかり。 */
let brawlerSecrets = 0;
export const noteBrawlerSecret = (): void => { brawlerSecrets++; };
export const brawlerSecretCount = (): number => brawlerSecrets;

export const stopCrashWatch = (): void => {
  if (timer !== null) { clearInterval(timer); timer = null; }
};
