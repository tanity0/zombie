import { describe, it, expect, beforeEach } from 'vitest';
import { isEnemyCapProtected, runOffscreenRecycleAndCull, type RecycleCullCtx } from './directorTick';
import { useGameStore } from '../store/gameStore';
import type { Enemy, EnemyType } from '../types/game';

// PACING_PUZZLE.md §6.38 B1(賞金首)保護3箇所のうち②: 上限カリングのisProtected表。
// 賞金首4型はここに載っていないとcap超過で消される(=「勝手に消える」実バグ)。
const mk = (type: EnemyType, patch: Partial<Parameters<typeof isEnemyCapProtected>[0]> = {}) => ({
  type, fixed: false, fromEvent: false, isNamed: false, questTarget: false, isWave: false, spawnedAt: 0,
  ...patch,
});

describe('isEnemyCapProtected — 上限カリングの保護表(§6.38 B1)', () => {
  it('賞金首4型は上限カリング対象外(保護される)', () => {
    for (const type of ['bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko'] as EnemyType[]) {
      expect(isEnemyCapProtected(mk(type), 100000), type).toBe(true);
    }
  });
  it('既存の保護対象は従来どおり保護される(挙動不変)', () => {
    expect(isEnemyCapProtected(mk('giantbat'), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('pumpkin'), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('reaper'), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('lab-zombie-3'), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('mimir'), 0)).toBe(true); // isHiddenBoss経由
    expect(isEnemyCapProtected(mk('zombie', { fixed: true }), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('zombie', { fromEvent: true }), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('zombie', { isNamed: true }), 0)).toBe(true);
    expect(isEnemyCapProtected(mk('zombie', { questTarget: true }), 0)).toBe(true);
  });
  it('通常の雑魚は保護されない(=カリング対象になり得る)', () => {
    expect(isEnemyCapProtected(mk('zombie'), 999999)).toBe(false);
  });
  it('waveは猶予10秒だけ保護され、以後は保護されない', () => {
    expect(isEnemyCapProtected(mk('zombie', { isWave: true, spawnedAt: 0 }), 5000)).toBe(true);
    expect(isEnemyCapProtected(mk('zombie', { isWave: true, spawnedAt: 0 }), 10001)).toBe(false);
  });
});

// PACING_PUZZLE.md §6.38 B1.5-6(賞金首): 距離リサイクル免除を「isEngageableBoss経由の暗黙相乗り」
// から明示条件(isBountyType)へ変更。実際に消えない/ワープしないことを統合テストで確認する。
describe('runOffscreenRecycleAndCull — 賞金首は距離リサイクル対象外(明示条件・§6.38 B1.5-6)', () => {
  const mkBounty = (over: Partial<Enemy> = {}): Enemy => ({
    id: 'bounty-1', type: 'bounty-ranged', x: 999999, y: 999999, width: 44, height: 44,
    health: 500, maxHealth: 500, damage: 10, speed: 50, lastHit: 0, lastShot: 0,
    dormant: false, ...over,
  } as Enemy);

  const baseCtx: RecycleCullCtx = {
    labTheme: false, indoor: false,
    gameBounds: { width: 800, height: 600 },
    player: { x: 0, y: 0, width: 20, height: 20 } as RecycleCullCtx['player'],
    playerCenterX: 0, playerCenterY: 0,
    gameTime: 0,
    spawnBounds: { width: 800, height: 600 },
    spawnViewOffsetY: 0,
    snowTheme: false, spawnEsc: 0, playerAreaIdx: 0, enemyCap: 100, puzzleActiveNow: false,
    labSpawnAggroRange: 200,
  };

  beforeEach(() => {
    useGameStore.setState({ enemies: [] });
  });

  it('画面外はるか遠くに居ても位置がワープしない・消えない(専用コントローラbountyTickに任せる)', () => {
    useGameStore.setState({ enemies: [mkBounty()] });
    runOffscreenRecycleAndCull(baseCtx);
    const after = useGameStore.getState().enemies.find(e => e.id === 'bounty-1');
    expect(after).toBeDefined();
    expect(after?.x).toBe(999999);
    expect(after?.y).toBe(999999);
  });

  it('dormant中でも同様にワープしない', () => {
    useGameStore.setState({ enemies: [mkBounty({ dormant: true })] });
    runOffscreenRecycleAndCull(baseCtx);
    const after = useGameStore.getState().enemies.find(e => e.id === 'bounty-1');
    expect(after?.x).toBe(999999);
    expect(after?.y).toBe(999999);
  });
});
