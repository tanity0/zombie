// ★地割り(旧 大踏み潰し)の派生「土竜」(research/BRAWLER.md §35・社長指示2026-11-20)。入力の窓・値段・浮かせ(押さない)・取り消しの道を固める。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setKenkiLevelForTest } from '../utils/kenkiLevel';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import {
  BRAWLER_TECHS, BRAWLER_MOGURA_IGNORE_MS, brawlerMoguraWindow, brawlerMoguraCost, brawlerMoguraExtraCost, brawlerTechCost,
  brawlerRouteNodeOf, brawlerRouteAllows, initialBrawlerState, brawlerStartTech,
} from '../utils/brawler';
import { setBrawlerTempoAll, brawlerAirborne, brawlerJugglePush, BRAWLER_JUGGLE_BUDGET, BRAWLER_JUGGLE_COST, BRAWLER_GROUND_LAUNCH, BRAWLER_KICKUP_LIFT_K } from '../utils/brawlerCombo';
import { brawlerTimeKeeperDiscount } from '../utils/brawlerSkills';
import { BRAWLER_TECH_NAMES } from '../data/brawlerTechNames';
import { TUTORIALS } from '../data/tutorials';

setBrawlerTempoAll(1.0);
const NO_INPUT = { up: false, down: false, left: false, right: false } as never;
let now = 9_000_000;
const setup = (points: number) => {
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(st => ({
    m0Unlocked: { ...st.m0Unlocked, melee: true, crit: true },
    player: {
      ...st.player, health: 9999, maxHealth: 9999, invulnerable: false, skills: [] as never, skillLevels: {},
      subWeapons: ['brawler'], subWeaponLevels: { brawler: 2 }, lastDirection: { x: 1, y: 0 }, brawler: { ...initialBrawlerState(), points },
    },
    skillProcFeed: [],
  }));
};
const center = () => { const p = useGameStore.getState().player; return { x: p.x + p.width / 2, y: p.y + p.height / 2 }; };
const enemyAt = (dx: number, dy: number, id: string) => {
  const c = center();
  const e = spawnEnemyAt('zombie', 0, 0, useGameStore.getState().gameTime);
  e.x = c.x + dx - e.width / 2; e.y = c.y + dy - e.height / 2; e.health = 99999; e.maxHealth = 99999; e.id = id;
  return e;
};
const advance = (ms: number) => {
  const end = now + ms;
  while (now < end) {
    now += 10;
    if (now - 10 < useGameStore.getState().hitstopUntil) continue;
    useGameStore.setState(st => ({ gameTime: st.gameTime + 10 }));
    useGameStore.getState().movePlayer(NO_INPUT, 0.01);
    useGameStore.getState().tickBrawler();
  }
};
const br = () => useGameStore.getState().player.brawler!;
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;
const feed = () => useGameStore.getState().skillProcFeed.map(e => e.key);
const waitHit = () => { for (let k = 0; k < 120 && !(br().resolved && !(useGameStore.getState().gameTime < br().stopUntil)); k++) advance(10); };
/** 地割りを出して upAt ms 後に上を入れる(null=入れない)。 */
const stomp = (points: number, upAt: number | null, enemies = [enemyAt(40, 0, 'z')]) => {
  setup(points);
  useGameStore.setState({ enemies });
  expect(useGameStore.getState().brawlerTech(0, 1)).toBe(true);
  expect(br().tech).toBe('stomp');
  if (upAt !== null) { advance(upAt); useGameStore.getState().brawlerTech(0, -1); }
};

beforeEach(() => {
  setKenkiLevelForTest(5); // ★§36-2: 踵落とし・蹴り上げ・土竜を体得した状態で試す(体得の門そのものは brawlerArts.store.test.ts)
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('§35 名前', () => {
  it('技の行: 地割り(下)・土竜(上)。資料室の格闘の一覧は地割りの次の行に土竜', () => {
    expect(BRAWLER_TECH_NAMES['tech:stomp']).toEqual({ name: '地割り', dir: 'down' });
    expect(BRAWLER_TECH_NAMES['tech:mogura']).toEqual({ name: '土竜', dir: 'up' });
    const t = TUTORIALS.find(x => x.id === 'brawler-moves')!;
    for (const lines of [t.lines, t.pcLines!, t.padLines!]) {
      const i = lines.findIndex(l => l.includes(': 地割り。'));
      expect(i).toBeGreaterThanOrEqual(0);
      expect(lines[i + 1]).toBe('地割りの溜めの間に上: 土竜。');
      expect(lines.join('')).not.toContain('大踏み潰し');
    }
  });
});

describe('§35 土竜の入力と値段(純関数)', () => {
  it('窓: 地割りの出だしの最初60ms(実時間)は受け付けず、そこから当たるまで。派生は1回', () => {
    const s = { ...brawlerStartTech(initialBrawlerState(), 'stomp', 1000), pressAt: 5000 };
    expect(brawlerMoguraWindow(s, 5000 + BRAWLER_MOGURA_IGNORE_MS - 1)).toBe(false);
    expect(brawlerMoguraWindow(s, 5000 + BRAWLER_MOGURA_IGNORE_MS)).toBe(true);
    expect(brawlerMoguraWindow({ ...s, resolved: true }, 5200)).toBe(false);
    expect(brawlerMoguraWindow({ ...s, mogura: true }, 5200)).toBe(false);
    expect(brawlerMoguraWindow({ ...brawlerStartTech(initialBrawlerState(), 'kiko', 1000), pressAt: 5000 }, 5200)).toBe(false);
  });
  it('値段=地割り+1(タイムキーパー・血の覚醒は地割りと同じ規則)・差額は1(覚醒中は0)', () => {
    expect(brawlerMoguraCost()).toBe(BRAWLER_TECHS.stomp.cost + 1);
    const d = brawlerTimeKeeperDiscount('stomp', 3);
    expect(brawlerMoguraCost(false, d)).toBe(brawlerTechCost('stomp', false, d) + 1);
    expect(brawlerMoguraCost(true)).toBe(brawlerTechCost('stomp', true));
    expect(brawlerMoguraExtraCost()).toBe(1);
    expect(brawlerMoguraExtraCost(true)).toBe(0);
  });
  it('浮き: 地上=蹴り上げと同じ打ち上げ・空中=浮き直し(地面バウンドではない)・予算2', () => {
    expect(BRAWLER_GROUND_LAUNCH.mogura).toBeCloseTo(0.7 * BRAWLER_KICKUP_LIFT_K, 9);
    expect(BRAWLER_GROUND_LAUNCH.mogura).toBe(BRAWLER_GROUND_LAUNCH.kickup);
    expect(BRAWLER_JUGGLE_COST.mogura).toBe(2);
    const e0 = spawnEnemyAt('zombie', 0, 0, 0);
    const g = brawlerJugglePush(e0, 'mob', 'mogura', 1000)!;
    expect(g.brLiftPeak).toBeCloseTo(BRAWLER_GROUND_LAUNCH.mogura!, 9);
    const air = { ...e0, ...g };
    const a = brawlerJugglePush(air, 'mob', 'mogura', 1100)!;
    expect(a.brLiftBudget).toBe(BRAWLER_JUGGLE_BUDGET.mob - 2);
    expect(a.brLiftDropMs ?? 0).toBe(0);                           // 落ちてから跳ねる(地面バウンド)ではない
    expect((a as { brBounceCombo?: number }).brBounceCombo).toBeUndefined();
  });
  it('道: 土竜の後は飛び蹴り・気功へ取り消せる(地割りへは不可)・待機からは出ない', () => {
    expect(brawlerRouteAllows('mogura', 'kick1')).toBe(true);
    expect(brawlerRouteAllows('mogura', 'kiko')).toBe(true);
    expect(brawlerRouteAllows('mogura', 'stomp')).toBe(false);
    expect(brawlerRouteAllows('idle', 'mogura')).toBe(false);
    expect(brawlerRouteNodeOf({ ...brawlerStartTech(initialBrawlerState(), 'stomp', 0), mogura: true })).toBe('mogura');
  });
});

describe('§35 土竜(ストア)', () => {
  it('最初の60msの上は受け付けない(地割りのまま・値段も払わない)', () => {
    stomp(10, 30);
    expect(br().mogura).toBeFalsy();
    expect(br().points).toBe(10 - BRAWLER_TECHS.stomp.cost);
    expect(feed()).toEqual(['tech:stomp']);
  });
  it('60msを過ぎて当たる前の上=土竜(差額1を払う・技の行は地割り→土竜・秘奥義の順番は地割りのまま)', () => {
    stomp(10, 0);
    const prog = br().secretProgress;
    advance(80);
    expect(useGameStore.getState().brawlerTech(0, -1)).toBe(true);
    expect(br().mogura).toBe(true);
    expect(br().tech).toBe('stomp');
    expect(br().points).toBe(10 - BRAWLER_TECHS.stomp.cost - 1);
    expect(feed()).toEqual(['tech:stomp', 'tech:mogura']);
    expect(br().secretProgress).toBe(prog);
  });
  it('払えない(差額が足りない)時は地割りのまま', () => {
    stomp(BRAWLER_TECHS.stomp.cost, 80);
    expect(br().mogura).toBeFalsy();
    waitHit();
    expect((en('z').knockbackUntil ?? 0)).toBeGreaterThan(now); // 地割り=押す
  });
  it('当たった地上の敵: 地割りは押す / 土竜は押さずに浮かせる', () => {
    stomp(10, null);
    waitHit();
    const pushed = en('z');
    expect(Math.hypot(pushed.knockbackVx ?? 0, pushed.knockbackVy ?? 0)).toBeGreaterThan(0);
    stomp(10, 80);
    expect(br().mogura).toBe(true);
    waitHit();
    const up = en('z');
    expect(brawlerAirborne(up, now)).toBe(true);
    expect(Math.hypot(up.knockbackVx ?? 0, up.knockbackVy ?? 0)).toBe(0);
  });
  it('当てた後は飛び蹴り・気功へ取り消せる', () => {
    for (const [dx, dy, tech] of [[1, 0, 'kick'], [-1, 0, 'kiko']] as const) {
      stomp(20, 80);
      waitHit();
      expect(useGameStore.getState().brawlerTech(dx, dy)).toBe(true);
      for (let k = 0; k < 40 && br().tech !== tech; k++) advance(10);
      expect(br().tech).toBe(tech);
    }
  });
});
