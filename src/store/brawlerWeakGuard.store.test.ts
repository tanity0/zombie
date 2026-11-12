// ★弱い構え(社長指示2026-11-12「(格闘の)カウンターはポイントが無くても発動。ただし、3未満の時はダメージ防いで弾き飛ばされるのみ」
//   +「それでもジャストカウンターはポイント付与有り」)をストアで実際に動かして固める。
//  ・払えない上フリック=構えが出る(払わない・ステップに変わらない・カウンター窓は張らない)。払えれば今どおり通常の構え。
//  ・弱い構えで受けた=ダメージ0・相手と反対へ押される。潰し・反撃の気功・気絶・光線の中断・Counter!・成立の記録は無い。
//  ・ジャストなら +5 と JUST の表示だけ付く。弾は打ち返さない(防いで消す)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, isBrawlerGuarding, isBrawlerWeakGuarding } from './gameStore';
import { applyEnemyProjectileHits, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { BRAWLER_GUARD_MS } from '../utils/brawler';
import { BRAWLER_GUARD_KNOCK_PX } from '../utils/brawlerGuard';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { computeTimeSlowScale } from '../utils/timeSlowCurve';
import { GAME_SPEED } from '../config/gameSpeed';
import type { Enemy, EnemyType, Projectile } from '../types/game';
setBrawlerTempoAll(1.0);

const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 7_000_000;

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
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const enemyAt = (type: EnemyType, dx: number, dy: number, id: string): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = 99999; e.maxHealth = 99999; e.id = id;
  return e;
};
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    now += 10;
    const s = useGameStore.getState();
    const scale = computeTimeSlowScale(now, s.timeSlowStart, s.timeSlowUntil, s.timeSlowScale, s.timeSlowHoldMs);
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 * scale }));
    useGameStore.getState().movePlayer(NO_INPUT, 0.01 * scale * GAME_SPEED);
    useGameStore.getState().tickBrawler();
  }
};
const br = () => useGameStore.getState().player.brawler!;
const pl = () => useGameStore.getState().player;
const gt = () => useGameStore.getState().gameTime;
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const callouts = (text: string) => useGameStore.getState().effects.filter(e => (e as { text?: string }).text === text).length;
/** 構えを出す。just=true ならジャストの窓の中に留める(進めない)、false なら窓の外まで進める。 */
const guardNow = (points: number, just = false): void => {
  useGameStore.getState().brawlerPress(); advance(400);
  useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points, gainAt: 0, denyAt: 0 } } }));
  expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
  if (!just) advance(200);
  expect(isBrawlerGuarding(pl(), gt())).toBe(true);
};
const hitBy = (id: string, type: EnemyType, move?: string) => {
  const e = en(id);
  return useGameStore.getState().damagePlayer(30, 'test', e.x + e.width / 2, e.y + e.height / 2, type, false, move, id);
};

beforeEach(() => {
  now = 7_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); setTreesDisabled(false); setTorchesDisabled(false); });

describe('払えない構え=弱い構えとして出る', () => {
  it('ポイント0で上フリック→構えが出る・ポイントは0のまま・ステップに変わらない・拒否の印なし・カウンター窓は張らない・長さは通常と同じ', () => {
    setup();
    guardNow(0, true);
    const t0 = gt();
    expect(br().tech).toBe('guard');
    expect(br().guardWeak).toBe(true);
    expect(isBrawlerWeakGuarding(pl(), t0)).toBe(true);
    expect(br().points).toBe(0);
    expect(br().stepAt ?? 0).toBe(0);
    expect(br().denyAt).toBe(0);
    expect(br().guardUntil).toBe(br().guardSince! + BRAWLER_GUARD_MS);
    expect(pl().counterWindowEnd).toBeLessThan(now + 1);
    advance(300);
    expect(pl().counterWindowEnd).toBeLessThan(now + 1); // 構えの間も張り直さない
  });
  it('ポイント3なら今どおり通常の構え(3減る・カウンター窓を張る)', () => {
    setup();
    guardNow(3, true);
    expect(br().guardWeak).toBe(false);
    expect(br().points).toBe(0);
    expect(pl().counterWindowEnd).toBe(now + BRAWLER_GUARD_MS);
  });
});

describe('弱い構えで受けた: ダメージを防いで押されるだけ', () => {
  it('雑魚の攻撃: ダメージ0・相手と反対へ押される・潰しは出ない・気絶なし・Counter! なし・成立の記録は書かない', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 60, 0, 'z')] });
    guardNow(0);
    const hp0 = pl().health;
    const lcs0 = pl().lastCounterSuccessTime;
    const q0 = br().quickUntil;
    const x0 = pl().x;
    expect(hitBy('z', 'zombie')).toBe(false);
    expect(pl().health).toBe(hp0);
    expect(br().tech).toBe('guard');           // 潰しへ移らない
    expect(pl().lungeShape).toBe('push');
    expect(pl().lungeVx).toBeLessThan(0);      // 相手(右)と反対
    expect(pl().lastCounterSuccessTime).toBe(lcs0);
    expect(en('z').stunUntil ?? 0).toBeLessThanOrEqual(gt());
    expect(callouts('Counter!')).toBe(0);
    expect(callouts('JUST')).toBe(0);
    expect(br().quickUntil).toBe(q0);           // 受けた直後の前隙なしも付かない
    expect(br().guardHitAt).toBe(now);          // 受けた所の絵(体の光の膨らみ)の合図は打つ
    expect(useGameStore.getState().timeSlowUntil).toBeLessThanOrEqual(now); // スローなし
    expect(useGameStore.getState().hitstopUntil).toBeLessThanOrEqual(now);  // 停止なし
    advance(400);
    expect(x0 - pl().x).toBeGreaterThan(BRAWLER_GUARD_KNOCK_PX * GAME_SPEED - 12); // 通常の押しと同じ距離
    expect(x0 - pl().x).toBeLessThan(BRAWLER_GUARD_KNOCK_PX * GAME_SPEED + 12);
    expect(br().points).toBe(0);
  });
  it('ボス級の攻撃: 押されるだけ・反撃の気功なし・足止めなし', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    guardNow(2);
    const stop0 = en('h').stunUntil ?? 0;
    expect(hitBy('h', 'hunter')).toBe(false);
    expect(pl().lungeShape).toBe('push');
    expect(br().guardKiko).toBeUndefined();
    advance(500);
    expect(useGameStore.getState().brawlerKiko.length).toBe(0);
    expect(en('h').stunUntil ?? 0).toBe(stop0);
    expect(br().points).toBe(2);
  });
  it('ジャストで受けた: +5(HUD の跳ね)と JUST の表示は付く・反撃の気功と Counter! は無い・構え1回に1度', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    guardNow(0, true);
    const lcs0 = pl().lastCounterSuccessTime;
    hitBy('h', 'hunter');
    expect(br().points).toBe(5);
    expect(br().gainAt).toBe(now);
    expect(callouts('JUST')).toBe(1);
    expect(callouts('Counter!')).toBe(0);
    expect(br().guardKiko).toBeUndefined();
    expect(pl().lastCounterSuccessTime).toBe(lcs0);
    expect(br().guardWeak).toBe(true); // 増えても今の構えは弱いまま(延長すれば通常)
    advance(200);
    hitBy('h', 'hunter');
    expect(br().points).toBe(5); // 同じ構えでは1度だけ(しかも窓の外)
  });
  it('弾は打ち返さない: 防いで消える・ダメージ0・押される', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 400, 0, 'h')] });
    guardNow(0);
    const c = center();
    const proj = {
      id: 'b1', x: c.x - 5, y: c.y - 5, width: 10, height: 10, speed: 0, damage: 10,
      direction: { x: -1, y: 0 }, weaponType: 'handgun', hostile: true, reflected: false, passthrough: false, hitEnemies: [], duration: 5000, createdAt: now, critChance: 0,
      ownerId: 'h', ownerType: 'hunter',
    } as unknown as Projectile;
    useGameStore.setState({ projectiles: [proj] });
    const hp0 = pl().health;
    const lcs0 = pl().lastCounterSuccessTime;
    applyEnemyProjectileHits(now, pl(), false, 0, gt(), NOOP_COMBAT_EFFECTS, { grenadeBlastRadius: 0, grenadeBlastDamageMult: 0, counterReflectSlowMs: 0 });
    expect(useGameStore.getState().projectiles.find(p => p.id === 'b1')).toBeUndefined();
    expect(pl().health).toBe(hp0);
    expect(pl().lungeShape).toBe('push');
    expect(pl().lastCounterSuccessTime).toBe(lcs0);
  });
});
