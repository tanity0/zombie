// EVENT_QUEST_DESIGN.md §2-8(二人組クエストv2・B4): 帰還サークルへの飛来(warping)のジオメトリだけを
// 扱う純関数。判定・状態遷移(いつ始めるか)は世界の状態を読む必要があるため useGameLoop 側に置く
// (CLAUDE.md「配線ロジックは純関数に切り出してテスト」)。ここは着地点・飛来始点の計算のみ。

/**
 * 帰還サークルへの着地点を決める(EVENT_QUEST_DESIGN.md §2-8「着地点はサークルの縁寄りで、
 * プレイヤーと重ならない位置」)。プレイヤーから見て円の反対側(=最もプレイヤーから遠い縁寄りの点)を
 * 選ぶことで、"重ならない" を距離の再判定なしに構造的に満たす(円の中心からプレイヤーまでの距離 d に
 * 対し、反対側の点までの距離は d + radius*edgeFrac になるため必ず d 以上離れる)。
 * プレイヤーが中心に重なる退化ケース(d<=1)は角度0へフォールバックする。
 */
export function computeWarpLandingPoint(args: {
  circleX: number;
  circleY: number;
  radius: number;
  playerX: number;
  playerY: number;
  edgeFrac: number; // 縁からどれだけ内側か(0=中心・1=縁ちょうど)。§2-8「縁寄り」= 1未満の値を想定
}): { x: number; y: number } {
  const { circleX: cx, circleY: cy, radius, playerX: px, playerY: py, edgeFrac } = args;
  const d = Math.hypot(px - cx, py - cy);
  const angFromCenterToPlayer = d > 1 ? Math.atan2(py - cy, px - cx) : 0;
  const angAway = angFromCenterToPlayer + Math.PI;
  return {
    x: cx + Math.cos(angAway) * radius * edgeFrac,
    y: cy + Math.sin(angAway) * radius * edgeFrac,
  };
}

/**
 * 飛来の始点を決める(EVENT_QUEST_DESIGN.md §2-14「★ワープの段を進める場所」の4:00出現と同じ式を、
 * 帰還サークルへの飛来にも流用する。実在定数 EVENT_NPC_MIN_DISTANCE を再利用=新しい距離定数を作らない)。
 * 着地点から見てプレイヤーと反対側へ minDistance 離れた点。
 */
export function computeWarpFlyinStart(args: {
  landX: number;
  landY: number;
  playerX: number;
  playerY: number;
  minDistance: number;
}): { x: number; y: number } {
  const { landX, landY, playerX: px, playerY: py, minDistance } = args;
  const dlx = landX - px, dly = landY - py;
  const dlen = Math.hypot(dlx, dly) || 1;
  return {
    x: landX + (dlx / dlen) * minDistance,
    y: landY + (dly / dlen) * minDistance,
  };
}
