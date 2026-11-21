// SKILL_BUILD_REDESIGN.md §15-2(B0基準線②): 現行最強2枠ビルド(crit-up+sniper、共存可能な組み合わせ)
// のグレン(stage-7ストーリーボス)TTK。b0Baseline.test.ts(基準線①)と同じ流儀=`B0_TTK=1` を付けた
// 明示実行専用(通常のnpm test/CIでは走らない)。
// 実行: B0_TTK=1 npx vitest run src/store/b0TtkBaseline.test.ts
//
// 計測値=既存bossClock(src/utils/bossClock.ts)の bossClockDurationMs(§12-2#7で定義済み=正)。
//
// ★このファイルはゲーム挙動・数値を一切変更しない(既存コードは無改変・新設はこのファイル1本)。
// 既存のヘッドレス基盤(playtestDriver.ts=b0Baseline.test.ts と同じ土台)を使うが、以下2点だけは
// 「調査で判明した理由」により既存コードの手前でこのファイル側から補っている(bossTest.tsの
// BossTestSkillInjection注入口・v0.25.3229は「装備スキル/Tier/Lvの注入」しか提供しない=
// グレンの出現・湧き制御・形態2遷移はuseGameLoop.ts側の~500行のReact/RAF専用配線に住んでおり、
// そちらはplaytestDriver.ts(M9)が意図的に対象外としている領域):
//
//  1. グレン(giantbat, storyBossVariant='stage-7')の出現・形態2への遷移は、実プレイでは
//     useGameLoop.tsの「storyBoss」ブロック(React hook内・requestAnimationFrame駆動)が担っている。
//     このファイルは同ブロックの「出現」「形態1死亡→形態2予約(glenForm2SpawnAt)→形態2出現」を、
//     既存のエクスポート済み関数(spawnEnemyAt/stageBossHealthFor/store.addEnemy)だけを使って
//     このテストファイル内で再現する(store側の判定=glenForm2SpawnAtのセット・triggerDramaticDeath・
//     bossClock等は本物の既存コードがそのまま動く。再現するのは「読んで再スポーンする」配線だけ)。
//  2. playtestDriver.runPlaytestTick は koma(通常湧きパズル)の puzzleActiveNow を内部で true 固定
//     しており、外から止める口が無い(実プレイのstoryBossOnlyステージはuseGameLoop.ts側で通常湧きを
//     全停止するが、その停止ロジックもReact hook側にある)。このテストは毎tick後に
//     「giantbat以外の敵を除去」して湧いた雑魚を即座に取り除き、クリーンな1対1測定を保つ。
//     (ダメージ計算・クリ/スナイパー倍率・被弾5経路・レベルアップ等は既存コードをそのまま使用=無改変。)
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

// このリポジトリは jsdom を使わず、必要なグローバルだけ最小スタブで用意する作法
// (tutorialArchive.test.ts/playerTraits.test.ts等と同じ・jsdomパッケージ自体が未インストール)。
// ここで要るのは2つだけ: ①localStorage(setSelectedStageIdが読み書きするslot key用)
// ②window.location.search(isBossMakerRun()がBossTestSkillInjectionを読む条件・§12-2#7の注入口)。
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
const MAX_TICKS = 6 * 60 * 60; // 6分相当(60fps換算)/ラン。安全上の打ち切り(タイムアウトより先に効く)。
const RUNS = 5;
const STAGE_ID = 'stage-7';
const SLOT_KEY = bossStyleSlotKey('giantbat', STAGE_ID); // 'giantbat@stage-7'
const CLASS = 'warrior'; // 固定条件(タスク側で class 指定なし。全クラス共通で開始銃+近接を持つ)。

// useGameLoop.ts のローカル定数の写し(export されていないためテスト側で複製・playtestDriver.ts の
// 既存の複製作法=COMBAT_TUNABLES等と同じ流儀)。値を変えたら向こうも合わせること。
const STORY_BOSS_SPAWN_DIST = 380;

interface TtkRun {
  seed: number;
  defeated: boolean;
  playerDied: boolean;
  timedOut: boolean;
  ticksUsed: number;
  sawForm2: boolean;
  form1DurationMs: number | null; // 形態1のbossClockDurationMs(死亡直前の最終値)
  finalDurationMs: number | null; // 最終撃破時点のbossClockDurationMs(定義どおりの正=タスクの計測値)
  finalHealthFrac: number | null; // 未撃破時: 最後に生存していた個体のHP残存率
  finalPhase: 'form1' | 'form2' | null; // 未撃破時: どちらの個体で終わったか
  survivedGameTimeSec: number;
}

const runGlenTtk = (seed: number): TtkRun => {
  const realEpoch = Date.now();
  vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['Date'] });
  vi.setSystemTime(realEpoch);
  try {
    setSelectedStageId(STAGE_ID);
    // storyBoss扱い(§出典: gameStore.ts resetGame の escortRoster 分岐と同じフラグ)。
    // 護衛NPCを出さない(実際のM7と同じ・タスク仕様「ボス1体との純粋な戦い」を保つ)。
    useGameStore.getState().setPendingStoryBoss(true);
    const critMax = skillMaxLevel('crit-up');
    const sniperMax = skillMaxLevel('sniper');
    const injection: BossTestSkillInjection = {
      skills: ['crit-up', 'sniper'] as SkillKey[],
      skillLevels: { 'crit-up': critMax, sniper: sniperMax },
      equipTier: { body: 5, arms: 5, accessory: 5 },
      playerLevel: 10,
    };
    setBossTestSkillInjection(injection);
    useGameStore.getState().resetGame(CLASS);
    setBossTestSkillInjection(null); // 次ランの誤持ち越し防止(resetGameは読み終わっている)

    // 固定条件の検算(想定どおりの状態で開始できているかをその場で確認する)。
    const p0 = useGameStore.getState().player;
    expect(p0.level).toBe(10);
    expect(p0.skills).toContain('crit-up');
    expect(p0.skills).toContain('sniper');
    expect(p0.skillLevels?.['crit-up']).toBe(critMax);
    expect(p0.skillLevels?.['sniper']).toBe(sniperMax);

    // グレン(形態1)を出撃地点近くへ手動スポーン(useGameLoop.ts storyBossブロックの writeup。
    // ヘッダコメント参照)。
    const scx = p0.x + p0.width / 2;
    const scy = p0.y + p0.height / 2 - STORY_BOSS_SPAWN_DIST;
    const gt0 = useGameStore.getState().gameTime;
    const boss = spawnEnemyAt('giantbat', scx, scy, gt0);
    boss.isStoryBoss = true;
    boss.storyBossVariant = 'stage-7';
    boss.glenForm = 1;
    boss.health = boss.maxHealth = stageBossHealthFor(STAGE_ID);
    const ow = boss.width, oh = boss.height;
    boss.width = ow * 2; boss.height = oh * 2; // M7=当たり判定込み2倍(中心維持)
    boss.x -= ow / 2; boss.y -= oh / 2;
    boss.vx = 0; boss.vy = 0;
    boss.aiReadyAt = gt0 + 2000; // 出現直後に即技を撃たないためのゲート(実装と同じ)
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

      // ヘッダコメント2: koma常時湧きの汚染除去。giantbat以外(通常湧き雑魚)を即座に取り除く。
      useGameStore.setState(s => ({ enemies: s.enemies.filter(e => e.type === 'giantbat') }));

      // ヘッダコメント1(attention自動解除): useGameLoop.ts の att.startReal 経過判定の写し。
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

      // ヘッダコメント1(形態2予約消化): useGameLoop.ts の glenForm2SpawnAt 消化ブロックの写し。
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

      // bossClock(既存の唯一の正=bossClockDurationMs)を進める。
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
          // 形態2予約が張られなかった(想定外)。撃破扱いで終了する。
          defeated = true; finalDurationMs = lastKnownDuration; timedOut = false;
          break;
        }
        // else: 形態2予約待ち(継続。次tick以降の予約消化ブロックで形態2が出る)。
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

describe('B0基準線②: crit-up+sniper 2枠ビルドのグレンTTK(明示実行専用)', () => {
  it.runIf(typeof process !== 'undefined' && process?.env?.B0_TTK)(
    `crit-up Lv${skillMaxLevel('crit-up')} + sniper Lv${skillMaxLevel('sniper')} / 装備Tier5 / プレイヤーLv10 / ` +
      `グレン(stage-7) を ${RUNS}ラン: bossClockDurationMsを記録する`,
    () => {
      // ボスメーカーの部屋フラグ(bossmaker=1)。BossTestSkillInjection(bossTest.ts)は
      // isBossMakerRun()===true の時だけ resetGame に読まれる(唯一の注入経路・§12-2#7)。
      installMinimalGlobals('?bossmaker=1');

      const runs: TtkRun[] = [];
      for (let i = 0; i < RUNS; i++) {
        const run = runGlenTtk(i);
        runs.push(run);
        console.log(
          `[B0_TTK] run=${run.seed} defeated=${run.defeated} playerDied=${run.playerDied} ` +
          `timedOut=${run.timedOut} sawForm2=${run.sawForm2} ticks=${run.ticksUsed} ` +
          `survived=${run.survivedGameTimeSec}s form1DurationMs=${run.form1DurationMs ?? '-'} ` +
          `finalDurationMs=${run.finalDurationMs ?? '-'} finalPhase=${run.finalPhase ?? '-'} ` +
          `finalHealthFrac=${run.finalHealthFrac !== null ? run.finalHealthFrac.toFixed(3) : '-'}`
        );
      }

      const defeatedDurations = runs.filter(r => r.defeated && r.finalDurationMs !== null)
        .map(r => r.finalDurationMs as number)
        .sort((a, b) => a - b);
      const avg = defeatedDurations.length
        ? Math.round(defeatedDurations.reduce((a, b) => a + b, 0) / defeatedDurations.length) : null;
      const median = defeatedDurations.length
        ? defeatedDurations[Math.floor(defeatedDurations.length / 2)] : null;
      console.log(
        `[B0_TTK] summary: n=${runs.length} defeatedCount=${defeatedDurations.length} ` +
        `durationsMs=${JSON.stringify(defeatedDurations)} medianMs=${median ?? '-'} avgMs=${avg ?? '-'} ` +
        `condition=crit-up_Lv${skillMaxLevel('crit-up')}+sniper_Lv${skillMaxLevel('sniper')}` +
        `_equipTier5_playerLv10_boss=glen(stage-7)`
      );
    },
    15 * 60 * 1000, // タイムアウト15分(b0Baseline=30ラン20分の外挿より小さいラン数なので余裕あり)
  );
});
