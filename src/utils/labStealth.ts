// ステージ2(研究所)の索敵解除(社長指示v0.25.1757「距離を取ったら追跡を諦めて再休眠する」)。
// 起床中の敵が「プレイヤーが解除距離(LAB_DEAGGRO_DIST)より遠い」状態を LAB_DEAGGRO_MS 続けたら
// 追跡を諦めて再休眠(dormant=true)する判定の純関数。呼び出し側(gameStore.updateEnemies)は
// ラボ(labTheme)の lab-zombie にだけこれを通す。再発見は既存の視界(300px+視線)判定。
// 解除450 > 視界300 のヒステリシスで「境界でパカパカ寝起きする」ことはない。

export const LAB_DEAGGRO_DIST = 450; // 解除距離(px・叩き台。視界300より広く=追い縋りの余地を残す)
export const LAB_DEAGGRO_MS = 3000;  // 遠い状態がこの時間続いたら諦める(ms・叩き台)

export interface LabDeaggroTick {
  outSince: number | undefined; // 「遠い」状態の開始時刻(範囲内に戻ったら undefined=リセット)
  deaggro: boolean;             // true=このtickで追跡を諦める(再休眠させる)
}

export const tickLabDeaggro = (
  gameTime: number,
  distSq: number,               // プレイヤーとの中心間距離の2乗
  prevOutSince: number | undefined,
  deaggroDist = LAB_DEAGGRO_DIST,
  graceMs = LAB_DEAGGRO_MS,
): LabDeaggroTick => {
  if (distSq <= deaggroDist * deaggroDist) return { outSince: undefined, deaggro: false };
  const outSince = prevOutSince ?? gameTime;
  return { outSince, deaggro: gameTime - outSince >= graceMs };
};
