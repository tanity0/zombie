// 社長相談(実装チャット・v0.25.1499): レベルアップ処理を、ジャンプ着地/ダッシュ突進の「赤ライン」
// 実当たり判定内にプレイヤーがいる間だけ保留する(画面のどこかで誰かが溜めているだけでは保留しない)。
// ・ジャンプ着地(パンプキン/lab-zombie-3/ジャイアントバット/ハンター): 実際の着地爆発ヒット判定
//   (useGameLoopのpumpkinBlasts処理と同じ「爆心からの距離 <= 半径+双方の当たり半径」)と同じ式。
// ・ダッシュ突進(werewolf/lab-zombie-2/ジャイアントバット/ハンター): 専用の当たり判定式が
//   別に存在しない(汎用の接触ダメージ)ため、敵の幅を経路の当たり半径として近似する。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。最小インターフェースにして
// フルの Enemy 型に依存しない(enemyCulling.ts と同じ方針)。

interface Point { x: number; y: number }

export interface TelegraphEnemy {
  type: string;
  x: number; y: number; width: number; height: number;
  aiPhase?: string;
  aiTargetX?: number; aiTargetY?: number;
}

const JUMP_TELEGRAPH_TYPES = new Set(['pumpkin', 'lab-zombie-3', 'giantbat', 'hunter']);
const DASH_TELEGRAPH_TYPES = new Set(['werewolf', 'lab-zombie-2', 'giantbat', 'hunter']);

const distToSegment = (p: Point, a: Point, b: Point): number => {
  const abx = b.x - a.x, aby = b.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / abLenSq));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
};

export const isPlayerInAttackTelegraph = (
  player: { x: number; y: number; width: number; height: number },
  enemies: TelegraphEnemy[],
  pumpkinExplosionRadius: number
): boolean => {
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const pr = Math.max(player.width, player.height) / 2;
  for (const e of enemies) {
    if (e.aiPhase === 'jump' && JUMP_TELEGRAPH_TYPES.has(e.type)) {
      const tx = (e.aiTargetX ?? e.x) + e.width / 2;
      const ty = (e.aiTargetY ?? e.y) + e.height / 2;
      if (Math.hypot(pcx - tx, pcy - ty) <= pumpkinExplosionRadius + pr) return true;
    } else if (
      e.aiPhase === 'windup' && DASH_TELEGRAPH_TYPES.has(e.type) &&
      e.aiTargetX !== undefined && e.aiTargetY !== undefined
    ) {
      const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
      const half = e.width / 2 + pr;
      if (distToSegment({ x: pcx, y: pcy }, { x: ex, y: ey }, { x: e.aiTargetX, y: e.aiTargetY }) <= half) return true;
    }
  }
  return false;
};
