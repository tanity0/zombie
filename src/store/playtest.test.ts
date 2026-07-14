// M9-D: 自動テストプレイ(デバッグボット)の実行形態(PACING_PUZZLE.md §5.10)。
// 通常push(npm test)では短縮版(2ラン・5分相当)を毎回。フル(N=10・15分相当)は
// SIM_FUZZ=1(nightly、または `npm run playtest` のローカル実行)でのみ走る。
// 目的はデバッグ(バランス測定ではない)なので、違反が1件でもあれば即FAIL(assert)。
import { describe, it, expect, vi } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { createPlaytestRefs, runPlaytestTick } from '../utils/playtestDriver';
import { BOT_PERSONAS, decideBotInput, createRusherTrackState, type BotPersona } from '../utils/playtestBot';
import {
  checkNoOnscreenCapRemoval, checkSpawnCadence, checkBoardInvariants, checkRankClamp, checkStateHealth,
} from '../utils/playtestInvariants';
import { OFFSCREEN_RECYCLE_MARGIN, AREA_THRESHOLDS } from '../utils/enemyUtils';
import { CONTEXT_ZOOM_MIN } from '../utils/cameraZoom';
import { KOMA_BASE_MS, KOMA_EXTENSION_MAX_MS, type KomaKind4 } from '../utils/scriptPuzzle';

// Minimal ambient declaration so the SIM_FUZZ env gate typechecks without @types/node
// (同じパターンをsim.test.tsから踏襲)。
declare const process: { env?: Record<string, string | undefined> } | undefined;

const CLASSES = ['warrior', 'mage', 'rogue', 'necromancer'];
const DT = 1 / 60;
const RUNAWAY_ENEMY_CEILING = 500; // sim.test.tsの既存ヘッドレス上限と同じ基準(無限増殖の網)

interface RunReport {
  persona: BotPersona;
  characterClass: string;
  ticks: number;
  survivedMs: number;
  finalRank: number;
  violations: string[];
  // PACING_PUZZLE.md §5.18 M17: 被ダメ経路がヘッドレスに繋がったかの計測(playtestレポート拡張)。
  hpLost: number;               // ラン中の被ダメ合計(治療等の回復分は含めない=減少分のみ加算)
  died: boolean;                // ラン中に health<=0 になった瞬間があったか
  diedAtMs: number | null;      // 死亡時点のgameTime(なければnull)
  deathCause: string | null;    // 死亡時点のlastDamageSource(なければnull)
  // PACING_PUZZLE.md §6.2 M26 Step0(社長指示v0.25.1673「シミュレーション精度向上」): バランス測定の充実。
  kills: number;                // 総キル数(gameStats.enemiesKilled)
  playerLevel: number;          // 終了時のプレイヤーレベル(成長ループ未接続の現状は常に1=Step1のビフォー計測)
  minHp: number;                // ラン中の最低HP(ニアデスの深さ)
  nearDeathCount: number;       // HPが最大値の25%を上から下へ跨いだ回数(ニアデス頻度)
  maxDepthPx: number;           // 原点からの最深到達距離(px)
  areaSec: number[];            // 区域(0..4)ごとの滞在秒数
}

const runOnePlaytest = (persona: BotPersona, characterClass: string, ticks: number, wanderSeed: number): RunReport => {
  // 重要: ノックバック免疫窓・カウンターCD・ヒットストップ・スロー等は Date.now()(実時間)基準
  // (useGameLoop.tsの実プレイでは requestAnimationFrame の timestamp と実時間が常に同期している
  // 前提の設計)。ヘッドレスは54,000tickを数秒の実時間で回すため、フェイクタイマーで
  // Date.now() を仮想の gameTime に同期させないと、これらの実時間ゲート系が全て「詰まったまま」
  // か「即座に開きっぱなし」になり、ボットの近接攻撃(triggerCounter等)がほぼ機能しない
  // (このコメントを書く前の実測で発覚: フェイクタイマー無しだとRank1のまま5分経過していた)。
  const realEpoch = Date.now();
  vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['Date'] });
  vi.setSystemTime(realEpoch);
  try {
    useGameStore.getState().resetGame(characterClass);
    const refs = createPlaytestRefs();
    const violations: string[] = [];
    let prevKomaKind: KomaKind4 | null = null;
    let prevGameTime = useGameStore.getState().gameTime;
    const overscan = 1 / CONTEXT_ZOOM_MIN; // labTheme/indoorは常にfalse(playtestDriver.tsの前提と同じ)
    // PACING_PUZZLE.md §5.18 M17: 被ダメ経路がヘッドレスに繋がったかの計測。
    let hpLost = 0;
    let died = false;
    let diedAtMs: number | null = null;
    let deathCause: string | null = null;
    // §6.2 M26 Step0: バランス計測(最低HP/ニアデス回数/最深距離/区域滞在)。
    let minHp = useGameStore.getState().player.health;
    let nearDeathCount = 0;
    let maxDepthPx = 0;
    const areaSec = [0, 0, 0, 0, 0];
    const zoneIdxOf = (dist: number): number => AREA_THRESHOLDS.filter(th => dist >= th).length; // 0..4

    for (let i = 0; i < ticks; i++) {
      const before = useGameStore.getState();
      const beforeIds = new Set(before.enemies.map(e => e.id));
      const beforePositions = new Map(before.enemies.map(e => [e.id, { x: e.x, y: e.y, width: e.width, height: e.height }]));
      const prevNuisanceAt = refs.koma.puzzleCdRef.current.lastNuisanceSpawnAt;
      const prevSpecialAt = refs.koma.puzzleCdRef.current.lastSpecialSpawnAt;
      const prevHitAt = refs.koma.puzzleHitRef.current.lastHitAt;
      const healthBefore = before.player.health;

      const nextGameTime = before.gameTime + DT * 1000;
      vi.setSystemTime(realEpoch + nextGameTime); // Date.now() を今回tick分のgameTimeへ同期
      runPlaytestTick(refs, { persona, tickIndex: i, wanderSeed, dt: DT });

      const after = useGameStore.getState();
      hpLost += Math.max(0, healthBefore - after.player.health); // 回復分は含めない(減少分のみ加算)
      if (!died && after.player.health <= 0) {
        died = true;
        diedAtMs = after.gameTime;
        deathCause = after.lastDamageSource || null;
      }
      // §6.2 M26 Step0: バランス計測。minHp/ニアデス(最大HPの25%を上→下に跨いだ回数)/最深距離/区域滞在。
      minHp = Math.min(minHp, after.player.health);
      const ndThreshold = after.player.maxHealth * 0.25;
      if (healthBefore >= ndThreshold && after.player.health < ndThreshold) nearDeathCount++;
      const depthNow = Math.hypot(after.player.x + after.player.width / 2, after.player.y + after.player.height / 2);
      maxDepthPx = Math.max(maxDepthPx, depthNow);
      areaSec[zoneIdxOf(depthNow)] += DT;
      const removedIds = [...beforeIds].filter(id => !after.enemies.some(e => e.id === id));
      const gb = after.gameBounds;
      const rect = {
        centerX: after.player.x + after.player.width / 2,
        centerY: after.player.y + after.player.height / 2,
        halfW: (gb.width / 2) * overscan + OFFSCREEN_RECYCLE_MARGIN,
        halfH: (gb.height / 2) * overscan + OFFSCREEN_RECYCLE_MARGIN,
      };
      violations.push(...checkNoOnscreenCapRemoval(removedIds, beforePositions, rect));
      violations.push(...checkSpawnCadence({
        gameTime: after.gameTime, lastHitAt: prevHitAt,
        prevNuisanceSpawnAt: prevNuisanceAt, nextNuisanceSpawnAt: refs.koma.puzzleCdRef.current.lastNuisanceSpawnAt,
        prevSpecialSpawnAt: prevSpecialAt, nextSpecialSpawnAt: refs.koma.puzzleCdRef.current.lastSpecialSpawnAt,
      }));
      const koma = refs.koma.puzzleKomaRef.current;
      violations.push(...checkBoardInvariants(after.enemies, koma, prevKomaKind, KOMA_BASE_MS, KOMA_EXTENSION_MAX_MS, RUNAWAY_ENEMY_CEILING));
      prevKomaKind = koma.kind;
      violations.push(...checkRankClamp(refs.koma.puzzleClockRef.current));
      violations.push(...checkStateHealth(after.player, after.enemies, after.goldBalance, after.gameTime, prevGameTime));
      prevGameTime = after.gameTime;
    }

    const endState = useGameStore.getState();
    return {
      persona, characterClass, ticks,
      survivedMs: endState.gameTime,
      finalRank: refs.koma.puzzleClockRef.current.rank,
      violations,
      hpLost, died, diedAtMs, deathCause,
      kills: endState.gameStats.enemiesKilled,
      playerLevel: endState.player.level,
      minHp, nearDeathCount, maxDepthPx,
      areaSec: areaSec.map(s => Math.round(s)),
    };
  } finally {
    vi.useRealTimers();
  }
};

const printReport = (label: string, reports: RunReport[]): void => {
  console.log(`\n=== playtest report: ${label} ===`);
  for (const r of reports) {
    const status = r.violations.length === 0 ? 'OK' : `FAIL(${r.violations.length})`;
    // PACING_PUZZLE.md §5.18 M17: hpLost/died をコンソール出力にも出す(受け入れ条件のとおり)。
    const deathInfo = r.died ? ` died@${((r.diedAtMs ?? 0) / 1000).toFixed(0)}s(${r.deathCause ?? '?'})` : '';
    // §6.2 M26 Step0: kills/lv/minHp/ニアデス/最深/区域滞在も1行で出す(バランスの読み取り用)。
    console.log(`  [${status}] persona=${r.persona} class=${r.characterClass} survived=${(r.survivedMs / 1000).toFixed(0)}s rank=${r.finalRank} hpLost=${r.hpLost.toFixed(0)}${deathInfo}`);
    console.log(`      kills=${r.kills} lv=${r.playerLevel} minHp=${r.minHp.toFixed(0)} nearDeath=${r.nearDeathCount} depth=${Math.round(r.maxDepthPx)}px areaSec=[${r.areaSec.join('/')}]`);
    for (const v of r.violations.slice(0, 5)) console.log(`      - ${v}`);
  }
};

describe('playtest bot (M9: 自動テストプレイ=デバッグボット)', () => {
  it('short smoke run: 2 runs x ~5min-equivalent, mixed personas (通常push・毎回)', () => {
    const TICKS = 18000; // 5分相当(60fps換算)
    const reports: RunReport[] = [];
    for (let i = 0; i < 2; i++) {
      const persona = BOT_PERSONAS[i % BOT_PERSONAS.length];
      const cls = CLASSES[i % CLASSES.length];
      reports.push(runOnePlaytest(persona, cls, TICKS, i));
    }
    printReport('short (CI)', reports);
    const allViolations = reports.flatMap(r => r.violations);
    expect(allViolations, allViolations.slice(0, 20).join('\n')).toEqual([]);
  });

  // Nightly fuzz (SIM_FUZZ=1) と `npm run playtest`(同じ環境変数)専用のフル版。
  // 通常のnpm testではスキップ(重い=15分相当x10ラン)。
  it.runIf(typeof process !== 'undefined' && process?.env?.SIM_FUZZ)(
    'full run: 10 runs x ~15min-equivalent, all personas x all classes shuffled (nightly/playtest専用)',
    () => {
      const TICKS = 54000; // 15分相当(60fps換算)
      const reports: RunReport[] = [];
      for (let i = 0; i < 10; i++) {
        const persona = BOT_PERSONAS[i % BOT_PERSONAS.length];
        const cls = CLASSES[i % CLASSES.length];
        reports.push(runOnePlaytest(persona, cls, TICKS, i));
      }
      printReport('full (nightly/playtest)', reports);
      const allViolations = reports.flatMap(r => r.violations);
      expect(allViolations, allViolations.slice(0, 20).join('\n')).toEqual([]);
    },
  );
});

describe('M17: 被ダメ経路のヘッドレス化(カナリア回帰・PACING_PUZZLE.md §5.18)', () => {
  it('棒立ちボット(stationary)を深部相当の盤面(未確認汚染エリア)で120秒回すと被ダメ>0になる', () => {
    // 受け入れ条件2: 被ダメ5経路(src/utils/combatTick.ts)がヘッドレスへ正しく繋がっていることの
    // 機械的証明。M9導入当初、ボットは構造的にダメージを受けられなかった(v0.25.1501で発覚)。
    const realEpoch = Date.now();
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['Date'] });
    vi.setSystemTime(realEpoch);
    try {
      useGameStore.getState().resetGame('warrior');
      const refs = createPlaytestRefs();
      // プレイヤーを未確認汚染エリア相当(area index3・5000-7500px。AREA_BASE_DIFFICULTY=1.75)へ
      // 配置し、密着する敵を複数体スポーン(area基準の強さスケーリングが乗った状態で
      // 接触ダメージが発生することを確認=「深部相当の盤面」の再現)。
      const deepX = 6000, deepY = 0;
      const tStart = useGameStore.getState().gameTime;
      useGameStore.setState(state => ({ player: { ...state.player, x: deepX, y: deepY } }));
      const deepEnemies = [
        spawnEnemyAt('zombie', deepX + 30, deepY, tStart),
        spawnEnemyAt('zombie', deepX - 30, deepY, tStart),
        spawnEnemyAt('skeleton', deepX, deepY + 30, tStart),
      ];
      useGameStore.setState({ enemies: deepEnemies });

      const TICKS = 120 * 60; // 120秒相当(60fps換算)
      const dt = 1 / 60;
      let hpLost = 0;
      for (let i = 0; i < TICKS; i++) {
        const before = useGameStore.getState();
        const healthBefore = before.player.health;
        const nextGameTime = before.gameTime + dt * 1000;
        vi.setSystemTime(realEpoch + nextGameTime); // Date.now() を今回tick分のgameTimeへ同期
        runPlaytestTick(refs, { persona: 'stationary', tickIndex: i, wanderSeed: 0, dt });
        hpLost += Math.max(0, healthBefore - useGameStore.getState().player.health);
      }
      expect(hpLost).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('M16: pumpkin jump-cap escape scenario (回帰・PACING_PUZZLE.md §5.16)', () => {
  it('cap有効時、8秒交戦→60秒逃走(引き撃ちボット)で1500px以上離れられる(設計チャットのボット実測シナリオの回帰版)', () => {
    // 固定方向へ直進する素朴な「逃走」は、追いつかれる度にジャンプ着地の吹き飛ばしで
    // 進行方向以外へ流されて偶発的に閾値を割ることがあった(単発試行のflaky化)。
    // playtestBot.tsのkiterペルソナ(最寄り敵から常に離れる)へ差し替え、設計チャットの
    // ボット実測(実際に敵から距離を取り続ける逃走ロジック)に近い挙動で安定させる。
    useGameStore.getState().resetGame('warrior');
    const dt = 1 / 60;
    let t = useGameStore.getState().gameTime;
    const start = useGameStore.getState().player;
    const startX = start.x, startY = start.y;
    // パンプキンを密着圏内に配置(=交戦シナリオ。溜め→ジャンプの発動条件を満たす)。
    const pumpkin = spawnEnemyAt('pumpkin', startX + 40, startY, t);
    useGameStore.setState({ enemies: [pumpkin] });

    const STILL = { up: false, down: false, left: false, right: false };
    const stepStill = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        t += dt * 1000;
        useGameStore.getState().setGameTime(t);
        useGameStore.getState().movePlayer(STILL, dt);
        useGameStore.getState().updateEnemies(dt);
      }
    };
    const stepKiting = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        t += dt * 1000;
        useGameStore.getState().setGameTime(t);
        const s = useGameStore.getState();
        const decision = decideBotInput('kiter', s.player, s.enemies, t, i, 0);
        useGameStore.getState().movePlayer(decision.input, dt);
        useGameStore.getState().updateEnemies(dt);
      }
    };

    stepStill(8 * 60);   // 8秒交戦(その場で向き合う=溜め→ジャンプが発動する)
    stepKiting(60 * 60); // 60秒逃走(最寄り敵=パンプキンから常に離れる)

    const player = useGameStore.getState().player;
    const dist = Math.hypot(player.x - startX, player.y - startY);
    expect(dist).toBeGreaterThanOrEqual(1500);
  });
});

describe('M19: rusherペルソナ+深層ラッシュ・シナリオ(試験の穴塞ぎ・PACING_PUZZLE.md §5.20)', () => {
  it('rusher×Lv1初期装備を最大6分回すと深層域(r>=7500)へ到達する(境界到達/HP/死因を記録)', () => {
    // 受け入れ条件②: v0.25.1510実機動画(Lv1で約79秒→深層到達→包囲死)を再現できることの機械的証明。
    // 芯は「詰まらず深層域まで歩けるか」だけ(木/壁で足止めされ続ける事故の検知)。バランス値
    // (HP残量・死亡有無)は記録専用で固定しない(将来の守護者ゲート/深さ床で変わる想定・§5.20)。
    const realEpoch = Date.now();
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['Date'] });
    vi.setSystemTime(realEpoch);
    try {
      useGameStore.getState().resetGame('warrior');
      const refs = createPlaytestRefs();
      const rusherState = createRusherTrackState();
      const dt = 1 / 60;
      const MAX_TICKS = 6 * 60 * 60; // 6分相当(60fps換算)

      const boundaries = [...AREA_THRESHOLDS]; // [1500, 3000, 5000, 7500]
      const boundaryHits: { r: number; atMs: number; hpAtHit: number }[] = [];
      let died = false;
      let diedAtMs: number | null = null;
      let deathCause: string | null = null;
      let maxRadius = 0;
      let finalTick = 0;

      for (let i = 0; i < MAX_TICKS; i++) {
        finalTick = i;
        const before = useGameStore.getState();
        const nextGameTime = before.gameTime + dt * 1000;
        vi.setSystemTime(realEpoch + nextGameTime); // Date.now() を今回tick分のgameTimeへ同期
        runPlaytestTick(refs, { persona: 'rusher', tickIndex: i, wanderSeed: 0, dt, rusherState });

        const after = useGameStore.getState();
        const pcx = after.player.x + after.player.width / 2;
        const pcy = after.player.y + after.player.height / 2;
        const radius = Math.hypot(pcx, pcy);
        if (radius > maxRadius) maxRadius = radius;

        while (boundaries.length > 0 && radius >= boundaries[0]) {
          const r = boundaries.shift()!;
          boundaryHits.push({ r, atMs: after.gameTime, hpAtHit: after.player.health });
        }
        if (!died && after.player.health <= 0) {
          died = true;
          diedAtMs = after.gameTime;
          deathCause = after.lastDamageSource || null;
          break; // 死亡したらそこで打ち切り(以降は無意味な放置tickを回さない)
        }
      }

      console.log(`\n=== M19 深層ラッシュ・シナリオ ===`);
      console.log(`  境界到達: ${boundaryHits.map(b => `r${b.r}@${(b.atMs / 1000).toFixed(0)}s(hp=${b.hpAtHit.toFixed(0)})`).join(' / ') || '(なし)'}`);
      console.log(`  最終深度=${maxRadius.toFixed(0)}px  経過tick=${finalTick}(${(finalTick / 60).toFixed(0)}s)`);
      console.log(`  死亡=${died}${died ? ` @${((diedAtMs ?? 0) / 1000).toFixed(0)}s 死因=${deathCause ?? '?'}` : ''}`);

      // 芯(受け入れ条件②): rusherが深層域(r>=7500)へ到達できること。
      expect(maxRadius).toBeGreaterThanOrEqual(7500);
    } finally {
      vi.useRealTimers();
    }
  });
});
