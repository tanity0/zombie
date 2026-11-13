// ★格闘のカウンター(構え)で弾を受けた時(社長指示2026-11-13「格闘のカウンター、弾を受けてもカウンターの発動はするがカウンターモードは解除しない。その後の連動技も発動しない。」)。
//  ・弾=カウンターは成立する(打ち返す・成立の記録)が、構えは残り時間のまま続き、潰し・反撃の気功は出ない
//  ・近接=今どおり(雑魚=潰しで構えが終わる / 雑魚より上=反撃の気功)
//  ・ジャストの +5 は弾でも今どおり入る
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, isBrawlerGuarding } from './gameStore';
import { applyEnemyProjectileHits, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { brawlerGuardOutcome, brawlerGuardCounterDue, brawlerGuardKnockPx, BRAWLER_GUARD_KNOCK_PX, BRAWLER_GUARD_PROJECTILE_KNOCK_PX } from '../utils/brawlerGuard';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { computeTimeSlowScale } from '../utils/timeSlowCurve';
import { GAME_SPEED } from '../config/gameSpeed';
import type { Enemy, EnemyType, Projectile } from '../types/game';
setBrawlerTempoAll(1.0);

const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 7_000_000;
const seen = new Set<string>();

const setup = () => {
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    enemies: [], projectiles: [], pumpkinBlasts: [], brawlerKiko: [],
    player: {
      ...st.player, health: 100, maxHealth: 100, invulnerable: false,
      subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 },
      lastDirection: { x: 1, y: 0 },
    },
  }));
  seen.clear();
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const enemyAt = (type: EnemyType, dx: number, dy: number, id: string): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = 99999; e.maxHealth = 99999; e.id = id;
  return e;
};
const counterKiko = () => useGameStore.getState().brawlerKiko.filter(k => k.counter === true);
/** ゲームループ相当(brawlerGuard.store.test.ts と同じ式)。出た反撃の気功の id を数える。 */
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    now += 10;
    const s = useGameStore.getState();
    const scale = computeTimeSlowScale(now, s.timeSlowStart, s.timeSlowUntil, s.timeSlowScale, s.timeSlowHoldMs);
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 * scale }));
    useGameStore.getState().movePlayer(NO_INPUT, 0.01 * scale * GAME_SPEED);
    useGameStore.getState().tickBrawler();
    for (const k of counterKiko()) seen.add(k.id);
  }
};
const advanceSim = (ms: number) => { const g0 = useGameStore.getState().gameTime; let guard = 0; while (useGameStore.getState().gameTime - g0 < ms && guard++ < 5000) advance(10); };
const br = () => useGameStore.getState().player.brawler!;
const pl = () => useGameStore.getState().player;
const guarding = () => isBrawlerGuarding(pl(), useGameStore.getState().gameTime);
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const guardNow = (points = 5): number => {
  useGameStore.getState().brawlerPress(); advance(400);
  useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points, gainAt: 0 } } }));
  expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
  advance(20);
  expect(guarding()).toBe(true);
  return br().points;
};
const hitBy = (id: string, type: EnemyType, move?: string) => {
  const e = en(id);
  return useGameStore.getState().damagePlayer(30, 'test', e.x + e.width / 2, e.y + e.height / 2, type, false, move, id);
};
const shoot = (ownerId: string, ownerType: EnemyType) => {
  const c = center();
  const proj = {
    id: `b-${now}`, x: c.x - 5, y: c.y - 5, width: 10, height: 10, speed: 0, damage: 10,
    direction: { x: -1, y: 0 }, weaponType: 'handgun', hostile: true, reflected: false, passthrough: false, hitEnemies: [], duration: 5000, createdAt: now, critChance: 0,
    ownerId, ownerType,
  } as unknown as Projectile;
  useGameStore.setState({ projectiles: [proj] });
  applyEnemyProjectileHits(now, pl(), false, 0, useGameStore.getState().gameTime, NOOP_COMBAT_EFFECTS, { grenadeBlastRadius: 0, grenadeBlastDamageMult: 0, counterReflectSlowMs: 0 });
};

beforeEach(() => {
  now = 7_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリ・オーバークロックを出さない
});
afterEach(() => { vi.restoreAllMocks(); setTreesDisabled(false); setTorchesDisabled(false); });

describe('純関数: 弾の受けは連動技を出さない', () => {
  it('雑魚の弾=何も出さない(潰しにしない)/ 雑魚より上の弾=押されるだけ(気功は予約しない・押しは近接より短い)', () => {
    expect(brawlerGuardOutcome({ throttled: false, projectile: true, classes: ['mob'] })).toBe('none');
    expect(brawlerGuardOutcome({ throttled: false, projectile: true, classes: ['boss'] })).toBe('knockback');
    expect(brawlerGuardKnockPx(true)).toBe(BRAWLER_GUARD_PROJECTILE_KNOCK_PX);
    expect(brawlerGuardKnockPx(undefined)).toBe(BRAWLER_GUARD_KNOCK_PX);
    expect(BRAWLER_GUARD_PROJECTILE_KNOCK_PX).toBeLessThan(BRAWLER_GUARD_KNOCK_PX);
    expect(brawlerGuardOutcome({ throttled: false, classes: ['mob'] })).toBe('stomp');
    expect(brawlerGuardCounterDue({ outcome: 'knockback', guardSince: 1, firedFor: undefined, projectile: true })).toBe(false);
    expect(brawlerGuardCounterDue({ outcome: 'knockback', guardSince: 1, firedFor: undefined })).toBe(true);
  });
});

describe('構えで弾を受けた時(社長指示2026-11-13)', () => {
  it('雑魚の弾: 打ち返して成立するが、構えは続き(残り時間そのまま)潰しは出ない', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 400, 0, 'z')] });
    guardNow(3);
    const until = br().guardUntil;
    const t0 = now;
    shoot('z', 'zombie');
    expect(useGameStore.getState().projectiles.some(p => p.hostile)).toBe(false); // 打ち返した(敵の弾として残らない)
    expect(pl().lastCounterSuccessTime).toBe(t0); // カウンターは成立している
    expect(br().tech).toBe('guard');
    expect(br().guardUntil).toBe(until);
    expect(guarding()).toBe(true);
    advance(100);
    expect(br().tech).toBe('guard');
    expect(guarding()).toBe(true);
  });
  it('ボス級の弾: 構えは続き、反撃の気功は出ない', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 400, 0, 'h')] });
    guardNow(5);
    const until = br().guardUntil;
    shoot('h', 'hunter');
    expect(pl().lastCounterSuccessTime).toBe(now);
    expect(br().tech).toBe('guard');
    expect(br().guardUntil).toBe(until);
    expect(br().guardKiko).toBeUndefined();
    advanceSim(1200);
    expect(seen.size).toBe(0);
  });
  it('ボス級の弾=少しだけ押される(近接の押しより短い)/ 雑魚の弾=押されない / 近接のボス級=今どおり(社長指示2026-11-13「あ、少しだけ押される で」)', () => {
    const pushed = (fn: () => void): number => {
      const x0 = pl().x, y0 = pl().y;
      fn();
      advanceSim(600);
      return Math.hypot(pl().x - x0, pl().y - y0);
    };
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 400, 0, 'h')] });
    guardNow(5);
    const dProj = pushed(() => shoot('h', 'hunter'));
    expect(pl().lastCounterSuccessTime).toBeGreaterThan(0);
    expect(br().tech).toBe('guard');
    expect(dProj).toBeGreaterThan(BRAWLER_GUARD_PROJECTILE_KNOCK_PX * 0.7);
    expect(dProj).toBeLessThan(BRAWLER_GUARD_PROJECTILE_KNOCK_PX * 1.3);

    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 400, 0, 'z')] });
    guardNow(3);
    const dMob = pushed(() => shoot('z', 'zombie'));
    expect(dMob).toBe(0);
    expect(br().tech).toBe('guard');

    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    guardNow(5);
    const dMelee = pushed(() => hitBy('h', 'hunter', 'hunter-slash'));
    expect(dMelee).toBeGreaterThan(BRAWLER_GUARD_KNOCK_PX * 0.7);
    expect(dMelee).toBeGreaterThan(dProj * 2);
  });
  it('弱い構え(3点未満)+ボス級の弾=約30px押される / 弱い構えの近接は今どおり(社長指示2026-11-13「ボスの弾の弾かれは少しだけ」)', () => {
    const pushed = (fn: () => void): number => {
      const x0 = pl().x, y0 = pl().y;
      fn();
      advanceSim(600);
      return Math.hypot(pl().x - x0, pl().y - y0);
    };
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 400, 0, 'h')] });
    guardNow(0);
    expect(br().guardWeak).toBe(true);
    const dProj = pushed(() => shoot('h', 'hunter'));
    expect(dProj).toBeGreaterThan(BRAWLER_GUARD_PROJECTILE_KNOCK_PX * 0.7);
    expect(dProj).toBeLessThan(BRAWLER_GUARD_PROJECTILE_KNOCK_PX * 1.3);

    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    guardNow(0);
    expect(br().guardWeak).toBe(true);
    const dMelee = pushed(() => hitBy('h', 'hunter', 'hunter-slash'));
    expect(dMelee).toBeGreaterThan(BRAWLER_GUARD_KNOCK_PX * 0.7);
  });
  it('ジャストの +5 は弾でも今どおり入る', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 400, 0, 'h')] });
    const left = guardNow(3); // 払った後 0 → +5(上限に掛からない)
    shoot('h', 'hunter');
    expect(br().justAt).toBe(now);
    expect(br().points).toBe(left + 5);
    expect(br().tech).toBe('guard');
  });
  it('対照: 近接は今どおり(雑魚=潰しで構えが終わる / ボス級=反撃の気功が出る)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 60, 0, 'z')] });
    guardNow(3);
    hitBy('z', 'zombie');
    expect(br().tech).toBe('stomp');
    expect(br().guardUntil).toBe(0);

    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    guardNow(5);
    hitBy('h', 'hunter', 'hunter-slash');
    expect(br().guardKiko).toBeDefined();
    advanceSim(1200);
    expect(seen.size).toBe(1);
  });
});
