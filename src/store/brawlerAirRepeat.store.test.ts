// ★1回の空中で同じ技は1回まで(社長指示2026-11-27「格闘の空中では、一度の空中で同じ技は1回までにして(一度着地した後ならok)」)。実際のストアを実機の刻み(16ms・係数1.3)で回す(進め方は brawlerTrack.store.test.ts と同じ)。
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setKenkiLevelForTest } from '../utils/kenkiLevel';
import { setBrawlerTempoAll } from '../utils/brawlerCombo';
import {
  BRAWLER_TEMPO_DEFAULT, initialBrawlerState, brawlerSelfHeightPx, brawlerInHitstop, brawlerSelfAirborne, type BrawlerState,
} from '../utils/brawler';
import { resetAirMeleeHit } from '../utils/playerAirFollow';

const NO = { up: false, down: false, left: false, right: false } as never;
const FRAME = 16;
let now = 7_000_000;

const setup = (o: { skills?: string[]; points?: number } = {}) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: {
      ...st.player, health: 99999, maxHealth: 99999, invulnerable: false, skills: (o.skills ?? []) as never, skillLevels: {},
      subWeapons: ['brawler'], subWeaponLevels: { brawler: 3 }, lastDirection: { x: 1, y: 0 }, brawler: { ...initialBrawlerState(), points: o.points ?? 20 },
    },
  }));
};
const pc = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const place = (type: EnemyType, dx: number, id: string, extra: Partial<Enemy> = {}, dy = 0): Enemy => {
  const c = pc();
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, x: c.x + dx - e.width / 2, y: c.y + dy - e.height / 2, id, health: 9_999_999, maxHealth: 9_999_999, dormant: false, ...extra } as Enemy;
};
const br = (): BrawlerState => useGameStore.getState().player.brawler!;
const gt = () => useGameStore.getState().gameTime;
const selfH = () => brawlerSelfHeightPx(br(), gt());
let input: typeof NO = NO;
const adv = (onStep?: () => void) => {
  now += FRAME;
  if (now < useGameStore.getState().hitstopUntil) { onStep?.(); return; } // 画面全体の止め(掴み)=壁時計だけ進む(実機のループと同じ)
  useGameStore.getState().setGameTime(gt() + FRAME);
  useGameStore.getState().movePlayer(input, FRAME / 1000);
  useGameStore.getState().tickBrawler();
  useGameStore.getState().updateEnemies(FRAME / 1000);
  onStep?.();
};

const spawnMob = (dx = 80): void => { useGameStore.setState({ enemies: [place('zombie', dx, 'z')] }); };

/** 入力。P=通常攻撃 / K=右フリック(飛び蹴り) / D=下(踵落とし・地割り) / U=上(蹴り上げ) / L=左(気功)。 */
type In = 'P' | 'K' | 'D' | 'U' | 'L';
const FL: Record<Exclude<In, 'P'>, [number, number]> = { K: [1, 0], D: [0, 1], U: [0, -1], L: [-1, 0] };
const press = (i: In): boolean => (i === 'P' ? useGameStore.getState().brawlerPress() : useGameStore.getState().brawlerTech(FL[i][0], FL[i][1]));

beforeEach(() => {
  now = 7_000_000;
  input = NO;
  setBrawlerTempoAll(1.3);
  setKenkiLevelForTest(5);
  resetAirMeleeHit();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); setKenkiLevelForTest(null); });
afterAll(() => { setBrawlerTempoAll(BRAWLER_TEMPO_DEFAULT); });

const air = () => brawlerSelfAirborne(br(), gt());
/** 飛び蹴り1発目→2発目(空中蹴りの滞空)まで。 */
const toHover = () => {
  setup();
  spawnMob(80);
  expect(press('K')).toBe(true);
  for (let k = 0; k < 60 && !br().resolved; k++) adv();
  expect(press('K')).toBe(true);
  for (let k = 0; k < 60 && !(br().kickN === 2 && br().resolved); k++) adv();
  expect(br().kickN).toBe(2);
  for (let k = 0; k < 40 && brawlerInHitstop(br(), gt()); k++) adv();
  expect(air()).toBe(true);
};
const runToLand = () => {
  for (let k = 0; k < 300 && (br().phase !== 'idle' || selfH() > 0); k++) adv();
  expect(selfH()).toBe(0);
  for (let k = 0; k < 10; k++) adv();
};

describe('1回の空中で同じ技は1回まで(着地したら数え直す)', () => {
  it('飛び蹴り1→2発目は別の技として出る(数えているのは1発目・2発目)', () => {
    toHover();
    expect(br().airUsed).toEqual(['kick1', 'kick2']);
  });
  it('空中の1段目の後の飛び蹴りは、この空中で1発目を出しているので出ない(覚えもしない)。着地後は出る', () => {
    toHover();
    // 滞空中の通常攻撃=1段目(別の技=出る)
    expect(press('P')).toBe(true);
    for (let k = 0; k < 60 && !(br().phase === 'attack' && br().stage === 1); k++) adv();
    expect(br().stage).toBe(1);
    for (let k = 0; k < 60 && !br().resolved; k++) adv();
    for (let k = 0; k < 40 && brawlerInHitstop(br(), gt()); k++) adv();
    expect(air(), 'まだ空中').toBe(true);
    expect(br().airUsed).toEqual(['kick1', 'kick2', 's1']);
    expect(press('K'), '2度目の飛び蹴り1発目').toBe(false);
    expect(br().techBuffer, '覚えない').toBeUndefined();
    // 覚えた技の発動の経路(行動の終わりに出す覚え)も門を通る: 覚えを直に置いても出ない。
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, techBuffer: 'kick', lateHeld: true } } }));
    for (let k = 0; k < 300 && (br().phase !== 'idle' || selfH() > 0); k++) {
      adv();
      expect(br().phase === 'tech' && br().tech === 'kick', '着地まで蹴りは出ない').toBe(false);
    }
    runToLand();
    expect(selfH(), '着地した(印は残っていても空中ではない=門は閉じない)').toBe(0);
    expect(press('K'), '着地後').toBe(true);
    expect(br().kickN).toBe(1);
    expect(br().airUsed).toEqual(['kick1']);
  });
  it('落下中の2度目の1段目は出ない(覚えない)。地割り(別の技)は出る', () => {
    toHover();
    expect(press('P')).toBe(true);
    for (let k = 0; k < 200 && br().phase !== 'idle'; k++) adv();
    // 1段目が終わって落下中。段のつなぎを切って、次の押しも1段目(=同じ技)にする。
    expect(air(), 'まだ落下中').toBe(true);
    useGameStore.setState(st => ({ player: { ...st.player, brawler: { ...st.player.brawler!, nextStage: 1, chainUntil: 0 } } }));
    expect(br().airUsed).toContain('s1');
    expect(press('P'), '落下中の2度目の1段目').toBe(false);
    expect(br().buffered).toBe(false);
    expect(br().phase).toBe('idle');
    expect(press('D'), '地割りは別の技').toBe(true);
    expect(br().tech).toBe('stomp');
  });
});
