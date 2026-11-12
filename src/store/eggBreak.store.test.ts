// ★卵を割る(社長実機報告2026-11-09「銃の弾や爆発、一部格闘の技などで緑の卵が割れない。」)。
// 「敵に当たる攻撃は、その範囲の卵も割る」をストアで固める: 爆発の円の口(breakEggsInBlast)と、格闘の技・段の範囲。
// 割れ方は近接で割った時と同じ(アームしていても無害に消える=爆発しない・連鎖しない・ドロップ無し)。松明・UVバーは今どおり触らない。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore, huntingMeleeRadius } from './gameStore';
import type { BreakableProp, Enemy } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { mineRect } from '../world/mines';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { BRAWLER_TEMPO_DEFAULT, BRAWLER_STOMP_RADIUS, BRAWLER_LANDING_RADIUS } from '../utils/brawler';

setBrawlerTempoAll(1.0);
const NO = { up: false, down: false, left: false, right: false } as never;
let now = 8_000_000;

const setup = (level = 3) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    breakableProps: [], destroyedBreakableProps: {},
    player: { ...st.player, health: 100, maxHealth: 100, invulnerable: false, subWeapons: ['brawler'], subWeaponLevels: { brawler: level }, lastDirection: { x: 1, y: 0 } },
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const foot = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height }; };
/** プレイヤーの足元から (dx, dy) に置いた卵。 */
const eggAt = (dx: number, dy: number, id: string, extra: Partial<BreakableProp> = {}): BreakableProp => {
  const f = foot();
  const footX = f.x + dx, footY = f.y + dy;
  const r = mineRect({ footX, footY, scale: 1 });
  return { id, x: r.x, y: r.y, width: r.width, height: r.height, footX, footY, scale: 1, health: 1, maxHealth: 1, type: 'mine', lastHit: 0, ...extra };
};
const torchAt = (dx: number, dy: number, id: string): BreakableProp => {
  const f = foot();
  return { id, x: f.x + dx - 10, y: f.y + dy - 40, width: 20, height: 40, footX: f.x + dx, footY: f.y + dy, scale: 1, health: 10, maxHealth: 10, type: 'torch', lastHit: 0 };
};
const zombieAt = (dx: number, dy: number, id: string): Enemy => {
  const c = center();
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 99999, maxHealth: 99999, dormant: false } as Enemy;
};
const eggsLeft = () => useGameStore.getState().breakableProps.filter(p => p.type === 'mine').map(p => p.id).sort();
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    now += 10;
    // ★画面全体の止め(triggerHitstop・格闘の当たり=社長指示2026-11-12): 実機のループと同じく、止まっている間は壁時計だけ進める。
    if (now - 10 < useGameStore.getState().hitstopUntil) continue;
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
    useGameStore.getState().movePlayer(NO, 0.01);
    useGameStore.getState().tickBrawler();
  }
};
const withPoints = (n: number) => useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: n } } }));

beforeEach(() => {
  now = 8_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

describe('爆発の円で卵を割る(breakEggsInBlast)', () => {
  it('半径の中の卵だけ割れる。アームした卵も無害に消える(爆発しない)。松明は触らない', () => {
    setup();
    const f = foot();
    useGameStore.setState({ breakableProps: [eggAt(200, 0, 'in'), eggAt(200, 0, 'armed', { armedAt: 1 }), eggAt(320, 0, 'out'), torchAt(210, 0, 'torch')] });
    const hp0 = useGameStore.getState().player.health;
    const n = useGameStore.getState().breakEggsInBlast(f.x + 200, f.y, 80);
    expect(n).toBe(2);
    expect(eggsLeft()).toEqual(['out']);
    const st = useGameStore.getState();
    expect(st.destroyedBreakableProps.in).toBe(true);
    expect(st.destroyedBreakableProps.armed).toBe(true);
    expect(st.breakableProps.some(p => p.id === 'torch' && p.health === 10)).toBe(true); // 松明は今どおり
    expect(st.player.health).toBe(hp0); // 爆発しない
    expect(st.pickups.length).toBe(0); // ドロップ無し(近接で割った時と同じ)
  });
});

describe('格闘の技・段は、その範囲の卵も割る', () => {
  it('大踏み潰し: 足元の半径150の中の卵(近接の届きより遠い所も)が割れる・外は割れない', () => {
    setup();
    const reach = huntingMeleeRadius(useGameStore.getState().player);
    expect(BRAWLER_STOMP_RADIUS - 20).toBeGreaterThan(reach); // 近接の円の外を見ている
    useGameStore.setState(st => ({ enemies: [zombieAt(60, 0, 'z')], breakableProps: [eggAt(BRAWLER_STOMP_RADIUS - 20, 0, 'near'), eggAt(-(BRAWLER_STOMP_RADIUS - 20), 0, 'back'), eggAt(BRAWLER_STOMP_RADIUS + 40, 0, 'far')], player: { ...st.player, brawler: undefined } }));
    useGameStore.getState().brawlerPress(); advance(400);
    withPoints(5);
    expect(useGameStore.getState().brawlerTech(0.1, 1)).toBe(true);
    advance(260);
    expect(eggsLeft()).toEqual(['far']);
  });
  it('気功: 飛んでいく途中の卵を割って、そのまま敵まで届いて爆ぜる(爆発の円の卵も割れる)', () => {
    setup();
    useGameStore.setState(st => ({
      enemies: [zombieAt(-300, 0, 'k')],
      breakableProps: [eggAt(-150, -14, 'path'), eggAt(-300, 10, 'blast'), eggAt(-150, 120, 'off')],
      player: { ...st.player, brawler: undefined },
    }));
    useGameStore.getState().brawlerPress(); advance(400);
    withPoints(2);
    expect(useGameStore.getState().brawlerTech(-1, 0)).toBe(true);
    advance(600);
    expect(useGameStore.getState().brawlerKiko.length).toBe(0);
    const k = useGameStore.getState().enemies.find(e => e.id === 'k')!;
    expect(k.health).toBeLessThan(99999); // 卵で止まらず敵まで届いた
    expect(eggsLeft()).toEqual(['off']);
  });
  it('4段目(着地の円)は足元の半径の卵を割る', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(50, 0, 'z')], breakableProps: [eggAt(-(BRAWLER_LANDING_RADIUS - 10), 0, 'land')], player: { ...st.player, brawler: undefined } }));
    for (let i = 0; i < 4; i++) {
      useGameStore.getState().brawlerPress();
      for (let k = 0; k < 150 && useGameStore.getState().player.brawler!.phase !== 'idle'; k++) advance(10);
    }
    expect(useGameStore.getState().player.brawler!.stage).toBe(4);
    expect(eggsLeft()).toEqual([]);
  });
  it('1段目(近接の届きの円)は今どおり割る', () => {
    setup();
    useGameStore.setState(st => ({ enemies: [zombieAt(50, 0, 'z')], breakableProps: [eggAt(30, 0, 'e1')], player: { ...st.player, brawler: undefined } }));
    useGameStore.getState().brawlerPress();
    for (let k = 0; k < 150 && useGameStore.getState().player.brawler!.phase !== 'idle'; k++) advance(10);
    expect(eggsLeft()).toEqual([]);
  });
});
