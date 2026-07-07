import { describe, it, expect } from 'vitest';
import {
  BENCHMARK_PROFILES,
  nextProfileIndex,
  hasBenchmarkMargin,
  BENCHMARK_MARGIN_AVG_FPS,
  BENCHMARK_MARGIN_MIN_FPS,
  createBenchmarkMines,
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
    const next = nextProfileIndex(from, 60, 60);
    expect(next).toBe(idx('PR3'));
    expect(BENCHMARK_PROFILES[next].category).toBe('PROJ');
  });

  it('without margin (tight pass/caution/fail): steps down to the next (lighter) stage in the same category', () => {
    const from = idx('E3');
    const next = nextProfileIndex(from, 45, 32); // PASSだが余裕ラインには届かない
    expect(next).toBe(idx('E2'));
    expect(BENCHMARK_PROFILES[next].category).toBe('ENEMY');
  });

  it('a FAIL grade also descends within the category (does not abandon it outright)', () => {
    const from = idx('E3');
    const next = nextProfileIndex(from, 10, 5); // 明確なFAIL
    expect(next).toBe(idx('E2'));
  });

  it('descending off the lightest stage of a category naturally spills into the next category', () => {
    const from = idx('E1'); // ENEMYの最軽(最後の段)
    const next = nextProfileIndex(from, 45, 32); // 余裕未満
    expect(BENCHMARK_PROFILES[next]?.category).toBe('PROJ');
  });

  it('with margin on the very last profile, returns an out-of-range index (benchmark complete)', () => {
    const from = BENCHMARK_PROFILES.length - 1;
    const next = nextProfileIndex(from, 60, 60);
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
