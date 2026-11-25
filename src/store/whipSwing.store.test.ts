// 鞭の作り直し(research/WHIP_FOLLOWUP.md §8): 当てる→絡め取る→回す→投げる→着弾の爆発、をストアを動かして固める。ボス級は掴まない。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { WHIP_SWING_ACCEL_MS, WHIP_SWING_MAX_MS, WHIP_SWING_PERIOD_MS } from '../utils/whipSwing';

let now = 15_000_000;
const NO = { up: false, down: false, left: false, right: false } as never;
const st = () => useGameStore.getState();
const center = () => { const p = st().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, st().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => st().enemies.find(e => e.id === id)!;
const ecOf = (id: string) => { const e = en(id); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; };
const step = (ms = 10) => {
  now += ms;
  useGameStore.setState(s => ({ gameTime: s.gameTime + ms, realGameTime: s.realGameTime + ms, hitstopUntil: 0 }));
  st().movePlayer(NO, ms / 1000);
  st().updateEnemies(ms / 1000);
  if (st().whipSwing) st().tickWhipSwing(); // ループと同じく敵の更新の後
};
const run = (ms: number) => { const end = now + ms; while (now < end) step(10); };
const swing = () => {
  useGameStore.setState(s => ({ player: { ...s.player, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
  return st().triggerCounter();
};

beforeEach(() => {
  now = 15_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // クリを出さない
  st().resetGame('warrior');
  useGameStore.setState(s => ({
    m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false }, breakableProps: [],
    player: { ...s.player, subWeapons: ['whip'], skills: [], skillLevels: {}, whipCharged: false, whipHitCount: 0, counterCooldownEnd: 0, pendingSwingAt: 0, lastDirection: { x: 1, y: 0 }, health: 9999, maxHealth: 9999 },
  }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('当てる→掴む→回す→投げる→爆発', () => {
  it('雑魚に当てると一番近い1体を掴み、加速しながらプレイヤーの周りを回り、触れた敵を1周1回弾き、投げると着弾で爆発する', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z'), place('zombie', 140, 0, 'z2')] });
    swing();
    const sw0 = st().whipSwing!;
    expect(sw0.enemyId).toBe('z'); // 近い方
    expect(sw0.phase).toBe('swing');
    expect(en('z').whipHeld).toBe(true);
    expect(en('z').health).toBeLessThan(99999); // 1撃目のダメージは今のまま
    expect(en('z2').whipHeld).toBeFalsy();
    // 回り出し: 掴んだ直後は遅く、加速の後は一定の速さで回る(半径=届く距離×0.6 へ寄る)
    const c = center();
    const angAt = () => { const p = ecOf('z'); return Math.atan2(p.y - c.y, p.x - c.x); };
    run(50);
    const a50 = angAt();
    run(WHIP_SWING_ACCEL_MS);
    const r = Math.hypot(ecOf('z').x - c.x, ecOf('z').y - c.y);
    expect(r).toBeCloseTo(sw0.radius, 0);
    expect(Math.abs(a50)).toBeLessThan(0.6); // 出だしはゆっくり
    // 回る先に別の敵を置く → 1周に1回だけ当たり、外へ弾かれる
    const aNow = angAt();
    const ahead = aNow + sw0.dir * 1.2;
    const ox = Math.cos(ahead) * sw0.radius, oy = Math.sin(ahead) * sw0.radius;
    useGameStore.setState(s => ({ enemies: [...s.enemies.filter(e => e.id !== 'z2'), place('zombie', ox, oy, 'o')] }));
    const hpO = en('o').health;
    run(Math.round(WHIP_SWING_PERIOD_MS * 0.4));
    const hpO1 = en('o').health;
    expect(hpO1).toBeLessThan(hpO);
    const kb = { x: en('o').knockbackVx ?? 0, y: en('o').knockbackVy ?? 0 };
    expect(kb.x * Math.cos(ahead) + kb.y * Math.sin(ahead)).toBeGreaterThan(0); // 外向き
    // 弾かれた敵を回る円の上へ戻しても、1周ぶんの時間が経つまでは二度目は当たらない
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === 'o' ? { ...e, x: c.x + Math.cos(angAt()) * sw0.radius - e.width / 2, y: c.y + Math.sin(angAt()) * sw0.radius - e.height / 2, knockbackVx: 0, knockbackVy: 0, knockbackUntil: now } : e)) }));
    step(10);
    expect(en('o').health).toBe(hpO1);
    // 振り回し中は鞭の通常の振りは出ない(フリック=その向きへ投げる)
    useGameStore.setState(s => ({ enemies: s.enemies.filter(e => e.id !== 'o') }));
    expect(st().tryFlickFollowup(1, 0)).toBe(true);
    const sw1 = st().whipSwing!;
    expect(sw1.phase).toBe('thrown');
    // 飛ぶ先に敵を置く(投げた敵が触れたら着弾)
    const tx = (sw1.fromX ?? 0) + 160 - center().x, ty = (sw1.fromY ?? 0) - center().y;
    useGameStore.setState(s => ({ enemies: [...s.enemies, place('zombie', tx, ty, 't')] }));
    const hpZ = en('z').health, hpT = en('t').health;
    let landed = false;
    for (let i = 0; i < 100 && !landed; i++) { step(10); landed = st().whipSwing === null; }
    expect(landed).toBe(true);
    expect(en('z').whipHeld).toBeFalsy();
    expect(en('z').health).toBeLessThan(hpZ); // 投げた本人も爆発を受ける
    expect(en('t').health).toBeLessThan(hpT); // 当たった敵も
    expect(ecOf('z').x - (sw1.fromX ?? 0)).toBeGreaterThan(60); // 投げた向きへ飛んだ
  });

  it('ボス級は掴まない(打撃と押しは今のまま)', () => {
    useGameStore.setState({ enemies: [place('hunter', 110, 0, 'h')] });
    swing();
    expect(en('h').health).toBeLessThan(99999);
    expect(st().whipSwing).toBeNull();
    expect(en('h').whipHeld).toBeFalsy();
  });

  it('フリックしないと最長の時間で自動で投げる', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    run(WHIP_SWING_MAX_MS - 50);
    expect(st().whipSwing?.phase).toBe('swing');
    run(80);
    const sw = st().whipSwing;
    expect(sw === null || sw.phase === 'thrown').toBe(true);
  });

  it('振り回し中の近接=今の向きへ投げ+カウンター窓', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    run(200);
    useGameStore.setState(s => ({ player: { ...s.player, lastDirection: { x: 0, y: 1 }, counterCooldownEnd: 0, counterWindowEnd: 0 } }));
    st().triggerCounter();
    const sw = st().whipSwing!;
    expect(sw.phase).toBe('thrown');
    expect(sw.uy).toBeCloseTo(1);
    expect(st().player.counterWindowEnd).toBeGreaterThan(now);
  });

  it('技の行(大車輪)はプレイヤーの入力で投げた着弾だけ。自動の投げでは出ない。投げた敵の回りは振り回しの向きを引き継ぐ', () => {
    const techRows = () => st().skillProcFeed.filter(r => r.key === 'tech:whipslam').length;
    const landNow = () => { for (let i = 0; i < 200 && st().whipSwing; i++) step(10); };
    // 入力(フリック)で投げる
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')], skillProcFeed: [] });
    swing();
    run(200);
    const dir = st().whipSwing!.dir;
    expect(st().tryFlickFollowup(0, 1)).toBe(true);
    expect(en('z').brThrowSpin?.dir).toBe(dir);
    landNow();
    expect(st().whipSwing).toBeNull();
    expect(techRows()).toBe(1);
    // 自動で投げる
    useGameStore.setState({ enemies: [place('zombie', -100, 0, 'y')], skillProcFeed: [] });
    run(1000);
    useGameStore.setState(s => ({ player: { ...s.player, lastDirection: { x: -1, y: 0 } } }));
    swing();
    expect(st().whipSwing?.enemyId).toBe('y');
    run(WHIP_SWING_MAX_MS + 50);
    landNow();
    expect(st().whipSwing).toBeNull();
    expect(techRows()).toBe(0);
  });

  it('掴まれている敵に弾は当たらない・毒などで死んだらその場で着弾', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z')] });
    swing();
    run(100);
    const hp = en('z').health;
    st().damageEnemy('z', 50, false, false, false, 'gun');
    expect(en('z').health).toBe(hp); // 弾は素通り
    const p = ecOf('z');
    useGameStore.setState(s => ({ enemies: [...s.enemies, place('zombie', p.x - center().x + 30, p.y - center().y, 'n')] }));
    const hpN = en('n').health;
    st().damageEnemy('z', 9_999_999, false, false, false, 'dot');
    step(10);
    expect(st().whipSwing).toBeNull();
    expect(en('n').health).toBeLessThan(hpN); // その場の爆発
  });
});
