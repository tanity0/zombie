// ★構えでボス級の技を受けたら、気功で反撃する(research/BRAWLER.md §32・社長裁定2026-11-12)をストアで実際に動かして固める。
//  ・ボス級の近接の技を構えで受ける → 受けた瞬間の止めが明けた時に、代金なしの気功が1発出て当たる(体力が減る・技ポイントは減らない)
//  ・威力は通常の気功の 1.5 倍
//  ・構え1回で弾を何度打ち返しても1発
//  ・雑魚を受けた時は今どおり潰しで、気功は出ない
//  ・押しの距離は 90 前後
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, isBrawlerGuarding } from './gameStore';
import { applyEnemyProjectileHits, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { BRAWLER_GUARD_KNOCK_PX, BRAWLER_GUARD_KNOCK_MS, BRAWLER_GUARD_COUNTER_KIKO_MULT } from '../utils/brawlerGuard';
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
/** 気功が出てから消える(爆発する)まで進める。 */
const untilKikoGone = () => { let g = 0; while (useGameStore.getState().brawlerKiko.length > 0 && g++ < 200) advance(10); };

beforeEach(() => {
  now = 7_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリ・オーバークロックを出さない
});
afterEach(() => { vi.restoreAllMocks(); setTreesDisabled(false); setTorchesDisabled(false); });

describe('構えでボス級の技を受けたら、気功で反撃する(§32)', () => {
  it('ボス級の近接の技を受ける → 止めが明けた後に代金なしの気功が1発出て当たる・ボスの体力が減る・技ポイントは減らない', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    const left = guardNow(5);
    expect(hitBy('h', 'hunter', 'hunter-slash')).toBe(false);
    expect(br().tech).toBe('guard');
    // 受けた瞬間はまだ撃たない(予約だけ)。撃つ時刻=受けた瞬間の止めの明け(押され始めと同じ)。
    expect(counterKiko().length).toBe(0);
    const r = br().guardKiko!;
    expect(r).toBeDefined();
    expect(r.at).toBeGreaterThanOrEqual(useGameStore.getState().hitstopUntil);
    expect(r.at).toBe(pl().lungeUntil - BRAWLER_GUARD_KNOCK_MS);
    expect(r.targetId).toBe('h');
    advance(10);
    expect(counterKiko().length).toBe(1);
    const k = counterKiko()[0];
    expect(k.dirX).toBeGreaterThan(0.9); // 相手(右)へ
    expect(br().guardKiko).toBeUndefined();
    expect(br().tech).toBe('guard'); // 構えは続く
    expect(guarding()).toBe(true);
    untilKikoGone();
    expect(en('h').health).toBeLessThan(99999);
    expect(br().points).toBe(left);
    advanceSim(1200);
    expect(seen.size).toBe(1);
  });
  it('威力は通常の気功の 1.5 倍', () => {
    // 通常の気功(待機から左の技)
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    useGameStore.getState().brawlerPress(); advance(400);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 2 } } }));
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    let g = 0; while (useGameStore.getState().brawlerKiko.length === 0 && g++ < 100) advance(10);
    expect(useGameStore.getState().brawlerKiko.length).toBe(1);
    untilKikoGone();
    const normal = 99999 - en('h').health;
    expect(normal).toBeGreaterThan(0);
    // 反撃の気功
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    guardNow(5);
    hitBy('h', 'hunter', 'hunter-slash');
    advance(10);
    expect(counterKiko().length).toBe(1);
    untilKikoGone();
    const counter = 99999 - en('h').health;
    expect(counter / normal).toBeGreaterThan(BRAWLER_GUARD_COUNTER_KIKO_MULT * 0.9);
    expect(counter / normal).toBeLessThan(BRAWLER_GUARD_COUNTER_KIKO_MULT * 1.1);
  });
  it('構え1回で弾を何度打ち返しても1発', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 400, 0, 'h')] });
    guardNow(5);
    for (let i = 0; i < 3; i++) {
      expect(guarding(), `${i}発目`).toBe(true);
      shoot('h', 'hunter');
      advance(200);
    }
    advanceSim(1200);
    expect(seen.size).toBe(1);
  });
  it('雑魚を受けた時は今どおり潰しで、気功は出ない', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 60, 0, 'z')] });
    guardNow(3);
    hitBy('z', 'zombie');
    expect(br().tech).toBe('stomp');
    expect(br().guardKiko).toBeUndefined();
    advanceSim(1200);
    expect(seen.size).toBe(0);
  });
  it('押しの距離は 90 前後(ステップより少し短い)', () => {
    expect(BRAWLER_GUARD_KNOCK_PX).toBe(90);
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    guardNow(5);
    const x0 = pl().x;
    hitBy('h', 'hunter', 'hunter-slash');
    advanceSim(BRAWLER_GUARD_KNOCK_MS + 40);
    const moved = x0 - pl().x;
    expect(moved).toBeGreaterThan(90 * GAME_SPEED - 12);
    expect(moved).toBeLessThan(90 * GAME_SPEED + 12);
  });
});
