// ★密着のスープレックスのジャスト(社長指示2026-11-28「格闘で、ジャストタイミングで上おしたとき、スープレックスになりつつジャストカウンターにも して。」
//   補足「そのスープレックスのカウンターに、ジャストの概念が入ってなかった」)と、ジャストカウンターの弾の打ち返し(同日「ジャストカウンターしたとき、弾を弾き返してない」)。
//  ・密着の構え(↑)で相手が攻撃中 → 構えのジャストの窓の間は構えで待つ。窓の内にその相手の攻撃が当たれば、構えのジャストの効果(JUST・+5・Counter!・
//    止め・スロー・成立の記録)が出て、今までどおりスープレックス(雑魚)/サマーソルト(ボス級)。当たらなければ窓の終わりに今までどおり掴む。
//  ・ただの構え(密着でない)のジャストは今までどおり(雑魚=代金なしの地割り / ボス級=押し+反撃の気功)。
//  ・ジャストで受けて出た地割りの最中に飛んできた弾は打ち返す(旧: 地割りで構えが閉じ、弾が当たっていた)。
//  ・弱い構えでもジャストの窓の内に当たった弾は打ち返す(旧: JUST は出るのに弾は防ぐだけ)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { applyEnemyProjectileHits, NOOP_COMBAT_EFFECTS } from '../utils/combatTick';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { BRAWLER_JUST_MS } from '../utils/brawler';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { computeTimeSlowScale } from '../utils/timeSlowCurve';
import { GAME_SPEED } from '../config/gameSpeed';
import type { Enemy, EnemyType, Projectile } from '../types/game';
setBrawlerTempoAll(1.0);

const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 7_000_000;
const setup = () => {
  useGameStore.getState().resetGame('warrior');
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    enemies: [], projectiles: [], pumpkinBlasts: [], brawlerKiko: [],
    player: { ...st.player, health: 100, maxHealth: 100, invulnerable: false, subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 }, lastDirection: { x: 1, y: 0 } },
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const enemyAt = (type: EnemyType, dx: number, dy: number, id: string): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = 99999; e.maxHealth = 99999; e.id = id;
  return e;
};
/** ゲームループ相当(brawlerGuardProjectile.store.test.ts と同じ式)。 */
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
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
/** 密着の構えを避けて普通の構えを出す。 */
const guardNow = (points = 5) => {
  useGameStore.getState().brawlerPress(); advance(400);
  useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points, gainAt: 0 } } }));
  const es = useGameStore.getState().enemies;
  useGameStore.setState({ enemies: [] });
  expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
  useGameStore.setState({ enemies: es });
  advance(20);
};
/** 密着した相手を置いてから構える(密着の構え)。 */
const guardContact = (e: Enemy, points = 5) => {
  useGameStore.getState().brawlerPress(); advance(400);
  useGameStore.setState(st => ({ enemies: [e], player: { ...st.player, brawler: { ...st.player.brawler!, points, gainAt: 0 } } }));
  expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
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
const reflected = () => useGameStore.getState().projectiles.filter(p => p.reflected).length;
const hostileLeft = () => useGameStore.getState().projectiles.filter(p => p.hostile).length;
const untilGrab = (maxMs = 800) => { for (let i = 0; i < maxMs / 10 && !br().contactGrab; i++) advance(10); };

beforeEach(() => { now = 7_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now); vi.spyOn(Math, 'random').mockReturnValue(0.99); });
afterEach(() => { vi.restoreAllMocks(); setTreesDisabled(false); setTorchesDisabled(false); });

const callouts = (text: string) => useGameStore.getState().effects.filter(e => (e as { text?: string }).text === text).length;

describe('密着の構え(↑)で相手が攻撃中: ジャストの瞬間ならスープレックス+ジャストカウンター', () => {
  it('雑魚: 窓の内にその相手の攻撃が当たる → JUST・Counter!・成立の記録・+5 と、今までどおりのスープレックスが同時に出る', () => {
    setup();
    const z = enemyAt('zombie', 30, 0, 'z'); z.biteAt = 1;
    guardContact(z, 5);
    expect(br().tech).toBe('guard');
    expect(br().contactWait?.enemyId).toBe('z');
    expect(br().contactGrab).toBeUndefined();
    advance(50);
    const pts0 = br().points;
    hitBy('z', 'zombie');
    expect(br().justAt).toBe(now); // ジャストカウンター(構えのジャストと同じ判定・同じ効果)
    expect(pl().lastCounterSuccessTime).toBe(now); // 成立の記録
    expect(callouts('JUST')).toBe(1);
    expect(callouts('Counter!')).toBe(1);
    expect(br().points).toBeGreaterThan(pts0); // ジャストの +5
    expect(br().contactGrab).toEqual(expect.objectContaining({ enemyId: 'z', mode: 'suplex' })); // 今までどおりのスープレックス
    expect(br().contactWait).toBeUndefined();
    expect(br().tech).not.toBe('stomp'); // 代金なしの地割りにはならない
    expect(pl().health).toBe(100);
  });
  it('ボス級: JUST と今までどおりのサマーソルト(押されない・反撃の気功は出さない)', () => {
    setup();
    const h = enemyAt('hunter', 40, 0, 'h');
    Object.assign(h, { aiPhase: 'hunter-slash', aiPhaseUntil: useGameStore.getState().gameTime + 300 });
    guardContact(h, 5);
    expect(br().contactWait?.enemyId).toBe('h');
    advance(40);
    hitBy('h', 'hunter', 'hunter-slash');
    expect(br().justAt).toBe(now);
    expect(pl().lastCounterSuccessTime).toBe(now);
    expect(br().contactGrab).toEqual(expect.objectContaining({ enemyId: 'h', mode: 'flipkick' }));
    expect(br().guardKiko).toBeUndefined();
  });
  it('窓の内に当たらなかった: 窓の終わりに今までどおり掴む(JUST は出ない)', () => {
    setup();
    const z = enemyAt('zombie', 30, 0, 'z'); z.biteAt = 1;
    guardContact(z);
    advance(BRAWLER_JUST_MS - 30);
    expect(br().contactGrab).toBeUndefined();
    advance(60);
    expect(br().contactGrab).toEqual(expect.objectContaining({ enemyId: 'z', mode: 'suplex' }));
    expect(br().justAt).toBeUndefined();
    expect(callouts('JUST')).toBe(0);
  });
  it('対照: 攻撃中でない相手はその場で掴む(今どおり)', () => {
    setup();
    guardContact(enemyAt('zombie', 30, 0, 'z'));
    expect(br().contactWait).toBeUndefined();
    expect(br().contactGrab).toEqual(expect.objectContaining({ enemyId: 'z', mode: 'suplex' }));
  });
});

describe('ただの構え(密着でない)のジャストは今までどおり', () => {
  it('雑魚: JUST と代金なしの地割り(掴まない)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 70, 0, 'z')] });
    guardNow(5);
    hitBy('z', 'zombie');
    expect(br().justAt).toBe(now);
    expect(br().tech).toBe('stomp');
    expect(br().contactGrab).toBeUndefined();
  });
  it('ボス級: JUST と押し+反撃の気功', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('hunter', 120, 0, 'h')] });
    guardNow(5);
    hitBy('h', 'hunter', 'hunter-slash');
    expect(br().justAt).toBe(now);
    expect(br().guardKiko).toBeDefined();
    expect(pl().lungeShape).toBe('push');
    expect(br().contactGrab).toBeUndefined();
  });
});

describe('幻影(汎用・孫悟空)も雑魚と同じく投げる(社長指示2026-11-28「スープレックスも雑魚と同じにして」)', () => {
  const phantomAt = (dx: number, id: string, unique?: 'brawler'): Enemy => {
    const e = enemyAt('guardian-phantom', dx, 0, id);
    e.dormant = false; e.bossState = 'chase';
    if (unique) e.phantomUnique = unique;
    return e;
  };
  for (const unique of [undefined, 'brawler'] as const) {
    it(`密着の構え → スープレックス(${unique ?? '汎用'})`, () => {
      setup();
      guardContact(phantomAt(30, 'gp', unique));
      untilGrab(200);
      expect(br().contactGrab).toEqual(expect.objectContaining({ enemyId: 'gp', mode: 'suplex' }));
      const x0 = en('gp').x;
      advance(700);
      expect(en('gp').health).toBeLessThan(99999); // 叩きつけ(小爆発)が当たった
      expect(en('gp').x).not.toBe(x0); // 背中側へ叩きつけて移った(§34-12)
    });
  }
  it('対照: ボス級(ハンター)は今どおりサマーソルト', () => {
    setup();
    guardContact(enemyAt('hunter', 40, 0, 'h'));
    untilGrab(200);
    expect(br().contactGrab?.mode).toBe('flipkick');
  });
});

describe('ジャストカウンターで弾を弾き返す', () => {
  it('ジャストで受けて出た地割りの最中に飛んできた弾を打ち返す(旧: 地割りで構えが閉じ当たっていた)', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 70, 0, 'z'), enemyAt('zombie', -400, 0, 'z2')] });
    guardNow(5);
    hitBy('z', 'zombie');
    expect(br().tech).toBe('stomp');
    expect(br().justStomp).toBe(true);
    advance(30);
    shoot('z2', 'zombie');
    expect(reflected()).toBe(1);
    expect(hostileLeft()).toBe(0);
    expect(pl().health).toBe(100);
  });
  it('密着のスープレックスのジャストの後も、投げの間は弾を打ち返す', () => {
    setup();
    const z = enemyAt('zombie', 30, 0, 'z'); z.biteAt = 1;
    guardContact(z, 5);
    useGameStore.setState(st => ({ enemies: [...st.enemies, enemyAt('zombie', -400, 0, 'z2')] }));
    advance(30);
    hitBy('z', 'zombie');
    expect(br().contactGrab?.mode).toBe('suplex');
    advance(30);
    shoot('z2', 'zombie');
    expect(reflected()).toBe(1);
    expect(pl().health).toBe(100);
  });
  it('弱い構えでもジャストの窓の内の弾は打ち返す / 窓の外は今どおり防ぐだけ', () => {
    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 400, 0, 'z')] });
    guardNow(0);
    expect(br().guardWeak).toBe(true);
    shoot('z', 'zombie');
    expect(br().justAt).toBe(now);
    expect(reflected()).toBe(1);
    expect(pl().health).toBe(100);

    setup();
    useGameStore.setState({ enemies: [enemyAt('zombie', 400, 0, 'z')] });
    guardNow(0);
    advance(BRAWLER_JUST_MS + 20);
    shoot('z', 'zombie');
    expect(reflected()).toBe(0);
    expect(hostileLeft()).toBe(0); // 防いで消える(被害なし)
    expect(pl().health).toBe(100);
  });
});
