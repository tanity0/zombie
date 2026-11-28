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
  // PACING_PUZZLE.md §9-7#1(削岩型・「同格」): driller はpumpkinと同じくカリング保護される。
  it('driller はpumpkinと同格でカリング保護される', () => {
    expect(isEnemyCapProtected(mk('driller'), 0)).toBe(isEnemyCapProtected(mk('pumpkin'), 0));
    expect(isEnemyCapProtected(mk('driller'), 0)).toBe(true);
  });
  // PACING_PUZZLE.md §14-3裁定済み#2(伐採人・logger): driller同様pumpkinと同格でカリング保護される。
  it('logger はpumpkinと同格でカリング保護される', () => {
    expect(isEnemyCapProtected(mk('logger'), 0)).toBe(isEnemyCapProtected(mk('pumpkin'), 0));
    expect(isEnemyCapProtected(mk('logger'), 0)).toBe(true);
  });
  it('waveは猶予10秒だけ保護され、以後は保護されない', () => {
    expect(isEnemyCapProtected(mk('zombie', { isWave: true, spawnedAt: 0 }), 5000)).toBe(true);
    expect(isEnemyCapProtected(mk('zombie', { isWave: true, spawnedAt: 0 }), 10001)).toBe(false);
  });
  // PACING_PUZZLE.md §17-12-e(ウェルカム台本のサークル化): ウェルカムの個体は isWelcome ではなく
  // fromEvent=true で保護する(旧 isWelcome 専用の時間無制限保護は撤去=fromEventに一本化)。
  // fromEvent はisWaveと違いWAVE_GRACE_MS(10秒)で切れない(ウェルカムは最長60秒続くため)。受け入れ条件9。
  it('fromEventは時間無制限で保護される(waveの10秒猶予を超えても保護されたまま)', () => {
    expect(isEnemyCapProtected(mk('zombie', { fromEvent: true, spawnedAt: 0 }), 10001)).toBe(true);
    expect(isEnemyCapProtected(mk('zombie', { fromEvent: true, spawnedAt: 0 }), 999999)).toBe(true);
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

  // ★v0.25.3958(社長報告「動いてて突然消えちゃう敵」「クリティカル解除されたら消えた(プラント)」):
  // エリア外タイプ(areaInvalid)の強制回収は、可視域(ズーム最大引き考慮)の中では発動しない。
  // plant はエリア0で出現重み0=プレイヤーがエリア境界をまたいだ瞬間に画面内で湧き直っていた真因。
  describe('areaInvalid回収は可視域の外に出てから(§5.7 画面内の敵は強制消去しない)', () => {
    const mkPlant = (cx: number, over: Partial<Enemy> = {}): Enemy => ({
      id: 'plant-1', type: 'plant', x: cx - 22, y: -22, width: 44, height: 44,
      health: 100, maxHealth: 100, damage: 10, speed: 0, lastHit: 0, lastShot: 0,
      dormant: false, spawnedAt: 0, ...over,
    } as Enemy);
    // baseCtx: gameBounds 800×600 → 可視半幅=400×(1/ZOOM_MIN_ABS 0.4)=1000 / 回収半幅=1000+240=1240。
    const ctx = { ...baseCtx, gameTime: 10_000, playerAreaIdx: 0 };

    it('画面内(プレイヤーの目の前)のエリア外タイプは回収しない=消えない・湧き直らない', () => {
      useGameStore.setState({ enemies: [mkPlant(0)] });
      runOffscreenRecycleAndCull(ctx);
      const after = useGameStore.getState().enemies.find(e => e.id === 'plant-1');
      expect(after?.type).toBe('plant');
      expect(after?.x).toBe(-22); // 位置もそのまま(ワープしない)
    });

    it('気絶(クリ)解除直後でも画面内なら回収しない(「解除されたら消えた」の再発防止)', () => {
      useGameStore.setState({ enemies: [mkPlant(0, { stunUntil: 9_000 })] }); // gameTime=10000で解除済み
      runOffscreenRecycleAndCull(ctx);
      const after = useGameStore.getState().enemies.find(e => e.id === 'plant-1');
      expect(after?.type).toBe('plant');
      expect(after?.x).toBe(-22);
    });

    it('可視域の外(回収余白の内側)に出たエリア外タイプは従来どおり回収される=仕組み自体は不変', () => {
      useGameStore.setState({ enemies: [mkPlant(1100)] }); // 可視半幅1000の外・回収半幅1240の内
      runOffscreenRecycleAndCull(ctx);
      const after = useGameStore.getState().enemies.find(e => e.id === 'plant-1');
      expect(after).toBeDefined(); // idは使い回し(消えるのではなく湧き直し)
      expect(after?.x).not.toBe(1100 - 22); // 元の位置には居ない=回収された
    });

    // PACING_PUZZLE.md §17-12-e(ウェルカム台本のサークル化): ウェルカムの個体は fromEvent=true で
    // 湧くので、areaInvalid経路でも既存のfromEvent除外(上の早期return)でそのまま除外される
    // (プラント(speed 8)はプレイヤーが走れば必ず画面外へ出る=これを外すと台本外の敵に化ける)。
    it('fromEventはareaInvalid回収の対象外(画面外に出ても化けない)', () => {
      useGameStore.setState({ enemies: [mkPlant(1100, { fromEvent: true })] });
      runOffscreenRecycleAndCull(ctx);
      const after = useGameStore.getState().enemies.find(e => e.id === 'plant-1');
      expect(after?.type).toBe('plant');
      expect(after?.x).toBe(1100 - 22); // ワープしない=元の位置のまま
    });
  });

  // PACING_PUZZLE.md §17-12-e・受け入れ条件9: ウェルカムの個体(fromEvent=true)は通常の距離リサイクル
  // (offRect境界越え)からも時間無制限で除外される(isWaveのWAVE_GRACE_MS=10秒では最長60秒の関門に足りない)。
  it('fromEventは10秒を超えて画面外はるか遠くに居てもリサイクル(湧き直し)されない', () => {
    const far: Enemy = {
      id: 'welcome-1', type: 'bat', x: 999999, y: 999999, width: 32, height: 32,
      health: 20, maxHealth: 20, damage: 5, speed: 100, lastHit: 0, lastShot: 0,
      dormant: false, spawnedAt: 0, fromEvent: true, isWelcome: true,
    } as Enemy;
    useGameStore.setState({ enemies: [far] });
    runOffscreenRecycleAndCull({ ...baseCtx, gameTime: 999999 });
    const after = useGameStore.getState().enemies.find(e => e.id === 'welcome-1');
    expect(after?.x).toBe(999999);
    expect(after?.y).toBe(999999);
  });
});
