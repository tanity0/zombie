// PACING_PUZZLE.md §6.38 B1.5-3(重要): デバッグ出現から fromEvent:true を撤去した結果、
// 賞金首はイベント終了一掃(endArenaEvent)で消えないことを固定する
// (旧実装はfromEvent=trueだったため「賞金首を起こして戦っている最中に別イベントが終わると消える」
// 実バグを埋め込んでいた。保護はisEngageableBoss/isEnemyCapProtectedで別途足りている)。
import { describe, it, expect } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';

describe('endArenaEvent — 賞金首(fromEvent無し)は周辺一掃で消えない(§6.38 B1.5-3)', () => {
  it('fromEventが立っていない賞金首はendArenaEventの取りこぼし撤去を素通りする', () => {
    useGameStore.getState().resetGame('warrior');
    const bounty = spawnEnemyAt('bounty-ranged', 0, 0, useGameStore.getState().gameTime);
    // デバッグ出現(B1.5修正後)と同じ形: fromEventは立てない。
    expect(bounty.fromEvent).toBeUndefined();
    const eventBounty = spawnEnemyAt('zombie', 100, 100, useGameStore.getState().gameTime);
    eventBounty.fromEvent = true; // 比較対象: 実際にイベント産の敵は撤去される
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState({
      enemies: [bounty, eventBounty],
      activeEvent: { kind: 'horde', x: 0, y: 0, radius: 300, startedAt: gt, endsAt: gt + 60000, holdMs: 0 },
    });

    useGameStore.getState().endArenaEvent();

    const survivors = useGameStore.getState().enemies;
    expect(survivors.find(e => e.id === bounty.id)).toBeDefined(); // 賞金首は残る
    expect(survivors.find(e => e.id === eventBounty.id)).toBeUndefined(); // fromEvent敵は撤去される(挙動不変の確認)
    expect(useGameStore.getState().activeEvent).toBeNull();
  });
});
