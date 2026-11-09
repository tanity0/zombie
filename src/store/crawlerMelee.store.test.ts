// ★研究所の塊と格闘(research/BRAWLER.md §9-75・research/LAB_CRAWLER.md・社長「研究所の塊、当たり判定と壁判定が合ってない?」
// →「近接が当たらない(格闘でやってる)」→「塊のは当たりエフェクトが無いとか?」→「はい」=共通の作りで直す)。
// 塊(743×300)の左右上下の各面で: 5段目が当たる・秘奥義が入る・ダメージ数字が拳の先に出る。普通の敵の数字の位置は変わらない。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { runLabCrawlerTick } from '../utils/labCrawlerTick';
import { createLabCrawler, crawlerRect, type LabCrawler } from '../world/labCrawler';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import { BRAWLER_TEMPO_DEFAULT, initialBrawlerState } from '../utils/brawler';
import { spawnEnemyAt } from '../utils/enemyUtils';
import type { Enemy } from '../types/game';

setBrawlerTempoAll(1.0);
let now = 9_000_000;
type Side = 'left' | 'right' | 'top' | 'bottom';
const SIDES: Side[] = ['left', 'right', 'top', 'bottom'];
let nums: { x: number; y: number; v: number }[] = [];

const setup = (side: Side) => {
  useGameStore.getState().resetGame('warrior');
  const c0: LabCrawler = { ...createLabCrawler({ x: 7000, y: 0 }), awake: true, nextAttackAt: 1e12 };
  const r = crawlerRect(c0);
  useGameStore.setState(st => {
    const pw = st.player.width, ph = st.player.height;
    const x = side === 'left' ? r.x - pw - 4 : side === 'right' ? r.x + r.width + 4 : r.x + r.width / 2 - pw / 2;
    const y = side === 'top' ? r.y - ph - 4 : side === 'bottom' ? r.y + r.height + 4 : r.y + r.height / 2 - ph / 2;
    return {
      enemies: [], pumpkinBlasts: [], attention: null, gameTime: 10_000, stageTheme: 'lab', farBackdrop: 'lab',
      labCrawler: c0, viewZoom: 1, gameBounds: { ...st.gameBounds, width: 430, height: 932 },
      m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
      player: {
        ...st.player, x, y, health: 1e9, maxHealth: 1e9, invulnerable: true, subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 },
        lastDirection: { x: side === 'left' ? 1 : side === 'right' ? -1 : 0, y: side === 'top' ? 1 : side === 'bottom' ? -1 : 0 },
      },
    };
  });
  nums = [];
  const orig = useGameStore.getState().spawnDamageNumber;
  useGameStore.setState({ spawnDamageNumber: ((x: number, y: number, v: number, ...rest: never[]) => { nums.push({ x, y, v }); return (orig as (...a: unknown[]) => void)(x, y, v, ...rest); }) as never });
};
/** 1フレーム(塊は止めたまま=面に張り付いた状態を保つ)。塊が受けたダメージを返す。 */
const frame = (): number => {
  now += 16;
  const gt = useGameStore.getState().gameTime + 16;
  const p0 = useGameStore.getState().player;
  useGameStore.setState(st => ({
    gameTime: gt, attention: null,
    camera: { x: p0.x + p0.width / 2 - st.gameBounds.width / 2, y: p0.y + p0.height / 2 - st.gameBounds.height / 2 },
    player: { ...st.player, brawler: { ...(st.player.brawler ?? initialBrawlerState()), points: 99 } },
  }));
  useGameStore.getState().movePlayer({ up: false, down: false, left: false, right: false } as never, 0.016);
  useGameStore.getState().tickBrawler();
  const hp0 = useGameStore.getState().labCrawler?.hp ?? 0;
  runLabCrawlerTick(gt, 0);
  useGameStore.setState(st => ({ pumpkinBlasts: [], labCrawler: st.labCrawler ? { ...st.labCrawler, nextAttackAt: 1e12, state: 'move' } : null }));
  return hp0 - (useGameStore.getState().labCrawler?.hp ?? 0);
};
const pc = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };

beforeEach(() => {
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

describe('塊の各面で5段', () => {
  for (const side of SIDES) {
    it(`${side}: 1〜5段が全部当たり、数字は拳の先(殴った所の近く)に出る`, () => {
      setup(side);
      for (let i = 0; i < 20; i++) frame();
      const dmgBy: number[] = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 5; i++) {
        useGameStore.getState().brawlerPress();
        for (let k = 0; k < 120 && useGameStore.getState().player.brawler!.phase !== 'idle'; k++) {
          const d = frame();
          if (d > 0) {
            dmgBy[useGameStore.getState().player.brawler!.stage] += d;
            const n = nums.at(-1)!;
            const c = pc();
            expect(Math.hypot(n.x - c.x, n.y - c.y), `${side} 段${i + 1} 数字(${n.x},${n.y}) 自機(${c.x},${c.y})`).toBeLessThan(110);
          }
        }
      }
      for (let k = 1; k <= 5; k++) expect(dmgBy[k], `${side} 段${k}`).toBeGreaterThan(0);
    });
  }
});

describe('塊の各面で秘奥義', () => {
  for (const side of SIDES) {
    it(`${side}: 秘奥義が塊に入る(中心が画面の外でも)`, () => {
      setup(side);
      for (let i = 0; i < 20; i++) frame();
      useGameStore.getState().brawlerPress();
      for (let i = 0; i < 40; i++) frame();
      useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, points: 99, secretProgress: 3, secretLastEndAt: st.gameTime } } }));
      expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
      let dmg = 0, hits = 0;
      for (let i = 0; i < 400; i++) {
        dmg += frame();
        const sec = useGameStore.getState().player.brawler?.secret;
        if (sec) hits = sec.hits; else if (i > 5) break;
      }
      expect(hits, side).toBeGreaterThanOrEqual(9);
      expect(dmg).toBeGreaterThan(0);
      // ワープ先は塊の面のすぐ外(中心から max(幅,高さ)/2 の所=遠くの空中ではない)
      const r = crawlerRect(useGameStore.getState().labCrawler!);
      const c = pc();
      const gap = Math.hypot(c.x - Math.max(r.x, Math.min(c.x, r.x + r.width)), c.y - Math.max(r.y, Math.min(c.y, r.y + r.height)));
      expect(gap).toBeLessThan(80);
    });
  }
});

describe('普通の敵は変わらない', () => {
  it('ゾンビへの1段目: 数字は箱の中心の x・箱の上の縁(今までどおり)', () => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState(st => ({ m0Unlocked: { ...st.m0Unlocked, melee: true, crit: false }, player: { ...st.player, subWeapons: ['brawler'], subWeaponLevels: { brawler: 1 }, lastDirection: { x: 1, y: 0 } } }));
    const c = pc();
    const e0 = spawnEnemyAt('zombie', 0, 0, 0);
    const z = { ...e0, x: c.x + 50 - e0.width / 2, y: c.y + 20 - e0.height / 2, id: 'z', health: 9999, maxHealth: 9999 } as Enemy;
    useGameStore.setState({ enemies: [z] });
    nums = [];
    const orig = useGameStore.getState().spawnDamageNumber;
    useGameStore.setState({ spawnDamageNumber: ((x: number, y: number, v: number, ...rest: never[]) => { nums.push({ x, y, v }); return (orig as (...a: unknown[]) => void)(x, y, v, ...rest); }) as never });
    useGameStore.getState().brawlerPress();
    for (let k = 0; k < 60 && nums.length === 0; k++) { now += 16; useGameStore.setState(st => ({ gameTime: st.gameTime + 16 })); useGameStore.getState().tickBrawler(); }
    const zz = useGameStore.getState().enemies.find(e => e.id === 'z')!;
    expect(nums.length).toBeGreaterThan(0);
    expect(nums[0].x).toBeCloseTo(zz.x + zz.width / 2, 5);
    expect(nums[0].y).toBeCloseTo(zz.y, 5);
  });
});
