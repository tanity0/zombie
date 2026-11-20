// 実機デバッグ用エラービーコン(v0.25.3324・アクラシエル診断)。
//
// このプロジェクトには「例外を1回だけconsoleへ出して以後は握り潰す」try/catchが数カ所ある
// (drawEnemy / 天使コントローラ / 裏ボス / アイドル)。実機(スマホ)ではconsoleが見えないため、
// そこで何かが起きても**誰にも観測できない**——アクラシエルの「白く歪んだまま固まる」報告
// (v0.25.3205→3207→3323で3度目)の実例外源が特定できない根本原因。
// ⇒ 握り潰した例外の要約を保持し、ゲーム内左下のバージョン表示(Game.tsx)に赤字で出す。
// 表示は最初の1件を保持(後続で上書きしない=初発が原因である可能性が最も高いため)。
let last: string | null = null;
/**
 * 今の1件が「知らせ」(例外ではなく、自分で立ち直った事の記録=ループの張り直し)か。
 * ★知らせは後から来た本物の例外に席を譲る(社長実機 v0.25.5677「鞭でバグった」: 裏から戻った時の
 * `loop-stall`(243秒)が最初の1件の席を取り、その後に描画で起きた例外が画面に出ず、原因が名指しできなかった)。
 */
let lastSoft = false;

/** 自分で立ち直った事の知らせとして残す(席が空いている時だけ)。後から本物の例外が来たら上書きされる。 */
export const reportSoftNotice = (tag: string, err: unknown): void => {
  if (last !== null) return;
  reportSuppressedError(tag, err);
  lastSoft = true;
};

/** 握り潰しcatchから呼ぶ。最初の1件だけ保持する(知らせ=reportSoftNotice の後なら上書きする)。 */
export const reportSuppressedError = (tag: string, err: unknown): void => {
  if (last !== null && !lastSoft) return;
  lastSoft = false;
  const e = err as Error | undefined;
  // メッセージ+スタック先頭1行(発生関数と行番号)だけの短い要約にする。
  const stackLine = (e?.stack ?? '').split('\n').find(l => l.includes('at ')) ?? '';
  last = `${tag}: ${e?.message ?? String(err)} ${stackLine.trim()}`.slice(0, 180);
};

/** 表示側(Game.tsx の ErrBeaconDebug)が1秒間隔で読む。無ければnull。 */
export const lastSuppressedError = (): string | null => last;

/**
 * ビーコンを再アームする(research/BOSS_GAUNTLET.md 検出器5)。**次の1件をまた拾えるようにするだけ**で、
 * 例外の握り潰し方は変えない。
 *
 * ★なぜ要るか: 保持は「最初の1件だけ」=**ページ寿命**なので、1タブで連続して何戦も回す
 * (ボス・ガントレット)と**2戦目以降が丸ごと無音**になる。戦いの切れ目で明示的に再アームする。
 * 通常プレイでは誰も呼ばない=挙動は従来どおり。
 */
export const rearmSuppressedError = (): void => { last = null; lastSoft = false; };

/**
 * ★捕まえていない例外も画面に出す(v0.25.4347・社長報告「めっちゃゲーム中に落ちる」)。
 *
 * 既存のビーコンは**握り潰した try/catch からの自己申告**しか拾えない。つまり
 * **どこにも catch が無い所で落ちた時は画面に何も出ない**=実機で「落ちた」としか分からず、
 * こちらは推測するしかなくなる(この数日それで何度も外した)。
 * `window.onerror` と `unhandledrejection` を同じビーコンへ繋いで、**最初の1件を赤字で出す**。
 *
 * ★これは計測器であって挙動ではない: 例外は握り潰さない(既定の伝播はそのまま)。
 * 保持は最初の1件だけ(後続で上書きしない)=初発が原因である可能性が最も高いため。
 */
export const installGlobalErrorBeacon = (): void => {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (ev: ErrorEvent) => {
    // 画像/音声の読み込み失敗もここへ来る(ev.error が無い)。素材の取りこぼしも実機で見たいので出す。
    if (!ev.error) {
      const t = ev.target as { src?: string; tagName?: string } | null;
      if (t && t.src) { reportSuppressedError('load', new Error(`${t.tagName ?? ''} ${String(t.src).slice(-60)}`)); return; }
    }
    reportSuppressedError('uncaught', ev.error ?? new Error(ev.message));
  }, true); // capture=true: 読み込み失敗は bubble しない
  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    reportSuppressedError('promise', ev.reason);
  });
};
