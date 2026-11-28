// 叫喚型の置き去りを進む先の辺の外へ動かす配線(社長指示2026-11-11「進行方向にワープさせる」)。
// 距離・溜め・間隔の判定そのものは screamerGate.test.ts が固定する。ここでは runOffscreenRecycleAndCull が
// 叫喚型だけを同じ個体のまま動かし、ほかの fixed の敵は動かさないことを確かめる。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { runOffscreenRecycleAndCull, type RecycleCullCtx } from './directorTick';
import { spawnEnemyAt } from './enemyUtils';
import { SCREAMER_MARK_MAX_DIST_PX } from './screamerGate';
import type { Player } from '../types/game';

const GAME_TIME = 999999;
const buildCtx = (player: Player): RecycleCullCtx => ({
  labTheme: false,
  indoor: false,
  gameBounds: { width: 800, height: 600 },
  player,
  playerCenterX: player.x + player.width / 2,
  playerCenterY: player.y + player.height / 2,
  gameTime: GAME_TIME,
  spawnBounds: { width: 800, height: 600 },
  spawnViewOffsetY: 0,
  snowTheme: false,
  spawnEsc: 0,
  playerAreaIdx: 0,
  enemyCap: 50,
  puzzleActiveNow: false,
  labSpawnAggroRange: 200,
  labVisited: null,
});

describe('runOffscreenRecycleAndCull(叫喚型の置き去り)', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
  });

  const farFixed = (type: 'screamer' | 'zombie') => {
    const player = useGameStore.getState().player;
    const e = spawnEnemyAt(type, player.x + SCREAMER_MARK_MAX_DIST_PX + 400, player.y, 0);
    e.isWave = false;
    e.fixed = true;
    return { player, e };
  };

  it('遠く離れた叫喚型は同じ個体のまま見えている範囲の外へ動き、動かした時刻が残る', () => {
    const { player, e } = farFixed('screamer');
    e.screamNextAt = 123456;
    useGameStore.setState({ enemies: [e] });
    runOffscreenRecycleAndCull(buildCtx(player));
    const after = useGameStore.getState().enemies[0];
    expect(after.id).toBe(e.id);
    expect(after.health).toBe(e.health);
    expect(after.screamNextAt).toBe(123456);
    expect(after.fixed).toBe(true);
    expect(after.screamerWarpAt).toBe(GAME_TIME);
    expect(after.x === e.x && after.y === e.y).toBe(false);
  });

  it('叫びの溜めの最中は動かさない', () => {
    const { player, e } = farFixed('screamer');
    e.aiPhase = 'scream';
    useGameStore.setState({ enemies: [e] });
    runOffscreenRecycleAndCull(buildCtx(player));
    const after = useGameStore.getState().enemies[0];
    expect(after.x).toBe(e.x);
    expect(after.screamerWarpAt).toBeUndefined();
  });

  it('叫喚型以外の fixed の敵は動かさない', () => {
    const { player, e } = farFixed('zombie');
    useGameStore.setState({ enemies: [e] });
    runOffscreenRecycleAndCull(buildCtx(player));
    const after = useGameStore.getState().enemies[0];
    expect(after.x).toBe(e.x);
    expect(after.y).toBe(e.y);
  });
});
