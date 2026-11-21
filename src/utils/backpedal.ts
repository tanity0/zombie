// ★後ずさり(社長指示2026-09-30「敵がこちらをターゲティングして距離を離そうとしている時は、こちらを向きながら後退る感じにして」)。
// 描画だけが読む純関数(判定・移動・AIは1つも変えない)。
//
// 「離れようとしている」= 実際の移動が、プレイヤーから遠ざかる向き。
// その間は ①体をプレイヤーの側へ向けたまま(進む向きへ振り向かない) ②歩きのコマを逆に送る(=後ろへ下がる足取り)。
// 逃走中(ハンターの逃げ)・休眠中は「狙っていない」ので対象外=従来どおり進む向きへ向いて歩く。

/** 移動(dx,dy)が、敵→プレイヤーの向き(tx,ty)から遠ざかっているか(内積が負)。 */
export const isBackingAway = (dx: number, dy: number, tx: number, ty: number): boolean =>
  dx * tx + dy * ty < 0;

/**
 * 横の移動(vx・px/s)で振り向く敵の向きを、後ずさり中だけプレイヤーの側へ固定する。
 * 戻り値: プレイヤーの居る側(+1=右 / -1=左)。後ずさりでなければ 0(=従来どおり進む向きで決める)。
 */
export const backpedalFaceSide = (vx: number, enemyCx: number, playerCx: number, deadzone = 25): 1 | -1 | 0 => {
  const side = playerCx >= enemyCx ? 1 : -1;
  if (Math.abs(vx) <= deadzone) return 0;
  return Math.sign(vx) === -side ? side : 0;
};
