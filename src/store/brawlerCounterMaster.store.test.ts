// ★格闘のときのカウンターマスター(社長指示2026-11-22「雑魚:土竜 ボス:気功を2連発 30%はつける」・受けた直後に自動で反撃)をストアで固める。
//  ・格闘+所持: 構えで雑魚を受ける → 土竜(代金なし・技ポイントは減らない)/ ボス級を受ける → 反撃の気功が2発(間を置いて)
//  ・格闘では待ち時間の前倒しと周りの吹き飛ばしが起きない / 格闘以外は今まで通り前倒し
//  ・覚醒(Lv3)の成立後3秒+30% は格闘でも付く
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, isBrawlerGuarding, applyCounterMasterRefund, counterMasterOnCounterSuccess, skillOutgoingDamageMult, COUNTER_MASTER_AWAKEN_DMG_MULT } from './gameStore';
import { applyEnemyProjectileHits, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { BRAWLER_CM_KIKO_GAP_MS } from '../utils/brawlerCounterMaster';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { computeTimeSlowScale } from '../utils/timeSlowCurve';
import { GAME_SPEED } from '../config/gameSpeed';
import type { Enemy, EnemyType, Projectile } from '../types/game';
setBrawlerTempoAll(1.0);

const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 7_000_000;
const seen = new Set<string>();

const setup = (cmLv = 1) => {
  useGameStore.getState().resetGame('warrior');
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    enemies: [], projectiles: [], pumpkinBlasts: [], brawlerKiko: [],
    player: {
      ...st.player, health: 100, maxHealth: 100, invulnerable: false,
      subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 },
      skills: cmLv > 0 ? ['counter-master'] : [], skillLevels: cmLv > 0 ? { 'counter-master': cmLv } : {},
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
/** ★密着の構え(research/BRAWLER.md §34-7)を避けて、普通の構えを出す(この試験は構えの受けを見る=密着していた敵は掴まない)。 */
const guardTechNoContact = (): boolean => {
  const es = useGameStore.getState().enemies;
  useGameStore.setState({ enemies: [] });
  const r = useGameStore.getState().brawlerTech(0, -1);
  useGameStore.setState(st => ({ enemies: [...es.filter(e => !st.enemies.some(x => x.id === e.id)), ...st.enemies] }));
  return r;
};
const guardNow = (points = 5): number => {
  useGameStore.getState().brawlerPress(); advance(400);
  useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points, gainAt: 0 } } }));
  expect(guardTechNoContact()).toBe(true);
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

/** 1発ずつ、最初に見えた時刻を数える。 */
const kikoFirstSeen = new Map<string, number>();
const advanceTrack = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    advance(10);
    for (const k of counterKiko()) if (!kikoFirstSeen.has(k.id)) kikoFirstSeen.set(k.id, now);
  }
};

describe('格闘のカウンターマスター: 受けた直後に自動で反撃', () => {
  it('雑魚を受ける → 土竜が出る(代金なし)・気功は出ない', () => {
    setup(1);
    useGameStore.setState({ enemies: [enemyAt('zombie', 60, 0, 'z')] });
    guardNow(3);
    hitBy('z', 'zombie');
    const pts = br().points;
    expect(br().tech).toBe('stomp');
    expect(br().mogura).toBe(true);
    expect(br().points).toBe(pts);
    advanceSim(1200);
    expect(seen.size).toBe(0);
  });
  it('未所持なら今どおり地割り(土竜にならない)', () => {
    setup(0);
    useGameStore.setState({ enemies: [enemyAt('zombie', 60, 0, 'z')] });
    guardNow(3);
    hitBy('z', 'zombie');
    expect(br().tech).toBe('stomp');
    expect(br().mogura).toBeFalsy();
  });
  it('ボス級を受ける → 反撃の気功が2発、間を置いて出る・技ポイントは減らない', () => {
    setup(1);
    kikoFirstSeen.clear();
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    guardNow(5);
    expect(hitBy('h', 'hunter', 'hunter-slash')).toBe(false);
    const left = br().points;
    expect(br().guardKiko?.left).toBe(2);
    advanceTrack(1200);
    const times = [...kikoFirstSeen.values()].sort((a, b) => a - b);
    expect(times.length).toBe(2);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(BRAWLER_CM_KIKO_GAP_MS - 10);
    expect(times[1] - times[0]).toBeLessThanOrEqual(BRAWLER_CM_KIKO_GAP_MS + 40);
    expect(br().points).toBe(left);
    expect(en('h').health).toBeLessThan(99999);
  });
  it('未所持なら反撃の気功は今どおり1発', () => {
    setup(0);
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    guardNow(5);
    hitBy('h', 'hunter', 'hunter-slash');
    advanceSim(1200);
    expect(seen.size).toBe(1);
  });
  it('弾を受けた時は自動の反撃を出さない(2026-11-13「弾を受けても…その後の連動技も発動しない」)=二連発にならない', () => {
    setup(1);
    useGameStore.setState({ enemies: [enemyAt('hunter', 400, 0, 'h')] });
    guardNow(5);
    shoot('h', 'hunter');
    advanceSim(1200);
    expect(seen.size).toBeLessThanOrEqual(1);
  });
  it('格闘では待ち時間の前倒しと周りの吹き飛ばしが起きない', () => {
    setup(3);
    const cdEnd = now + 5000;
    useGameStore.setState(st => ({ enemies: [enemyAt('zombie', 0, 90, 'near')], player: { ...st.player, counterCooldownEnd: cdEnd } }));
    applyCounterMasterRefund(now);
    expect(pl().counterCooldownEnd).toBe(cdEnd);
    counterMasterOnCounterSuccess();
    expect(en('near').knockbackUntil ?? 0).toBe(0);
  });
  it('格闘以外は今まで通り前倒しと吹き飛ばしが起きる', () => {
    setup(3);
    const cdEnd = now + 5000;
    useGameStore.setState(st => ({ enemies: [enemyAt('zombie', 0, 90, 'near')], player: { ...st.player, subWeapons: [], subWeaponLevels: {}, counterCooldownEnd: cdEnd } }));
    applyCounterMasterRefund(now);
    expect(pl().counterCooldownEnd).toBe(now);
    counterMasterOnCounterSuccess();
    expect(en('near').knockbackUntil ?? 0).toBeGreaterThan(0);
  });
  it('覚醒(Lv3): 格闘の構えの成立でも成立後3秒・全攻撃+30% が付く', () => {
    setup(3);
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    guardNow(5);
    hitBy('h', 'hunter', 'hunter-slash');
    expect(pl().counterMasterBuffUntil ?? 0).toBeGreaterThan(useGameStore.getState().gameTime);
    expect(skillOutgoingDamageMult(pl())).toBeCloseTo(COUNTER_MASTER_AWAKEN_DMG_MULT, 5);
  });
});
