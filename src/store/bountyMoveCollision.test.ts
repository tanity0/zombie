// PACING_PUZZLE.md §6.38 B1.5-4(重要): bountyTick.tsの追跡/帰巣移動に障害物衝突を通す
// (resolveMove相当=木/建物/壁に当たる。城ボスと同じ「当たる」側)。
// resolveBountyMove(gameStore.ts)がupdateEnemiesと同じ遮蔽物連鎖(resolveOutOfSolids)を
// 実際に通していることを、座標を直接制御できる病院の当たり判定で固定する
// (木は procedural=座標を狙い撃ちできないため、この検証には向かない)。
import { describe, it, expect } from 'vitest';
import { useGameStore, resolveBountyMove } from './gameStore';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

describe('resolveBountyMove — 障害物衝突を通す(§6.38 B1.5-4)', () => {
  it('建物(病院)の中へ向かう移動は壁でブロックされる', () => {
    setTreesDisabled(true);
    setTorchesDisabled(true);
    useGameStore.getState().resetGame('warrior');
    // 病院を原点に固定配置(ランダム配置に依存しない)。
    useGameStore.setState({ hospital: { x: 0, y: 0 }, hospitalTaken: false });
    const box = { width: 40, height: 40 };
    // 建物のど真ん中(0,0)へ移動しようとする希望座標。
    const resolved = resolveBountyMove(-20, -20, box);
    // 壁に当たって押し返される=建物の中心へは入れない(希望座標のままにはならない)。
    expect(resolved.x === -20 && resolved.y === -20).toBe(false);
  });

  it('遮蔽物の無い場所への移動はそのまま通る(希望座標=解決座標)', () => {
    setTreesDisabled(true);
    setTorchesDisabled(true);
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState({ hospital: null });
    const box = { width: 40, height: 40 };
    const resolved = resolveBountyMove(123456, 654321, box);
    expect(resolved).toEqual({ x: 123456, y: 654321 });
  });
});
