// research/LIGHT_REWORK.md §3-9-D「案C・全部水平」。
// 影の幅方向は光へ合わせて回転させず、根元と先端を常に画面水平=素材の底辺と平行にする。
// 光が変えるのは tip の位置(伸び方向と長さ)だけ。PixiJS非依存で四隅を直接テストできる。

export interface ShadowPoint { x: number; y: number }

export interface HorizontalShadowCorners {
  /** PerspectiveMesh の top-left (u0,v0): 影の先端。 */
  c0: ShadowPoint;
  /** PerspectiveMesh の top-right (u1,v0): 影の先端。 */
  c1: ShadowPoint;
  /** PerspectiveMesh の bottom-right (u1,v1): 素材の底辺。 */
  c2: ShadowPoint;
  /** PerspectiveMesh の bottom-left (u0,v1): 素材の底辺。 */
  c3: ShadowPoint;
}

/**
 * 案Cの四隅。根元(c2/c3)と先端(c0/c1)はそれぞれ同じYに置く。
 * 真横の光(dirY=0)では4点が同じYへ並び、伸び影の面積が線へ潰れるのも確定仕様。
 */
export const horizontalShadowCorners = (
  footX: number,
  footY: number,
  dirX: number,
  dirY: number,
  length: number,
  nearHalf: number,
  farHalf: number,
  skewShift: number,
  uSign: number,
): HorizontalShadowCorners => {
  const tipX = footX + dirX * length + skewShift;
  const tipY = footY + dirY * length;
  return {
    // PerspectiveMesh.setCorners is UV-ordered: top-left, top-right,
    // bottom-right, bottom-left. uSign=1 must keep that native order.
    c0: { x: tipX - uSign * farHalf, y: tipY },
    c1: { x: tipX + uSign * farHalf, y: tipY },
    c2: { x: footX + uSign * nearHalf, y: footY },
    c3: { x: footX - uSign * nearHalf, y: footY },
  };
};
