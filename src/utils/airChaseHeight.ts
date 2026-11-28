// ★高さに追いつく技(飛び蹴り・踵落とし)の「プレイヤーの絵の高さ」の決め方(社長指示2026-11-16
// 「高さに追いつく技も相手の高さに合わせに行って。(ただし強制ではなく決まった距離の中で進行方向としての高さ。)」)。
// 描画だけの高さ(絵の jump)。判定・横の移動距離・技の時間・無敵は変えない。純関数(PixiJS を import しない)。
//
// 考え方: 技は「動ける距離」reachPx を持つ(飛び蹴り・踵落としは BRAWLER_KICK_RANGE)。横に groundPx 進んだ先の相手は、
// 高さ targetPx に居る。自分は相手の位置(横+高さ)へ向かう向きに、動ける距離だけ進む:
//   - 相手まで(√(横²+高さ²))が動ける距離以内 → 相手の高さに届く。
//   - 届かない → 同じ向きで動ける距離ぶん進んだ所=高さ targetPx × reach ÷ 相手まで(途中の高さ)。
//   - 下限 floorPx(踵落としは今の決め打ちの 30px)より低くはしない。相手が地上(0)なら下限のまま=今どおり。
/** 高さ(px)。groundPx=横に進む距離・targetPx=相手の浮いた絵の高さ(追う目標)・reachPx=技の動ける距離・floorPx=下限。 */
export const airChaseHeightPx = (groundPx: number, targetPx: number, reachPx: number, floorPx = 0): number => {
  const g = Math.max(0, groundPx);
  const h = Math.max(0, targetPx);
  const r = Math.max(0, reachPx);
  const d = Math.hypot(g, h);
  const reach = d <= r || d <= 1e-9 ? h : h * (r / d);
  return Math.max(Math.max(0, floorPx), reach);
};
