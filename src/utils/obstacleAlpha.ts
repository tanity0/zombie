// 障害物(木・壁・建物・置物)の alpha を1フレーム進める(描画: pixiScene.applyObstacleAlpha)。
// 既存の絵は目標(地平線フェード×手前フェード×裏回りの透け)へ lerp で寄せる。
// ★作ったばかりの絵(fresh)は目標から始める。Sprite の既定 alpha は 1 なので、lerp で寄せると
//   「目標が 0(足元が画面の下=手前フェードの外)なのに1から薄れていく」=画面の下から入ってきた大きな木が
//   一瞬くっきり出て消える(v0.25.5730 の不具合・下へ歩く時だけ)。
export const stepObstacleAlpha = (current: number, target: number, lerp: number, fresh: boolean): number =>
  fresh ? target : current + (target - current) * lerp;
