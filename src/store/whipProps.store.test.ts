// 大車輪で置き物を壊す(社長指示2026-11-27「大車輪、緑卵とか松明とか壊せる様にして欲しい」)。
// ①振り回している体が触れた松明・緑卵が壊れる(松明は壊して通り抜ける=回す半径を縮めない) ②投げて飛んでいる体が通った道の松明が壊れ、そのまま飛ぶ
// ③着弾の爆発の範囲の松明・緑卵が壊れる(雑魚の投げ・ボスの叩きつけ)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { BreakableProp, Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { WHIP_SWING_ACCEL_MS } from '../utils/whipSwing';
import { torchRect } from '../world/torches';
import { mineRect } from '../world/mines';

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
const STUN = { stunUntil: 1e12 } as Partial<Enemy>;
const step = (ms = 10) => {
  now += ms;
  useGameStore.setState(s => ({ gameTime: s.gameTime + ms, realGameTime: s.realGameTime + ms, hitstopUntil: 0 }));
  st().movePlayer(NO, ms / 1000);
  st().updateEnemies(ms / 1000);
  if (st().whipSwing) st().tickWhipSwing();
};
const run = (ms: number) => { const end = now + ms; while (now < end) step(10); };
const swing = () => {
  useGameStore.setState(s => ({ player: { ...s.player, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
  return st().triggerCounter();
};
const torch = (id: string, footX: number, footY: number): BreakableProp => {
  const r = torchRect({ footX, footY, scale: 1 });
  return { id, ...r, footX, footY, scale: 1, health: 12, maxHealth: 12, type: 'torch', lastHit: 0 };
};
const egg = (id: string, footX: number, footY: number): BreakableProp => {
  const r = mineRect({ footX, footY, scale: 1 });
  return { id, ...r, footX, footY, scale: 1, health: 10, maxHealth: 10, type: 'mine', lastHit: 0 };
};
const alive = (id: string) => st().breakableProps.some(p => p.id === id);
const addProps = (...ps: BreakableProp[]) => useGameStore.setState(s => ({ breakableProps: [...s.breakableProps, ...ps] }));

beforeEach(() => {
  now = 15_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  st().resetGame('warrior');
  useGameStore.setState(s => ({
    m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false }, breakableProps: [], destroyedBreakableProps: {},
    player: { ...s.player, subWeapons: ['whip'], skills: [], skillLevels: {}, whipCharged: false, whipHitCount: 0, counterCooldownEnd: 0, pendingSwingAt: 0, lastDirection: { x: 1, y: 0 }, health: 9999, maxHealth: 9999 },
  }));
  const c = center();
  useGameStore.setState(s => ({ camera: { x: c.x - s.gameBounds.width / 2, y: c.y - s.gameBounds.height / 2 }, viewZoom: 1 }));
});
afterEach(() => { vi.restoreAllMocks(); });

/** 掴んで回り出し、一定の速さになった所で、回る先(角度 +ahead)の円の上・体の足元の高さに置き物を置く。 */
const grabAndPlaceAhead = (make: (id: string, x: number, y: number) => BreakableProp, ahead = 1.0): { id: string; radius: number } => {
  useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', STUN)] });
  swing();
  const sw0 = st().whipSwing!;
  expect(sw0.phase).toBe('swing');
  run(WHIP_SWING_ACCEL_MS);
  const c = center();
  const p = ecOf('z');
  const a = Math.atan2(p.y - c.y, p.x - c.x) + sw0.dir * ahead;
  const e = en('z');
  const fx = c.x + Math.cos(a) * sw0.radius, fy = c.y + Math.sin(a) * sw0.radius + e.height / 2 - 2;
  addProps(make('prop', fx, fy));
  return { id: 'prop', radius: sw0.radius };
};

describe('大車輪で置き物を壊す', () => {
  it('振り回している体が触れた松明が壊れる(壊れた印・落とし物あり)。松明では回す半径を縮めない=壊して通る', () => {
    const { id, radius } = grabAndPlaceAhead(torch);
    expect(alive(id)).toBe(true);
    const pickups0 = st().pickups.length;
    let minR = Infinity;
    for (let i = 0; i < 60 && alive(id); i++) { step(10); minR = Math.min(minR, st().whipSwing?.rNow ?? Infinity); }
    expect(alive(id)).toBe(false);
    expect(st().destroyedBreakableProps[id]).toBe(true);
    expect(st().pickups.length).toBeGreaterThan(pickups0); // 松明の落とし物(近接で壊した時と同じ経路)
    expect(st().whipSwing?.phase).toBe('swing');
    expect(minR).toBeGreaterThan(radius * 0.95);
  });

  it('振り回している体が触れた緑卵が割れる', () => {
    const { id } = grabAndPlaceAhead(egg);
    for (let i = 0; i < 60 && alive(id); i++) step(10);
    expect(alive(id)).toBe(false);
    expect(st().whipSwing?.phase).toBe('swing');
  });

  it('回る円から外れた置き物は壊れない', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', STUN)] });
    swing();
    const c = center();
    addProps(torch('far', c.x + 400, c.y + 300), egg('far-egg', c.x - 420, c.y - 260));
    run(500);
    expect(alive('far')).toBe(true);
    expect(alive('far-egg')).toBe(true);
  });

  it('投げて飛んでいる体が通った道の松明が壊れ、そのまま飛び続ける(松明で着弾しない)', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', STUN)] });
    swing();
    for (let i = 0; i < 400 && st().whipSwing?.phase === 'swing'; i++) step(10);
    const sw = st().whipSwing!;
    expect(sw.phase).toBe('thrown');
    const e = en('z');
    const tx = (sw.fromX ?? 0) + (sw.ux ?? 1) * 80, ty = (sw.fromY ?? 0) + (sw.uy ?? 0) * 80 + e.height / 2 - 2;
    addProps(torch('t', tx, ty));
    for (let i = 0; i < 100 && alive('t'); i++) step(10);
    expect(alive('t')).toBe(false);
    // 壊した直後もまだ飛んでいる(松明の所で着弾しない)
    expect(st().whipSwing?.phase).toBe('thrown');
    for (let i = 0; i < 200 && st().whipSwing; i++) step(10);
    expect(st().whipSwing).toBeNull();
    const lc = ecOf('z');
    expect(Math.hypot(lc.x - (sw.fromX ?? 0), lc.y - (sw.fromY ?? 0))).toBeGreaterThan(120); // 松明(80px)より先で着いた
  });

  it('着弾の爆発の範囲の松明と緑卵が壊れる(体が触れていなくても)', () => {
    useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', STUN)] });
    swing();
    for (let i = 0; i < 400 && st().whipSwing?.phase === 'swing'; i++) step(10);
    const sw = st().whipSwing!;
    const c = center();
    const lx = (sw.fromX ?? 0) + (sw.ux ?? 1) * 160, ly = (sw.fromY ?? 0) + (sw.uy ?? 0) * 160;
    useGameStore.setState(s => ({ enemies: [...s.enemies, place('zombie', lx - c.x, ly - c.y, 't')] }));
    const nx = -(sw.uy ?? 0), ny = sw.ux ?? 1;
    addProps(torch('bt', lx + nx * 45, ly + ny * 45), egg('be', lx - nx * 45, ly - ny * 45));
    for (let i = 0; i < 100 && st().whipSwing; i++) step(10);
    expect(st().whipSwing).toBeNull();
    expect(alive('bt')).toBe(false);
    expect(alive('be')).toBe(false);
  });

  it('ボスの叩きつけ: 着地点の爆発の範囲の松明と緑卵が壊れる', () => {
    useGameStore.setState({ enemies: [place('hunter', 100, 0, 'h', { stunUntil: st().gameTime + 200 })] });
    swing();
    const sw = st().whipSwing!;
    expect(sw.phase).toBe('overhead');
    const tx = sw.toX ?? 0, ty = sw.toY ?? 0;
    addProps(torch('ot', tx + 50, ty + 20), egg('oe', tx - 50, ty - 20));
    for (let i = 0; i < 200 && st().whipSwing; i++) step(10);
    expect(st().whipSwing).toBeNull();
    expect(alive('ot')).toBe(false);
    expect(alive('oe')).toBe(false);
  });
});
