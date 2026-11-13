// ★空中の敵に弾が当たった時の、その敵だけの止め(社長指示2026-11-12「空中にいる敵に弾が当たったら、一瞬だけHITストップして。
// 銃の弾速に比例して止まる時間を変える。早いほど短い」)。実際のストア(airShotStopHit → updateEnemies)で通す。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll, brawlerAirborne, brawlerJuggleHeightRel } from '../utils/brawlerCombo';
import { BRAWLER_TEMPO_DEFAULT } from '../utils/brawler';
import { airShotStopMs, AIR_SHOT_NUDGE_PX } from '../utils/airShotStop';
import { catalogProjectileSpeed } from '../utils/weaponUtils';

let now = 7_000_000;
const DT = 10;
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (dx: number, dy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const c = center();
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, health: 999999, maxHealth: 999999, id, dormant: false, ...extra } as Enemy;
};
/** 浮かせた雑魚(格闘の3段目の打ち上げの欄を直に置く)。 */
const lifted = (dx: number, dy: number, id: string, ms = 600): Enemy => place(dx, dy, id, {
  brawlerLiftAt: now, brLiftMs: ms, brLiftPeak: 1, brLiftFrom: 0, brLiftUntil: now + ms, liftUntil: now + ms, brLiftBudget: 6,
});
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const step = (ms: number, onStep?: () => void) => {
  const end = now + ms;
  while (now < end) {
    now += DT;
    useGameStore.getState().setGameTime(useGameStore.getState().gameTime + DT);
    useGameStore.getState().updateEnemies(DT / 1000);
    onStep?.();
  }
};
const shoot = (id: string, speed = 520) => useGameStore.getState().airShotStopHit(id, speed, 1, 0);

beforeEach(() => {
  now = 7_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  setBrawlerTempoAll(1.3);
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({ breakableProps: [], player: { ...st.player, health: 99999, maxHealth: 99999 } }));
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT));

describe('空中の弾の止め', () => {
  it('浮いている雑魚に拳銃の弾: その敵だけ止まり(位置・浮きの高さが動かない)、浮きの時計が止めた分だけ後ろへずれる', () => {
    useGameStore.setState({ enemies: [lifted(200, 0, 'a'), lifted(200, 80, 'b')] });
    step(100);
    const a0 = en('a'), b0 = en('b');
    const h0 = brawlerJuggleHeightRel(a0, now);
    expect(shoot('a', catalogProjectileSpeed('handgun-t1')!)).toBe(true);
    const ms = airShotStopMs(520);
    expect(ms).toBe(140);
    step(130, () => {
      expect(brawlerJuggleHeightRel(en('a'), now)).toBeCloseTo(h0, 6); // 空中で静止
      expect(en('a').x).toBe(a0.x);
      expect(en('a').brawlerShakeUntil).toBe(a0.brawlerLiftAt! + 100 + ms); // 震え(格闘の止めと同じ欄)
    });
    step(40);
    expect(en('a').brLiftUntil).toBe(a0.brLiftUntil! + ms);
    expect(en('a').brawlerLiftAt).toBe(a0.brawlerLiftAt! + ms);
    expect(en('a').liftUntil).toBe(a0.liftUntil! + ms);
    expect(en('a').brLiftMs).toBe(a0.brLiftMs); // 弧の形は同じ
    expect(en('b').brLiftUntil).toBe(b0.brLiftUntil); // 当たっていない敵は止まらない
    expect(brawlerJuggleHeightRel(en('a'), now)).not.toBeCloseTo(h0, 3); // 明けたら続きから動く
  });
  it('速い弾ほど短い(スナイパー < 拳銃 < 散弾)', () => {
    const shift = (key: string): number => {
      useGameStore.setState({ enemies: [lifted(200, 0, 'a')] });
      const u0 = en('a').brLiftUntil!;
      shoot('a', catalogProjectileSpeed(key)!);
      step(200);
      return en('a').brLiftUntil! - u0;
    };
    const sniper = shift('rifle-t2'), pistol = shift('handgun-t1'), shotgun = shift('shotgun-t1');
    expect(sniper).toBe(73);
    expect(pistol).toBe(140);
    expect(shotgun).toBe(165);
    expect(shift('rifle-t3-railgun')).toBe(60);
  });
  it('地上の敵は止まらない', () => {
    useGameStore.setState({ enemies: [place(200, 0, 'g')] });
    expect(shoot('g')).toBe(false);
    expect(en('g').airShotStopUntil).toBeUndefined();
  });
  it('散弾の粒: 同じフレームの2発目以降は止めない(重ならない・張り直さない)', () => {
    useGameStore.setState({ enemies: [lifted(200, 0, 'a')] });
    expect([shoot('a', 440), shoot('a', 440), shoot('a', 440)]).toEqual([true, false, false]);
    expect(en('a').airShotStopUntil).toBe(now + 165);
  });
  it('連射しても浮きの延びは元の浮きの約半分まで(明けてから止めの2倍の間を空ける)', () => {
    const L = 600;
    const S = airShotStopMs(520); // 止め1回の長さ(端数の幅)
    useGameStore.setState({ enemies: [lifted(200, 0, 'a', L)] });
    const start = now;
    let stops = 0;
    step(5000, () => { if (brawlerAirborne(en('a'), now) && shoot('a', 520)) stops++; }); // 10ms ごとに撃ち続ける(マシンピストルより速い)
    const landedAfter = en('a').brLiftUntil! - start; // 空中の全体の時間(壁時計)
    const stopped = landedAfter - L; // 止めで延びた分
    expect(stops).toBeGreaterThan(1);
    expect(stopped).toBe(stops * S);
    expect(stopped).toBeLessThanOrEqual(landedAfter / 3 + S); // 止まっていた時間は全体の約1/3まで(最後の1回ぶんの端数)
    expect(stopped).toBeLessThanOrEqual(L * 0.5 + S); // =延びは元の浮きの約半分まで(+50%前後・止め1回ぶんの端数・無限には延びない)
    expect(stopped).toBeGreaterThanOrEqual(L * 0.5 - S);
  });
});

describe('空中の敵を弾の向きへ微妙に押す(社長指示2026-11-13)', () => {
  it('現状確認: 弾の止め(airShotStopHit)以外に、空中の敵を押す経路は無かった=ここで初めて押す(止めの間は動かず、明けてから約10px)', () => {
    useGameStore.setState({ enemies: [lifted(200, 0, 'a', 1500)] });
    step(50);
    const x0 = en('a').x, y0 = en('a').y;
    shoot('a', 520);
    step(130, () => expect(en('a').x).toBe(x0)); // 止めの間は動かない
    step(600);
    const dx = en('a').x - x0;
    expect(dx).toBeGreaterThan(AIR_SHOT_NUDGE_PX * 0.8);
    expect(dx).toBeLessThan(AIR_SHOT_NUDGE_PX * 1.6);
    expect(Math.abs(en('a').y - y0)).toBeLessThan(1);
  });
  it('止めの間の中の弾(止めは掛からない)でも押す=毎発', () => {
    useGameStore.setState({ enemies: [lifted(200, 0, 'a', 2000)] });
    shoot('a', 520);
    step(200);
    const x0 = en('a').x;
    expect(shoot('a', 520)).toBe(false); // 間の中=止めない
    expect(en('a').knockbackUntil).toBeGreaterThan(now);
    step(400);
    expect(en('a').x - x0).toBeGreaterThan(AIR_SHOT_NUDGE_PX * 0.8);
  });
  it('ボス級は押さない・地上の敵は今どおり(押さない)', () => {
    const c = center();
    const bossBase = spawnEnemyAt('giantbat', 0, 0, useGameStore.getState().gameTime);
    const boss = { ...bossBase, x: c.x + 200, y: c.y, id: 'boss', dormant: false, health: 999999, maxHealth: 999999,
      brawlerLiftAt: now, brLiftMs: 600, brLiftPeak: 1, brLiftFrom: 0, brLiftUntil: now + 600, liftUntil: now + 600 } as Enemy;
    useGameStore.setState({ enemies: [boss, place(200, 120, 'g')] });
    shoot('boss', 520);
    shoot('g', 520);
    expect(en('boss').knockbackUntil).toBeUndefined();
    expect(en('g').knockbackUntil).toBeUndefined();
    const gx = en('g').x;
    step(50);
    expect(en('g').knockbackVx ?? 0).toBe(0);
    expect(Math.abs(en('g').x - gx)).toBeLessThan(5); // 寄ってくる分だけ(押されていない)
  });
});
