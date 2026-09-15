/**
 * 実機で「増え続けていないか」を見るためだけの小さな窓口(v0.25.4347)。
 *
 * 社長報告「**めっちゃゲーム中に落ちる**」。落ちる原因として一番ありがちなのは
 * **描画オブジェクトが解放されずに増え続ける**ことだが、スマホでは開発者ツールが無く、
 * 増えているのかどうかすら確認できない。だから**画面に出す**。
 * 書き込みは数値の代入1つ=毎フレーム呼んでも実質ゼロコスト(React も起こさない)。
 */
let effectSprites = 0;
let effectItems = 0;

export const setRenderStats = (sprites: number, items: number): void => {
  effectSprites = sprites;
  effectItems = items;
};

/** 表示側(Game.tsx の ErrBeacon が1秒ごとに読む)。 */
export const renderStatsText = (): string => `fx ${effectItems}/${effectSprites}`;
