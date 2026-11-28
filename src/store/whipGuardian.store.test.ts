// 守護霊の鞭: 絡め取り → 振り回し → 自動の投げ → 着弾の爆発(research/WHIP_FOLLOWUP.md §8-5・社長指示「後回しにしてたムチとか、幻影や守護霊に反映」)。
// プレイヤーと同じ関数に「掴んでいる人=守護霊」を渡して通すことを、ストアを動かして固める。幻影は掴まない(utils/whipSwing の whipGrabberCanGrab)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, swingGhostWhip, ghostWhipHandsBusy } from './gameStore';
import type { Enemy, EnemyType, PlayerBuildSnapshot, Summon } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { clearGhostBuildCache } from '../utils/ghostBuild';
import { WHIP_SWING_MAX_MS, type WhipSwingState } from '../utils/whipSwing';

const GID = 'ghost-whip';
let now = 21_000_000;
const NO = { up: false, down: false, left: false, right: false } as never;
const st = () => useGameStore.getState();
const center = () => { const p = st().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const STUN = { stunUntil: 1e12 } as Partial<Enemy>;
const enemyAt = (type: EnemyType, cx: number, cy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const e = spawnEnemyAt(type, 0, 0, st().gameTime);
  return { ...e, x: cx - e.width / 2, y: cy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => st().enemies.find(e => e.id === id);
const snap = (): PlayerBuildSnapshot => ({
  maxHealth: 100, speed: 200, level: 1,
  gunKeys: ['handgun-t1'], activeGunKey: 'handgun-t1', meleeKey: 'knife-t1',
  subWeapons: ['whip'], subWeaponLevels: {}, skills: [], skillLevels: {},
});
/** 守護霊の体の中心を (cx,cy) に置く。 */
const ghostAt = (cx: number, cy: number): Summon => ({
  id: GID, x: cx - 16, y: cy - 16, width: 32, height: 32, speed: 200,
  health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
  createdAt: Date.now(), lastHit: 0, ghostBossId: 'boss-x', ghostBuild: snap(),
});
const gsw = (): WhipSwingState | undefined => st().whipSwingGhosts[GID];
const step = (ms = 10) => {
  now += ms;
  useGameStore.setState(s => ({ gameTime: s.gameTime + ms, realGameTime: s.realGameTime + ms, hitstopUntil: 0 }));
  st().movePlayer(NO, ms / 1000);
  st().updateEnemies(ms / 1000);
  if (st().whipSwing) st().tickWhipSwing(); // ループと同じ順(敵の更新の後・プレイヤー→守護霊)
  st().tickGhostWhipSwings();
};

beforeEach(() => {
  now = 21_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
  st().resetGame('warrior');
  clearGhostBuildCache();
  useGameStore.setState(s => ({
    m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false }, breakableProps: [],
    player: { ...s.player, subWeapons: ['whip'], skills: [], skillLevels: {}, whipCharged: false, whipHitCount: 0, counterCooldownEnd: 0, pendingSwingAt: 0, lastDirection: { x: 1, y: 0 }, health: 9999, maxHealth: 9999 },
  }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('守護霊の鞭(§8-5): 掴む → 守護霊の周りを回す → 最長で自動で投げる → 着弾で爆発', () => {
  it('線に掛かった気絶の雑魚を掴み(打撃は通さない)、守護霊を中心に回し、最長で自動で投げて着弾で爆発する', () => {
    const c = center();
    const gx = c.x - 400, gy = c.y;
    useGameStore.setState({ summons: [ghostAt(gx, gy)], enemies: [enemyAt('zombie', gx + 90, gy, 'z', STUN)] });
    const res = swingGhostWhip(GID, 1, 0);
    expect(res.grabbed).toBe(true);
    const sw0 = gsw()!;
    expect(sw0.enemyId).toBe('z');
    expect(sw0.phase).toBe('swing');
    expect(en('z')!.whipHeld).toBe(true);
    expect(en('z')!.health).toBe(99999); // 掴みに置き換える(処刑の打撃を通さない)
    expect(st().whipSwing).toBeNull(); // プレイヤーの台帳は使わない
    expect(ghostWhipHandsBusy(GID)).toBe(true);
    // 回す中心は守護霊(プレイヤーではない)
    for (let i = 0; i < 80; i++) step(10);
    const z = en('z')!;
    const rG = Math.hypot(z.x + z.width / 2 - gx, z.y + z.height / 2 - gy);
    expect(rG).toBeCloseTo(gsw()!.rNow, 0);
    expect(rG).toBeLessThan(sw0.reach);
    // フリックは無い=最長の時間で自動で投げる
    for (let i = 0; i < 400 && gsw()?.phase === 'swing'; i++) step(10);
    expect(gsw() === undefined || gsw()!.phase === 'thrown').toBe(true);
    let landed = false;
    for (let i = 0; i < 200 && !landed; i++) { step(10); landed = gsw() === undefined; }
    expect(landed).toBe(true);
    const zz = en('z');
    expect(!zz || zz.health <= 0).toBe(true); // 掴んだ雑魚は着弾の爆発で必ず死ぬ(プレイヤーと同じ)
    expect(ghostWhipHandsBusy(GID)).toBe(false);
  });

  it('自動の投げの時刻はプレイヤーと同じ(最長 WHIP_SWING_MAX_MS)', () => {
    const c = center();
    const gx = c.x - 400, gy = c.y;
    useGameStore.setState({ summons: [ghostAt(gx, gy)], enemies: [enemyAt('zombie', gx + 90, gy, 'z', STUN)] });
    swingGhostWhip(GID, 1, 0);
    const t0 = st().gameTime;
    for (let i = 0; i < 400 && gsw()?.phase === 'swing'; i++) step(10);
    const el = st().gameTime - t0;
    expect(el).toBeGreaterThanOrEqual(WHIP_SWING_MAX_MS);
    expect(el).toBeLessThan(WHIP_SWING_MAX_MS + 30);
  });

  it('掴んでいる間は守護霊の鞭の通常の振りを出さない', () => {
    const c = center();
    const gx = c.x - 400, gy = c.y;
    useGameStore.setState({ summons: [ghostAt(gx, gy)], enemies: [enemyAt('zombie', gx + 90, gy, 'z', STUN)] });
    swingGhostWhip(GID, 1, 0);
    // 線の上に普通の敵を置いて振らせても、当たらない・線の絵も出ない
    useGameStore.setState(s => ({ enemies: [...s.enemies, enemyAt('zombie', gx, gy + 90, 'o')] }));
    const fx0 = st().effects.filter(e => e.kind === 'whip').length;
    const r = swingGhostWhip(GID, 0, 1);
    expect(r.hits).toBe(0);
    expect(en('o')!.health).toBe(99999);
    expect(st().effects.filter(e => e.kind === 'whip').length).toBe(fx0);
  });

  it('ボス級は掴まない(守護霊は叩きつけを持たない)・気絶していない敵は掴まない', () => {
    const c = center();
    const gx = c.x - 400, gy = c.y;
    useGameStore.setState({ summons: [ghostAt(gx, gy)], enemies: [enemyAt('hunter', gx + 100, gy, 'h', STUN), enemyAt('zombie', gx + 60, gy + 4, 'n')] });
    const r = swingGhostWhip(GID, 1, 0);
    expect(r.grabbed).toBe(false);
    expect(gsw()).toBeUndefined();
    expect(en('h')!.whipHeld).toBeFalsy();
    expect(en('n')!.whipHeld).toBeFalsy();
  });
});

describe('プレイヤーと守護霊が同時に別の敵を掴む(1体ずつ・同じ敵は二重に掴まない)', () => {
  it('プレイヤーが掴んだ敵は、守護霊の線に掛かっても掴まず、その奥の別の気絶の敵を掴む', () => {
    const c = center();
    useGameStore.setState({ enemies: [enemyAt('zombie', c.x + 100, c.y, 'z', STUN)] });
    useGameStore.setState(s => ({ player: { ...s.player, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
    st().triggerCounter();
    expect(st().whipSwing?.enemyId).toBe('z');
    // 守護霊の線が z(掴まれている)と z2 を通るように置く
    const z = en('z')!;
    const zx = z.x + z.width / 2, zy = z.y + z.height / 2;
    useGameStore.setState(s => ({
      summons: [ghostAt(zx, zy - 60)],
      enemies: [...s.enemies, enemyAt('zombie', zx, zy + 40, 'z2', STUN)],
    }));
    const r = swingGhostWhip(GID, 0, 1);
    expect(r.grabbed).toBe(true);
    expect(gsw()!.enemyId).toBe('z2');
    expect(st().whipSwing!.enemyId).toBe('z');
    // 両方が回り続ける(それぞれ自分の台帳)
    for (let i = 0; i < 20; i++) step(10);
    expect(st().whipSwing?.enemyId).toBe('z');
    expect(gsw()?.enemyId).toBe('z2');
    expect(en('z')!.whipHeld).toBe(true);
    expect(en('z2')!.whipHeld).toBe(true);
  });

  it('台帳に掴まれていると載っている敵は、印(whipHeld)が無くても掴まない(二重の守り)', () => {
    const c = center();
    const gx = c.x - 400, gy = c.y;
    useGameStore.setState({
      summons: [ghostAt(gx, gy)],
      enemies: [enemyAt('zombie', gx + 60, gy, 'a', STUN), enemyAt('zombie', gx + 110, gy, 'b', STUN)],
    });
    useGameStore.setState({ whipSwing: { enemyId: 'a', phase: 'thrown' } as WhipSwingState });
    const r = swingGhostWhip(GID, 1, 0);
    expect(r.grabbed).toBe(true);
    expect(gsw()!.enemyId).toBe('b');
  });

  it('守護霊が消えたら、掴んでいた敵をその場で放す', () => {
    const c = center();
    const gx = c.x - 400, gy = c.y;
    useGameStore.setState({ summons: [ghostAt(gx, gy)], enemies: [enemyAt('zombie', gx + 90, gy, 'z', STUN)] });
    swingGhostWhip(GID, 1, 0);
    step(10);
    useGameStore.setState({ summons: [] });
    step(10);
    expect(gsw()).toBeUndefined();
    expect(en('z')!.whipHeld).toBeFalsy();
  });
});
