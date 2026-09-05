// SKILL_BUILD_REDESIGN.md §21-1点3 / §5-2(B5計測): 想定最強6枠ビルド(§15-3で選定・固定)の
// グレン(stage-7ストーリーボス)TTK。b0TtkBaseline.test.ts(基準線②)と全く同じ流儀・同じ固定条件を
// 使い、注入スキルだけ主案/副案の6枠へ差し替える。`B5_TTK=1` を付けた明示実行専用
// (通常のnpm test/CIでは走らない)。
// 実行: B5_TTK=1 npx vitest run src/store/b5TtkMeasure.test.ts
//
// 指標=SKILL_BUILD_REDESIGN.md §15-6の訂正どおり「ボス出現→完全撃破の総経過時間」
// (bossClockDurationMsは交戦ヒステリシスでブレるため参考記録のみ)。
// 判定: 基準線②の中央値128秒に対し−25%ライン=96秒を下回るか(=速すぎ=予算超過)。
//
// ★このファイルはゲーム挙動・数値を一切変更しない(既存コードは無改変・新設はこのファイル1本)。
// b0TtkBaseline.test.ts のヘッダコメント(useGameLoop.tsのstoryBossブロック再現・koma常時湧きの
// 汚染除去)をそのまま踏襲する。詳細はそちらのコメントを参照。
import { describe, it, vi, expect } from 'vitest';
import {
  useGameStore, ATTENTION_IN_MS, ATTENTION_HOLD_MS, ATTENTION_OUT_MS,
} from './gameStore';
import { createPlaytestRefs, runPlaytestTick } from '../utils/playtestDriver';
import { runGhostAndTraitsStep, type GhostAndTraitsRefs } from '../utils/directorTick';
import { bossClockDurationMs } from '../utils/bossClock';
import { setBossTestSkillInjection, type BossTestSkillInjection } from '../utils/bossTest';
import { setSelectedStageId } from '../data/progress';
import { stageBossHealthFor } from '../config/bossHealth';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { skillMaxLevel } from '../data/campaign';
import { bossStyleSlotKey } from '../utils/ghostSlot';
import type { SkillKey } from '../types/game';

declare const process: { env?: Record<string, string | undefined> } | undefined;

// このリポジトリは jsdom を使わず、必要なグローバルだけ最小スタブで用意する作法(b0TtkBaseline.test.tsと同じ)。
const installMinimalGlobals = (search: string): void => {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
  (globalThis as unknown as { window: { location: { search: string } } }).window = {
    location: { search },
  };
};

const DT = 1 / 60;
const MAX_TICKS = 6 * 60 * 60; // 6分相当(60fps換算)/ラン。安全上の打ち切り(b0TtkBaseline.test.tsと同じ)。
const RUNS = 5;
const STAGE_ID = 'stage-7';
const SLOT_KEY = bossStyleSlotKey('giantbat', STAGE_ID); // 'giantbat@stage-7'
const CLASS = 'warrior'; // 基準線②と同一条件(タスク側で class 指定なし)。

// useGameLoop.ts のローカル定数の写し(b0TtkBaseline.test.tsと同じ)。
const STORY_BOSS_SPAWN_DIST = 380;

// SKILL_BUILD_REDESIGN.md §15-3: 想定最強6枠ビルド(主案/副案)。全てLv3。
interface BuildConfig {
  label: string;
  skills: SkillKey[];
}
const BUILD_CONFIGS: BuildConfig[] = [
  {
    label: '主案(超=crit-up)',
    skills: ['crit-up', 'exploder', 'fire-shooter', 'sharpshooter', 'ricochet', 'punisher'],
  },
  {
    label: '副案(超=sniper)',
    skills: ['sniper', 'exploder', 'fire-shooter', 'sharpshooter', 'ricochet', 'punisher'],
  },
];

interface TtkRun {
  seed: number;
  defeated: boolean;
  playerDied: boolean;
  timedOut: boolean;
  ticksUsed: number;
  sawForm2: boolean;
  form1DurationMs: number | null;
  finalDurationMs: number | null;
  finalHealthFrac: number | null;
  finalPhase: 'form1' | 'form2' | null;
  survivedGameTimeSec: number;
}

const runGlenTtk = (seed: number, build: BuildConfig): TtkRun => {
  const realEpoch = Date.now();
  vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['Date'] });
  vi.setSystemTime(realEpoch);
  try {
    setSelectedStageId(STAGE_ID);
    useGameStore.getState().setPendingStoryBoss(true);
    const skillLevels: Partial<Record<SkillKey, number>> = {};
    build.skills.forEach(k => { skillLevels[k] = skillMaxLevel(k); });
    const injection: BossTestSkillInjection = {
      skills: [...build.skills],
      skillLevels,
      equipTier: { body: 5, arms: 5, accessory: 5 },
      playerLevel: 10,
    };
    setBossTestSkillInjection(injection);
    useGameStore.getState().resetGame(CLASS);
    setBossTestSkillInjection(null); // 次ランの誤持ち越し防止

    // 固定条件の検算(注入した6スキル全てが反映されているか。入らなければここで落ちる=報告対象)。
    const p0 = useGameStore.getState().player;
    expect(p0.level).toBe(10);
    build.skills.forEach(k => {
      expect(p0.skills).toContain(k);
      expect(p0.skillLevels?.[k]).toBe(skillMaxLevel(k));
    });

    const scx = p0.x + p0.width / 2;
    const scy = p0.y + p0.height / 2 - STORY_BOSS_SPAWN_DIST;
    const gt0 = useGameStore.getState().gameTime;
    const boss = spawnEnemyAt('giantbat', scx, scy, gt0);
    boss.isStoryBoss = true;
    boss.storyBossVariant = 'stage-7';
    boss.glenForm = 1;
    boss.health = boss.maxHealth = stageBossHealthFor(STAGE_ID);
    const ow = boss.width, oh = boss.height;
    boss.width = ow * 2; boss.height = oh * 2;
    boss.x -= ow / 2; boss.y -= oh / 2;
    boss.vx = 0; boss.vy = 0;
    boss.aiReadyAt = gt0 + 2000;
    useGameStore.getState().addEnemy(boss);

    const refs = createPlaytestRefs();
    const ghostRefs: GhostAndTraitsRefs = { ghostProfileRef: { current: null } };

    let phase: 'form1' | 'form2' = 'form1';
    let sawForm2 = false;
    let lastKnownDuration: number | null = null;
    let form1DurationMs: number | null = null;
    let finalDurationMs: number | null = null;
    let defeated = false;
    let playerDied = false;
    let timedOut = true;
    let ticksUsed = 0;
    let finalHealthFrac: number | null = null;
    let finalPhase: 'form1' | 'form2' | null = null;

    for (let i = 0; i < MAX_TICKS; i++) {
      ticksUsed = i + 1;
      const before = useGameStore.getState();
      const nextGameTime = before.gameTime + DT * 1000;
      vi.setSystemTime(realEpoch + nextGameTime);

      runPlaytestTick(refs, {
        persona: 'standard', tickIndex: i, wanderSeed: seed, dt: DT, skill: 'master', events: false,
      });

      useGameStore.setState(s => ({ enemies: s.enemies.filter(e => e.type === 'giantbat') }));

      {
        const att = useGameStore.getState().attention;
        if (att) {
          const el = Date.now() - att.startReal;
          const cutinMs = att.cutinMs ?? 0;
          const attHoldMs = att.holdMs ?? ATTENTION_HOLD_MS;
          if (el >= ATTENTION_IN_MS + attHoldMs + ATTENTION_OUT_MS + cutinMs) {
            useGameStore.getState().clearAttention();
          }
        }
      }

      {
        const pend = useGameStore.getState().glenForm2SpawnAt;
        if (pend && Date.now() >= pend.at && !useGameStore.getState().attention
            && useGameStore.getState().player.health > 0 && !useGameStore.getState().gameWon) {
          useGameStore.setState({ glenForm2SpawnAt: null });
          const gt = useGameStore.getState().gameTime;
          const e2 = spawnEnemyAt('giantbat', pend.x, pend.y, gt);
          e2.isStoryBoss = true;
          e2.storyBossVariant = 'stage-7';
          e2.glenForm = 2;
          e2.health = e2.maxHealth = stageBossHealthFor(STAGE_ID);
          const ow2 = e2.width, oh2 = e2.height;
          e2.width = ow2 * 2; e2.height = oh2 * 2;
          e2.x = pend.x - e2.width / 2; e2.y = pend.y - e2.height / 2;
          e2.vx = 0; e2.vy = 0;
          e2.aiReadyAt = gt + 2000;
          e2.glenVolleyAt = gt;
          useGameStore.getState().addEnemy(e2);
          phase = 'form2';
          sawForm2 = true;
        }
      }

      {
        const st = useGameStore.getState();
        runGhostAndTraitsStep(ghostRefs, { gameTime: st.gameTime, player: st.player, ghostDebugEnabled: false });
      }

      const stNow = useGameStore.getState();
      const hasGiant = stNow.enemies.some(e => e.type === 'giantbat');
      const curDur = bossClockDurationMs(SLOT_KEY);
      if (curDur !== null) lastKnownDuration = curDur;

      if (phase === 'form1' && !hasGiant) {
        form1DurationMs = lastKnownDuration;
        if (!stNow.glenForm2SpawnAt) {
          defeated = true; finalDurationMs = lastKnownDuration; timedOut = false;
          break;
        }
      } else if (phase === 'form2' && !hasGiant) {
        finalDurationMs = lastKnownDuration;
        defeated = true;
        timedOut = false;
        break;
      }

      if (stNow.player.health <= 0) {
        playerDied = true; timedOut = false;
        const alive = stNow.enemies.find(e => e.type === 'giantbat');
        finalHealthFrac = alive ? alive.health / alive.maxHealth : 0;
        finalPhase = alive?.glenForm === 2 ? 'form2' : (phase === 'form2' ? 'form2' : 'form1');
        break;
      }
    }

    if (timedOut) {
      const stEnd = useGameStore.getState();
      const alive = stEnd.enemies.find(e => e.type === 'giantbat');
      finalHealthFrac = alive ? alive.health / alive.maxHealth : null;
      finalPhase = alive?.glenForm === 2 ? 'form2' : phase;
    }

    return {
      seed,
      defeated,
      playerDied,
      timedOut,
      ticksUsed,
      sawForm2,
      form1DurationMs,
      finalDurationMs,
      finalHealthFrac,
      finalPhase,
      survivedGameTimeSec: Math.round(useGameStore.getState().gameTime / 1000),
    };
  } finally {
    vi.useRealTimers();
  }
};

// 基準線②(b0TtkBaseline.test.ts)の中央値128秒に対する判定ライン(§5-2「−25%以内」)。
const BASELINE_MEDIAN_SEC = 128;
const BUDGET_FLOOR_SEC = BASELINE_MEDIAN_SEC * 0.75; // 96秒

describe('B5計測: 想定最強6枠ビルドのグレンTTK(明示実行専用)', () => {
  BUILD_CONFIGS.forEach(build => {
    it.runIf(typeof process !== 'undefined' && process?.env?.B5_TTK)(
      `${build.label}: ${build.skills.join('+')}(全Lv3) / 装備Tier5 / プレイヤーLv10 / ` +
        `グレン(stage-7) を ${RUNS}ラン: 総経過時間(出現→完全撃破)を記録する`,
      () => {
        // ボスメーカーの部屋フラグ(bossmaker=1)。BossTestSkillInjection(bossTest.ts)は
        // isBossMakerRun()===true の時だけ resetGame に読まれる。
        installMinimalGlobals('?bossmaker=1');

        const runs: TtkRun[] = [];
        for (let i = 0; i < RUNS; i++) {
          const run = runGlenTtk(i, build);
          runs.push(run);
          console.log(
            `[B5_TTK] build=${build.label} run=${run.seed} defeated=${run.defeated} ` +
            `playerDied=${run.playerDied} timedOut=${run.timedOut} sawForm2=${run.sawForm2} ` +
            `ticks=${run.ticksUsed} survived=${run.survivedGameTimeSec}s ` +
            `form1DurationMs=${run.form1DurationMs ?? '-'} finalDurationMs(参考)=${run.finalDurationMs ?? '-'} ` +
            `finalPhase=${run.finalPhase ?? '-'} finalHealthFrac=${run.finalHealthFrac !== null ? run.finalHealthFrac.toFixed(3) : '-'}`
          );
        }

        // 指標=§15-6訂正どおり「総経過時間(出現→完全撃破)」= survivedGameTimeSec(撃破ランのみ)。
        const totalElapsedSec = runs.filter(r => r.defeated).map(r => r.survivedGameTimeSec).sort((a, b) => a - b);
        const avg = totalElapsedSec.length
          ? Math.round(totalElapsedSec.reduce((a, b) => a + b, 0) / totalElapsedSec.length * 10) / 10 : null;
        const median = totalElapsedSec.length
          ? totalElapsedSec[Math.floor(totalElapsedSec.length / 2)] : null;
        const overBudget = median !== null && median < BUDGET_FLOOR_SEC;
        console.log(
          `[B5_TTK] summary build=${build.label}: n=${runs.length} defeatedCount=${totalElapsedSec.length} ` +
          `totalElapsedSecList=${JSON.stringify(totalElapsedSec)} medianSec=${median ?? '-'} avgSec=${avg ?? '-'} ` +
          `baselineMedianSec=${BASELINE_MEDIAN_SEC} budgetFloorSec=${BUDGET_FLOOR_SEC} ` +
          `overBudget(=速すぎ=予算超過)=${overBudget} ` +
          `condition=${build.skills.join('+')}_allLv3_equipTier5_playerLv10_boss=glen(stage-7)`
        );
      },
      15 * 60 * 1000,
    );
  });
});
