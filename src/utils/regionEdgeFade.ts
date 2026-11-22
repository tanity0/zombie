// 作って回収する範囲(store の矩形)の縁の手前で絵を薄くする(描画だけ・純関数・PixiJS を読まない)。
// research/PERSPECTIVE_PROJECTION.md 段階1 監査 A2: ?proj=1 では見える範囲が北へ広がり、松明・緑卵が
// store の範囲(プレイヤー中心の画面 ± BREAKABLE_PROP_REGION_PAD)の縁で「パッと出て、パッと消える」のが見える。
// 縁までの距離が fadePx 以下で 1→0(ease=smoothstep)。範囲の外は 0。範囲そのもの(作る/回収する所)は変えない。

export interface RegionRect { left: number; top: number; right: number; bottom: number }

/** プレイヤー中心の画面の矩形を pad だけ広げた範囲(store.syncBreakableProps と同じ形)。 */
export const playerCenteredRegion = (
  playerCx: number, playerCy: number, viewW: number, viewH: number, pad: number,
): RegionRect => ({
  left: playerCx - viewW / 2 - pad, right: playerCx + viewW / 2 + pad,
  top: playerCy - viewH / 2 - pad, bottom: playerCy + viewH / 2 + pad,
});

/** 範囲の縁までの距離 d で 1→0 に落とす(d>=fadePx で 1・d<=0 で 0・間は smoothstep)。 */
export const regionEdgeFade = (x: number, y: number, r: RegionRect, fadePx: number): number => {
  const d = Math.min(x - r.left, r.right - x, y - r.top, r.bottom - y);
  if (d <= 0) return 0;
  if (!(fadePx > 0) || d >= fadePx) return 1;
  const u = d / fadePx;
  return u * u * (3 - 2 * u);
};
