// ★格闘以外の浮き(research/BRAWLER.md §14・社長「浮き入れよう。落ちてくるのを爆発のは少しゆっくりに」)をストアで固める。
// ①プレイヤー側の爆発の合流点(playerBlast)が雑魚・強個体を浮かせる(ボス級は浮かない・浮いている間は動けない)
// ②スラッシャーの1回目の追撃で打ち上げ、2回目の追撃は空中の敵に当たる。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll, brawlerAirborne, brawlerLiftHoldNow, BRAWLER_JUGGLE_BUDGET } from '../utils/brawlerCombo';
import { BRAWLER_TEMPO_DEFAULT } from '../utils/brawler';

let now = 11_000_000;
const NO = { up: false, down: false, left: false, right: false } as never;
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, dy: number, id: string): Enemy => {
  const c = center();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false } as Enemy;
};
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const step = (ms = 10) => {
  now += ms;
  useGameStore.setState(st => ({ gameTime: st.gameTime + ms }));
  useGameStore.getState().movePlayer(NO, ms / 1000);
  useGameStore.getState().tickBrawler();
  useGameStore.getState().updateEnemies(ms / 1000);
};

beforeEach(() => {
  now = 11_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  setBrawlerTempoAll(1.3);
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({ m0Unlocked: { ...st.m0Unlocked, melee: true, crit: false }, breakableProps: [], player: { ...st.player, health: 9999, maxHealth: 9999 } }));
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT));

describe('爆発で浮く(playerBlast)', () => {
  it('爆風の中の雑魚・強個体が浮く(次の格闘の時計で)・ボス級と爆風の外は浮かない', () => {
    useGameStore.setState({ enemies: [place('zombie', 150, 0, 'z'), place('driller', 210, 0, 'd'), place('hunter', 150, 60, 'h'), place('zombie', 420, 0, 'far')] });
    const c = center();
    useGameStore.getState().playerBlast(c.x + 160, c.y, 100);
    expect(brawlerAirborne(en('z'), now)).toBe(false); // その場では掛けない(爆発のダメージ・押しの書き込みと混ぜない)
    step();
    expect(en('z').brLiftShape).toBe('blast');
    expect(brawlerLiftHoldNow(en('z'), now)).toBe(true);
    expect(en('z').brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob - 2);
    expect(brawlerAirborne(en('d'), now)).toBe(true);
    expect(en('d').brLiftPeak!).toBeLessThan(en('z').brLiftPeak!); // 強個体は重い(+爆心から遠い)
    expect(en('h').brawlerLiftAt).toBeUndefined(); // ボス級は浮かない
    expect(en('far').brawlerLiftAt).toBeUndefined();
  });
  it('浮いている間は自分では動かない(押されない限り位置が変わらない)・着地したらまた動く', () => {
    useGameStore.setState({ enemies: [place('zombie', 150, 0, 'z')] });
    const c = center();
    useGameStore.getState().playerBlast(c.x + 150, c.y, 100);
    step();
    const x0 = en('z').x, y0 = en('z').y, until = en('z').liftUntil!;
    while (now < until - 20) step(16);
    expect(Math.hypot(en('z').x - x0, en('z').y - y0)).toBeLessThan(0.01);
    for (let i = 0; i < 120; i++) step(16);
    expect(Math.hypot(en('z').x - x0, en('z').y - y0)).toBeGreaterThan(1); // 着地の後はプレイヤーへ向かって動く
  });
});

describe('スラッシャーの追撃で打ち上げる', () => {
  const arm = (step0: number) => useGameStore.setState(state => ({
    realGameTime: 4100,
    player: {
      ...state.player,
      skills: state.player.skills.includes('slasher') ? state.player.skills : [...state.player.skills, 'slasher'],
      skillLevels: { ...state.player.skillLevels, slasher: 3 },
      slasherChainReadyAt: 4000, slasherStrikeStep: step0, slasherReach: 74, slasherQueuedTap: false, pendingSwingAt: 0,
      counterCooldownEnd: Date.now() + 700,
    },
  }));
  it('1回目の追撃=3段目と同じ打ち上げ・2回目の追撃は空中の敵に当たって拾う', () => {
    useGameStore.setState({ enemies: [place('zombie', 40, 0, 'z')] });
    arm(0);
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    const z1 = en('z');
    expect(z1.health).toBeLessThan(99999);
    expect(brawlerAirborne(z1, now)).toBe(true);
    expect(z1.brLiftShape).toBeUndefined(); // 格闘の弧
    expect(z1.brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob);
    const hp1 = z1.health;
    step(80);
    // 2回目の追撃(空中の敵)
    useGameStore.setState(state => ({ realGameTime: 6000, player: { ...state.player, slasherChainReadyAt: 5500, counterCooldownEnd: Date.now() + 700, pendingSwingAt: 0 } }));
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    const z2 = en('z');
    expect(z2.health).toBeLessThan(hp1);
    expect(brawlerAirborne(z2, now)).toBe(true);
    expect(z2.brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob - 1); // 2段目の拾い=1
  });
  it('ボス級も格闘と同じく重く浮く(区分の重さ0.4)', () => {
    useGameStore.setState({ enemies: [place('hunter', 50, 0, 'h')] });
    arm(0);
    useGameStore.getState().beginMeleeSwing();
    const h = en('h');
    expect(brawlerAirborne(h, now)).toBe(true);
    expect(h.brLiftPeak!).toBeCloseTo(0.75 * 0.4, 5);
  });
});
