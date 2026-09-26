/**
 * ★同じ seed なら**湧きの型の並びが一致する**(TEST_HANDOFF/REQUEST-devbridge.md **C. P0-3 の seed**)。
 *
 * ★なぜこのテストが要るのか(2026-09-17の実機確認 `results/20260917-1430-bc-verify.md` §2):
 * `?seed=12345` を付けた2本で、**0件目から型が違った**(`skeleton` vs `bat`)。
 * 原因は `enemyUtils` の `spawnRng` ではなく、**「どの型を出すか」を決める側**が
 * `Math.random()` を直に引いていたこと——
 *   ①`directorTick.ts` の台本ローテーション(`selectRotationPattern` の2値)
 *   ②`directorTick.ts` の盤面維持の抽選(`decideNextSpawn` の `tieBreakRandom` → `pickChaffType`)
 *   ③`drillerAi.ts` の `resolvePumpkinTier`(pumpkin/driller/logger の実体化)の既定 rand
 * 3つとも `seededRng` の `director` 系統に載せた。ここではその**並び**を固定する。
 *
 * ★ここで再現するのは **`directorTick` の台本駆動スポナー**(通常/ピークのコマの実体)。
 * 盤面数・CD・被弾ガードは「常に湧かせてよい」側へ倒して、**抽選だけ**を取り出している。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
// ★ソースそのものを読む(?raw)。「直したつもり」ではなく**実物**に素の Math.random が無いことを見る。
import directorTickSrc from './directorTick.ts?raw';
import drillerAiSrc from './drillerAi.ts?raw';
import scriptPuzzleSrc from './scriptPuzzle.ts?raw';

const loadWith = async (search: string) => {
  vi.resetModules();
  const url = new URL('http://localhost/zombie/' + search);
  vi.stubGlobal('window', { location: { search: url.search } } as unknown as Window);
  const seeded = await import('./seededRng');
  const puzzle = await import('./scriptPuzzle');
  const driller = await import('./drillerAi');
  return { seeded, puzzle, driller };
};

type Mods = Awaited<ReturnType<typeof loadWith>>;

/**
 * `directorTick.ts` の湧き決定を、乱数の引き方だけそのままに抜き出したもの。
 * 引く順序(台本の2値 → tieBreak → pumpkinの実体化)も本体と同じにしてある。
 */
const spawnTypeSequence = ({ seeded, puzzle, driller }: Mods, count: number): string[] => {
  const rank = 3 as const;
  const seen = new Set<string>();
  let lastPatternId: string | null = null;
  let script = null as ReturnType<typeof puzzle.selectRotationPattern> | null;
  let spawned = { ...puzzle.ZERO_NUISANCE };
  const out: string[] = [];
  let guard = 0;
  while (out.length < count && guard++ < 10000) {
    const cleared = script == null
      || puzzle.isScriptCleared(puzzle.nuisanceTarget(script), spawned, puzzle.ZERO_NUISANCE);
    if (cleared) {
      script = puzzle.selectRotationPattern(
        rank, seen, lastPatternId, false, seeded.directorRng(), seeded.directorRng(),
      );
      spawned = { ...puzzle.ZERO_NUISANCE };
      lastPatternId = script.id;
      seen.add(script.id);
      if (puzzle.allPatternsSeen(rank, seen)) seen.clear();
    }
    const decision = puzzle.decideNextSpawn({
      boardCount: 0,
      boardTarget: 99,
      cdElapsedMs: 99999,
      cdMs: 0,
      nuisanceElapsedMs: 99999,
      nuisanceTargetCounts: puzzle.nuisanceTarget(script!),
      nuisanceSpawnedCounts: spawned,
      specialElapsedMs: 0,          // 特別枠のCDは明けていない扱い(抽選を混ぜない)
      area: 0,
      aliveSpecial: {},
      msSinceLastHit: 99999,
      chaffWeights: puzzle.chaffWeightsForKoma('normal'),
      tieBreakRandom: seeded.directorRng(),
    });
    if (!decision) break;
    if (decision.slot === 'nuisance') {
      spawned = { ...spawned, [decision.type]: spawned[decision.type as keyof typeof spawned] + 1 };
    }
    // §9-3: pumpkin枠は実体化の瞬間に pumpkin/driller/logger へ差し替わる(既定randが director系統)。
    out.push(decision.type === 'pumpkin' ? driller.resolvePumpkinTier(true, true) : decision.type);
  }
  return out;
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ランの再現性: 湧きの型の並び', () => {
  it('★★同じseedで2回ぶん引くと、先頭20体の型の並びが一致する(受け入れ条件)', async () => {
    const m = await loadWith('?seed=12345');
    const first = spawnTypeSequence(m, 20);
    expect(first).toHaveLength(20);
    m.seeded.resetSeededRngs();          // = 出撃のたびに useGameLoop が呼ぶもの
    const second = spawnTypeSequence(m, 20);
    expect(second).toEqual(first);
  });

  it('★★別ページ(モジュール再評価)で同じseedを指定しても同じ並びになる', async () => {
    const a = spawnTypeSequence(await loadWith('?seed=12345'), 20);
    const b = spawnTypeSequence(await loadWith('?seed=12345'), 20);
    expect(b).toEqual(a);
  });

  it('並びが1種類に潰れていない(抽選として機能している)', async () => {
    const seq = spawnTypeSequence(await loadWith('?seed=12345'), 20);
    expect(new Set(seq).size).toBeGreaterThan(1);
  });

  it('seedが違えば並びも違う', async () => {
    const a = spawnTypeSequence(await loadWith('?seed=1'), 20);
    const b = spawnTypeSequence(await loadWith('?seed=2'), 20);
    expect(b).not.toEqual(a);
  });

  it('★★seed未指定なら Math.random をそのまま使う(通常プレイの分布を変えない)', async () => {
    const m = await loadWith('');
    expect(m.seeded.isSeededRun()).toBe(false);
    const spy = vi.spyOn(Math, 'random');
    spawnTypeSequence(m, 20);
    expect(spy).toHaveBeenCalled();
  });
});

describe('★再発防止: 湧きの意思決定に素の Math.random を残さない', () => {
  // v0.25.4448 の事故そのもの——「seedの口は効いているのに湧きが再現しない」の正体は、
  // 型を決める側が `Math.random()` を直に引いていたこと。ここは**ファイル単位で機械的に**塞ぐ。
  it.each([
    ['directorTick.ts', directorTickSrc],
    ['drillerAi.ts', drillerAiSrc],
    ['scriptPuzzle.ts', scriptPuzzleSrc],
  ])('%s に Math.random( が1つも無い', (_name, src) => {
    expect(src.includes('Math.random(')).toBe(false);
  });
});
