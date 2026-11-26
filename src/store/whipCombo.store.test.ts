// 鞭の3連撃と掴む条件(社長指示2026-11-26「タップで0.3秒間隔で3連撃…2-3とクリティカル率が上がる。1-2撃目は敵は吹き飛ばず、ストップ弱浮き。
// 気絶の敵を攻撃すると掴めて、爆撃と共にKILL。(ボスはさっきの叩きつけ)」)をストアを動かして固める。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { WHIP_COMBO_INTERVAL_MS, WHIP_COMBO_RESET_MS, WHIP_COMBO_CRIT_BONUS } from '../utils/whipCombo';

let now = 15_000_000;
let rnd = 0.99;
const NO = { up: false, down: false, left: false, right: false } as never;
const st = () => useGameStore.getState();
const center = () => { const p = st().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, st().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => st().enemies.find(e => e.id === id);
const step = (ms = 10) => {
  now += ms;
  useGameStore.setState(s => ({ gameTime: s.gameTime + ms, realGameTime: s.realGameTime + ms, hitstopUntil: 0 }));
  st().movePlayer(NO, ms / 1000);
  st().pumpWhipQueuedTap();
  // 前隙の解決(useGameLoop と同じ): 前隙が明けたら triggerCounter(押した時刻)。
  const pend = st().player.pendingSwingAt;
  if (pend > 0 && now - pend >= 250) { useGameStore.setState(s => ({ player: { ...s.player, pendingSwingAt: 0 } })); st().triggerCounter(pend); }
  st().updateEnemies(ms / 1000);
  if (st().whipSwing) st().tickWhipSwing();
};
const run = (ms: number) => { const end = now + ms; while (now < end) step(10); };
/** 直呼びの1振り(PC)。 */
const tap = () => st().triggerCounter();
const resetZ = (extra: Partial<Enemy> = {}) => useGameStore.setState({ enemies: [place('zombie', 100, 0, 'z', extra)] });

beforeEach(() => {
  now = 15_000_000;
  rnd = 0.99;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockImplementation(() => rnd);
  st().resetGame('warrior');
  useGameStore.setState(s => ({
    m0Unlocked: { ...s.m0Unlocked, melee: true, crit: true }, breakableProps: [],
    player: { ...s.player, subWeapons: ['whip'], skills: [], skillLevels: {}, whipCharged: false, whipHitCount: 0, counterCooldownEnd: 0, pendingSwingAt: 0, lastDirection: { x: 1, y: 0 }, health: 9999, maxHealth: 9999 },
  }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('3連撃: 段が進む・0.3秒の間隔・戻る', () => {
  it('タップごとに 1→2→3→1。間隔は0.3秒(早いタップは1つ予約して明けたら出す)。0.9秒タップが無ければ1段目へ', () => {
    resetZ();
    tap();
    expect(st().player.whipComboStage).toBe(1);
    expect(st().player.counterCooldownEnd - now).toBeLessThanOrEqual(WHIP_COMBO_INTERVAL_MS);
    // 間隔の前のタップ=振らずに予約
    run(100);
    expect(tap().swung).toBe(false);
    expect(st().player.whipComboStage).toBe(1);
    expect(st().player.whipQueuedAt).toBeGreaterThan(0);
    // 間隔が明けると予約が出る(タッチと同じ前隙の経路)=2段目
    run(WHIP_COMBO_INTERVAL_MS);
    expect(st().player.whipComboStage).toBe(2);
    run(WHIP_COMBO_INTERVAL_MS);
    tap();
    expect(st().player.whipComboStage).toBe(3);
    run(WHIP_COMBO_INTERVAL_MS);
    tap();
    expect(st().player.whipComboStage).toBe(1);
    run(WHIP_COMBO_INTERVAL_MS);
    tap();
    expect(st().player.whipComboStage).toBe(2);
    run(WHIP_COMBO_RESET_MS + 50);
    tap();
    expect(st().player.whipComboStage).toBe(1);
  });
  it('タッチ(指を離す)も1段ずつ進む', () => {
    resetZ();
    expect(st().beginMeleeSwing()).toBe(true);
    expect(st().player.whipComboStage).toBe(1);
    run(WHIP_COMBO_INTERVAL_MS + 10);
    expect(st().beginMeleeSwing()).toBe(true);
    expect(st().player.whipComboStage).toBe(2);
  });
});

describe('段の会心率と押し', () => {
  it('2段目・3段目は会心率が上がる(1段目は今のまま)', () => {
    // 近接の会心の基礎を0にして、乱数を上乗せ(2段目 +15%)の内側に置く: 1段目は会心にならず(気絶しない)、2段目・3段目は会心=気絶。
    useGameStore.setState(s => ({ player: { ...s.player, weapons: s.player.weapons.map(w => (w.isMelee ? { ...w, critChance: 0 } : w)) } }));
    rnd = WHIP_COMBO_CRIT_BONUS[1] * 0.5;
    const stunnedAfter = () => (en('z')?.stunUntil ?? 0) > st().gameTime;
    resetZ();
    tap();
    expect(st().player.whipComboStage).toBe(1);
    expect(stunnedAfter()).toBe(false);
    run(WHIP_COMBO_INTERVAL_MS);
    resetZ();
    tap();
    expect(st().player.whipComboStage).toBe(2);
    expect(stunnedAfter()).toBe(true);
    run(WHIP_COMBO_INTERVAL_MS);
    rnd = (WHIP_COMBO_CRIT_BONUS[1] + WHIP_COMBO_CRIT_BONUS[2]) / 2; // 3段目(+30%)だけが会心になる乱数
    resetZ();
    tap();
    expect(st().player.whipComboStage).toBe(3);
    expect(stunnedAfter()).toBe(true);
  });
  it('1・2段目は押さない(止めと弱い浮き)・3段目は押す', () => {
    resetZ();
    tap();
    expect(Math.hypot(en('z')!.knockbackVx ?? 0, en('z')!.knockbackVy ?? 0)).toBe(0);
    expect(en('z')!.liftUntil ?? 0).toBeGreaterThan(now);
    run(WHIP_COMBO_INTERVAL_MS);
    resetZ();
    tap();
    expect(st().player.whipComboStage).toBe(2);
    expect(Math.hypot(en('z')!.knockbackVx ?? 0, en('z')!.knockbackVy ?? 0)).toBe(0);
    run(WHIP_COMBO_INTERVAL_MS);
    resetZ();
    tap();
    expect(st().player.whipComboStage).toBe(3);
    expect(Math.hypot(en('z')!.knockbackVx ?? 0, en('z')!.knockbackVy ?? 0)).toBeGreaterThan(0);
  });
});

describe('掴む条件: 気絶している敵だけ', () => {
  it('普通の敵は掴まない', () => {
    resetZ();
    tap();
    expect(st().whipSwing).toBeNull();
    expect(en('z')!.whipHeld).toBeFalsy();
  });
  it('気絶した雑魚は掴んで振り回し、着弾の爆発で必ず死ぬ', () => {
    resetZ({ stunUntil: st().gameTime + 5000 });
    tap();
    expect(st().whipSwing?.enemyId).toBe('z');
    expect(st().whipSwing?.phase).toBe('swing');
    expect(en('z')!.health).toBe(99999); // 処刑の枝は通らない(掴みに置き換える)
    run(400);
    expect(st().tryFlickFollowup(0, 1)).toBe(true);
    for (let i = 0; i < 300 && st().whipSwing; i++) step(10);
    expect(st().whipSwing).toBeNull();
    const z = en('z');
    expect(!z || z.health <= 0).toBe(true);
  });
  it('気絶した強個体も掴んで着弾で死ぬ', () => {
    useGameStore.setState({ enemies: [place('pumpkin', 100, 0, 'p', { stunUntil: st().gameTime + 5000 })] });
    tap();
    expect(st().whipSwing?.enemyId).toBe('p');
    expect(st().whipSwing?.phase).toBe('swing');
    run(1600);
    for (let i = 0; i < 300 && st().whipSwing; i++) step(10);
    const p = en('p');
    expect(!p || p.health <= 0).toBe(true);
  });
  it('気絶したボスは叩きつけ(振り回さない)', () => {
    useGameStore.setState({ enemies: [place('hunter', 100, 0, 'h', { stunUntil: st().gameTime + 5000 })] });
    tap();
    expect(st().whipSwing?.phase).toBe('overhead');
  });
});
