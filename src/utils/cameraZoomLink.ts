// カメラのズーム(useGameLoop の camBossZoomRef.current.z)を、途切れずに描画(pixi)へ渡す窓口。
// 設計書 research/PERSPECTIVE_PROJECTION.md §1-1d「②の経路に要る物」・§3-3 作る物11(★#20 裁定②)。
//
// store の viewZoom は 0.005 以上の変化しか書かない(per-frame churn を避けるゲート)ので、投影の基準行 ℓ_ref が段で跳ぶ。
// ここは store を通さない描画用の値(ゲームの状態ではない)。useGameLoop がカメラ(setCameraPosition)と同じフレームで書き、
// pixi は `?proj=1` の時だけ読む。既定(`?proj=0`)では誰も読まない。
let cameraZoomNow = 1;

/** useGameLoop: カメラの位置を書くのと同じ所で、カメラの縦の下げ量を決めたズームを書く。 */
export const setCameraZoomLink = (z: number): void => {
  if (Number.isFinite(z) && z > 0) cameraZoomNow = z;
};

/** pixi: カメラのズーム(ボス交戦の引き・?zoomlock の時だけ 1 から外れる)。 */
export const getCameraZoomLink = (): number => cameraZoomNow;
