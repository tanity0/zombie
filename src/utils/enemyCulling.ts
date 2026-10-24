// PACING_PUZZLE.md §5.7 バッチM6追補2(実機バグ対処v0.25.1393): 上限カリングの可視域保護。
// 実機報告「被弾すると敵が消える」の原因=査定でr7Cap縮小/降格→上限(enemyCap)が瞬時に下がる→
// 上限カリング(遠い順に即削除)が画面内の敵まで消していた(仕様「在席は強制消去しない・自然消化」
// と矛盾=実バグ)。パズルON時は cull候補を可視域外(呼び出し側がリサイクルと同じ矩形を渡す)に
// 限定し、画面内の超過分は消さず湧き停止+自然消化で収束させる。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

export interface CullRect {
  centerX: number;
  centerY: number;
  halfW: number;
  halfH: number;
}

export interface CullableEnemy {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const isOutsideCullRect = (e: CullableEnemy, rect: CullRect): boolean => {
  const cx = e.x + e.width / 2;
  const cy = e.y + e.height / 2;
  return Math.abs(cx - rect.centerX) > rect.halfW || Math.abs(cy - rect.centerY) > rect.halfH;
};

// isProtected を除いた敵から cull 候補を選び、rectの中心から遠い順(降順)に並べて返す。
// restrictToOffscreen=true の時は rect 外(可視域外)の敵だけを候補にする(§5.7)。
// false の時は旧来どおり全敵から選ぶ(?puzzle=0時などパズルOFF状態の旧挙動維持用)。
export const selectCullCandidates = <T extends CullableEnemy>(
  enemies: T[],
  isProtected: (e: T) => boolean,
  rect: CullRect,
  restrictToOffscreen: boolean
): T[] =>
  enemies
    .filter(e => !isProtected(e) && (!restrictToOffscreen || isOutsideCullRect(e, rect)))
    .sort((a, b) => {
      const distA = Math.hypot(a.x + a.width / 2 - rect.centerX, a.y + a.height / 2 - rect.centerY);
      const distB = Math.hypot(b.x + b.width / 2 - rect.centerX, b.y + b.height / 2 - rect.centerY);
      return distB - distA;
    });
