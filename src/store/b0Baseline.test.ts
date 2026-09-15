// SKILL_BUILD_REDESIGN.md §15-2(B0基準線①): greedyボット30ランの到達Lv分布。
// 通常のnpm test/CIでは走らない(B0_BASELINE=1 を付けた明示実行専用)。
// 実行: B0_BASELINE=1 npx vitest run src/store/b0Baseline.test.ts
// 出力は [B0_BASELINE] 行(コンソール)。結果は DEVELOPMENT_LOG.md へ転記する。
// 注意: レア度表差し替え(B3)後にはこの基準線は二度と取れない(§7)。
import { describe, it, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { createPlaytestRefs, runPlaytestTick } from '../utils/playtestDriver';
import { getRunTelemetrySnapshot } from '../utils/runTelemetry';

declare const process: { env?: Record<string, string | undefined> } | undefined;

const DT = 1 / 60;
const TICKS = 54000; // 15分相当(60fps換算)=既存フルplaytestと同条件
const RUNS = 30;

interface BaselineRun {
  seed: number;
  characterClass: string;
  playerLevel: number;
  survivedSec: number;
  died: boolean;
  kills: number;
  scrapEarned: number;
  scrapSpent: number;
}

// 既存 playtest.test.ts の runOnePlaytest から計測に必要な骨格だけを写した簡約版
// (違反チェック等のデバッグ用計測は基準線には不要なので落としてある)。
const runBaselineRun = (seed: number, characterClass: string): BaselineRun => {
  const realEpoch = Date.now();
  vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['Date'] });
  vi.setSystemTime(realEpoch);
  try {
    useGameStore.getState().resetGame(characterClass);
    const refs = createPlaytestRefs();
    let died = false;
    for (let i = 0; i < TICKS; i++) {
      const before = useGameStore.getState();
      const nextGameTime = before.gameTime + DT * 1000;
      vi.setSystemTime(realEpoch + nextGameTime); // Date.now()をgameTimeへ同期(実時間ゲート対策)
      // greedy=段階'master'(botSkillProfile.upgradePolicy が greedy になる・M49-4)
      runPlaytestTick(refs, { persona: 'standard', tickIndex: i, wanderSeed: seed, dt: DT, skill: 'master' });
      const after = useGameStore.getState();
      if (!died && after.player.health <= 0) died = true;
      if (died) break;
    }
    const end = useGameStore.getState();
    return {
      seed,
      characterClass,
      playerLevel: end.player.level,
      survivedSec: Math.round(end.gameTime / 1000),
      died,
      kills: end.gameStats.enemiesKilled,
      scrapEarned: Math.round(end.gameStats.strapsCollected),
      scrapSpent: Math.round(end.gameStats.strapsSpent),
    };
  } finally {
    vi.useRealTimers();
  }
};

describe('B0基準線①: greedyボットの到達Lv分布(明示実行専用)', () => {
  it.runIf(typeof process !== 'undefined' && process?.env?.B0_BASELINE)(
    `greedy(master)ボット ${RUNS}ラン x 15分相当: 到達Lv分布を記録する`,
    () => {
      const CLASSES = ['warrior', 'mage', 'rogue', 'necromancer'];
      const runs: BaselineRun[] = [];
      for (let i = 0; i < RUNS; i++) {
        const run = runBaselineRun(i, CLASSES[i % CLASSES.length]);
        runs.push(run);
        console.log(`[B0_BASELINE] run=${i} class=${run.characterClass} Lv=${run.playerLevel} ` +
          `survived=${run.survivedSec}s died=${run.died} kills=${run.kills} ` +
          `scrap=+${run.scrapEarned}/-${run.scrapSpent}`);
        // 最終ランのtelemetryスナップショット(scrap流路・DDA並記の生存確認)を1回だけ出す
        if (i === RUNS - 1) {
          console.log('[B0_BASELINE] telemetry(last-run)=', JSON.stringify(getRunTelemetrySnapshot()));
        }
      }
      const levels = runs.map(r => r.playerLevel).sort((a, b) => a - b);
      const median = levels[Math.floor(levels.length / 2)];
      const hist: Record<number, number> = {};
      levels.forEach(lv => { hist[lv] = (hist[lv] ?? 0) + 1; });
      console.log(`[B0_BASELINE] summary: n=${runs.length} minLv=${levels[0]} ` +
        `medianLv=${median} maxLv=${levels[levels.length - 1]} ` +
        `deaths=${runs.filter(r => r.died).length} hist=${JSON.stringify(hist)}`);
    },
    20 * 60 * 1000, // タイムアウト20分(フルplaytest10ラン≈5分実測からの外挿+余裕)
  );
});
