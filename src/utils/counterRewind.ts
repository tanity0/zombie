/**
 * ★カウンターの「跳ね返した」手応え(社長指示2026-09-23「カウンターで跳ね返してる感じが欲しい。
 * 数コマだけ逆再生するとかで対応するとそれっぽくならないかな?(武器絵も)」)。
 *
 * それまでの挙動: カウンターが**着弾より前**に成立すると、技の絵のラッチは**削除**されていた
 * (`pixiScene.latchCounterCancelled`・v0.25.3986)。つまり武器も本体の攻撃コマも**その場で消える**=
 * 弾かれた動きが1コマも描かれない。だから跳ね返した感じが出ていなかった。
 *
 * ここは「消す」を「**戻す**」に置き換えるための**純粋な時計**。描画専用で、判定・座標・状態機械には
 * 一切触れない(CLAUDE.md「PixiJSは描画のみ」)。
 *
 * 掟:
 * - **等速で戻さない**(CLAUDE.md 慣性MUST)。弾かれた腕は**最初が速く、戻りながら減速して止まる**。
 *   等速の巻き戻しは「ビデオの逆再生」で、現実にそういう動きは無い。
 * - **赤い予告は巻き戻さない。** 赤は「ここに当たる」の約束(掟③「消え切る時刻=当たる時刻」)なので、
 *   戻すと嘘になる。**戻すのは体と武器の絵だけ。**
 * - **コマ数ではなく時間で指定する。** シートは6〜16コマとばらつくので「3コマ戻す」だと敵ごとに
 *   戻る量が変わる。時間で決めれば、どのシートでも同じ速さで戻る。
 */

/** 巻き戻しの長さ(ms)。実機で詰める前提の叩き台。 */
export const COUNTER_REWIND_MS = 140;

/**
 * 戻りのイージング(ease-out): 0→1 を返す「どれだけ戻ったか」。
 * 最初が速く、終わりへ向けて減速する=**弾かれて戻り、止まる**。
 */
export const counterRewindEase = (k: number): number => {
  const c = Math.max(0, Math.min(1, k));
  return 1 - (1 - c) * (1 - c);
};

/**
 * 巻き戻し中の「絵の時計」。`fromMs` = カウンターが刺さった瞬間の経過ms(=そこまで再生していた所)。
 * 戻り切った(または範囲外)なら **null**(呼び出し側は絵を出さない=ここで消える)。
 */
export const counterRewindElapsed = (
  fromMs: number, sinceCounterMs: number, durMs: number = COUNTER_REWIND_MS,
): number | null => {
  if (!(durMs > 0) || !(fromMs > 0)) return null;
  if (sinceCounterMs <= 0) return fromMs;
  if (sinceCounterMs >= durMs) return null;
  return fromMs * (1 - counterRewindEase(sinceCounterMs / durMs));
};

/**
 * シートのコマ番号を戻す版。`fromFrame` = カウンターの瞬間に出ていたコマ。
 * 0コマ目(構えの先頭)へ向かって戻り、戻り切ったら null。
 * ★`frames` は戻る先の下限を決めるだけで、**コマ数が違っても戻る速さは同じ**(時間で決めているため)。
 */
export const counterRewindFrame = (
  fromFrame: number, sinceCounterMs: number, durMs: number = COUNTER_REWIND_MS,
): number | null => {
  // ★戻る先が無いなら何も出さない(v0.25.4594・クリエイティブ監査 指摘1)。
  // 0コマ目でカウンターされた技(例: 伐採人の薙ぎは溜めが**1コマだけ**=`{windup:1,...}`ので、
  // 着弾前に成立するカウンターの瞬間は必ずコマ0)は、戻すコマが1枚も無い。ここで null を返さないと
  // **構えの絵のまま窓のぶん止まる**=社長が最初に「バグってるみたい」と言った「絵が固まる」に戻る。
  if (!(durMs > 0) || fromFrame <= 0) return null;
  if (sinceCounterMs <= 0) return fromFrame;
  if (sinceCounterMs >= durMs) return null;
  const back = counterRewindEase(sinceCounterMs / durMs);
  return Math.max(0, Math.round(fromFrame * (1 - back)));
};

/**
 * ★**もう終わった技を巻き戻さない**(社長報告2026-09-24
 * 「ジャンプ攻撃してくる→着地→硬直→**なぜか見た目だけ小ジャンプして戻る**」)。
 *
 * 巻き戻しは「**カウンターで中断された技**」の絵を戻すためのもの。ところが覚えているコマは
 * 技が終わっても残るので、**その後で刺さったカウンター**が古いコマを掴んで逆再生していた。
 * 蜘蛛で起きると**着地のコマ → 滞空 → しゃがみ**と140msで遡り、
 * **もう一度小さく跳んで戻ったように見える**(実測: コマ10→6→3→1→0)。
 *
 * ⇒ **打刻(カウンター成立)の直前に描かれたコマだけ**を巻き戻しの対象にする。
 *   それより古ければ「その技はもう終わっている」= 戻す相手がいない。
 *
 * ★窓を広く取りすぎないこと。技が終わってから窓のぶんだけは**まだ掴める**ので、
 *   「数フレームの取りこぼしを許す」以上には広げない(既定=120ms≒7フレーム)。
 */
export const COUNTER_REWIND_FRESH_MS = 120;

export const counterRewindIsFresh = (
  memoAtMs: number, counteredAtMs: number, freshMs: number = COUNTER_REWIND_FRESH_MS,
): boolean => counteredAtMs - memoAtMs <= freshMs;
