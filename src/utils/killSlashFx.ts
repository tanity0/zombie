// KILL時の首元斬撃(fx/kill-slash・社長指示2026-09-16「KILL時に敵の首元に流して斬撃を演出」)の
// 純粋計算だけを切り出す。renderer非依存・storeにもPixiにも依存しない(CLAUDE.md 実装精度の規律4:
// 配線ロジックは純関数に切り出してテスト)。
//
// このファイルが持つのは2つだけ:
//   1) 敵の当たり箱から「首元」の座標を出す(killSlashNeckPosition)
//   2) 横並びシートの経過進捗からコマindexを出す(pickImageEffectFrame・kill-slash専用ではなく
//      pixiScene.ts の drawImageEffect 汎用コマ送りが使う)

/**
 * 敵の当たり箱(x,y=左上・width/height)から「首元」を計算する。
 *
 * 敵の当たり箱は足元(下端)が foot という規約(src/world/obstacles.ts のオブジェクト convention と
 * 同じ考え方)なので、上端側が頭寄りになる。pixiScene.ts のホーミングロック(§16近く・行13918)が
 * 「頭のあたり」を `enemy.y + enemy.height * 0.28` として扱っているのと同じ作法で、首(頭の付け根=
 * 頭より少し下)はそれよりやや大きい比率にする。
 */
export const KILL_SLASH_NECK_HEIGHT_RATIO = 0.34;

export interface EnemyBoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function killSlashNeckPosition(enemy: EnemyBoxLike): { x: number; y: number } {
  return {
    x: enemy.x + enemy.width / 2,
    y: enemy.y + enemy.height * KILL_SLASH_NECK_HEIGHT_RATIO,
  };
}

/**
 * 横並びシートのコマ送り: 経過進捗(0=開始 / 1=終了)から今出すコマのindexを返す。
 * - 進捗0で0コマ目、進捗1で最終コマ(cols-1)で止める(ループしない)。
 * - 範囲外の進捗(負・1超)はクランプする。
 * - cols が1以下・NaN・Infinity などの壊れた値でも例外を投げず0を返す。
 */
export function pickImageEffectFrame(progress: number, cols: number): number {
  if (!Number.isFinite(cols) || cols <= 1) return 0;
  const t = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  return Math.min(cols - 1, Math.floor(t * cols));
}
