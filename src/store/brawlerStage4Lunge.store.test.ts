// ★社長実機報告2026-11-19「通常格闘の4段目が真上に飛ぶだけの時が結構ある」の再現と固定(research/BRAWLER.md §31「決まった距離を、出した瞬間の向きへ」)。
// 原因: 4段目を押した瞬間に狙える相手が居ない(3段目までで倒れた・届く範囲の外へ出た)と、踏み込みが0=その場で真上に跳んでいた。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, huntingMeleeRadius } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { initialBrawlerState, BRAWLER_TEMPO_DEFAULT, BRAWLER_LUNGE_PX, brawlerStageApproach, brawlerApproach } from '../utils/brawler';

const NO = { up: false, down: false, left: false, right: false } as never;
let now = 7_000_000;
const setup = (face: { x: number; y: number }) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: {
      ...st.player, health: 99999, maxHealth: 99999, invulnerable: false, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 },
      lastDirection: face, brawler: { ...initialBrawlerState(), points: 20 },
    },
  }));
};
const place = (dx: number, dy: number, type: EnemyType = 'zombie'): Enemy => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: p.x + p.width / 2 + dx - e.width / 2, y: p.y + p.height / 2 + dy - e.height / 2, id: 'z', health: 9_999_999, maxHealth: 9_999_999, dormant: false } as Enemy;
};
const adv = () => {
  const frozen = now < useGameStore.getState().hitstopUntil;
  now += 16;
  if (frozen) return;
  useGameStore.getState().setGameTime(useGameStore.getState().gameTime + 16);
  useGameStore.getState().movePlayer(NO, 0.016);
  useGameStore.getState().tickBrawler();
  useGameStore.getState().updateEnemies(0.016);
};
const pos = () => { const p = useGameStore.getState().player; return { x: p.x, y: p.y }; };
/** 1〜3段目を当てて、3段目の当たりが解けるまで進める。 */
const toStage3 = (dx: number, dy: number, type: EnemyType = 'zombie') => {
  useGameStore.setState({ enemies: [place(dx, dy, type)] });
  for (let stage = 1; stage <= 3; stage++) {
    useGameStore.getState().brawlerPress();
    for (let k = 0; k < 200; k++) { adv(); const b = useGameStore.getState().player.brawler!; if (b.stage === stage && b.resolved) break; }
  }
  expect(useGameStore.getState().player.brawler!.stage).toBe(3);
};
/** 4段目を押して、当たりが解けるまでに進んだ量。 */
const stage4Travel = () => {
  const a = pos();
  useGameStore.getState().brawlerPress();
  for (let k = 0; k < 200; k++) { adv(); const b = useGameStore.getState().player.brawler!; if (b.stage === 4 && b.resolved) break; }
  expect(useGameStore.getState().player.brawler!.stage).toBe(4);
  const b = pos();
  return { dx: b.x - a.x, dy: b.y - a.y };
};

beforeEach(() => {
  now = 7_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99); // 会心・処刑の抽選を外す(再現を決め打ち)
  setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('4段目(小ジャンプの叩き潰し)の踏み込み', () => {
  it('再現: 3段目までで相手が居なくなった(倒れた)後の4段目は、向いている向きへ決まった距離だけ進む(真上に跳ばない)', () => {
    setup({ x: 1, y: 0 });
    toStage3(45, 0);
    useGameStore.setState({ enemies: [] }); // 3段目で倒れた=狙える相手が居ない
    const d = stage4Travel();
    expect(d.dx).toBeGreaterThan(BRAWLER_LUNGE_PX.s4 * 0.85);
    expect(Math.abs(d.dy)).toBeLessThan(2);
  });
  // ★実機の録画(v0.25.5666・練習の案山子): 3段目の押しで相手が届く範囲の外まで飛び、4段目がその場で真上に跳んで、輪が足元に落ちた。
  //   届く範囲(huntingMeleeRadius)の外の相手は段の狙いにならない(§31-2b)=狙いが無い=踏み込み0、が原因。案山子とゾンビの両方で同じ。
  for (const type of ['scarecrow', 'zombie'] as EnemyType[]) {
    it(`再現(${type}・左向き): 3段目の押しで相手が届く範囲の外へ出た後の4段目は、3段目で向いた向きへ決まった距離だけ進む`, () => {
      setup({ x: -1, y: 0 });
      toStage3(-45, 0, type);
      // 3段目の押し(実機では体1.5個ぶん)で、相手が届く範囲の外に居る所を作る(浮いたまま・向きは3段目の向き=左のまま)。
      const st = useGameStore.getState();
      const p = st.player;
      const r = huntingMeleeRadius(p);
      const e = st.enemies.find(x => x.id === 'z')!;
      useGameStore.setState({ enemies: [{ ...e, x: p.x + p.width / 2 - r - 40 - e.width }] });
      const d = stage4Travel();
      expect(d.dx).toBeLessThan(-BRAWLER_LUNGE_PX.s4 * 0.85); // 左へ進む(真上に跳ばない)
      expect(Math.abs(d.dy)).toBeLessThan(2);
    });
  }
  it('相手が居ない時の向き=出した瞬間に向いている向き(斜め)', () => {
    setup({ x: 1, y: 0 });
    toStage3(30, 30);
    useGameStore.setState({ enemies: [] });
    const f = useGameStore.getState().player.lastDirection!;
    const d = stage4Travel();
    const len = Math.hypot(d.dx, d.dy);
    expect(len).toBeGreaterThan(BRAWLER_LUNGE_PX.s4 * 0.85);
    expect((d.dx * f.x + d.dy * f.y) / len).toBeGreaterThan(0.99);
  });
  it('相手が居る時は今どおり(相手の手前で止まる・§31)', () => {
    setup({ x: 1, y: 0 });
    toStage3(60, 0);
    const d = stage4Travel();
    expect(d.dx).toBeGreaterThan(20);
  });
  it('純関数: 4段目だけ、相手が居なくても向きへ決まった距離。1〜3段目は相手が居なければ進まない。相手が居れば brawlerApproach と同じ', () => {
    expect(brawlerStageApproach(4, 0, 0, null, 50, { x: 0, y: -1 })).toEqual({ dx: 0, dy: -50, dist: 50 });
    for (const s of [1, 2, 3]) expect(brawlerStageApproach(s, 0, 0, null, 30, { x: 1, y: 0 }).dist).toBe(0);
    const e = spawnEnemyAt('zombie', 100, 0, 0);
    expect(brawlerStageApproach(4, 0, 18, e, 50, { x: 1, y: 0 })).toEqual(brawlerApproach(0, 18, e, 50));
  });
});
