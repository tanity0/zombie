// ステージ2(研究所)の索敵解除(社長指示v0.25.1757→v0.25.2064で変更「画面外にいったら見失う」)。
// 旧: プレイヤーが解除距離(450px)より遠い状態が3秒続いたら諦める(tickLabDeaggro・時刻テーブル必要)。
// 新: 起床中の敵が【画面(カメラ=プレイヤー中心の可視域)+マージン】の外へ出た瞬間に見失って
// 再休眠する。状態を持たない即時判定=時刻テーブル不要。呼び出し側(gameStore.updateEnemies)は
// ラボ(labTheme)の lab-zombie にだけこれを通す。再発見は既存の視界(300px+視線)判定。
// 画面半幅(スマホ縦でも約215px+マージン)≫視界300…ではなく縦axis等で近い値になり得るが、
// 「画面外で寝る→視界300pxで起きる」の間には常にマージンぶんの隙間があり境界パカパカはしない。
// ステージ2はコンテキストズーム引き無効(recycleZoomOverscan=1)なので可視域=gameBoundsそのまま。

export const LAB_OFFSCREEN_MARGIN = 40; // 画面端の少し外まで猶予(見切れ中の敵が消えたように寝ない・叩き台)

// プレイヤー中心→敵中心の差(dx,dy)が可視域の半幅/半高+マージンを超えたら「見失った」。
export const isLabOffscreenLost = (
  dx: number,
  dy: number,
  halfW: number,               // 可視域の半幅(gameBounds.width/2)
  halfH: number,               // 可視域の半高(gameBounds.height/2)
  margin = LAB_OFFSCREEN_MARGIN,
): boolean => Math.abs(dx) > halfW + margin || Math.abs(dy) > halfH + margin;
