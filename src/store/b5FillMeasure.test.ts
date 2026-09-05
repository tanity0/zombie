// SKILL_BUILD_REDESIGN.md §5-3(B5計測・条件10/11の初回実測): greedyボットの枠充足率。
// b0Baseline.test.ts(基準線①)と同じ流儀=`B5_FILL=1` を付けた明示実行専用(通常のnpm test/CIでは
// 走らない)。実行: B5_FILL=1 npx vitest run src/store/b5FillMeasure.test.ts
//
// ★このファイルはゲーム挙動・数値を一切変更しない(既存コードは無改変・新設はこのファイル1本)。
// 計測ランの持ち込みは「なし」で固定(§9-11・現行 MAX_CARRY_SKILLS=0 のためresetGame既定のまま)。
//
// 「ボス突入時」の枠充足は、既存の runTelemetry.recordBossEntry(§15-1点1)が player.skills の
// スナップショットしか取らない(runBuild専用ではない)ため、このファイル側で bossFightNow の
// false→true 遷移を毎tick監視し、その瞬間の state.runBuild をディープコピーして記録する
// (店側コードは無改変・読むだけ=CLAUDE.md「PixiJSは読むだけ」と同じ規律をテスト計測にも適用)。
// ボス突入が15分以内に一度も起きなければ(§8基準線①の実測Lv10前後は妥当にありうる)、
// その旨をラン単位で記録し、代用としてラン終了時点の runBuild を使う。
import { describe, it, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { createPlaytestRefs, runPlaytestTick } from '../utils/playtestDriver';
import { getRunTelemetrySnapshot } from '../utils/runTelemetry';
import { SKILLS, type SkillRarity } from '../data/campaign';
import type { SkillKey } from '../types/game';

declare const process: { env?: Record<string, string | undefined> } | undefined;

const DT = 1 / 60;
const TICKS = 54000; // 15分相当(60fps換算)=b0Baseline.test.tsと同条件
const RUNS = 15;
const CLASSES = ['warrior', 'mage', 'rogue', 'necromancer'];

interface RarityBreakdown { normal: number; rare: number; super: number }

const emptyBreakdown = (): RarityBreakdown => ({ normal: 0, rare: 0, super: 0 });

const breakdownOf = (skills: readonly SkillKey[]): RarityBreakdown => {
  const b = emptyBreakdown();
  skills.forEach(k => {
    const r: SkillRarity | undefined = SKILLS[k]?.rarity;
    if (r) b[r] += 1;
  });
  return b;
};

interface FillRun {
  seed: number;
  characterClass: string;
  playerLevel: number;
  survivedSec: number;
  died: boolean;
  bossEntryObserved: boolean; // bossFightNowのfalse→true遷移を一度でも観測したか
  atBossEntryRunBuild: SkillKey[] | null; // 観測できていれば突入瞬間のrunBuild(ディープコピー)
  atBossEntryBreakdown: RarityBreakdown | null;
  finalRunBuild: SkillKey[]; // ラン終了時点(ボス突入が観測できない時の代用にも使う)
  finalBreakdown: RarityBreakdown;
  superFilledAtBossEntry: boolean | null; // null=ボス突入未観測
  superFilledAtRunEnd: boolean;
  slotFillTiming: { gameTimeMs: number; level: number }[];
  rerollsUsed: number;
  banishUsed: number;
  telemetryBossEntryCount: number; // 参考: runTelemetry.recordBossEntryが記録した回数(player.skills基準)
}

const runFillMeasure = (seed: number, characterClass: string): FillRun => {
  const realEpoch = Date.now();
  vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['Date'] });
  vi.setSystemTime(realEpoch);
  try {
    useGameStore.getState().resetGame(characterClass);
    const refs = createPlaytestRefs();
    let died = false;
    let prevBossFightNow = useGameStore.getState().bossFightNow;
    let bossEntryObserved = false;
    let atBossEntryRunBuild: SkillKey[] | null = null;

    for (let i = 0; i < TICKS; i++) {
      const before = useGameStore.getState();
      const nextGameTime = before.gameTime + DT * 1000;
      vi.setSystemTime(realEpoch + nextGameTime);
      runPlaytestTick(refs, { persona: 'standard', tickIndex: i, wanderSeed: seed, dt: DT, skill: 'master' });

      const after = useGameStore.getState();
      if (!bossEntryObserved && !prevBossFightNow && after.bossFightNow) {
        bossEntryObserved = true;
        atBossEntryRunBuild = [...after.runBuild];
      }
      prevBossFightNow = after.bossFightNow;

      if (!died && after.player.health <= 0) died = true;
      if (died) break;
    }

    const end = useGameStore.getState();
    const telemetry = getRunTelemetrySnapshot();
    const finalRunBuild = [...end.runBuild];
    const finalBreakdown = breakdownOf(finalRunBuild);
    const atBossEntryBreakdown = atBossEntryRunBuild ? breakdownOf(atBossEntryRunBuild) : null;

    return {
      seed,
      characterClass,
      playerLevel: end.player.level,
      survivedSec: Math.round(end.gameTime / 1000),
      died,
      bossEntryObserved,
      atBossEntryRunBuild,
      atBossEntryBreakdown,
      finalRunBuild,
      finalBreakdown,
      superFilledAtBossEntry: atBossEntryBreakdown ? atBossEntryBreakdown.super >= 1 : null,
      superFilledAtRunEnd: finalBreakdown.super >= 1,
      slotFillTiming: telemetry.slotFillTiming.filledAt,
      rerollsUsed: end.rerollsUsedThisRun,
      banishUsed: end.vanishedSkills.length,
      telemetryBossEntryCount: telemetry.bossEntries.length,
    };
  } finally {
    vi.useRealTimers();
  }
};

describe('B5計測: greedyボットの枠充足率(明示実行専用)', () => {
  it.runIf(typeof process !== 'undefined' && process?.env?.B5_FILL)(
    `greedy(master)ボット ${RUNS}ラン x 15分相当 x 4クラス輪番: ` +
      'ボス突入時(観測できれば)/ラン終了時点のrunBuild充足率とレア度内訳を記録する',
    () => {
      const runs: FillRun[] = [];
      for (let i = 0; i < RUNS; i++) {
        const run = runFillMeasure(i, CLASSES[i % CLASSES.length]);
        runs.push(run);
        console.log(
          `[B5_FILL] run=${run.seed} class=${run.characterClass} Lv=${run.playerLevel} ` +
          `survived=${run.survivedSec}s died=${run.died} bossEntryObserved=${run.bossEntryObserved} ` +
          `telemetryBossEntryCount=${run.telemetryBossEntryCount} ` +
          `atBossEntry=${run.atBossEntryRunBuild ? `${run.atBossEntryRunBuild.length}/6[${run.atBossEntryRunBuild.join(',')}] ` +
            `breakdown=${JSON.stringify(run.atBossEntryBreakdown)} superFilled=${run.superFilledAtBossEntry}` : '-'} ` +
          `finalRunBuild=${run.finalRunBuild.length}/6[${run.finalRunBuild.join(',')}] ` +
          `finalBreakdown=${JSON.stringify(run.finalBreakdown)} superFilledAtRunEnd=${run.superFilledAtRunEnd} ` +
          `slotFillTiming=${JSON.stringify(run.slotFillTiming)} ` +
          `rerollsUsed=${run.rerollsUsed} banishUsed=${run.banishUsed}`
        );
      }

      const observedCount = runs.filter(r => r.bossEntryObserved).length;
      const fillCountsAtBossEntry = runs.filter(r => r.bossEntryObserved).map(r => r.atBossEntryRunBuild!.length);
      const fillCountsAtRunEnd = runs.map(r => r.finalRunBuild.length);
      const avgFillAtBossEntry = fillCountsAtBossEntry.length
        ? Math.round(fillCountsAtBossEntry.reduce((a, b) => a + b, 0) / fillCountsAtBossEntry.length * 100) / 100
        : null;
      const avgFillAtRunEnd = Math.round(fillCountsAtRunEnd.reduce((a, b) => a + b, 0) / fillCountsAtRunEnd.length * 100) / 100;
      const superFillRateAtBossEntry = runs.filter(r => r.bossEntryObserved).length
        ? Math.round(runs.filter(r => r.superFilledAtBossEntry).length / runs.filter(r => r.bossEntryObserved).length * 1000) / 10
        : null;
      const superFillRateAtRunEnd = Math.round(runs.filter(r => r.superFilledAtRunEnd).length / runs.length * 1000) / 10;

      console.log(
        `[B5_FILL] summary: n=${runs.length} bossEntryObservedCount=${observedCount}/${runs.length} ` +
        `avgFillAtBossEntry=${avgFillAtBossEntry ?? '-'}/6 avgFillAtRunEnd=${avgFillAtRunEnd}/6 ` +
        `superFillRateAtBossEntryPct=${superFillRateAtBossEntry ?? '-'} superFillRateAtRunEndPct=${superFillRateAtRunEnd} ` +
        `totalRerolls=${runs.reduce((a, r) => a + r.rerollsUsed, 0)} totalBanish=${runs.reduce((a, r) => a + r.banishUsed, 0)} ` +
        `deaths=${runs.filter(r => r.died).length}`
      );
      if (observedCount === 0) {
        console.log('[B5_FILL] note: 15分x15ランのいずれもボス突入(bossFightNow)を観測できなかった。' +
          '§5-3条件10/11はラン終了時点のrunBuild(finalRunBuild)で代用する。');
      } else if (observedCount < runs.length) {
        console.log(`[B5_FILL] note: ${runs.length - observedCount}/${runs.length}ランでボス突入未観測。` +
          'それらはラン終了時点の値のみ(atBossEntry系はnull)。');
      }
    },
    20 * 60 * 1000,
  );
});
