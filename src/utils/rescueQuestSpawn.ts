// EVENT_QUEST_DESIGN.md §2-3(二人組クエストv2・B2): レスキュー出現位置のジオメトリだけを扱う純関数。
// 判定(resolveOutOfSolids・他イベント/商人/拠点サークル・原点距離・clampRectToPlayableArea)は
// 世界の状態を読む必要があるため、呼び出し側(src/store/gameStore.ts の spawnRescueQuestPoint)に置く
// (CLAUDE.md「配線ロジックは純関数に切り出してテスト」)。ここは候補点の生成(ジオメトリ)だけ。

export interface RescueSpawnCandidate {
  x: number;
  y: number;
}

/**
 * 出現の中心線ベクトルを決める(EVENT_QUEST_DESIGN.md §2-3)。
 * `lastDirection` は `player.lastDirection`(実速度から作った単位ベクトル・停止しても直前の向きが残る)を
 * そのまま渡す。null(そのランで一度も動いていない)の時だけ `randomAngle` の方位角へフォールバックする。
 */
export function resolveRescueSpawnDirection(
  lastDirection: { x: number; y: number } | null,
  randomAngle: number,
): { x: number; y: number } {
  if (lastDirection) return lastDirection;
  return { x: Math.cos(randomAngle), y: Math.sin(randomAngle) };
}

/**
 * 出現位置の候補列を生成する(EVENT_QUEST_DESIGN.md §2-3)。
 * 先頭要素が「中心線上・距離帯・±perpOffsetの直交オフセット」の第一候補。続く要素は
 * `beginReturnPhase`(src/store/gameStore.ts)と同じ形(プレイヤーを中心に角度を振りながら
 * 半径を広げる空き地探索)の候補で、判定(何と重なったら棄却するか)は呼び出し側が順に試す。
 */
export function rescueSpawnCandidates(args: {
  playerX: number;
  playerY: number;
  dirX: number; // 中心線の単位ベクトル(resolveRescueSpawnDirectionの戻り値)
  dirY: number;
  forwardDist: number; // 中心線上の距離(呼び出し側がRESCUE_SPAWN_DIST_MIN〜MAXから引く)
  perpSign: 1 | -1; // 直交オフセットの左右(呼び出し側がランダムに引く)
  perpOffset: number; // 直交オフセットの大きさ(px)
  ringStep: number; // リングごとの距離増分(px)
  rings?: number; // 既定5(beginReturnPhaseと同じ形)
  stepsPerRing?: number; // 既定8(beginReturnPhaseと同じ形)
}): RescueSpawnCandidate[] {
  const {
    playerX: px, playerY: py, dirX, dirY, forwardDist, perpSign, perpOffset, ringStep,
  } = args;
  const rings = args.rings ?? 5;
  const stepsPerRing = args.stepsPerRing ?? 8;

  // 直交ベクトル(90°回転)。
  const perpX = -dirY;
  const perpY = dirX;
  const baseX = px + dirX * forwardDist + perpX * perpOffset * perpSign;
  const baseY = py + dirY * forwardDist + perpY * perpOffset * perpSign;

  const out: RescueSpawnCandidate[] = [{ x: baseX, y: baseY }];

  const d0 = Math.hypot(baseX - px, baseY - py);
  const baseAng = d0 > 1 ? Math.atan2(baseY - py, baseX - px) : Math.atan2(dirY, dirX);
  for (let ring = 0; ring < rings; ring++) {
    const dist = d0 + ring * ringStep;
    for (let k = 0; k < stepsPerRing; k++) {
      const ang = baseAng + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
      out.push({ x: px + Math.cos(ang) * dist, y: py + Math.sin(ang) * dist });
    }
  }
  return out;
}
