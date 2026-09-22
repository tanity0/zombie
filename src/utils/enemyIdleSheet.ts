// ★待機中(呼吸)の絵の**尺の正本**(社長支給2026-09-21「プラントの待機中(呼吸)」)。
// PixiJS非依存の純関数=ヘッドレスでテストできる(CLAUDE.md 実装精度の規律4)。
//
// ★**なぜ往復(ping-pong)か**: 支給された6コマは「閉じ気味 → 開いて正面 → わずかに戻る」で、
// **末コマ→先頭コマの差が隣の平均の 2.10倍**(隣の最大 19.6 より大きい 26.6)。
// 前方ループで繋ぐと**1周ごとに跳ねる**。往復なら跳ねない(歩きシートの判定と同じ指標)。
//
// ★**位相は線形**にする。**絵の側に既に加減速が描かれている**からで、
// (隣り合うコマの差が 17.3 / 19.6 / 16.5 / **7.0 / 2.9** と、吸い切る所で詰まっている=
//  息を吸い切った「溜め」が絵で表現されている)、ここへさらに ease を掛けると**二重になる**。
// ★代わりに**吐き切った所(先頭コマ)で一拍止める**。往復の折り返しは、止めないと
// 「速度が瞬間反転する」=慣性MUST違反になる。絵に無い側の溜めだけをこちらで足す。

/**
 * ★送り方。**呼吸のように行って戻るもの=`pingpong`** / **一方向に流れ続けるもの=`loop`**。
 * 絵の意味で選ぶ(髪や裾がなびく絵を往復させると、流れが逆走して嘘になる)。
 */
export type IdlePlayback = 'pingpong' | 'loop';

/** 先頭コマ(吐き切り)で止まる割合。1周期のうちこれだけを「止まっている時間」に充てる。`pingpong` 専用。 */
export const IDLE_PAUSE_FRAC = 0.2;

/**
 * 待機コマ番号(0 … frames-1 … 0 の往復 + 先頭での一拍)。
 *
 * @param frames    コマ数
 * @param nowMs     実時刻(ms)
 * @param phaseSeed 個体ごとの位相(0..2π 想定)。**群れが同時に呼吸しない**ための種。
 * @param periodMs  1周期(吸う→吐く→止まる)の長さ
 */
export const enemyIdleFrame = (
  frames: number, nowMs: number, phaseSeed: number, periodMs: number,
  playback: IdlePlayback = 'pingpong', pauseFrac: number = IDLE_PAUSE_FRAC,
): number | null => {
  if (frames <= 1 || !(periodMs > 0)) return null;
  const last = frames - 1;
  const t = (((nowMs / periodMs + phaseSeed / (Math.PI * 2)) % 1) + 1) % 1;
  // ★前方ループ: 末コマの次が先頭コマ。**一方向に流れ続けるもの**(髪や裾がなびく、滑る)向き。
  // 往復させると流れが逆走するので、絵の意味で選ぶ(下の `ENEMY_IDLE_PLAYBACK`)。
  if (playback === 'loop') return Math.min(last, Math.max(0, Math.floor(t * frames)));
  const pause = Math.min(0.8, Math.max(0, pauseFrac));
  if (t >= 1 - pause) return 0;                      // 吐き切ったまま止まっている
  const u = t / (1 - pause);                         // 0..1 = 吸って吐くまで
  const tri = u < 0.5 ? u * 2 : (1 - u) * 2;         // 往復(0→1→0)
  return Math.min(last, Math.max(0, Math.round(tri * last)));
};
