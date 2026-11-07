/**
 * PC キーボードの被弾反撃の入力(research/HIT_RETALIATION.md・社長報告2026-10-16「PCで反撃(赤カウンター)が発動しない」)。
 *
 * スマホは「フリックして離す」、パッドは「ニュートラルから倒す」が反撃の入力。キーボードにはどちらも無く、
 * 反撃の入口が1つも無かった(右クリックだけ=マウス)。ここでは**方向キーの新しい押下**(押しっぱなしの repeat は除く)を
 * 「その方向へはじいた」入力として扱い、押した後の合成方向(斜め可)を返す。窓・±45°・相手の有効性は store 側
 * (`tryHitRetaliation`)が判定するので、ここは向きを作るだけ。純関数(実装精度の規律4)。
 */
export interface MoveInputLike { up: boolean; down: boolean; left: boolean; right: boolean }

export const keyRetaliationDir = (input: MoveInputLike, repeat: boolean): { x: number; y: number } | null => {
  if (repeat) return null;
  let dx = 0, dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (dx === 0 && dy === 0) return null;
  const l = Math.hypot(dx, dy);
  return { x: dx / l, y: dy / l };
};
