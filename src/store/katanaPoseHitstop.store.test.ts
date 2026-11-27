// 刀の振りの体の姿勢の止め(当たった時だけ・空振りは止めない=社長指示2026-11-27「空振りは止めない」)をストアを動かして固める。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { katanaPoseHit, meleePoseSince } from '../utils/meleeHitstopTiming';

let now = 18_000_000;
const st = () => useGameStore.getState();
const center = () => { const p = st().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, st().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false } as Enemy;
};
const KEY = 200; // 決めの経過(pixiScene は MELEE_WINDUP_MS × 振りの窓の比)
/** 体の姿勢の時計(pixiScene と同じ組み立て: 刀=katanaHitstopSwingAt/Ms を katanaPoseHit で渡す)。 */
const poseSince = (t: number) => {
  const p = st().player;
  return meleePoseSince(t - p.meleeSwingAt, katanaPoseHit(p.meleeSwingAt, p.katanaHitstopSwingAt, p.katanaHitstopMs, KEY));
};

beforeEach(() => {
  now = 18_000_000;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  st().resetGame('warrior');
  useGameStore.setState(s => ({
    enemies: [], breakableProps: [], m0Unlocked: { ...s.m0Unlocked, melee: true, crit: false },
    player: { ...s.player, x: -3000, y: 9000, subWeapons: ['katana'], subWeaponLevels: { katana: 1 }, lastDirection: { x: 1, y: 0 }, invulnerable: false, health: 9999, maxHealth: 9999 },
  }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('刀の振りの体の姿勢の止め(当たった時だけ・決めで止める)', () => {
  it('その振り自身が当たった時は、決め(刀が一番伸びた所)で止めの長さだけ体の姿勢の時計が止まる', () => {
    useGameStore.setState(s => ({ enemies: [place('zombie', 40, 0, 'z')], player: { ...s.player, meleeSwingAt: now } }));
    const r = st().performKatanaStrike(['z'], 1, true); // 縮地・被弾反撃の斬りと同じ呼び方(技の指定なし・射撃扱いでない)
    expect(r.hit).toBe(true);
    const p = st().player;
    expect(p.katanaHitstopSwingAt).toBe(now);
    const ms = p.katanaHitstopMs!;
    expect(ms).toBeGreaterThan(0);
    const hold = Math.max(ms, 70);
    expect(poseSince(now + KEY - 10)).toBe(KEY - 10); // 決めまでは生の時計
    expect(poseSince(now + KEY + 1)).toBe(KEY);       // 決めで止まる
    expect(poseSince(now + KEY + hold - 1)).toBe(KEY);
    expect(poseSince(now + KEY + hold + 20)).toBe(KEY + 20); // 明けたら進む(跳ばない)
  });
  it('空振りの振りは止めを書かない=体の姿勢の時計は生の時計のまま', () => {
    useGameStore.setState(s => ({ enemies: [], player: { ...s.player, meleeSwingAt: now, katanaHitstopSwingAt: undefined, katanaHitstopMs: undefined } }));
    const r = st().performKatanaStrike(['nobody'], 1, true);
    expect(r.hit).toBe(false);
    expect(st().player.katanaHitstopSwingAt).toBeUndefined();
    for (let t = 0; t <= 400; t += 16) expect(poseSince(now + t)).toBe(t);
  });
  it('オート斬り(射撃扱い)の当たりは、出ている振りの体を止めない', () => {
    useGameStore.setState(s => ({ enemies: [place('zombie', 40, 0, 'z')], player: { ...s.player, meleeSwingAt: now, katanaHitstopSwingAt: undefined, katanaHitstopMs: undefined } }));
    const r = st().performKatanaStrike(['z'], 1, false, undefined, 1, undefined, undefined, true);
    expect(r.hit).toBe(true);
    expect(st().player.katanaHitstopSwingAt).toBeUndefined();
    for (let t = 0; t <= 400; t += 16) expect(poseSince(now + t)).toBe(t);
  });
  it('一閃の着地など技の指定がある当たりも、出ている振りの体を止めない', () => {
    useGameStore.setState(s => ({ enemies: [place('zombie', 40, 0, 'z')], player: { ...s.player, meleeSwingAt: now, katanaHitstopSwingAt: undefined, katanaHitstopMs: undefined } }));
    expect(st().performKatanaStrike(['z'], 1, true, undefined, 1, 'issen').hit).toBe(true);
    expect(st().player.katanaHitstopSwingAt).toBeUndefined();
  });
  it('別の振りの当たりでは止めない(当たった振りと出ている振りの照合)', () => {
    expect(katanaPoseHit(1000, 900, 90, KEY)).toBeNull();
    expect(katanaPoseHit(1000, undefined, undefined, KEY)).toBeNull();
    expect(katanaPoseHit(1000, 1000, 90, KEY)).toEqual({ stopSince: KEY, selfMs: 90 });
  });
});
