import { describe, it, expect } from 'vitest';
import {
  BENCHMARK_PROFILES,
  nextProfileIndex,
  hasBenchmarkMargin,
  BENCHMARK_MARGIN_AVG_FPS,
  BENCHMARK_MARGIN_MIN_FPS,
  createBenchmarkMines,
  activeBenchmarkProfiles,
} from './BenchmarkOverlay';

describe('hasBenchmarkMargin (§5.24 M23)', () => {
  it('is true only at/above both the avg and min margin lines', () => {
    expect(hasBenchmarkMargin(BENCHMARK_MARGIN_AVG_FPS, BENCHMARK_MARGIN_MIN_FPS)).toBe(true);
    expect(hasBenchmarkMargin(60, 60)).toBe(true);
  });

  it('is false if either line is missed', () => {
    expect(hasBenchmarkMargin(BENCHMARK_MARGIN_AVG_FPS - 1, BENCHMARK_MARGIN_MIN_FPS)).toBe(false);
    expect(hasBenchmarkMargin(BENCHMARK_MARGIN_AVG_FPS, BENCHMARK_MARGIN_MIN_FPS - 1)).toBe(false);
  });
});

describe('nextProfileIndex (§5.24 M23: 重→軽ランプ+余裕スキップ)', () => {
  const idx = (id: string) => BENCHMARK_PROFILES.findIndex(p => p.id === id);

  it('with margin (comfortable pass): skips the rest of the category (lighter stages) straight to the next category head', () => {
    // E3(=E60, ENEMY先頭=最重)で余裕あり → ENEMY残り(E2/E1)を飛ばしPROJ先頭(PR3)へ。
    const from = idx('E3');
    const next = nextProfileIndex(BENCHMARK_PROFILES, from, 60, 60);
    expect(next).toBe(idx('PR3'));
    expect(BENCHMARK_PROFILES[next].category).toBe('PROJ');
  });

  it('without margin (tight pass/caution/fail): steps down to the next (lighter) stage in the same category', () => {
    const from = idx('E3');
    const next = nextProfileIndex(BENCHMARK_PROFILES, from, 45, 32); // PASSだが余裕ラインには届かない
    expect(next).toBe(idx('E2'));
    expect(BENCHMARK_PROFILES[next].category).toBe('ENEMY');
  });

  it('a FAIL grade also descends within the category (does not abandon it outright)', () => {
    const from = idx('E3');
    const next = nextProfileIndex(BENCHMARK_PROFILES, from, 10, 5); // 明確なFAIL
    expect(next).toBe(idx('E2'));
  });

  it('descending off the lightest stage of a category naturally spills into the next category', () => {
    const from = idx('E1'); // ENEMYの最軽(最後の段)
    const next = nextProfileIndex(BENCHMARK_PROFILES, from, 45, 32); // 余裕未満
    expect(BENCHMARK_PROFILES[next]?.category).toBe('PROJ');
  });

  it('with margin on the very last profile, returns an out-of-range index (benchmark complete)', () => {
    const from = BENCHMARK_PROFILES.length - 1;
    const next = nextProfileIndex(BENCHMARK_PROFILES, from, 60, 60);
    expect(next).toBeGreaterThanOrEqual(BENCHMARK_PROFILES.length);
  });

  it('MINE category is heavy-first (M52 → M32 → M16)', () => {
    const m52 = idx('MI3'), m32 = idx('MI2'), m16 = idx('MI1');
    expect(BENCHMARK_PROFILES[m52].label).toBe('M52');
    expect(BENCHMARK_PROFILES[m32].label).toBe('M32');
    expect(BENCHMARK_PROFILES[m16].label).toBe('M16');
    expect(m52).toBeLessThan(m32);
    expect(m32).toBeLessThan(m16);
  });

  it('works against a filtered (mobile) profile list too (indices are relative to the passed-in array)', () => {
    const mobileProfiles = activeBenchmarkProfiles(true);
    const from = mobileProfiles.findIndex(p => p.id === 'A1'); // ALLの唯一の段(最重かつ最軽)
    // 余裕ありでも、これがALL内の最後(唯一)の段なので次カテゴリ(MINE)の先頭へ。
    const next = nextProfileIndex(mobileProfiles, from, 60, 60);
    expect(mobileProfiles[next]?.category).toBe('MINE');
  });
});

describe('createBenchmarkMines (§5.24 M23)', () => {
  it('creates exactly `count` mine props with the bench-mine- id prefix', () => {
    const mines = createBenchmarkMines(0, 0, 5, 0);
    expect(mines).toHaveLength(5);
    mines.forEach(m => expect(m.id.startsWith('bench-mine-')).toBe(true));
  });

  it('matches the real mine BreakableProp shape (type/health)', () => {
    const [mine] = createBenchmarkMines(100, 200, 1, 0);
    expect(mine.type).toBe('mine');
    expect(mine.health).toBe(1);
    expect(mine.maxHealth).toBe(1);
  });

  it('returns an empty array for count=0', () => {
    expect(createBenchmarkMines(0, 0, 0, 0)).toHaveLength(0);
  });
});

describe('activeBenchmarkProfiles (§5.24-追補: スマホはALL最重段を除外)', () => {
  it('desktop (mobile=false) keeps the full profile list, including A3(MAX)/A2', () => {
    const desktop = activeBenchmarkProfiles(false);
    expect(desktop).toBe(BENCHMARK_PROFILES); // 参照そのまま=フィルタなし
    expect(desktop.some(p => p.id === 'A3')).toBe(true);
    expect(desktop.some(p => p.id === 'A2')).toBe(true);
  });

  it('mobile (mobile=true) drops A3(MAX) and A2, leaving ALL with only A1', () => {
    const mobile = activeBenchmarkProfiles(true);
    expect(mobile.some(p => p.id === 'A3')).toBe(false);
    expect(mobile.some(p => p.id === 'A2')).toBe(false);
    const allCategory = mobile.filter(p => p.category === 'ALL');
    expect(allCategory).toHaveLength(1);
    expect(allCategory[0].id).toBe('A1');
  });

  it('mobile filtering does not touch other categories (e.g. MINE stays M52/M32/M16)', () => {
    const mobile = activeBenchmarkProfiles(true);
    const mineIds = mobile.filter(p => p.category === 'MINE').map(p => p.id);
    expect(mineIds).toEqual(['MI3', 'MI2', 'MI1']);
  });
});
