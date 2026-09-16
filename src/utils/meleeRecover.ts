/**
 * ★近接を振った「あと」の硬直(社長指示2026-09-16)。
 *
 * 社長の言葉: 「**振った直後にディレイが入るのはいいと思うけど。振り中の移動速度が下がっちゃうと、
 * 回避として使いづらくなっちゃうのが懸念**」。
 *
 * ★前提(社長の指摘): **踏み込み斬りは「回避としての使い方」ができるのがメリット**。
 * だから**振っている間は素の足のまま**にする。重さは**振り終わってから**乗せる。
 *  - 踏み込み(`lungeUntil`・90ms)は movePlayer の別の枝(`player.lungeVx`)で動いており、
 *    この関数が返す倍率は**そこには一切掛からない**=回避の出だしと伸びは1mmも変わらない。
 *  - 振り1サイクル(前隙200+刃200=`COUNTER_WINDOW`)の間も倍率は1。逃げ切るまでは素の足。
 *  - **サイクルが終わってから**この硬直が開く=「振り切った体が流れて、立て直すまで足が重い」。
 *
 * 一撃の重さは「遅さ」ではなく「取り返しのつかなさ」から出る(社長「重い=遅いではない」)。
 * 振る頻度は既に十分遅い(次に振れるまで `COUNTER_WINDOW + COUNTER_COOLDOWN` = 820ms)ので、
 * 足りなかったのは**振った代償**の方だった。
 */

/** 硬直の長さ(ms・叩き台。実機で調整)。 */
export const MELEE_RECOVER_MS = 240;
/** 硬直中の移動倍率(叩き台)。0にはしない=操作を奪うと理不尽になる。 */
export const MELEE_RECOVER_SPEED_MULT = 0.45;

/**
 * 近接の振り終わりからの硬直による移動倍率(1=硬直していない)。
 *
 * @param meleeSwingAt 直近の振りの起点(`player.meleeSwingAt`。未使用なら0)
 * @param nowMs        いまの実時刻
 * @param swingCycleMs 振り1サイクルの長さ(呼び手が `COUNTER_WINDOW` を渡す。
 *                     ★ここで定数を再定義しない=サイクル長を変えた時に片方だけ古くなるのを防ぐ)
 */
export const meleeRecoverSpeedMult = (
  meleeSwingAt: number | undefined,
  nowMs: number,
  swingCycleMs: number,
): number => {
  if (!meleeSwingAt || meleeSwingAt <= 0) return 1; // まだ一度も振っていない
  const since = nowMs - meleeSwingAt;
  if (since < swingCycleMs) return 1;                       // 振り中(=回避として使える区間)は素の足
  if (since >= swingCycleMs + MELEE_RECOVER_MS) return 1;    // 立て直した
  return MELEE_RECOVER_SPEED_MULT;
};
