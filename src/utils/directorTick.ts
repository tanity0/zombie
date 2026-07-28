// ディレクター配線(盤面維持・コマ進行・査定消費・画面外リサイクル/カリング・AIディレクター信号)を
// src/hooks/useGameLoop.ts から移設したもの。
//
// これは「移設」であり「再設計」ではない(CLAUDE.md 仕様変更のルール)。各関数の中身は元の
// useGameLoop.ts の該当ブロックの式・分岐・呼び出し順序を変えていない。クロージャ経由で読んでいた
// 値を明示的な引数(ctx)に、直接 mutate していた useRef の .current を明示的な ref 引数
// (refs.xxxRef.current)に置き換えただけ。数値・しきい値・分岐条件は一切変更していない。
//
// レンダラーに依存しない(PixiJSをimportしない)。store(useGameStore)・audioManager(playSfx)への
// 呼び出しは、他の src/utils/*.ts (例: inputActions.ts, weaponUtils.ts)と同じ既存パターンに倣う。

import { useGameStore, ENEMY_REMOVE_CAUSE, WALL_ENABLED } from '../store/gameStore';
import { placeLabSpawn } from './labSpawn';
import { OFFSCREEN_SPAWN_MARGIN } from './enemyUtils';
import { LAB_CORRIDOR_Y_LIMIT_PX } from '../world/labWalls';
import {
  isFirstRankReach, markRankReached, markSelfHighestRank, WALL_RANK_NAMES, WALL_RANK_NAMES_EN,
} from './wallProgress';
import type { ActiveEvent, Enemy, EnemyType, GameBounds, Player } from '../types/game';
import {
  generateEnemy,
  getEnemyFireProfile,
  isBossType,
  isHiddenBoss,
  isValidForArea,
  selectLabEnemyType,
  OFFSCREEN_RECYCLE_MARGIN,
} from './enemyUtils';
import { selectCullCandidates } from './enemyCulling';
import { enemyCountCap, ENEMY_COUNT_CEIL, type PhaseKind } from './difficultyDirector';
import { stepDirector, type DirectorState } from './aiDirector';
import { setDirectorDebug, recordDirectorSample, DIRECTOR_EVENT_BIT } from './aiDirectorDebug';
import { stepPinch, pityLevel, pityDropTuning, type PinchState } from './pityDirector';
import { setPityDrop } from './pityState';
import { PITY_EVENT_BLOCK_TAIL_MS } from './eventProducer';
import { CONTEXT_ZOOM_MIN } from './cameraZoom';
import { getSelectedStageId, recordChronicle } from '../data/progress';
import { recordKoma, isKomaLogEnabled, komaLogRunRef, tickKomaLive } from './komaLog';
import {
  capForState,
  assessKomaDelta, applyRankDelta, combineCycleDelta,
  createKomaAccumulator, stepKomaAccumulator, finalizeKomaAssessmentInput,
  stepSoften, SOFTEN_TARGET_MULT, SOFTEN_TARGET_MIN,
  TIGHTEN_NO_HIT_MS, TIGHTEN_PERF_MIN, TIGHTEN_STARVE_MS,
  tickRankPace,
  type PuzzleClockState, type KomaAccumulatorState, type SoftenState, type RankDelta,
  type KomaAssessmentInput, type RankPaceState, type PuzzleRank,
} from './rankAssessor';
import {
  nuisanceTarget, decideNextSpawn, noNewSupplyNuisanceTarget,
  ZERO_NUISANCE, NUISANCE_TYPES,
  nextKomaKind, KOMA_BASE_MS, KOMA_EXTENSION_MAX_MS,
  chaffWeightsForKoma, chaffTargetForKoma, rampIntervalForKoma, cdForKoma, stepChaffRamp,
  isScriptCleared, selectRotationPattern, allPatternsSeen,
  type FormationPattern, type NuisanceCounts, type SpecialType, type KomaKind4, type ChaffRampState,
} from './scriptPuzzle';
import { setPuzzleDebug, getPuzzleDebug } from './puzzleState';
import { playSfx } from '../audio/audioManager';
import {
  NAMED_HP_MULT, NAMED_DMG_MULT, NAMED_SIZE_MULT, NAMED_SPAWN_CD_MS, NAMED_POST_HIT_GUARD_MS, normalizeNamedName,
} from './namedEnemy';

// useRef() が返す MutableRefObject<T> と構造的に同じ({ current: T })。React をimportしないための
// 最小定義(renderer/React-agnosticの規約)。呼び出し側(useGameLoop.ts)の useRef(...) をそのまま渡せる。
export type Ref<T> = { current: T };

// --- 以下、useGameLoop.ts のモジュールスコープ定数のうち、ここへ移した処理だけが使っていたもの。
// 値は元のまま(重複定義。元ファイル側の宣言はこの移設に伴い削除済み)。
const PUZZLE_MANAGED_TYPES = new Set<EnemyType>(['bat', 'skeleton', 'zombie', 'plant', 'werewolf', 'pumpkin', 'screamer', 'ghost']);
const DIRECTOR_NEAR_RADIUS = 240;         // Intensity の"近接敵"を数える半径(接触危険レンジ相当)
const DIRECTOR_EGG_DANGER_RADIUS = 180;   // 抱卵型(ghost)が撒いた毒卵の"密度"を見る、プレイヤー中心の半径
const DIRECTOR_EGG_DANGER_FULL = 3;       // この個数(近くに)でdanger最大(=1バーストぶんが足元に集まっている状態)
const WAVE_GRACE_MS = 10000;
const LAB_RETURN_HOME_MARGIN = 140;
const EVENT_BANNER_MS = 3500;             // イベント発生告知バナーの表示時間(gameTime ms)。useGameLoop.ts と同じ値。

// ============================================================================
// Cap/target math (dirCountCap / enemyCap / normalSpawnCap)
// ============================================================================

export function computeDirCountCap(
  gameTime: number,
  labTheme: boolean,
  indoor: boolean,
  maxEnemies: number,
  rankAdj: { countCapBonus: number },
  upswingBonus: number,
  pressureCapBonus: number,
): number {
  return (labTheme || indoor)
    ? maxEnemies
    : Math.min(ENEMY_COUNT_CEIL, enemyCountCap(gameTime) + rankAdj.countCapBonus + upswingBonus + pressureCapBonus);
}

export function computeEnemyCap(
  confining: boolean,
  arenaEventCap: number,
  ae: ActiveEvent | null,
  dirCountCap: number,
  rescueAttackers: number,
  puzzleActiveNow: boolean,
  puzzleClock: PuzzleClockState,
): number {
  return confining ? arenaEventCap
    : (ae ? dirCountCap + rescueAttackers
    : (puzzleActiveNow ? capForState(puzzleClock) : dirCountCap));
}

export function computeNormalSpawnCap(
  labTheme: boolean,
  maxEnemies: number,
  dirCountCap: number,
  relaxAdjCapMult: number,
): number {
  return labTheme ? maxEnemies : Math.max(6, Math.round(dirCountCap * relaxAdjCapMult));
}

// 社長指示v0.25.1845: 「変異体が興奮し始めた」通信の判定開始(コマ経過ms)。序盤の誤発火防止(叩き台)。
const EXCITED_COMM_MIN_KOMA_MS = 15000;

// PACING_PUZZLE.md §6.27 バッチM50: 連続査定(「捌けているか」一本化)。既定ON。
// 復帰フラグ ?rank2=0 で旧来のコマ境界(離散)査定へ戻す(cameraZoom.tsのZOOM_LOCK等と同じ作法)。
const RANK2_ENABLED = typeof window === 'undefined'
  ? true
  : new URLSearchParams(window.location.search).get('rank2') !== '0';

// PACING_PUZZLE.md §5.17 M14: ランクの壁演出(銘打ちバナー+SE+年表記録/降格は静かに)。
// 旧経路(コマ境界の確定査定)・新経路(M50連続査定)の両方から呼ぶ共通処理として抽出したもの
// (中身は元のコマ切替ブロックのまま=挙動不変・移設のみ)。
function announceRankChange(prevRank: PuzzleRank, newRank: PuzzleRank): void {
  if (!WALL_ENABLED) return;
  if (newRank > prevRank) {
    useGameStore.setState(state => ({
      gameStats: { ...state.gameStats, maxRankReached: Math.max(state.gameStats.maxRankReached, newRank) },
    }));
    const st = useGameStore.getState();
    if (isFirstRankReach(st.wallMeta, newRank)) {
      const nextMeta = markSelfHighestRank(markRankReached(st.wallMeta, newRank), newRank);
      useGameStore.setState({ wallMeta: nextMeta });
    }
    useGameStore.getState().enqueueWallEvent(
      'rank', `${WALL_RANK_NAMES[newRank]} —— 到達`, WALL_RANK_NAMES_EN[newRank], '#ff6a55'
    );
    playSfx('level-up'); // 専用ジングル無し=既存SEの流用(演出仕様v0.25.1499)
    recordChronicle(getSelectedStageId(), 'rank', String(newRank), `ランク「${WALL_RANK_NAMES[newRank]}」に到達`);
  } else if (newRank < prevRank) {
    useGameStore.getState().enqueueWallEvent(
      'rank', `${WALL_RANK_NAMES[newRank]} —— 降格`, WALL_RANK_NAMES_EN[newRank], '#9ca3af'
    );
  }
}

// ============================================================================
// 難易度⑥(ピンチ救済) upkeep
// ============================================================================

export interface PityUpkeepRefs {
  pinchRef: Ref<PinchState>;
  pityEventBlockUntilRef: Ref<number>;
}

export interface PityUpkeepCtx {
  pityEnabled: boolean;
  player: Player;
  enemyCap: number;
  deltaTime: number;
  gameTime: number;
}

export function runPityUpkeep(refs: PityUpkeepRefs, ctx: PityUpkeepCtx): void {
  if (!ctx.pityEnabled) return;
  const { player, enemyCap, deltaTime, gameTime } = ctx;
  refs.pinchRef.current = stepPinch(refs.pinchRef.current, {
    hpFrac: player.maxHealth > 0 ? player.health / player.maxHealth : 0,
    enemyCount: useGameStore.getState().enemies.length,
    enemyCap, // 本方式ON時はpuzzleの実効上限(dirCountCapのままだと過大なピンチ誤検知)。
    dtMs: deltaTime * 1000,
  });
  const lvl = pityLevel(refs.pinchRef.current.pinchMs);
  setPityDrop(pityDropTuning(lvl), lvl);
  // バッチ7(憲法第5条): ピンチ救済発動中は猶予を更新し続ける→非発動になった瞬間から
  // PITY_EVENT_BLOCK_TAIL_MS(10秒)だけそのまま残る(=解除後10秒はイベント発火禁止)。
  if (lvl > 0) refs.pityEventBlockUntilRef.current = gameTime + PITY_EVENT_BLOCK_TAIL_MS;
}

// ============================================================================
// PACING_PUZZLE.md バッチM4〜M6: コマ(4コマサイクル)進行・査定・decideNextSpawn 消費
// ============================================================================

export interface KomaState {
  kind: KomaKind4;
  elapsedMs: number;
  script: FormationPattern | null;
  scriptSpawned: NuisanceCounts;
  seenIds: Set<string>;
  lastPatternId: string | null;
  acc: KomaAccumulatorState;
  provisionalDelta: RankDelta | null;
  pendingFinalDelta: RankDelta | null;
  chaffRamp: ChaffRampState;
  belowTargetMs: number;
  // 社長指示v0.25.1845: 「変異体が興奮し始めた」通信をこのコマで出したか(査定コマごとに1回)。
  excitedThisKoma: boolean;
}

export interface KomaMaintenanceRefs {
  puzzleKomaRef: Ref<KomaState>;
  puzzleHitRef: Ref<{ prevHp: number; lastHitAt: number }>;
  puzzleClockRef: Ref<PuzzleClockState>;
  puzzleCdRef: Ref<{ lastBaseSpawnAt: number; lastNuisanceSpawnAt: number; lastSpecialSpawnAt: number }>;
  puzzleSoftenRef: Ref<SoftenState>;
  directorRef: Ref<{ state: DirectorState }>;
  // §5.14 M13: 宿敵(ネームド)投入の独立CD(他の枠と競合しないよう専用)。
  namedFoeRef: Ref<{ lastAttemptAt: number }>;
  // PACING_PUZZLE.md §6.27 バッチM50: 連続査定(窓/被弾ストリーク)+撃破数フレーム差分用の前回値。
  rankPaceRef: Ref<{ state: RankPaceState; prevKills: number }>;
}

export interface KomaMaintenanceCtx {
  puzzleActiveNow: boolean;
  gameTime: number;
  deltaTime: number;
  player: Player;
  playerAreaIdx: number;
  spawnBounds: GameBounds;
  spawnViewOffsetY: number;
  snowTheme: boolean;
  spawnEsc: number;
}

// PACING_PUZZLE.md バッチM4: 盤面構成パズル方式の配線。§2の停止/継続リストどおり、
// 通常湧きスポナー(旧経路。useGameLoop.ts に残置)の代わりにここが型選択と上限を供給する。
// ボス中(puzzleActiveNow=false)は何もしない=リフを一切触らない(査定・コマ進行を一時停止し、
// ボス後に続きから再開する。§2「ボス中は査定・台本を停止、ボス後再開」)。
export function runKomaBoardMaintenance(refs: KomaMaintenanceRefs, ctx: KomaMaintenanceCtx): void {
  if (!ctx.puzzleActiveNow) {
    setPuzzleDebug(null);
    return;
  }
  const { gameTime, deltaTime, player, playerAreaIdx, spawnBounds, spawnViewOffsetY, snowTheme, spawnEsc } = ctx;
  const {
    puzzleKomaRef, puzzleHitRef, puzzleClockRef, puzzleCdRef, puzzleSoftenRef, directorRef, namedFoeRef,
    rankPaceRef,
  } = refs;

  const koma = puzzleKomaRef.current;
  // 被弾検知(pressureHitRef/M1と同じ責務分離の専用ref)。
  if (puzzleHitRef.current.prevHp < 0) puzzleHitRef.current.prevHp = player.health;
  const dmgTakenThisFrame = Math.max(0, puzzleHitRef.current.prevHp - player.health);
  if (dmgTakenThisFrame > 0) puzzleHitRef.current.lastHitAt = gameTime;
  puzzleHitRef.current.prevHp = player.health;
  const msSinceLastHit = gameTime - puzzleHitRef.current.lastHitAt;

  // PACING_PUZZLE.md §6.27 バッチM50: 連続査定「捌けているか」一本化。コマ境界(relax/harvest/
  // normal/peak)に関係なく毎tick進める(旧仕様の欠陥③=relax/harvestの80秒が昇格に一切寄与しない、
  // をここで解消する)。撃破数はgameStats.enemiesKilledのフレーム差分、被弾は上のdmgTakenThisFrame
  // 由来のmsSinceLastHitをそのまま使う(指示どおり=専用の被弾検知を新設しない)。
  const killsNow = useGameStore.getState().gameStats.enemiesKilled;
  const killsThisFrame = Math.max(0, killsNow - rankPaceRef.current.prevKills);
  rankPaceRef.current.prevKills = killsNow;
  const rankPaceResult = tickRankPace(rankPaceRef.current.state, {
    dtMs: deltaTime * 1000,
    killsThisFrame,
    msSinceLastHit,
    rank: puzzleClockRef.current.rank,
    r7Cap: puzzleClockRef.current.r7Cap,
  });
  rankPaceRef.current.state = rankPaceResult.state;
  // v0.25.2374(実機テストチャットの指摘①): 較正値を毎tick焼く。**コマ境界を待たない**ので、
  // 2分未満で終わったランからも数字が取れる(旧版は koma 0件=要約が空だった)。
  // 無効時(`?komalog=1` 無し)は tickKomaLive が即returnするので通常プレイのコストはゼロ。
  if (isKomaLogEnabled()) {
    const lpx = player.x + player.width / 2, lpy = player.y + player.height / 2;
    tickKomaLive({
      atMs: gameTime,
      rank: puzzleClockRef.current.rank,
      dist: Math.hypot(lpx, lpy),
      windowsAtRank: rankPaceRef.current.state.window.windowsAtRank,
      windowsClearing: rankPaceRef.current.state.window.windowsClearing,
      hitStreakMs: rankPaceRef.current.state.hitStreak.streakMs,
      kills: killsNow,
      hitThisFrame: dmgTakenThisFrame > 0,
    });
  }
  // ?rank2=0時は旧経路(下のコマ境界査定)がランクを動かす。ここでは連続査定を進めるだけに留め、
  // 実際のapplyRankDeltaは呼ばない(=旧挙動へ完全復帰できる)。
  if (RANK2_ENABLED && rankPaceResult.delta !== 0) {
    const prevRank = puzzleClockRef.current.rank;
    puzzleClockRef.current = applyRankDelta(puzzleClockRef.current, rankPaceResult.delta);
    announceRankChange(prevRank, puzzleClockRef.current.rank);
  }

  // コマ査定の生データ収集(社長指示v0.25.2356)。**記録するだけで誰も読んで分岐しない**
  // (旧査定の正本は assessKomaDelta / combineCycleDelta のまま=挙動は完全に不変。M50では
  // これらの結果は実ランクを動かさず、komaLog/昇格度表示 promotionScore 用に生き続けるだけ)。
  // 既定は無効で、ヘッドレスの計測ランが enableKomaLog() を呼んだ時だけ溜まる。
  const recordKomaSample = (
    kind: 'normal' | 'peak', input: KomaAssessmentInput, delta: -1 | 0 | 1,
  ): void => {
    if (!isKomaLogEnabled()) return;
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    recordKoma({
      run: komaLogRunRef.current, atMs: gameTime, kind,
      rank: puzzleClockRef.current.rank, dist: Math.hypot(pcx, pcy),
      maxHealth: player.maxHealth, input, delta,
      // M50(§6.27): 較正用のスナップショット(この記録時点での連続査定の内部状態)。
      pace: {
        windowsAtRank: rankPaceRef.current.state.window.windowsAtRank,
        windowsClearing: rankPaceRef.current.state.window.windowsClearing,
        hitStreakMs: rankPaceRef.current.state.hitStreak.streakMs,
      },
    });
  };

  // 盤面の現況(パズル管理下の型のみ。ボス/裏ボス/ハンター/リーパー等は対象外)。
  const puzzleEnemiesNow = useGameStore.getState().enemies;
  const boardCount = puzzleEnemiesNow.filter(e => PUZZLE_MANAGED_TYPES.has(e.type)).length;
  const aliveNuisance: NuisanceCounts = {
    plant: puzzleEnemiesNow.filter(e => e.type === 'plant').length,
    werewolf: puzzleEnemiesNow.filter(e => e.type === 'werewolf').length,
    pumpkin: puzzleEnemiesNow.filter(e => e.type === 'pumpkin').length,
  };
  const aliveSpecial: Partial<Record<SpecialType, number>> = {
    screamer: puzzleEnemiesNow.filter(e => e.type === 'screamer').length,
    ghost: puzzleEnemiesNow.filter(e => e.type === 'ghost').length,
  };

  // M6(§3-D改訂): 全コマ常時の「多少緩め」検知(直近10秒の被ダメ/Intensity平均/低HPのリング集計)。
  puzzleSoftenRef.current = stepSoften(puzzleSoftenRef.current, {
    dtMs: deltaTime * 1000,
    dmgFracThisFrame: player.maxHealth > 0 ? dmgTakenThisFrame / player.maxHealth : 0,
    intensity: directorRef.current.state.intensity,
    hpFrac: player.maxHealth > 0 ? player.health / player.maxHealth : 0,
    msSinceLastHit,
  });
  const softenedNow = puzzleSoftenRef.current.softened;

  // M6(§4-D): 台本の「片付き」駆動ローテーション(通常/ピーク中のみ)。時間では切り替えない。
  const inScriptKoma = koma.kind === 'normal' || koma.kind === 'peak';
  const scriptCleared = koma.script == null
    || isScriptCleared(nuisanceTarget(koma.script), koma.scriptSpawned, aliveNuisance);
  if (inScriptKoma && scriptCleared && koma.elapsedMs < KOMA_BASE_MS) {
    // コマの基本時間内なら次の台本を引く(基本=現ランク・時々1ランク下を混ぜる。未見優先・直前禁止)。
    // 40秒到達後はもう引かない=現台本の片付きがコマ切替の合図になる(下の切替判定)。
    const picked = selectRotationPattern(
      puzzleClockRef.current.rank, koma.seenIds, koma.lastPatternId,
      msSinceLastHit < 10000, Math.random(), Math.random()
    );
    koma.script = picked;
    koma.scriptSpawned = { ...ZERO_NUISANCE };
    koma.lastPatternId = picked.id;
    koma.seenIds.add(picked.id);
    if (allPatternsSeen(puzzleClockRef.current.rank, koma.seenIds)) koma.seenIds.clear();
  }

  // M6(§4-C): コマ切替判定。リラックス/ハーベスト=きっかり40秒。通常/ピーク=40秒+台本の
  // 片付き待ち(処理待ちは邪魔者のみ・チャフ/特別枠は含めない=社長v0.25.1385)。延長上限+30秒。
  koma.elapsedMs += deltaTime * 1000;
  const baseDone = koma.elapsedMs >= KOMA_BASE_MS;
  const switchNow = inScriptKoma
    ? ((baseDone && scriptCleared) || koma.elapsedMs >= KOMA_BASE_MS + KOMA_EXTENSION_MAX_MS)
    : baseDone;
  if (switchNow) {
    // 査定(§3-B/4-C 2段構え): 通常末=仮査定 / ピーク末=検証査定(確定は次の通常開始時に反映)。
    if (koma.kind === 'normal') {
      const normalInput = finalizeKomaAssessmentInput(koma.acc, player.maxHealth);
      koma.provisionalDelta = assessKomaDelta(normalInput);
      recordKomaSample(koma.kind, normalInput, koma.provisionalDelta);
      // PACING_PUZZLE.md §5.17-追補/§5.19 M18: 昇格度(惜しさ)表示用の最新スナップショット。
      // 死亡リザルトが1回だけ読む(promotionScore)。判定挙動には影響しない(読むだけ)。
      useGameStore.setState({ lastKomaAssessmentInput: normalInput });
    } else if (koma.kind === 'peak') {
      const peakInput = finalizeKomaAssessmentInput(koma.acc, player.maxHealth);
      koma.pendingFinalDelta = combineCycleDelta(koma.provisionalDelta ?? 0, peakInput);
      recordKomaSample(koma.kind, peakInput, koma.pendingFinalDelta);
      koma.provisionalDelta = null;
    }
    const prevKind = koma.kind;
    koma.kind = nextKomaKind(koma.kind);
    koma.elapsedMs = 0;
    koma.acc = createKomaAccumulator();
    koma.excitedThisKoma = false; // 興奮通信(v0.25.1845)はコマごとに再アーム
    if (koma.kind === 'normal') {
      // 確定査定の反映は「次の通常」から(§4-C。直後のリラックス/ハーベストはR1相当なので影響なし)。
      // M50(§6.27・?rank2=0時のみ): 実ランクはここで動かす旧経路。rank2既定ON時はこの確定査定は
      // komaLog/promotionScore用に生き続けるだけで、実ランクは連続査定(上のrankPaceResult)側が動かす。
      if (koma.pendingFinalDelta != null) {
        if (!RANK2_ENABLED) {
          const prevRank = puzzleClockRef.current.rank;
          puzzleClockRef.current = applyRankDelta(puzzleClockRef.current, koma.pendingFinalDelta);
          // PACING_PUZZLE.md §5.17 M14: ランクの壁(査定確定=このタイミングのみ・予告なし)。
          // 社長指示v0.25.1845「ランク演出について変更」: ①演出(銘打ち)は毎回何度でも出す
          // (旧・isFirstRankReachの初回限定を撤廃。記録系=wallMeta/年表は従来どおり初回のみ)。
          // ②降格もグレーバージョンで出す(SE指定なし=静かに)。
          announceRankChange(prevRank, puzzleClockRef.current.rank);
        }
        koma.pendingFinalDelta = null;
      }
      koma.script = null; // 緩明けは新しい台本から(§4-D。次フレームのローテーションが引く)
      koma.scriptSpawned = { ...ZERO_NUISANCE };
    }
    if (koma.kind === 'relax') {
      // 緩に入ったら台本は破棄(邪魔者は補充停止=自然消化・強制消去しない=§4-D)。
      koma.script = null;
      koma.scriptSpawned = { ...ZERO_NUISANCE };
    }
    // PEAK演出(§4-C: 打楽器・バナーはピークコマ。通常コマでは鳴らさない)。
    // バナー: ピーク突入=「多数の変異体を検知」/ピーク明け=「襲撃を凌いだ」+ジングル。
    if (koma.kind === 'peak') {
      useGameStore.setState({ eventBannerText: '多数の変異体を検知', eventBannerUntil: gameTime + 3500 });
    } else if (prevKind === 'peak') {
      useGameStore.setState({ eventBannerText: '襲撃を凌いだ', eventBannerUntil: gameTime + 3500 });
      playSfx('gate-clear'); // 強襲突破ジングル(社長提供SE)
    }
  }

  // 社長指示v0.25.1845→用語整理v0.25.1851: ランク条件(昇格判定)をその時点までの集計で満たした瞬間に、
  // 査定を待たず**通信(帯バナー=紅き月と同じ線)**で「変異体が興奮し始めた」を出す(予兆)。
  // ※会話(モデル付き吹き出し=NpcDialogue)ではない(社長訂正)。査定コマ(通常/ピーク)ごとに1回。
  // コマ序盤はサンプル不足で誤発火しやすい(無被弾数秒でstarveRatioが立つ等)ため15秒経過後から判定(叩き台)。
  if (inScriptKoma && !koma.excitedThisKoma && koma.elapsedMs >= EXCITED_COMM_MIN_KOMA_MS) {
    const liveInput = finalizeKomaAssessmentInput(koma.acc, player.maxHealth);
    if (assessKomaDelta(liveInput) === 1) {
      koma.excitedThisKoma = true;
      useGameStore.setState({ eventBannerText: '変異体が興奮し始めた', eventBannerUntil: gameTime + 3500 });
    }
  }

  // M6(§4-C): コマ別のチャフ目標・度数・CD。目標へは1ずつランプ(上げ)・下げは即スナップ。
  const rank = puzzleClockRef.current.rank;
  const cap = capForState(puzzleClockRef.current);
  // 締め(§3-D・通常/ピーク限定): 無被弾15秒+(Perf>=0.6 or 盤面<目標が15秒継続)。緩め優先。
  const tightenedNow = inScriptKoma && !softenedNow
    && msSinceLastHit >= TIGHTEN_NO_HIT_MS
    && (directorRef.current.state.performance >= TIGHTEN_PERF_MIN || koma.belowTargetMs >= TIGHTEN_STARVE_MS);
  let komaChaffTarget = chaffTargetForKoma(koma.kind, cap);
  if (softenedNow) komaChaffTarget = Math.max(SOFTEN_TARGET_MIN, Math.round(komaChaffTarget * SOFTEN_TARGET_MULT));
  // PACING_PUZZLE.md §5.21-追補4(社長決定v0.25.1553): 追補3が足した「ゲート1中はchaff目標=
  // ピーク・CD0を強制」は撤回。ゲート1中もchaffは常にコマ駆動の値をそのまま使う=既存カーブ不変
  // (雑魚の湧き数はディレクター任せ)。
  const cdMs = cdForKoma(koma.kind, rank, puzzleClockRef.current.r7Cap, tightenedNow, softenedNow);
  koma.chaffRamp = stepChaffRamp(koma.chaffRamp, {
    dtMs: deltaTime * 1000,
    komaTarget: komaChaffTarget,
    rampIntervalMs: rampIntervalForKoma(koma.kind, tightenedNow),
    holdIncrease: koma.kind !== 'harvest' && msSinceLastHit < 10000, // §3-A被弾ホールド(盛り演出のハーベストは対象外)
  });
  // 邪魔者/特別枠は通常・ピークのみ供給(緩コマは新規補充停止=在席は自然消化)。
  const nuisanceTargetCounts = inScriptKoma && koma.script
    ? nuisanceTarget(koma.script)
    : noNewSupplyNuisanceTarget(aliveNuisance);
  const areaForSpecial = inScriptKoma ? playerAreaIdx : -1;
  const wantedNuisance = NUISANCE_TYPES.reduce((s, t) => s + Math.max(nuisanceTargetCounts[t], aliveNuisance[t]), 0);
  const wantedSpecial = (aliveSpecial.screamer ?? 0) + (aliveSpecial.ghost ?? 0)
    + (inScriptKoma ? 0 : 0); // 特別枠の欠員はdecideNextSpawnが埋める(目標計上は在席+欠員でなく在席のみ=控えめ側)
  const totalTarget = Math.min(cap, koma.chaffRamp.target + wantedNuisance + wantedSpecial);
  koma.belowTargetMs = boardCount < totalTarget ? koma.belowTargetMs + deltaTime * 1000 : 0;

  // 査定集計(§4-C: 通常/ピークのみ意味を持つが、集計自体は毎フレーム=コマ全体・延長込み)。
  // capReached=「盤面数がそのコマの総目標へ実際に到達した」(M6での再解釈・裁定済み記録参照)。
  if (inScriptKoma) {
    koma.acc = stepKomaAccumulator(koma.acc, {
      dtMs: deltaTime * 1000,
      perf: directorRef.current.state.performance,
      intensity: directorRef.current.state.intensity,
      dmgTakenThisFrame,
      boardCount,
      boardTarget: totalTarget,
      cap: totalTarget,
    });
  }

  const decision = decideNextSpawn({
    boardCount,
    boardTarget: totalTarget,
    cdElapsedMs: gameTime - puzzleCdRef.current.lastBaseSpawnAt,
    cdMs,
    nuisanceElapsedMs: gameTime - puzzleCdRef.current.lastNuisanceSpawnAt,
    nuisanceTargetCounts,
    aliveNuisance,
    specialElapsedMs: gameTime - puzzleCdRef.current.lastSpecialSpawnAt,
    area: areaForSpecial,
    aliveSpecial,
    msSinceLastHit,
    chaffWeights: chaffWeightsForKoma(koma.kind),
    tieBreakRandom: Math.random(),
  });
  if (decision) {
    const puzzleEnemy = generateEnemy(gameTime, player, spawnBounds, decision.type, player.lastDirection, spawnViewOffsetY, snowTheme, spawnEsc);
    // 叫喚の一本化(社長裁定v0.25.1378): 旧ディレクターが持っていた叫喚固有の扱いを特別枠側へ
    // 引き継ぐ——fixed=true(単体管理=画面外カリング/距離リサイクル対象外。キープ距離AIで
    // 画面外に留まるため、外すと回収→即補充のチャーンが起きる)+「叫喚型 出現」バナー。
    if (decision.type === 'screamer') {
      puzzleEnemy.fixed = true;
      useGameStore.setState({ eventBannerText: '叫喚型 出現', eventBannerUntil: gameTime + EVENT_BANNER_MS });
    }
    useGameStore.getState().addEnemy(puzzleEnemy);
    puzzleCdRef.current.lastBaseSpawnAt = gameTime;
    if (decision.slot === 'nuisance') {
      puzzleCdRef.current.lastNuisanceSpawnAt = gameTime;
      // §4-D: 片付き判定用に現台本の邪魔者出現数を記録。
      koma.scriptSpawned = { ...koma.scriptSpawned, [decision.type]: koma.scriptSpawned[decision.type as keyof NuisanceCounts] + 1 };
    } else if (decision.slot === 'special') puzzleCdRef.current.lastSpecialSpawnAt = gameTime;
  }

  // PACING_PUZZLE.md §5.14 M13: 宿敵(ネームド)の投入。ラン通算1体だけの一発抽選なので
  // decideNextSpawn(継続補充モデル)の枠には乗せず、特別枠と同じ規律(同時1・3秒CD・被弾直後
  // 1.5秒ガード=§0.5)だけを踏襲した独立チェックにする(急コマ=通常/ピークのみ)。
  {
    const nfState = useGameStore.getState();
    const nf = nfState.namedFoe;
    if (
      inScriptKoma && nf && nfState.namedFoeRunEligible && !nfState.namedFoeSpawnedThisRun &&
      msSinceLastHit >= NAMED_POST_HIT_GUARD_MS &&
      !puzzleEnemiesNow.some(e => e.isNamed) &&
      gameTime - namedFoeRef.current.lastAttemptAt >= NAMED_SPAWN_CD_MS
    ) {
      const namedEnemy = generateEnemy(gameTime, player, spawnBounds, nf.type, player.lastDirection, spawnViewOffsetY, snowTheme, spawnEsc);
      namedEnemy.isNamed = true;
      namedEnemy.health = Math.round(namedEnemy.health * NAMED_HP_MULT);
      namedEnemy.maxHealth = Math.round(namedEnemy.maxHealth * NAMED_HP_MULT);
      namedEnemy.damage = Math.round(namedEnemy.damage * NAMED_DMG_MULT);
      namedEnemy.width = Math.round(namedEnemy.width * NAMED_SIZE_MULT);
      namedEnemy.height = Math.round(namedEnemy.height * NAMED_SIZE_MULT);
      useGameStore.getState().addEnemy(namedEnemy);
      useGameStore.setState({
        namedFoeSpawnedThisRun: true,
        namedFoeResult: { name: normalizeNamedName(nf.name), defeated: false },
      });
      // PACING_PUZZLE.md §5.17 M14追補(演出仕様v0.25.1499): 出現バナーは中格=金帯様式へ
      // (旧eventBannerTextのpill表示から置き換え)。
      useGameStore.getState().triggerWallBand(`宿敵 現る —— ${normalizeNamedName(nf.name)}`, 'gold', EVENT_BANNER_MS);
      playSfx('gate-clear'); // 専用SEは叩き台として既存の強襲ジングルを流用(社長の実素材待ち)
      namedFoeRef.current.lastAttemptAt = gameTime;
    }
  }

  setPuzzleDebug({
    rank, boardTarget: totalTarget, cap, tightened: tightenedNow, softened: softenedNow,
    komaKind: koma.kind,
  });
}

// ============================================================================
// VS-style off-screen recycling + RE-style hard-cap culling
// ============================================================================

export interface RecycleCullCtx {
  labTheme: boolean;
  indoor: boolean;
  gameBounds: GameBounds;
  player: Player;
  playerCenterX: number;
  playerCenterY: number;
  gameTime: number;
  spawnBounds: GameBounds;
  spawnViewOffsetY: number;
  snowTheme: boolean;
  spawnEsc: number;
  playerAreaIdx: number;
  enemyCap: number;
  puzzleActiveNow: boolean;
  labSpawnAggroRange: number;
  labVisited?: { minX: number; maxX: number } | null; // M2: 通った道の範囲(この外側にだけ再配置)
}

export function runOffscreenRecycleAndCull(ctx: RecycleCullCtx): void {
  const {
    labTheme, indoor, gameBounds, player, playerCenterX, playerCenterY, gameTime,
    spawnBounds, spawnViewOffsetY, snowTheme, spawnEsc, playerAreaIdx, enemyCap, puzzleActiveNow,
    labSpawnAggroRange,
    labVisited,
  } = ctx;

  // VS-style recycling: when an enemy drifts far beyond the viewport,
  // bring it back just outside the current screen instead of letting the
  // simulation spend time on a distant actor. Boss-class enemies keep
  // their HP/type/state; regular enemies are refreshed into the current
  // spawn pool while reusing the same renderer id.
  const currentEnemiesForRecycle = useGameStore.getState().enemies;
  // リサイクル境界=固定ビュー矩形(プレイヤー中心)を OFFSCREEN_RECYCLE_MARGIN だけ広げた矩形。
  // これより外の敵は画面外送り(湧き直し)。半径(円)ではなく矩形=どの辺も「画面端から○px外」で一律(社長指示B)。
  // 文脈カメラズーム引き(contextZoom<1)中は可視域が gameBounds を超えるため、固定矩形のままだと
  // 画面内に見えている敵を回収してしまう(社長報告: ズーム引きで敵が端で消える。トールが
  // 大型=常時最大引き対象になって露見)。レンダラ側カリング(v0.25.1253 zoomViewportOverscan)
  // と同思想で、最大引き(CONTEXT_ZOOM_MIN)でも覆える倍率だけ常に外へ広げる(安全側=消えなくなるだけ)。
  const recycleZoomOverscan = (labTheme || indoor) ? 1 : 1 / CONTEXT_ZOOM_MIN;
  const recycleHalfW = (gameBounds.width / 2) * recycleZoomOverscan + OFFSCREEN_RECYCLE_MARGIN;
  const recycleHalfH = (gameBounds.height / 2) * recycleZoomOverscan + OFFSCREEN_RECYCLE_MARGIN;
  let recycledAnyEnemy = false;
  const recycledEnemies = currentEnemiesForRecycle.map(enemy => {
    // 裏ボスは距離リサイクル(ワープ先回り)対象外。専用コントローラが帰巣/再生を独自に管理する。
    if (isHiddenBoss(enemy.type)) return enemy;
    // 死神チェイサーも専用コントローラ(回り込みワープ)が座標を管理する=汎用の距離リサイクルで二重管理しない。
    // チェイサーはリサイクル余白(240px)の外側に湧くため、放置すると毎フレーム別の画面外へ飛ばされ続け、
    // 「死神がすぐどこかへ行ってしまう」原因になっていた(ワープ先回りはこの下の専用コントローラが担当)。
    if (enemy.type === 'reaper' && enemy.reaperChaser) return enemy;
    // 囲い系イベントの敵は円内に留めるため距離リサイクル対象外(画面外送りしない)。
    if (enemy.fromEvent) return enemy;
    // §5.14 M13: 宿敵(ネームド)は距離リサイクル対象外(倒すかラン終了まで持ち越すかの2択に
    // 保ち、勝手に湧き直して型が変わったように見えるのを防ぐ)。
    if (enemy.isNamed) return enemy;
    // 二人組クエストの強制目標個体も同様に対象外(討伐が条件=消えたり湧き直したりしてはいけない)。
    if (enemy.questTarget) return enemy;
    // 休眠中(未起動)の敵は「近づくまで向かってこない」設計。距離リサイクルで先回り(ワープ)させない
    // =城ボス等は起動するまで定位置で待機。一度起動(dormant解除)すれば以降は通常どおりリサイクルされる(社長指示)。
    // ただしラボ(研究所スキン)の通常湧き休眠個体は対象にする: 届かない休眠個体がその場に残り続けて
    // 上限(MAX_ENEMIES)を食い潰し、湧きが完全停止する不具合を防ぐ。遠ざかった休眠個体は「休眠のまま」
    // 画面近くへ湧き直す(=近づけば起きる)。caps・休眠仕様は不変。城ボス/裏ボスは labTheme では出ない。
    if (enemy.dormant && !labTheme) return enemy;
    // ノックバック中(カウンター等で吹き飛び中)はリサイクルしない。吹き飛んだ敵がリサイクル境界を越えた瞬間に
    // 別の湧き位置へテレポート湧き直し=「消えて違うところにリスポーン」していた(社長報告)。吹き飛ばし演出は
    // そのまま飛んで着地させ、瞬間移動だけ防ぐ。着地後(ノックバック終了後)に遠ければ通常どおりリサイクルされる。
    if (enemy.knockbackUntil !== undefined && enemy.knockbackUntil > Date.now()) return enemy;
    // ジャンプ/ダッシュ攻撃の実行中(jump=滞空移動 / charge=突進)はリサイクルしない。着地/突進先が
    // (溜め開始時のプレイヤー位置=移動で古くなり)リサイクル境界を越えると、実行中にテレポート湧き直し
    // =「急に画面から消える」原因になっていた(社長報告: パンプキンのジャンプ/カウンター時)。攻撃を完遂させ、
    // 終わって(aiPhase解除)から遠ければ通常どおりリサイクルする。
    if (enemy.aiPhase === 'jump' || enemy.aiPhase === 'charge') return enemy;
    const enemyCenterX = enemy.x + enemy.width / 2;
    const enemyCenterY = enemy.y + enemy.height / 2;
    // 矩形(プレイヤー中心)で「画面外送り」判定。半径ではなく辺基準で一律。
    const offRect = Math.abs(enemyCenterX - playerCenterX) > recycleHalfW
      || Math.abs(enemyCenterY - playerCenterY) > recycleHalfH;
    const waveProtected = enemy.isWave && gameTime - (enemy.spawnedAt ?? 0) < WAVE_GRACE_MS;
    // 固定敵(屋内の配置敵)は距離リサイクル対象外=常駐。ただし「画面外に出たら最初の
    // 定位置へ戻して再休眠」する(社長指示)。プレイヤーは常に画面中心なので、画面の半分+
    // 余白を超えたら画面外と判定。
    if (enemy.fixed) {
      if (
        indoor && !enemy.dormant &&
        enemy.homeX !== undefined && enemy.homeY !== undefined &&
        (Math.abs(enemyCenterX - playerCenterX) > gameBounds.width / 2 + LAB_RETURN_HOME_MARGIN ||
         Math.abs(enemyCenterY - playerCenterY) > gameBounds.height / 2 + LAB_RETURN_HOME_MARGIN)
      ) {
        recycledAnyEnemy = true;
        return {
          ...enemy,
          x: enemy.homeX, y: enemy.homeY, vx: 0, vy: 0,
          dormant: true,
          aiPhase: undefined, aiPhaseUntil: undefined, aiStartedAt: undefined,
          aiTargetX: undefined, aiTargetY: undefined, aiFromX: undefined, aiFromY: undefined,
          aiReadyAt: undefined,
          knockbackUntil: undefined, knockbackVx: undefined, knockbackVy: undefined,
        };
      }
      return enemy;
    }
    // エリア外追跡バグ修正: 現在エリアで weight=0 の敵タイプは画面内でも回収して差し替える。
    // ただし生成直後(5s猶予)・ウェーブ保護・ボス系は除外。ghost(抱卵型)も除外(社長報告「割と消える」):
    // ghostはプレイヤーを中心に周回し続ける追従型なので、エリア2+で出会った個体をプレイヤーが
    // エリア0/1(拠点付近=ステージ1のメイン活動域。ghostは出現重み0)へ連れ帰ると、追従中(=画面内)
    // にもかかわらず5秒後に強制回収されていた。新規湧きの出現エリア制限(AREA_WEIGHT)自体は不変。
    const preserveEnemyState = enemy.type === 'reaper' || enemy.type === 'ghost' || isBossType(enemy.type);
    const aliveMs = gameTime - (enemy.spawnedAt ?? 0);
    // DISTRIBUTION_REDESIGN.md①: sceneSpawn(台本のfeatured床/保証出現などでエリア不問に選ばれた)
    // も強制回収の対象外(画面外に離れた時の通常回収 OFFSCREEN_RECYCLE_MARGIN は従来どおり効く)。
    const areaInvalid = !preserveEnemyState && !enemy.isWave && !enemy.fromEvent && !enemy.sceneSpawn
      && aliveMs > 5000
      && !isValidForArea(enemy.type, playerAreaIdx);
    if ((!offRect && !areaInvalid) || waveProtected) return enemy;
    // 研究所スキンはリサイクル先もラボ用ゾンビに固定(森敵を出さない)。
    const recycleType = preserveEnemyState ? enemy.type : (labTheme ? selectLabEnemyType(gameTime) : undefined);
    const replacement = generateEnemy(
      gameTime,
      player,
      spawnBounds, // 文脈ズームで引いている分だけ湧き位置も外へ(通常湧きと同じ)
      recycleType,
      player.lastDirection,
      spawnViewOffsetY, // 通常湧きと同じカメラ下げオフセットを使う(従来は固定0でリサイクル敵が約48-77px下にズレて画面内に出やすかった)
      snowTheme,
      spawnEsc // 難易度③: リサイクル敵も同じ escalation で強さ/種類を整合
    );
    recycledAnyEnemy = true;
    // M2: リサイクル(再配置)も**歩ける帯の中・画面外の左右**に限定する(社長指示v0.25.2242)。
    // 新規湧きだけが帯の制限を持っていて、この経路は素の generateEnemy のまま=上下からも帯の外にも
    // 湧いていた(=同じ規則を2箇所に書いていたことによる取りこぼし)。共有純関数で一本化する。
    if (labTheme) {
      // 既に居る敵の視界の中には再配置しない(社長指示v0.25.2245)。自分自身は除く。
      const visionCircles = useGameStore.getState().enemies
        .filter(e => e.id !== enemy.id && e.aggroRange !== undefined)
        .map(e => ({ x: e.x + e.width / 2, y: e.y + e.height / 2, r: e.aggroRange as number }));
      const placed = placeLabSpawn(
        player.x, spawnBounds.width / 2, OFFSCREEN_SPAWN_MARGIN,
        replacement.width, replacement.height, LAB_CORRIDOR_Y_LIMIT_PX,
        labVisited ?? null, visionCircles,
      );
      // 通った道しか置き場が無い場合は再配置せず、その個体をそのまま消す(=画面外で静かに退場)。
      if (!placed) return null;
      replacement.x = placed.x;
      replacement.y = placed.y;
    }

    if (preserveEnemyState) {
      return {
        ...enemy,
        x: replacement.x,
        y: replacement.y,
        vx: undefined,
        vy: undefined,
        knockbackUntil: undefined,
        knockbackVx: undefined,
        knockbackVy: undefined,
        spawnedAt: gameTime
      };
    }

    return {
      ...replacement,
      id: enemy.id,
      // ラボはリサイクル個体も索敵仕様(休眠+半径)で再配置。
      ...(labTheme ? { dormant: true, aggroRange: labSpawnAggroRange, vx: 0, vy: 0 } : {})
    };
  });
  if (recycledAnyEnemy) {
    // null = 「通った道しか置き場が無く再配置しなかった個体」= 除去する(v0.25.2244)。
    useGameStore.setState({ enemies: recycledEnemies.filter((e): e is Enemy => e !== null) });
  }

  // RE-style density: a hard cap of ~10 concurrent enemies. Set-piece
  // elites are never culled, and scripted-wave enemies get a 10-second
  // grace period before they're eligible (otherwise a boss wave gets
  // deleted the instant it spawns under the low cap).
  const currentEnemiesForCap = useGameStore.getState().enemies;
  if (currentEnemiesForCap.length > enemyCap) {
    const isProtected = (e: typeof currentEnemiesForCap[number]): boolean =>
      !!e.fixed || // 屋内ステージの固定配置敵は数が多くてもカリングしない(遠い敵が消えない)
      !!e.fromEvent || // 囲い系イベントの敵は終了判定に必要なのでカリングしない
      !!e.isNamed || // §5.14 M13: 宿敵は上限カリング対象外(倒すかラン終了持ち越しの2択を保つ)
      !!e.questTarget || // 二人組クエストの強制目標個体(討伐が条件=消えてはいけない)
      e.type === 'reaper' || e.type === 'giantbat' || e.type === 'pumpkin' ||
      e.type === 'lab-zombie-3' || // 研究所Lv3はパンプキン相当のボス(着地爆発)。ランダム湧き個体がcap超過で消されないよう保護
      isHiddenBoss(e.type) || // 裏ボスは専用コントローラ管理(帰巣/回復)。カリングすると討伐誤検出で「勝手に死ぬ」
      !!(e.isWave && gameTime - (e.spawnedAt ?? 0) < WAVE_GRACE_MS);
    // PACING_PUZZLE.md §5.7(M6追補2・実機バグ対処): パズルON時、査定でr7Cap/ランクが
    // 縮小して enemyCap が瞬時に下がっても、画面内の敵は消さない(仕様「在席は強制消去しない・
    // 自然消化」との矛盾=実バグだった)。cull候補を可視域外(リサイクルと同じ矩形・座標系=
    // CONTEXT_ZOOM_MIN のズーム引き考慮込み)に限定する。画面内の超過分は湧き停止+自然消化で
    // 収束させる。?puzzle=0時(puzzleActiveNow=false)は旧挙動(全敵が対象)のまま。
    const cullable = selectCullCandidates(
      currentEnemiesForCap,
      isProtected,
      { centerX: playerCenterX, centerY: playerCenterY, halfW: recycleHalfW, halfH: recycleHalfH },
      puzzleActiveNow
    );

    const toRemoveIds = new Set(
      cullable
        .slice(0, currentEnemiesForCap.length - enemyCap)
        .map(enemy => enemy.id)
    );
    if (toRemoveIds.size > 0) {
      toRemoveIds.forEach(id => ENEMY_REMOVE_CAUSE.set(id, 'cap')); // 消失ログ用: 上限カリング(fromEventは保護のはず)
      useGameStore.setState({
        enemies: currentEnemiesForCap.filter(enemy => !toRemoveIds.has(enemy.id))
      });
    }
  }
}

// ============================================================================
// AIディレクター(ステップA): Intensity/Performance/DirectorState を算出。
// ============================================================================

export interface DirectorSignalRefs {
  directorRef: Ref<{ state: DirectorState; prevHp: number; prevKills: number; nextSampleMs: number }>;
  hunterRef: Ref<{ phase: 'idle' | 'search' | 'chase' | 'retreat' }>;
  gatePressureRef: Ref<{ state: { pressure: number } }>;
}

export interface DirectorSignalCtx {
  directorActive: boolean;
  deltaTime: number;
  curPhaseKind: PhaseKind;
  pressureOutdoor: boolean;
  playerAreaIdx: number;
  boardDebtNow: number;
  upswingBonus: number;
}

// ★信号算出そのものはゲーム挙動を一切変えない(読むだけ)。実際の湧きへの適用はステップB(useGameLoop.ts
// 側の relaxAdj/buildupAdj)で、?directorApply=relax の時だけ・別箇所(通常湧きのescalation/間隔/上限)に
// 薄く乗る。通常は完全に無コスト。
export function runDirectorSignalStep(refs: DirectorSignalRefs, ctx: DirectorSignalCtx): void {
  if (!ctx.directorActive) return;
  const { directorRef, hunterRef, gatePressureRef } = refs;
  const { deltaTime, curPhaseKind, pressureOutdoor, playerAreaIdx, boardDebtNow, upswingBonus } = ctx;

  const ds = useGameStore.getState();
  const dp = ds.player;
  const maxHp = Math.max(1, dp.maxHealth);
  const dmgTaken = Math.max(0, directorRef.current.prevHp - dp.health) / maxHp;
  directorRef.current.prevHp = dp.health;
  const killsNow = ds.gameStats.enemiesKilled;
  const killDelta = Math.max(0, killsNow - directorRef.current.prevKills);
  directorRef.current.prevKills = killsNow;
  // 近接圏(接触危険レンジ)内の敵数="近い敵"。画面内総数ではなく近接を見る(トップダウンでは近接が効く)。
  const dpx = dp.x + dp.width / 2, dpy = dp.y + dp.height / 2;
  const nearR2 = DIRECTOR_NEAR_RADIUS * DIRECTOR_NEAR_RADIUS;
  let nearN = 0;
  for (const e of ds.enemies) {
    const ex = e.x + e.width / 2 - dpx, ey = e.y + e.height / 2 - dpy;
    if (ex * ex + ey * ey <= nearR2) nearN++;
  }
  // 危険敵の存在(0..1・複数あれば最大値を採用=合算しない): 被弾していなくても「危ないものが近くにある/
  // 起きようとしている」だけで緊張を底上げする。ハンター(索敵/追跡)に加え、werewolf突進予告/実行・
  // pumpkinジャンプ予告/滞空・screamer発動準備・plant射線内・ghost(抱卵型)の毒卵密度、を見る。
  const hPhase = hunterRef.current.phase;
  let dangerBias = hPhase === 'chase' ? 1 : hPhase === 'search' ? 0.6 : hPhase === 'retreat' ? 0.3 : 0;
  for (const e of ds.enemies) {
    if (e.type === 'werewolf') {
      if (e.aiPhase === 'charge') dangerBias = Math.max(dangerBias, 1);
      else if (e.aiPhase === 'windup') dangerBias = Math.max(dangerBias, 0.6);
    } else if (e.type === 'pumpkin') {
      if (e.aiPhase === 'jump') dangerBias = Math.max(dangerBias, 1);
      else if (e.aiPhase === 'crouch') dangerBias = Math.max(dangerBias, 0.6);
    } else if (e.type === 'screamer') {
      if (e.aiPhase === 'scream') dangerBias = Math.max(dangerBias, 0.7);
    } else if (e.type === 'plant') {
      const profile = getEnemyFireProfile(e);
      if (profile) {
        const ex = e.x + e.width / 2 - dpx, ey = e.y + e.height / 2 - dpy;
        if (ex * ex + ey * ey <= profile.range * profile.range) dangerBias = Math.max(dangerBias, 0.5);
      }
    }
  }
  let eggNear = 0;
  const eggR2 = DIRECTOR_EGG_DANGER_RADIUS * DIRECTOR_EGG_DANGER_RADIUS;
  for (const p of ds.breakableProps) {
    if (p.type !== 'mine') continue;
    const ex = p.footX - dpx, ey = p.footY - dpy;
    if (ex * ex + ey * ey <= eggR2) eggNear++;
  }
  if (eggNear > 0) dangerBias = Math.max(dangerBias, Math.min(1, eggNear / DIRECTOR_EGG_DANGER_FULL));
  // 紅き月(社長合意)/バッチ7憲法第5条(全大イベントへ拡張): イベント中は danger 最大=
  // 状態機械が自然にPEAKへ入る(=RELAX/BUILDUPの適用が消えて二重の盛り/緩めをしない)。
  // 明けたら「PEAK後は必ずRELAX」の既存不変条件で保証されたRELAX(引きの時間)が来る。
  // ハンターの索敵/追跡/撤退はすでに専用カーブ(上のhPhase分岐)を持つためここでは上書きしない。
  if (ds.redNight?.phase === 'active') dangerBias = 1;
  if (ds.activeEvent && ds.activeEvent.kind !== 'rescue') dangerBias = 1; // 囲い(ホード/ミニボス)
  if (ds.bossChasing) dangerBias = 1; // 裏ボス追跡中
  directorRef.current.state = stepDirector(directorRef.current.state, {
    hpFrac: dp.health / maxHp,
    damageTakenFrac: dmgTaken,
    nearEnemies: nearN,
    killDelta,
    dangerBias,
  }, deltaTime);
  const st = directorRef.current.state;
  setDirectorDebug(st);
  // リザルトのタイムライン用に 0.5s 刻みでサンプル記録(gameTime基準)。
  if (ds.gameTime >= directorRef.current.nextSampleMs) {
    directorRef.current.nextSampleMs = ds.gameTime + 500;
    // バッチ2.5(診断計測): 実機確認①のような「固定タイマー起因の詰まり」を、リザルト画面
    // だけで再現・診断できるように、関所種別/gatePressure/エリア/発火中イベントを併記する。
    // ここも記録のみ(既存のenemies走査は0.5s間隔なので追加負荷は無視できる=1/10)。
    let events = 0;
    if (ds.activeEvent) events |= DIRECTOR_EVENT_BIT.arena;
    if (ds.redNight?.phase === 'active') events |= DIRECTOR_EVENT_BIT.redNight;
    if (ds.castleEvent?.bossSpawned) events |= DIRECTOR_EVENT_BIT.castleBoss;
    for (const e of ds.enemies) {
      if (e.type === 'hunter') events |= DIRECTOR_EVENT_BIT.hunter;
      else if (e.type === 'screamer') events |= DIRECTOR_EVENT_BIT.screamer;
      else if (e.type === 'reaper') events |= DIRECTOR_EVENT_BIT.reaper;
      if (e.isNamed) events |= DIRECTOR_EVENT_BIT.named; // §5.14 M13: 宿敵出現中(他イベントと排他ではない)
    }
    // PACING_PUZZLE.md バッチM2(§3-D): 本方式ON時のランク/盤面目標(?puzzle=0時はundefined
    // のまま=ランク階段線が出ない=旧経路のランと区別できる)。setPuzzleDebugと同じスナップ
    // ショットを読むだけ(記録専用・挙動には影響しない)。
    const puzzleSnap = getPuzzleDebug();
    recordDirectorSample({
      t: ds.gameTime / 1000,
      intensity: st.intensity,
      performance: st.performance,
      macro: st.macro,
      phaseKind: curPhaseKind,
      pressure: pressureOutdoor ? gatePressureRef.current.state.pressure : null,
      areaIdx: playerAreaIdx,
      events,
      debt: boardDebtNow,
      upswing: upswingBonus,
      puzzleRank: puzzleSnap?.rank,
      boardTarget: puzzleSnap?.boardTarget,
      komaKind: puzzleSnap?.komaKind, // §5.8: パズルON時のコマ種別(リザルト集計をコマ基準へ)
    });
  }
}
