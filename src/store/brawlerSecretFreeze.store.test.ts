// ★秘奥義の間は画面内の敵を止める(社長指示2026-11-09・research/BRAWLER.md §17)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll, brawlerHeldNow } from '../utils/brawlerCombo';
import { initialBrawlerState } from '../utils/brawler';
import { secretFreezeIds } from '../utils/brawlerSkills';
import type { Enemy, EnemyType } from '../types/game';

setBrawlerTempoAll(1.0);
const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 13_000_000;

const setup = () => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: { ...st.player, health: 9999, maxHealth: 9999, invulnerable: true, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 }, lastDirection: { x: 1, y: 0 } },
  }));
};
const place = (type: EnemyType, dx: number, dy: number, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: p.x + p.width / 2 + dx - e.width / 2, y: p.y + p.height / 2 + dy - e.height / 2, id, health: 999999, maxHealth: 999999, dormant: false, ...extra } as Enemy;
};
const view = () => useGameStore.setState(st => {
  const p = st.player;
  return { viewZoom: 1, camera: { x: p.x + p.width / 2 - st.gameBounds.width / 2, y: p.y + p.height / 2 - st.gameBounds.height / 2 } };
});
const step = (ms: number) => {
  for (let i = 0; i < ms / 10; i++) {
    now += 10;
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
    useGameStore.getState().movePlayer(NO_INPUT, 0.01);
    useGameStore.getState().tickBrawler();
  }
};
/** 秘奥義の最中の状態を直接置く(次の1発は遠い先=起動後の止めだけを見る)。 */
const startSecret = () => useGameStore.setState(st => ({
  player: { ...st.player, brawler: { ...initialBrawlerState(), secret: { phase: 'strike', phaseAt: st.gameTime, hits: 0, nextAt: st.gameTime + 1e9, igniteAt: now } } },
}));
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const held = (id: string) => brawlerHeldNow(en(id), useGameStore.getState().gameTime, now);

beforeEach(() => { now = 13_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now); vi.spyOn(Math, 'random').mockReturnValue(0.99); });
afterEach(() => { vi.restoreAllMocks(); });

describe('秘奥義の間は画面内の敵を止める', () => {
  it('止まる範囲は狙う範囲と同じ: 画面の端から外へ100pxの敵は止まり、300pxの敵は止まらない(社長裁定2026-11-12「A」)', () => {
    setup(); view();
    const w = useGameStore.getState().gameBounds.width;
    useGameStore.setState({ enemies: [place('zombie', w / 2 + 100, 0, 'out100'), place('zombie', w / 2 + 300, 0, 'out300')] });
    startSecret();
    step(20);
    expect(held('out100')).toBe(true);
    expect(held('out300')).toBe(false);
  });
  it('画面内の雑魚・強個体は止まり、画面の外は止まらない・動き続ける間は切れない', () => {
    setup(); view();
    useGameStore.setState({ enemies: [place('zombie', 150, 0, 'near'), place('pumpkin', -150, 40, 'strong'), place('zombie', 9000, 0, 'far')] });
    startSecret();
    step(20);
    expect(held('near')).toBe(true);
    expect(held('strong')).toBe(true);
    expect(held('far')).toBe(false);
    step(2000); // 書き足しが続く
    expect(held('near')).toBe(true);
    expect(held('far')).toBe(false);
  });
  it('ボスは技の最中(溜め含む)なら止めず、技の最中でなければ止める', () => {
    setup(); view();
    useGameStore.setState({ enemies: [place('giantbat', 200, 0, 'idle'), place('giantbat', -200, 0, 'busy', { bossState: 'slam-windup' as never })] });
    startSecret();
    step(20);
    expect(held('idle')).toBe(true);
    expect(en('busy').brHoldUntil).toBeUndefined();
  });
  it('終端の死神は止めない(純関数)', () => {
    const reaper = place('reaper', 100, 0, 'r', { reaperChaser: true });
    expect(secretFreezeIds([reaper, place('zombie', 100, 0, 'z')], 0, () => true)).toEqual(['z']);
  });
  it('途中で中断(秘奥義が無くなる)したらその時点で解ける・当たりの固まりは消さない', () => {
    setup(); view();
    useGameStore.setState({ enemies: [place('zombie', 150, 0, 'a')] });
    startSecret();
    step(30);
    expect(held('a')).toBe(true);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, secret: undefined } } }));
    step(10);
    expect(en('a').brHoldUntil).toBeUndefined();
    expect(en('a').brSecretHoldUntil).toBeUndefined();
    // 当たりの固まりが書き直していたら、それは残す
    startSecret(); step(30);
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, brHoldUntil: now + 5000 })) }));
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, secret: undefined } } }));
    step(10);
    expect(en('a').brHoldUntil).toBe(now - 10 + 5000);
  });
  it('止まっている間も押し(締めの吹き飛ばし)は進む: 押しの時間が止めに食われない', () => {
    setup(); view();
    useGameStore.setState({ enemies: [place('zombie', 150, 0, 'a')] });
    startSecret(); step(30);
    const x0 = en('a').x;
    useGameStore.setState(st => ({ enemies: st.enemies.map(e => ({ ...e, knockbackVx: 400, knockbackVy: 0, knockbackUntil: now + 300 })) }));
    for (let i = 0; i < 30; i++) { step(10); useGameStore.getState().updateEnemies(0.01); }
    expect(en('a').x - x0).toBeGreaterThan(40);
    expect(held('a')).toBe(true);
  });
});
