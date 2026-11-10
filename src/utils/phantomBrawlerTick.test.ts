// research/BRAWLER_PHANTOM.md §4: 格闘の幻影(拳鬼)の格闘を幻影の上で回す(結合テスト)。
import { describe, it, expect, beforeEach } from 'vitest';
import { runPhantomTick, createPhantomTickState, NOOP_PHANTOM_SFX } from './phantomTick';
import { phantomBrawlerBossState, phantomBrawlerHoldClock, phantomBrawlerStrikerMult } from './phantomBrawlerTick';
import { initialBrawlerState, brawlerStartAttack, brawlerAfterResolve, brawlerElapsed, brawlerTotalMs } from './brawler';
import { setPhantomIdentity } from './phantomIdentity';
import { uniquePhantomSpec } from '../data/uniquePhantoms';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';

const START_GT = 10_000_000;
const ORIGIN = 50_000;

describe('相の登録(区分どおり)', () => {
  it('待機=追いかけ・前隙=技の最中・戻り=硬直', () => {
    expect(phantomBrawlerBossState(undefined, 0)).toBe('chase');
    expect(phantomBrawlerBossState(initialBrawlerState(), 0)).toBe('chase');
    const s = brawlerStartAttack(initialBrawlerState(), 1, 1000, false);
    expect(phantomBrawlerBossState(s, 1000)).toBe('gp-brawler');
    const r = brawlerAfterResolve(s, 1000 + s.windupMs, 0, { pointCap: 20, countPoint: true, hitstopMs: 0 });
    expect(phantomBrawlerBossState(r, 1000 + s.windupMs + 1)).toBe('gp-brawler-recover');
  });
  it('戻りで固めている間は格闘の時計が止まる(明けたら戻りの続きから)', () => {
    const s = brawlerStartAttack(initialBrawlerState(), 1, 1000, false);
    const r = brawlerAfterResolve(s, 1000 + s.windupMs, 0, { pointCap: 20, countPoint: true, hitstopMs: 0 });
    const t0 = 1000 + s.windupMs + 10;
    const el0 = brawlerElapsed(r, t0 + 16); // 固め始め(最初の tick)の時点
    let h = r;
    for (let k = 1; k <= 30; k++) h = phantomBrawlerHoldClock(h, t0 + k * 16, 500 - k * 16);
    expect(brawlerElapsed(h, t0 + 30 * 16)).toBeCloseTo(el0, 0);
    expect(brawlerElapsed(h, t0 + 500 + 50)).toBeLessThan(brawlerTotalMs(h));
  });
  it('ストライカーの素手×1.5(格闘中のストライカー)', () => {
    expect(phantomBrawlerStrikerMult('rogue')).toBe(1.5);
    expect(phantomBrawlerStrikerMult('warrior')).toBe(1);
  });
});

describe('拳鬼が格闘で戦う(結合)', () => {
  beforeEach(() => {
    setTreesDisabled(true); setTorchesDisabled(true);
    useGameStore.getState().resetGame('rogue');
    const k = uniquePhantomSpec('brawler');
    setPhantomIdentity({ name: k.name, profile: k.profile, source: 'unique' });
  });

  const setup = (offsetX: number, over: Partial<Enemy> = {}) => {
    const k = uniquePhantomSpec('brawler');
    const e = spawnEnemyAt('guardian-phantom', ORIGIN, ORIGIN, START_GT);
    Object.assign(e, { phantomUnique: 'brawler', phantomBuild: k.profile.snapshot, health: 130, maxHealth: 130, dormant: false, bossState: 'chase' }, over);
    useGameStore.setState(s => ({
      enemies: [e], projectiles: [], gameTime: START_GT,
      player: { ...s.player, x: e.x + e.width / 2 + offsetX, y: e.y + e.height / 2 - s.player.height / 2, health: 9999, maxHealth: 9999, invulnerable: false, invulnerableTime: 0 },
    }));
    let gt = START_GT;
    const st = createPhantomTickState();
    const states = new Set<string>();
    const step = (ms: number): void => {
      gt += ms;
      useGameStore.setState({ gameTime: gt });
      const cur = useGameStore.getState().enemies.find(x => x.id === e.id);
      if (cur) { runPhantomTick(cur, st, gt, ms / 1000, 1, gt, NOOP_PHANTOM_SFX, () => 0.999); states.add(useGameStore.getState().enemies.find(x => x.id === e.id)?.bossState ?? ''); }
    };
    return { id: e.id, step, states, cur: () => useGameStore.getState().enemies.find(x => x.id === e.id)! };
  };

  it('間合いの内のプレイヤーへ通常の段を当てる(HPが減る・段が進む・相が登録される)・銃は撃たない', () => {
    const h = setup(40);
    const hp0 = useGameStore.getState().player.health;
    let maxStage = 0;
    for (let i = 0; i < 200; i++) { h.step(16); maxStage = Math.max(maxStage, h.cur().phantomBrawler?.stage ?? 0); }
    expect(useGameStore.getState().player.health).toBeLessThan(hp0);
    expect(maxStage).toBeGreaterThanOrEqual(2);
    expect(h.states.has('gp-brawler')).toBe(true);
    expect(useGameStore.getState().projectiles.filter(p => p.hostile).length).toBe(0);
  });

  it('技ポイントが通常の当たりで貯まる', () => {
    const h = setup(40);
    for (let i = 0; i < 200; i++) h.step(16);
    expect(h.cur().phantomBrawler?.points ?? 0).toBeGreaterThan(0);
  });

  it('プレイヤーのカウンターの窓の中で当たると、幻影のダメージ0+行動の取り消し', () => {
    const h = setup(40);
    useGameStore.setState(s => ({ player: { ...s.player, counterWindowStart: 0, counterWindowEnd: Date.now() + 1e9 } }));
    const hp0 = useGameStore.getState().player.health;
    for (let i = 0; i < 60; i++) h.step(16);
    expect(useGameStore.getState().player.health).toBe(hp0);
    expect(h.cur().phantomBrawler?.stage ?? 0).toBeLessThanOrEqual(1); // つながらない(毎回1段目で返される)
  });

  it('ポイントが揃っていれば秘奥義(→↓←↑)まで出し切り、プレイヤーを止めずに当てる', () => {
    const k = uniquePhantomSpec('brawler');
    const h = setup(110, { phantomBrawler: { ...initialBrawlerState(), points: 20 }, phantomBuild: k.profile.snapshot });
    let sawSecret = false;
    for (let i = 0; i < 400; i++) { h.step(16); if (h.cur().phantomBrawler?.secret) sawSecret = true; }
    expect(sawSecret).toBe(true);
    expect(h.cur().phantomBrawler?.points ?? 0).toBeLessThan(20);
    // プレイヤーを止める(brHoldUntil 等)仕組みはプレイヤーには無い=動けるまま
    expect(useGameStore.getState().player.health).toBeLessThan(9999);
  });

  it('印の無い幻影は格闘を回さない(今の幻影のまま)', () => {
    const h = setup(40, { phantomUnique: undefined });
    for (let i = 0; i < 100; i++) h.step(16);
    expect(h.cur().phantomBrawler).toBeUndefined();
  });
});
