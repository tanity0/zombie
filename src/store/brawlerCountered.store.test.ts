// ★格闘の技はカウンターされるとノックバック(社長指示2026-11-26「格闘技はカウンターされるとノックバックで。」)。
// 既存の近接カウンターの規則(振りの中断+敵と同じ量のノックバック=KNOCKBACK_SPEED/KNOCKBACK_DURATION)に揃える。
//  ① プレイヤーの格闘の技を幻影(拳鬼の構え・刀の幻影の振りの窓)がカウンターした → プレイヤーが中断+ノックバック
//  ② 拳鬼の格闘の技をプレイヤーがカウンターした → 拳鬼が中断+ノックバック
//  ③ 守護霊は格闘の技を持たない(research/BRAWLER.md §8-2)=対象なし
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, KNOCKBACK_SPEED, KNOCKBACK_DURATION } from './gameStore';
import { runPhantomTick, createPhantomTickState, NOOP_PHANTOM_SFX } from '../utils/phantomTick';
import { setPhantomIdentity } from '../utils/phantomIdentity';
import { uniquePhantomSpec } from '../data/uniquePhantoms';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { initialBrawlerState, brawlerStartTech, brawlerStartAttack, brawlerSecretStart, BRAWLER_KICK_MAX } from '../utils/brawler';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import type { Enemy } from '../types/game';
setBrawlerTempoAll(1.0);

let now = 9_000_000;
const START_GT = 10_000_000;
const ORIGIN = 50_000;
const K = 'kenki';
const NO_INPUT = { up: false, down: false, left: false, right: false } as never;

/** 幻影を置く(プレイヤーは幻影の右 dx の所)。kenki=false なら刀の幻影(格闘を持たない幻影)。 */
const setup = (dx: number, kenki = true, over: Partial<Enemy> = {}) => {
  useGameStore.getState().resetGame('warrior');
  setTreesDisabled(true); setTorchesDisabled(true);
  const k = uniquePhantomSpec('brawler');
  setPhantomIdentity({ name: k.name, profile: k.profile, source: 'unique' });
  const e = spawnEnemyAt('guardian-phantom', ORIGIN, ORIGIN, START_GT);
  Object.assign(e, { id: K, ...(kenki ? { phantomUnique: 'brawler' } : {}), phantomBuild: k.profile.snapshot, health: 100000, maxHealth: 100000, dormant: false, bossState: 'chase' }, over);
  useGameStore.setState(s => ({
    m0Unlocked: { ...s.m0Unlocked, melee: true, crit: true },
    enemies: [e], projectiles: [], pumpkinBlasts: [], gameTime: START_GT,
    player: {
      ...s.player, x: e.x + e.width / 2 + dx - s.player.width / 2, y: e.y + e.height / 2 - s.player.height / 2, health: 99999, maxHealth: 99999,
      invulnerable: false, invulnerableTime: 0, subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 }, lastDirection: { x: -1, y: 0 },
    },
  }));
};
const en = () => useGameStore.getState().enemies.find(e => e.id === K)!;
const pl = () => useGameStore.getState().player;
const ecx = () => en().x + en().width / 2;
const pcx = () => pl().x + pl().width / 2;
/** 拳鬼を構えさせる(構えの間は窓が開いている=プレイヤーの近接を返す)。 */
const kenkiGuard = (ms = 1300) => {
  const t = useGameStore.getState().gameTime;
  const g = brawlerStartTech(initialBrawlerState(), 'guard', t);
  useGameStore.setState(s => ({ enemies: s.enemies.map(e => e.id === K ? { ...e, phantomBrawler: { ...g, guardSince: t, guardUntil: t + ms }, gpGuardUntil: t + ms } : e) }));
};
/** プレイヤーの格闘の当たり(段の当たりと同じ道=triggerCounter の格闘の枝)。 */
const playerBrawlerHit = () => useGameStore.getState().triggerCounter(undefined, {
  targetIds: [K], mult: 1, brawler: true, stunMs: 90, postureMult: 0.01, pressedAt: Date.now(), kb: { kind: 'none' }, combo: { move: 's1' },
});
const setPlayerBrawler = (b: ReturnType<typeof initialBrawlerState>) => useGameStore.setState(s => ({ player: { ...s.player, brawler: b } }));
const setKenkiBrawler = (b: ReturnType<typeof initialBrawlerState>) => useGameStore.setState(s => ({ enemies: s.enemies.map(e => e.id === K ? { ...e, phantomBrawler: b } : e) }));

/** ゲームループ相当(16ms): 移動・格闘の状態機械・幻影の制御・敵の移動(ノックバックの器を進める)。 */
const makeLoop = () => {
  const st = createPhantomTickState();
  return (ticks: number, each?: (i: number) => void) => {
    for (let i = 0; i < ticks; i++) {
      now += 16;
      useGameStore.setState(s => ({ gameTime: s.gameTime + 16 }));
      useGameStore.getState().movePlayer(NO_INPUT, 0.016);
      useGameStore.getState().tickBrawler();
      const gt = useGameStore.getState().gameTime;
      runPhantomTick(en(), st, gt, 0.016, 1, gt, NOOP_PHANTOM_SFX, () => 0.999);
      useGameStore.getState().updateEnemies(0.016);
      each?.(i);
    }
  };
};

beforeEach(() => {
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); setTreesDisabled(false); setTorchesDisabled(false); });

describe('① プレイヤーの格闘の技を幻影がカウンターした → プレイヤーが中断+ノックバック', () => {
  it('拳鬼の構えが1段目を返す: プレイヤーは敵と同じ量のノックバック(拳鬼から離れる向き)・技は断ち切られて次は1段目から', () => {
    setup(40);
    kenkiGuard();
    useGameStore.getState().brawlerPress();
    const loop = makeLoop();
    let kbSeenAt = -1;
    loop(30, i => { if (kbSeenAt < 0 && (pl().knockbackUntil ?? 0) > now) kbSeenAt = i; });
    expect(kbSeenAt).toBeGreaterThanOrEqual(0);
    expect(en().gpParriedAt).toBeDefined();
    expect(pl().brawler?.phase).toBe('idle');
    expect(pl().brawler?.nextStage).toBe(1);
    expect(pcx() - ecx()).toBeGreaterThan(40 + 10); // 押し離された(右へ)
  });

  it('押しの量と向きは近接カウンターと同じ定数(KNOCKBACK_SPEED/KNOCKBACK_DURATION)', () => {
    setup(40);
    kenkiGuard();
    setPlayerBrawler(brawlerStartAttack(initialBrawlerState(), 2, START_GT, false));
    playerBrawlerHit();
    expect(pl().brawlerCounteredAt).toBe(START_GT);
    const loop = makeLoop();
    loop(1);
    expect(pl().knockbackVx).toBeCloseTo(KNOCKBACK_SPEED, 3);
    expect(pl().knockbackVy ?? 0).toBeCloseTo(0, 3);
    expect(pl().knockbackMs).toBe(KNOCKBACK_DURATION);
    expect(pl().brawler?.phase).toBe('idle');
    expect(pl().brawlerCounteredAt).toBeUndefined();
  });

  it('格闘の届く距離が近接の間合いより遠くても(ハンティング・5段目の突き抜け)押される=距離の門を通さない', () => {
    setup(150); // 縁まで近接の間合い(74)より遠い
    kenkiGuard();
    setPlayerBrawler(brawlerStartAttack(initialBrawlerState(), 5, START_GT, false));
    playerBrawlerHit();
    makeLoop()(1);
    expect(pl().knockbackUntil ?? 0).toBeGreaterThan(now);
    expect(pl().knockbackVx).toBeGreaterThan(0);
    expect(pl().brawler?.phase).toBe('idle');
  });

  it('連撃の途中で返されたら、覚えた次の段(先行入力)は出ない', () => {
    setup(40);
    kenkiGuard();
    setPlayerBrawler({ ...brawlerStartAttack(initialBrawlerState(), 2, START_GT, false), buffered: true });
    playerBrawlerHit();
    const loop = makeLoop();
    loop(40);
    expect(pl().brawler?.phase).toBe('idle');
    expect(pl().brawler?.buffered).toBe(false);
  });

  it('秘奥義の途中で返されたら秘奥義ごと打ち切り(技ポイント0)・ノックバック', () => {
    setup(40);
    kenkiGuard();
    setPlayerBrawler(brawlerSecretStart({ ...initialBrawlerState(), points: 20 }, START_GT, now));
    playerBrawlerHit();
    makeLoop()(1);
    expect(pl().brawler?.secret).toBeUndefined();
    expect(pl().brawler?.points).toBe(0);
    expect(pl().knockbackUntil ?? 0).toBeGreaterThan(now);
  });

  it('空中の蹴り(踵落とし)で返されたら、その高さから落ちる(落下の記録)', () => {
    setup(40);
    kenkiGuard();
    // 踵落としを始めて、体が浮いている所まで進めてから返される。
    setPlayerBrawler(brawlerStartTech({ ...initialBrawlerState(), points: 20 }, 'kick', START_GT - 200, BRAWLER_KICK_MAX, false, true));
    playerBrawlerHit();
    makeLoop()(1);
    expect(pl().brawler?.phase).toBe('idle');
    expect(pl().brawler?.counterFall?.fromPx ?? 0).toBeGreaterThan(0);
    expect(pl().knockbackUntil ?? 0).toBeGreaterThan(now);
  });

  it('刀の幻影(格闘を持たない幻影)の振りの窓で返されても同じ(中断+ノックバック)', () => {
    setup(150, false, { gpSwingAt: START_GT });
    setPlayerBrawler(brawlerStartAttack(initialBrawlerState(), 3, START_GT, false));
    playerBrawlerHit();
    expect(en().gpParriedAt).toBe(START_GT);
    makeLoop()(1);
    expect(pl().knockbackUntil ?? 0).toBeGreaterThan(now);
    expect(pl().brawler?.phase).toBe('idle');
  });

  it('格闘でない近接のカウンターは今のまま(近接の間合いの外なら押されない)', () => {
    setup(150, false, { gpSwingAt: START_GT });
    // 格闘の当たりではない(打刻が無い)パリィ=従来どおり距離の門を通る。
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => e.id === K ? { ...e, gpParriedAt: START_GT, gpParryCdUntil: START_GT + 1000 } : e) }));
    makeLoop()(1);
    expect(pl().knockbackUntil ?? 0).toBeLessThan(now);
  });
});

describe('② 拳鬼の格闘の技をプレイヤーがカウンターした → 拳鬼が中断+ノックバック', () => {
  const openWindow = () => useGameStore.setState(s => ({ player: { ...s.player, counterWindowStart: 0, counterWindowEnd: now + 1e9 } }));
  const kenkiCountered = (b: ReturnType<typeof initialBrawlerState>) => {
    setup(40);
    setKenkiBrawler(b);
    openWindow();
    const x0 = ecx();
    let kbAt = -1;
    const hp0 = pl().health;
    makeLoop()(40, i => { if (kbAt < 0 && (en().knockbackUntil ?? 0) > now) kbAt = i; });
    return { kbAt, moved: ecx() - x0, hp0 };
  };
  it('通常の段(1段目)', () => {
    const r = kenkiCountered(brawlerStartAttack(initialBrawlerState(), 1, START_GT, false));
    expect(r.kbAt).toBeGreaterThanOrEqual(0);
    expect(r.moved).toBeLessThan(-20); // プレイヤー(右)から離れる向きへ押された
    expect(pl().health).toBe(r.hp0);
    expect(en().phantomBrawler?.phase === 'idle' || en().phantomBrawler?.startAt !== START_GT).toBe(true);
  });
  it('飛び蹴り(空中の技)', () => {
    const r = kenkiCountered(brawlerStartTech({ ...initialBrawlerState(), points: 20 }, 'kick', START_GT, 1));
    expect(r.kbAt).toBeGreaterThanOrEqual(0);
    expect(r.moved).toBeLessThan(-20);
    expect(pl().health).toBe(r.hp0);
  });
  it('大踏み潰し(技)', () => {
    const r = kenkiCountered(brawlerStartTech({ ...initialBrawlerState(), points: 20 }, 'stomp', START_GT));
    expect(r.kbAt).toBeGreaterThanOrEqual(0);
    expect(r.moved).toBeLessThan(-20);
    expect(pl().health).toBe(r.hp0);
  });
});
