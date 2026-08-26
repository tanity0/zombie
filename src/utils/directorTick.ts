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

import { useGameStore, ENEMY_REMOVE_CAUSE, WALL_ENABLED, SPAWN_CLAMP_ENABLED, RESCUE_ALLY_SPAWN_DIST } from '../store/gameStore';
import { placeLabSpawn } from './labSpawn';
import { OFFSCREEN_SPAWN_MARGIN } from './enemyUtils';
import { LAB_CORRIDOR_Y_LIMIT_PX } from '../world/labWalls';
import { clampRectToPlayableArea } from '../world/playableArea';
import {
  isFirstRankReach, markRankReached, markSelfHighestRank, WALL_RANK_NAMES_EN, rankLabel,
} from './wallProgress';
import type { ActiveEvent, Enemy, EnemyType, GameBounds, Player, PlayerBuildSnapshot, SkillKey, Summon } from '../types/game';
import {
  generateEnemy,
  getEnemyFireProfile,
  isBossType,
  isHiddenBoss,
  isValidForArea,
  selectLabEnemyType,
  OFFSCREEN_RECYCLE_MARGIN,
  isBountyType,
  isGuardianPhantom,
  isPumpkinTier,
} from './enemyUtils';
import { resolvePumpkinTier, allowDrillerForRun } from './drillerAi'; // PACING_PUZZLE.md §9
import { isBossMakerRun } from './bossTest'; // §9-7#7: 計測路(ボスメーカー)ではdrillerを出さない
import { isGauntletRun } from './gauntletMode'; // §9-7#7: 計測路(ガントレット)ではdrillerを出さない
import { selectCullCandidates } from './enemyCulling';
import { enemyCountCap, ENEMY_COUNT_CEIL, type PhaseKind } from './difficultyDirector';
import { stepDirector, applyRelaxSpawnCadence, type DirectorState } from './aiDirector';
import { setDirectorDebug, recordDirectorSample, DIRECTOR_EVENT_BIT, getDirectorPower } from './aiDirectorDebug';
import { stepPinch, pityLevel, pityDropTuning, type PinchState } from './pityDirector';
import { setPityDrop } from './pityState';
import { PITY_EVENT_BLOCK_TAIL_MS } from './eventProducer';
import { ZOOM_MIN_ABS } from './cameraZoom';
import { bossEngagedNow, bossEngagementDistancePx, bossRelaxWithTail, engagedBossSlotKeys, isEngageableBoss, isGhostEligibleBoss, BOSS_OPENING_HOLD_MS } from './bossEngagement';
import { markBossesEncountered } from './bossEncounter'; // BOSS_MAKER.md §20-5: ボスラッシュの解放記録
import {
  tickPlayerTraits, loadPlayerProfile, effectiveGhostProfile, bossStyleSlotKey,
  subStyleHomingHoldMs, type SubStyleProfile,
} from './playerTraits'; // BOT_AND_GHOST.md G1/G5
import { setDuoRunActive } from './duoRecords'; // §2.17(GHOST-DUO-RECORDS): 同行ランのフラグ(時計はbossClockへ移設)
import { tickBossClocks } from './bossClock'; // v0.25.2577: 撃破タイムのボスごと交戦時計(ソロ/同行共有)
import { loadPlayerName, displayNameFrom } from './playerName'; // v0.25.2477: 守護霊の頭上名(srcName未記録時のフォールバック)
import {
  displayGhostComment, GHOST_ARRIVAL_COMMENT_DEFAULT, GHOST_DEPARTURE_COMMENT_DEFAULT, loadGhostComments,
} from './ghostComment';
import { ghostAllySnapshot } from './playerBuild'; // v0.25.2553(§2.16 B): 同行守護霊カードの写し(共通の1枚)
import { defaultGhostProfile, ghostRunEnabled, GHOST_BOSS_HP_MULT, type GhostProfile } from './ghostDriver'; // BOT_AND_GHOST.md G2/G3(GHOST_HP_FRACはv0.25.2468で廃止=計測時スナップショット100%再現へ)
import {
  fixedGhostFeedbackTarget, isGhostOnlinePickPending, remoteGhostFeedbackTarget,
  resolveRemoteGhost, selectedGhostMode,
} from './ghostOnline';
import { pickFixedGuardianForGhostMode, shouldPickFixedGuardian } from '../data/fixedGuardians';
import { getSelectedStageId, recordChronicle } from '../data/progress';
import { recordKoma, isKomaLogEnabled, komaLogRunRef, tickKomaLive } from './komaLog';
import {
  capForState, clampRank,
  assessKomaDelta, applyRankDelta, combineCycleDelta,
  createKomaAccumulator, stepKomaAccumulator, finalizeKomaAssessmentInput,
  stepSoften, softenedChaffTarget,
  TIGHTEN_NO_HIT_MS, TIGHTEN_PERF_MIN, TIGHTEN_STARVE_MS,
  tickRankPace,
  type PuzzleClockState, type KomaAccumulatorState, type SoftenState, type RankDelta,
  type KomaAssessmentInput, type RankPaceState, type PuzzleRank,
} from './rankAssessor';
import { rankFloorForElapsed, parseRankFloorPaceMult } from './rankFloor'; // PACING_PUZZLE.md §7-11c(2)
import {
  nuisanceTarget, decideNextSpawn,
  ZERO_NUISANCE, NUISANCE_TYPES,
  nextKomaKind, KOMA_BASE_MS, KOMA_EXTENSION_MAX_MS,
  chaffWeightsForKoma, chaffTargetForKoma, rampIntervalForKoma, cdForKoma, stepChaffRamp,
  peakRedTier, noRedTierForKoma,
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
// PACING_PUZZLE.md §9-3(削岩型): driller はpumpkin枠の実体化差し替えなので、盤面カウント
// (boardCount)にも同じくpumpkin相当として乗る(将棋盤の駒数=見た目に関わらず数える)。
const PUZZLE_MANAGED_TYPES = new Set<EnemyType>(['bat', 'skeleton', 'zombie', 'plant', 'werewolf', 'pumpkin', 'driller', 'screamer', 'ghost']);
const DIRECTOR_NEAR_RADIUS = 240;         // Intensity の"近接敵"を数える半径(接触危険レンジ相当)
const DIRECTOR_EGG_DANGER_RADIUS = 180;   // 抱卵型(ghost)が撒いた毒卵の"密度"を見る、プレイヤー中心の半径
const DIRECTOR_EGG_DANGER_FULL = 3;       // この個数(近くに)でdanger最大(=1バーストぶんが足元に集まっている状態)
const WAVE_GRACE_MS = 10000;
const LAB_RETURN_HOME_MARGIN = 140;
// §6.38 B1.5-7(賞金首): export化してbountyTick.tsのBOUNTY_DEPART_BANNER_MSが手写しせずここを参照する。
export const EVENT_BANNER_MS = 3500;      // イベント発生告知バナーの表示時間(gameTime ms)。useGameLoop.ts と同じ値。

/**
 * 上限カリング(runOffscreenRecycleAndCull)の保護表。PACING_PUZZLE.md §6.38 B1(賞金首)の
 * 保護3箇所のうち②。named-export化してユニットテスト可能にした(旧: 呼び出し箇所のインライン
 * クロージャ・実装精度の規律4)。判定・値は移設前と同一(挙動不変)。
 */
export const isEnemyCapProtected = (
  e: Pick<Enemy, 'type' | 'fixed' | 'fromEvent' | 'isNamed' | 'questTarget' | 'isWave' | 'spawnedAt' | 'stunUntil'>,
  gameTime: number,
): boolean =>
  // ★v0.25.3956(社長報告「クリティカルになって…消えちゃう敵がいる」): 気絶中(=クリのフィニッシュ
  // 受付中)は消さない。ご褒美の窓の最中に上限カリングで消えるのは理不尽(プラント消失の疑い筋①)。
  (e.stunUntil !== undefined && gameTime < e.stunUntil) ||
  !!e.fixed ||
  !!e.fromEvent ||
  !!e.isNamed ||
  !!e.questTarget ||
  e.type === 'reaper' || e.type === 'giantbat' || isPumpkinTier(e.type) ||
  e.type === 'lab-zombie-3' ||
  isHiddenBoss(e.type) ||
  isBountyType(e.type) ||
  // research/GHOST_BOSS.md(守護霊ボス「幻影」): 上限カリングで消されない(戦っている相手が
  // 雑魚の数の都合で消えると戦闘そのものが成立しない=他のボス系と同じ保護)。
  isGuardianPhantom(e.type) ||
  !!(e.isWave && gameTime - (e.spawnedAt ?? 0) < WAVE_GRACE_MS);

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

// ボス交戦中の強制リラックス(社長裁定v0.25.2412)。既定ON。?bossrelax=0 で従来挙動(コマどおりに湧く)。
// 判定は src/utils/bossEngagement.ts の純関数(対象ボスの表と dormant の扱いはそちらが正本)。
const BOSS_RELAX_ENABLED = typeof window === 'undefined'
  ? true
  : new URLSearchParams(window.location.search).get('bossrelax') !== '0';
// 交戦判定のヒステリシス用に前フレームの結果を保持する。距離だけから毎フレーム再計算するので、
// ラン跨ぎで残っても最悪1フレーム余分に交戦中と見なすだけ(実害なし)。
let bossRelaxPrev = false;
// 社長指示2026-08-22「城ボス倒したあと、10秒はリラックスのままで」: 最後に交戦中だったゲーム内時刻。
// 施設ロック(facilitiesLocked)と同型の尾(bossRelaxWithTail・10秒)を張るために持ち回る。
// ラン跨ぎ(gameTimeが0へ戻る)はbossRelaxWithTail側のnow<lastTrueAtガードで無効化される。
let bossRelaxLastTrueAt = 0;
// ★バグ修正2026-08-22: 上の2つは**モジュールスコープ**なので出撃をまたいでも残る。
// `bossRelaxWithTail` の `now >= lastTrueAt` ガードは「gameTime が前ランの記録より小さい間」しか効かず、
// **ラン2で同じ時刻に到達すると前ランの記憶で10秒間リラックスになる**(実害: その10秒だけ湧きが静かになる)。
// resetGame から明示的に呼んで消す。
export const resetBossRelaxState = (): void => {
  bossRelaxPrev = false;
  bossRelaxLastTrueAt = 0;
};

// PACING_PUZZLE.md §7-11c(2): ランク床(決定済み仕様)。既定ON。?rankfloor=0で無効化(比較用)。
const RANK_FLOOR_ENABLED = typeof window === 'undefined'
  ? true
  : new URLSearchParams(window.location.search).get('rankfloor') !== '0';
// ?rankfloorpace=<倍率>(既定1・大きいほど床の上昇間隔が伸びる=遅くなる)。パースはrankFloor.ts側の
// 純関数(parseRankFloorPaceMult)に集約(異常値のフォールバックを1箇所にする)。
const RANK_FLOOR_PACE_MULT = typeof window === 'undefined'
  ? 1
  : parseRankFloorPaceMult(new URLSearchParams(window.location.search).get('rankfloorpace'));

// PACING_PUZZLE.md §5.17 M14: ランクの壁演出(銘打ちバナー+SE+年表記録/降格は静かに)。
// 旧経路(コマ境界の確定査定)・新経路(M50連続査定)の両方から呼ぶ共通処理として抽出したもの
// (中身は元のコマ切替ブロックのまま=挙動不変・移設のみ)。
function announceRankChange(prevRank: PuzzleRank, newRank: PuzzleRank): void {
  if (!WALL_ENABLED) return;
  // v0.25.3728(戦況ライン): HUDミラーへランクを書く(昇格/降格の変化時のみ)。
  useGameStore.setState(st => ({ hudDirector: { ...st.hudDirector, rank: newRank } }));
  if (newRank > prevRank) {
    useGameStore.setState(state => ({
      gameStats: { ...state.gameStats, maxRankReached: Math.max(state.gameStats.maxRankReached, newRank) },
    }));
    const st = useGameStore.getState();
    if (isFirstRankReach(st.wallMeta, newRank)) {
      const nextMeta = markSelfHighestRank(markRankReached(st.wallMeta, newRank), newRank);
      useGameStore.setState({ wallMeta: nextMeta });
    }
    // v0.25.2587(社長指示「ランクに数字入れてほしい」): 表示は rankLabel(=「ランク7 傲慢」)で統一。
    useGameStore.getState().enqueueWallEvent(
      'rank', `${rankLabel(newRank)} —— 到達`, WALL_RANK_NAMES_EN[newRank], '#ff6a55'
    );
    playSfx('rank-up'); // 専用ジングル(社長提供・v0.25.3666。旧: level-upの流用)
    recordChronicle(getSelectedStageId(), 'rank', String(newRank), `${rankLabel(newRank)}に到達`);
  } else if (newRank < prevRank) {
    useGameStore.getState().enqueueWallEvent(
      'rank', `${rankLabel(newRank)} —— 降格`, WALL_RANK_NAMES_EN[newRank], '#9ca3af'
    );
    playSfx('rank-down'); // 専用ジングル(社長提供・v0.25.3666。旧: 無音)
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
  // ★v0.25.3546(社長裁定「①の1は入れていい」): ピークの「赤い個体1体」をこのコマで出したか。
  peakRedSpawned: boolean;
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
  /**
   * 社長指示v0.25.3495「リラックスさせて」: AIディレクターのRELAXが持つ湧きレバーのうち
   * **湧き間隔(intervalMult)と盤面上限(capMult)**。従来この2本は旧スポーナー(!puzzleActiveNow)
   * だけが読んでおり、通常プレイでは一度も効いていなかった。省略時は1(=従来と完全に同じ挙動)
   * なので、既存のテスト・ヘッドレス経路には影響しない。
   */
  relaxIntervalMult?: number;
  relaxCapMult?: number;
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
  // v0.25.3495: RELAXの湧きレバー(間隔/上限)。未指定=1=従来どおり(下の cap/cdMs でだけ使う)。
  const relaxCadenceAdj = {
    intervalMult: ctx.relaxIntervalMult ?? 1,
    capMult: ctx.relaxCapMult ?? 1,
  };
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
  // ★ボス交戦中は湧きを強制リラックスへ落とす(社長裁定v0.25.2412)。
  // 方針: 「敵が多くて難易度を上げるのは不評」(ソウル系の多対一批判)。ボス戦の難しさは**ボスの技を
  // 読むこと**から来るべきで、雑魚の数から来るべきではない。判定は純関数 bossEngagedNow(dormant を見る)。
  // 裁定の内訳: ①コマ時計=凍結 / ②昇格=凍結(降格は据え置き) / ③対象=全ボス。
  // `?bossrelax=0` で従来挙動(コマどおりに湧く)へ戻る。
  // 距離も見る(社長指摘v0.25.2416): 起きたボスが遠くへ取り残されると、距離を見ないと**湧きが永久に
  // リラックスのまま**になる。ヒステリシス用に前フレームの判定を持ち回る(境界での振動防止)。
  const bossEngagedRaw = BOSS_RELAX_ENABLED && bossEngagedNow(
    useGameStore.getState().enemies,
    player.x + player.width / 2, player.y + player.height / 2,
    bossRelaxPrev,
  );
  bossRelaxPrev = bossEngagedRaw; // ヒステリシスに渡すのは**生の交戦判定**(尾を含めない)
  // ★社長指示2026-08-22「城ボス倒したあと、10秒はリラックスのままで」: 交戦終了から10秒は
  // リラックスを維持する(撃破/離脱は区別しない)。判定は施設ロックと同型の純関数へ切り出し済み。
  if (bossEngagedRaw) bossRelaxLastTrueAt = gameTime;
  const bossRelax = BOSS_RELAX_ENABLED && bossRelaxWithTail(bossEngagedRaw, bossRelaxLastTrueAt, gameTime);
  // PACING_PUZZLE.md §7-11c(2): ランク床(案A)。ステージ×経過msから現在の床を毎tick再計算し、
  // minRankへ焼く(査定側のapplyRankDeltaはstate.minRankを下限として読むので、降格もこれより下へは
  // 落ちない)。?rankfloor=0で無効化(常に1=床なし)。
  const rankFloorNow = RANK_FLOOR_ENABLED
    ? rankFloorForElapsed(getSelectedStageId() ?? '', gameTime, RANK_FLOOR_PACE_MULT)
    : 1;
  puzzleClockRef.current = { ...puzzleClockRef.current, minRank: rankFloorNow };
  const rankPaceResult = tickRankPace(rankPaceRef.current.state, {
    dtMs: deltaTime * 1000,
    killsThisFrame,
    msSinceLastHit,
    rank: puzzleClockRef.current.rank,
    r7Cap: puzzleClockRef.current.r7Cap,
    freezePromotion: bossRelax, // ②昇格凍結(降格=hitStreak は止めない)
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
  // 床が現在ランクより上に来たら引き上げる(査定イベントを待たない純粋な時間経過の底上げ。
  // 「圧は時間で必ず来る」=§7-11(4)の意図)。査定で既に床より上にいる場合は何もしない。
  if (puzzleClockRef.current.rank < rankFloorNow) {
    const prevRank = puzzleClockRef.current.rank;
    puzzleClockRef.current = { ...puzzleClockRef.current, rank: clampRank(rankFloorNow) };
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
    // §9-3: driller はpumpkin枠の実体化差し替え(帳簿はpumpkinのまま)。台本の「片付き」判定
    // (isScriptCleared)がpumpkin枠の生存を見誤らないよう、実体化されたdrillerもここで合算する。
    pumpkin: puzzleEnemiesNow.filter(e => isPumpkinTier(e.type)).length,
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
  // ①コマ時計の凍結(社長裁定v0.25.2412): ボス戦は4コマ周期の「幕間」として扱い、倒したら続きから
  // 再開する。上書き方式(kindだけ差し替え)だと戦闘中に周期が空回りして、ボス撃破直後にいきなり
  // ピークが来る等の事故になる。
  if (!bossRelax) koma.elapsedMs += deltaTime * 1000;
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
    // v0.25.3728(戦況ライン): HUDミラーへコマを書く(切替時のみ=約40秒に1回。毎フレームではない)。
    useGameStore.setState(st => ({ hudDirector: { ...st.hudDirector, koma: koma.kind } }));
    koma.elapsedMs = 0;
    koma.acc = createKomaAccumulator();
    koma.excitedThisKoma = false; // 興奮通信(v0.25.1845)はコマごとに再アーム
    koma.peakRedSpawned = false;  // ★ピークの赤い個体(v0.25.3546)もコマごとに再アーム
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
  const capRaw = capForState(puzzleClockRef.current);
  // 締め(§3-D・通常/ピーク限定): 無被弾15秒+(Perf>=0.6 or 盤面<目標が15秒継続)。緩め優先。
  const tightenedNow = inScriptKoma && !softenedNow
    && msSinceLastHit >= TIGHTEN_NO_HIT_MS
    && (directorRef.current.state.performance >= TIGHTEN_PERF_MIN || koma.belowTargetMs >= TIGHTEN_STARVE_MS);
  // ③湧きのパラメータだけ 'relax' として読む(コマ自体の kind は書き換えない=①の凍結と両立)。
  // リラックス = チャフ目標が上限の40% / 湧きCDがランク基準の2倍。**ゼロではない**ので、
  // 弾薬・回復のドロップ経路は細るだけで止まらない(長期戦で枯れない)。
  const spawnKoma = bossRelax ? 'relax' : koma.kind;
  // ★v0.25.3495(社長指示「リラックスさせて」): AIディレクターのRELAXが持つ湧きレバー2本
  // (湧き間隔/盤面上限)をここで初めて実際に効かせる。従来この2本は旧スポーナー
  // (!puzzleActiveNow)しか読んでおらず、通常プレイでは死んでいた(aiDirector.ts の
  // applyRelaxSpawnCadence のコメント参照)。未適用時は倍率1=式ごと恒等なので挙動不変。
  // bossRelax(ボス交戦中の強制リラックス)とは別レバーで、両方が同時に効いてよい
  // (あちらは spawnKoma を'relax'として読む=目標とCDの"段"を変える、こちらは倍率)。
  const cdRaw = cdForKoma(spawnKoma, rank, puzzleClockRef.current.r7Cap, tightenedNow, softenedNow);
  const cadence = applyRelaxSpawnCadence(capRaw, cdRaw, relaxCadenceAdj);
  const cap = cadence.cap;
  const cdMs = cadence.cdMs;
  let komaChaffTarget = chaffTargetForKoma(spawnKoma, cap);
  if (softenedNow) komaChaffTarget = softenedChaffTarget(komaChaffTarget);
  // PACING_PUZZLE.md §5.21-追補4(社長決定v0.25.1553): 追補3が足した「ゲート1中はchaff目標=
  // ピーク・CD0を強制」は撤回。ゲート1中もchaffは常にコマ駆動の値をそのまま使う=既存カーブ不変
  // (雑魚の湧き数はディレクター任せ)。
  koma.chaffRamp = stepChaffRamp(koma.chaffRamp, {
    dtMs: deltaTime * 1000,
    komaTarget: komaChaffTarget,
    rampIntervalMs: rampIntervalForKoma(spawnKoma, tightenedNow),
    holdIncrease: koma.kind !== 'harvest' && msSinceLastHit < 10000, // §3-A被弾ホールド(盛り演出のハーベストは対象外)
    // v0.25.3705(社長裁定①): ピークは目標を即スナップ=バナー「多数の変異体を検知」と圧の立ち上がりを
    // 一致させる(bossRelax中はspawnKomaが'relax'になるので自動的にスナップしない)。
    snapUp: spawnKoma === 'peak',
  });
  // 邪魔者/特別枠は通常・ピークのみ供給(緩コマは新規補充停止=在席は自然消化)。
  // v0.25.3177: 緩コマ(relax/harvest)は**ノルマ0**を渡すだけで新規投入が止まる(欠員判定が
  // 「出した数 < ノルマ」になったため)。在席ぶんの盤面枠は下の Math.max(ノルマ, 在籍数) が確保する
  // =旧 noNewSupplyNuisanceTarget と同じ結果。
  const nuisanceTargetCounts = inScriptKoma && koma.script
    ? nuisanceTarget(koma.script)
    : ZERO_NUISANCE;
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
    // ★v0.25.3177: 欠員は「この台本で出した数」で見る(生存数ではない)。倒す速さに関係なく
    // 台本どおりの並びになる=最後尾のパンプキンにも順番が回る。
    nuisanceSpawnedCounts: koma.scriptSpawned,
    specialElapsedMs: gameTime - puzzleCdRef.current.lastSpecialSpawnAt,
    area: areaForSpecial,
    aliveSpecial,
    msSinceLastHit,
    chaffWeights: chaffWeightsForKoma(spawnKoma),
    tieBreakRandom: Math.random(),
  });
  if (decision) {
    // ★v0.25.3546(社長裁定「①の1は入れていい」): ピークのコマの**最初のチャフ**を赤にする。
    // 追加で湧かせるのではなく既存の1体に色を乗せるだけなので、盤面数・湧きCD・バースト禁止(§0.5)
    // の規律には一切触れない。判定の理由と経緯は scriptPuzzle.ts の `peakRedTier` に集約してある。
    const forcedTier = peakRedTier(koma.kind, decision.slot, koma.peakRedSpawned);
    // PACING_PUZZLE.md §9-3①(台本nuisance枠の実体化): decision.type==='pumpkin' の時だけ
    // resolvePumpkinTier で実際に湧かせる型を差し替える。帳簿(scriptSpawned・下)は decision.type
    // (='pumpkin')のまま消化する=実体化のみの差し替え。
    const materializedType: EnemyType = decision.type === 'pumpkin'
      ? resolvePumpkinTier(allowDrillerForRun(getSelectedStageId(), isBossMakerRun() || isGauntletRun()))
      : decision.type;
    const puzzleEnemy = generateEnemy(
      gameTime, player, spawnBounds, materializedType, player.lastDirection, spawnViewOffsetY, snowTheme, spawnEsc,
      [], [], 1, false, [], undefined, forcedTier,
      // ★社長指示2026-08-23: ハーベストのコマは赤い個体を出さない(判定は noRedTierForKoma が正本)。
      // koma.kind で見る(spawnKomaではない)=peakRedTier/被弾ホールドと同じ基準に揃える。
      noRedTierForKoma(koma.kind),
    );
    if (forcedTier) koma.peakRedSpawned = true;
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
// BOT_AND_GHOST.md G1(プレイヤー実測)+ G2(ゴースト助っ人・デバッグ召喚)
// ============================================================================
// **意図的に runKomaBoardMaintenance とは別関数にしてある(重要な実装判断)**: そちらは
// `ctx.puzzleActiveNow===false` だと最初の行で即returnする。puzzleActiveNow は
// `phaseAt(gameTime).kind !== 'boss'` を含む式(useGameLoop.ts)で、これは「スケジュール上の
// ボスフェーズ時間帯」であって bossEngagedNow(実座標での交戦判定)とは別物。城ボス(giantbat)戦は
// まさにそのスケジュール上のボスフェーズ時間帯に起きることが多いため、bossRelax の計算に相乗りさせると
// **G1の計測とG2の召喚が城ボス戦で1度も発火しない**という実害のある穴になる(実装中に発見)。
// そのため bossEngagedNow をここでもう一度、puzzleActiveNowに関係なく毎tick呼ぶ(判定ロジックは
// 完全に同じ純関数を再利用=新しい交戦判定は発明していない。ヒステリシスの前回値だけ
// runKomaBoardMaintenance側のbossRelaxPrevとは別の変数で持つ=互いに干渉しない)。
let ghostBossEngagePrev = false;
// ボス戦テスト等で交戦開始がオンライン候補取得より早かった時だけ、同じ交戦の召喚を保留する。
// 召喚後はnullへ戻すため、守護霊が倒れても同じボスへ再召喚しない。
let pendingRemoteGhostSlot: string | null = null;
// v0.25.2577: ボスごと交戦時計のヒステリシス用(前tickで交戦中だったスロットキー集合)。
// ghostBossEngagePrevと同じくラン跨ぎの明示リセットは不要(敵が空の次tickで自然に空へ収束する)。
let engagedSlotKeysPrev = new Set<string>();

export interface GhostAndTraitsRefs {
  /** 召喚中ゴーストのプロファイル(6ノブ)。召喚時に1回だけ書き込み、解散まで固定して使う。 */
  ghostProfileRef: Ref<GhostProfile | null>;
}

export interface GhostAndTraitsCtx {
  gameTime: number;
  player: Player;
  /** `?ghost=1`(evParam('ghost')==='1')。開発用フラグ(G3以降、装備スキル「守護霊」でも召喚が有効になる)。 */
  ghostDebugEnabled: boolean;
}

export function runGhostAndTraitsStep(refs: GhostAndTraitsRefs, ctx: GhostAndTraitsCtx): void {
  const { gameTime, player, ghostDebugEnabled } = ctx;
  const state = useGameStore.getState();
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  const engagedNow = BOSS_RELAX_ENABLED && bossEngagedNow(state.enemies, pcx, pcy, ghostBossEngagePrev);
  const rising = engagedNow && !ghostBossEngagePrev;
  ghostBossEngagePrev = engagedNow;
  if (!engagedNow) pendingRemoteGhostSlot = null;

  const ghostActive = state.summons.some(s => s.kind === 'ghost-ally');
  // G3: このランでゴースト系を有効にするか = `?ghost=1`(開発用) OR 守護霊系を同行者に選択。
  // 同じ判定が計測停止(§2.7 制約1)にもそのまま使われる(ゴーストが出うるランは丸ごと測らない)。
  // SKILL_BUILD_REDESIGN.md §20(B4・配線全列挙): 同行者はplayer.skillsに入らない(§8点1)ため、
  // 判定はstate.companionSkill(gameStore.resetGameがこのランの実効値を確定させる)を読む
  // (player.skills経由の暗黙参照は廃止=旧実装はMAX_CARRY_SKILLS=0で常に空になり死んでいた経路)。
  const companionSkills: SkillKey[] = state.companionSkill ? [state.companionSkill] : [];
  const ghostRunActive = ghostRunEnabled(ghostDebugEnabled, companionSkills);

  // G1: 計測(純関数へ委譲。この関数自体はplayerTraitsが必要とする値をstoreから集めて渡すだけ)。
  tickPlayerTraits({
    inCombat: engagedNow,
    ghostActive,
    ghostRunActive,
    gameTime,
    player: {
      x: player.x, y: player.y, width: player.width, height: player.height,
      health: player.health, maxHealth: player.maxHealth,
      characterClass: player.characterClass, // v0.25.2467: プロファイルsrcClass(ゴーストの絵)用
      speed: player.speed, level: player.level, // v0.25.2468: 計測時ステータスの写し用
      // GHOST-CMD-2A(§2.18追補): カウンター成立直後の追撃窓(afterCounter文脈)の錨点。
      lastCounterSuccessTime: player.lastCounterSuccessTime,
      // ★§8(SAME_ARENA・間合いの癖): 「本人が近接を振った」の打刻。カウンター演出からは打たれない
      // 専用の打刻(meleeSwingAt ではなくこちら)なので、エッジ=本人の意思の振り。
      meleeSwingCommitAt: player.meleeSwingCommitAt,
    },
    // v0.25.2514(§2.11 裁定1): ビルド写し(武器/スキル/装備/クリ率/サブ)の元。写し取りはplayerTraits側の
    // 純関数(snapshotPlayerBuild)がボス交戦中のtickだけ行う=ここは本人オブジェクトを渡すだけ。
    buildSource: player,
    avatarId: state.avatarId, // v0.25.3271: 守護霊へのアバター記録(記録時に選択していたアバター)
    enemies: state.enemies,
    movementInput: state.inputState.up || state.inputState.down || state.inputState.left || state.inputState.right,
  });

  // v0.25.2577(社長裁定「ボスごとのタイムにはしたいな」): 撃破タイム用の**ボスごと**交戦時計。
  // ソロ台帳(notifyBossClear)と同行台帳(recordDuoBossClear)の両方がこの時計を読む(定義=交戦開始→
  // 撃破は不変・時計の単位だけスロットごとへ)。交戦判定はbossEngagedNowと同じENTER/EXITヒステリシスを
  // スロット単位に適用した純関数(engagedBossSlotKeys)。
  {
    const stageIdNow = getSelectedStageId();
    const prevEngagedKeys = engagedSlotKeysPrev;
    engagedSlotKeysPrev = engagedBossSlotKeys(
      state.enemies, pcx, pcy, engagedSlotKeysPrev, t => bossStyleSlotKey(t, stageIdNow),
    );
    // ★開幕の間合い調整ターン(社長指示2026-08-26「ボスと出会ってすぐに技出すの禁止。最初は3秒くらい
    // 自分の得意な間合いに調整しにいくターン」): 交戦の立ち上がり(このスロット集合の新規追加)で、
    // そのスロットに属するボス個体の技抽選を BOSS_OPENING_HOLD_MS(3秒)先へ押し出す。
    // - bossNextActionAt = 賞金首/裏ボス/天使/フィル/偶像の技抽選ゲート
    // - aiReadyAt = 城ボス(giantbat)の技抽選ゲート(v3032・bossNextActionAtは読まれない)
    // 移動(chase=間合い管理)は止めない=「得意な間合いへ調整しにいく」は各自の追跡挙動がそのまま担う。
    // 個体ごとに一度きり(bossOpeningHoldAt打刻)。ヒステリシス再進入では繰り返さない。
    {
      const risen = [...engagedSlotKeysPrev].filter(k => !prevEngagedKeys.has(k));
      if (risen.length > 0) {
        const risenSet = new Set(risen);
        useGameStore.setState(st2 => ({
          enemies: st2.enemies.map(e => {
            if (e.bossOpeningHoldAt !== undefined || e.dormant === true) return e;
            if (!isEngageableBoss(e.type)) return e;
            if (!risenSet.has(bossStyleSlotKey(e.type, stageIdNow))) return e;
            return {
              ...e,
              bossOpeningHoldAt: gameTime,
              bossNextActionAt: Math.max(e.bossNextActionAt ?? 0, gameTime + BOSS_OPENING_HOLD_MS),
              ...(e.type === 'giantbat' ? { aiReadyAt: Math.max(e.aiReadyAt ?? 0, gameTime + BOSS_OPENING_HOLD_MS) } : {}),
            };
          }),
        }));
      }
    }
    tickBossClocks(engagedSlotKeysPrev, gameTime);
    // ボスラッシュの解放記録(BOSS_MAKER.md §20-5・社長仕様「一度ステージで出会ったことがあれば解放」)。
    // ★ここが**全ボスを1箇所で拾える唯一の合流点**。`engagedBossSlotKeys` は休眠(dormant)を除外し
    // 距離のヒステリシス付きなので、「盤上に居た」ではなく**実際に近づいて戦い始めた**時だけ入る
    // (出現で記録すると、開始時点で盤上に居る idol が出撃しただけで解放されてしまう)。
    // 練習ラン/ボス戦テストでは記録しない・既に持っているキーだけなら書き込まない(関数側で判定)。
    markBossesEncountered(engagedSlotKeysPrev);
  }
  // §2.17(GHOST-DUO-RECORDS): 同行台帳側は「同行ランか」のフラグだけ預かる(時計は上の共有時計)。
  setDuoRunActive(ghostRunActive);

  // G2/G3: 召喚ゲート。`?ghost=1`(開発用・従来どおり) OR 守護霊装備(G3)のランだけ先へ進む。
  if (!ghostRunActive) return;

  const existingGhost = state.summons.find(s => s.kind === 'ghost-ally');
  if (existingGhost) {
    // 解散条件①: 紐付いたボスが居なくなった(撃破/画面外リサイクル等で enemies から消えた)。
    // 解散条件②(HP0)は damageSummon が既に summons から取り除いている=ここでは見なくてよい。
    const boundBossAlive = state.enemies.some(e => e.id === existingGhost.ghostBossId);
    if (!boundBossAlive && existingGhost.ghostDepartureStartedAt === undefined) {
      const face = existingGhost.ghostFacing === -1 ? -1 : 1;
      useGameStore.setState(s => ({
        summons: s.summons.map(su => su.id === existingGhost.id ? {
          ...su,
          ghostDepartureStartedAt: gameTime,
          ghostDepartureFromX: su.x,
          ghostDepartureFromY: su.y,
          ghostDepartureToX: su.x - face * RESCUE_ALLY_SPAWN_DIST,
          ghostDepartureToY: su.y,
          ghostLastShotAt: 0,
          ghostLastMeleeAt: 0,
          ghostCounterWindowEnd: 0,
        } : su),
      }));
      useGameStore.getState().enqueueNpcDialogue([{
        name: existingGhost.ghostName ?? '守護霊',
        text: existingGhost.ghostDepartureComment ?? GHOST_DEPARTURE_COMMENT_DEFAULT,
      }]);
    }
    return; // 同時1体(既に居るなら新規召喚はしない)
  }

  // ★社長指示2026-08-26「賞金首も出して守護霊」: **召喚だけ**賞金首を対象に加える(B-2裁定の更新)。
  // 台帳(ソロ/週間)・計測の除外(isGhostEligibleBoss)は据え置き=倒す義務のない相手を記録に混ぜない、は不変。
  // ★v0.25.3972(社長報告「アイドルに守護霊出てこない」): `ghostSummonedOnce` 未打刻の個体だけが対象。
  // 従来は交戦の**立ち上がりエッジ1tickだけ**が召喚機会で、その瞬間に前のボスの守護霊が退場アニメ中
  // (summonsにまだ居る)だと機会が食い潰され、その交戦では二度と召喚されなかった(ボス連戦・
  // ボスモードの連続出題で踏む)。個体ごとの1回旗に変えて「交戦中で未召喚なら毎tick試みる」へ堅牢化。
  // 「守護霊が倒れても同じボスへ再召喚しない」(既存意図)は同じ旗がそのまま保証する。
  const boss = state.enemies.find(e =>
    (isGhostEligibleBoss(e.type) || isBountyType(e.type)) && e.dormant !== true
    && e.ghostSummonedOnce !== true
    && Math.hypot((e.x + e.width / 2) - pcx, (e.y + e.height / 2) - pcy)
      <= bossEngagementDistancePx(e.type, false, e.isStoryBoss === true));
  if (!boss) return;

  // プロファイル未保存(初回)の場合は既定プロファイル(botSkillのcasual相当から変換)を使う。
  // G5(BOT_AND_GHOST.md §2.10 仕様5): 軸1プロファイルが有れば、紐付くボスのスロット(bossStyles)を
  // ノブ単位で優先合成する(effectiveGhostProfile。スロットが無い/そのノブがnullなら軸1へフォールバック)。
  const localSlot = bossStyleSlotKey(boss.type, getSelectedStageId());
  // SKILL_BUILD_REDESIGN.md §20(B4・配線全列挙): companionSkillsを唯一の出どころにする(上のghostRunActive
  // と同じ理由。player.skillsは同行者を含まない=旧実装のplayer.skills参照は死んでいた)。
  const requestedMode = selectedGhostMode(companionSkills);
  const onlineMode = requestedMode === 'random' || requestedMode === 'top';
  const pickPending = onlineMode && isGhostOnlinePickPending();
  if (rising && pickPending) {
    pendingRemoteGhostSlot = localSlot;
    return;
  }
  const delayedSummon = pendingRemoteGhostSlot === localSlot;
  // ★v0.25.3972: エッジ限定(旧: !rising && !delayedSummon で return)を撤廃。上の
  // ghostSummonedOnce 旗が「1個体1回」を保証するので、交戦中で未召喚なら毎tick召喚を試みる
  // (退場アニメ中の先客で機会が潰れない)。オンライン取得待ちだけは従来どおり保留する。
  if (delayedSummon && pickPending) return;
  if (!delayedSummon && onlineMode && pickPending) { pendingRemoteGhostSlot = localSlot; return; }
  pendingRemoteGhostSlot = null;
  const remoteCandidate = requestedMode === 'random' || requestedMode === 'top'
    ? resolveRemoteGhost(localSlot)
    : null;
  // 固定20人とオンライン実プレイヤーを候補人数比で同じ抽選母集団へ混ぜる。
  // 助っ人=固定20人+実候補全員 / 討伐者=ボス別4人+実候補の上位20%。
  const fixed = onlineMode && shouldPickFixedGuardian(requestedMode, remoteCandidate?.poolSize ?? 0)
    ? pickFixedGuardianForGhostMode(localSlot, requestedMode)
    : null;
  const remote = fixed ? null : remoteCandidate;
  const loadedProfile = loadPlayerProfile();
  const profile = remote
    ? effectiveGhostProfile(remote.profile, remote.slot)
    : fixed
      ? fixed.profile
      : loadedProfile
        ? effectiveGhostProfile(loadedProfile, localSlot)
        : defaultGhostProfile();
  const ghostSource = remote?.source ?? (fixed ? requestedMode : 'own');
  const localComments = ghostSource === 'own' ? loadGhostComments() : null;
  const arrivalComment = displayGhostComment(
    localComments?.arrivalComment ?? (profile as { arrivalComment?: unknown }).arrivalComment,
    GHOST_ARRIVAL_COMMENT_DEFAULT,
  );
  const departureComment = displayGhostComment(
    localComments?.departureComment ?? (profile as { departureComment?: unknown }).departureComment,
    GHOST_DEPARTURE_COMMENT_DEFAULT,
  );
  // 自分の守護霊/デバッグ、オンライン実プレイヤー、固定の先人守護霊のいずれかが実際に来た時だけ、
  // ボス個体ごとに1回×1.6。オンライン候補が無くても固定20人が来るため新2スキルも対価が成立する。
  const shouldBoostBoss = remote !== null || fixed !== null || requestedMode === 'own' || ghostDebugEnabled;
  if (shouldBoostBoss && !boss.ghostHpBoosted) {
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => e.id === boss.id
        ? { ...e, health: e.health * GHOST_BOSS_HP_MULT, maxHealth: e.maxHealth * GHOST_BOSS_HP_MULT, ghostHpBoosted: true }
        : e),
    }));
  }
  // GHOST-SUBS-FINAL(v0.25.2563): ホーミングの「押す時間」= G4a計測(subStyles.homing)の平均。
  // 計測なし(旧プロファイル/未使用)は undefined のまま=消費側が満タン発射へフォールバックする。
  const homingHoldMsAvg = subStyleHomingHoldMs((profile as { subStyles?: SubStyleProfile }).subStyles);
  refs.ghostProfileRef.current = homingHoldMsAvg === null
    ? profile
    : { ...profile, homingHoldMsAvg };

  // v0.25.2468(社長裁定「HPは計測時のHPを100%再現。HPというか全ステータスをそのまま再現」):
  // プロファイルの計測時スナップショット(maxHealth/speed/level)を100%使う。旧プロファイル等で
  // 無ければ召喚時の本人値へフォールバック(×0.6の減額=GHOST_HP_FRACは廃止)。
  // v0.25.2514(§2.11 裁定1): snapshotは「計測時ビルドの写し」(PlayerBuildSnapshot)へ拡張済み。
  // ステータス3項目の使い方は従来どおり。ビルド本体(武器/スキル/装備/クリ率/PHILL率)は
  // ghostBuild としてSummonへ載せ、攻撃計算側(useGameLoop/gameStore)が ghostBuild.ts で復元する。
  // (profileはGhostProfile(既定値)かPlayerProfile(保存済み)の合成=前者にsnapshotは無いので絞る)
  const snap = (profile as { snapshot?: PlayerBuildSnapshot }).snapshot;
  const arrivalToX = player.x - player.width - 16;
  const arrivalToY = player.y;
  const lastDir = player.lastDirection;
  const lastDirLen = lastDir ? Math.hypot(lastDir.x, lastDir.y) : 0;
  const arrivalDir = lastDirLen > 0.01
    ? { x: lastDir!.x / lastDirLen, y: lastDir!.y / lastDirLen }
    : { x: 0, y: 1 };
  const arrivalFromX = pcx - arrivalDir.x * RESCUE_ALLY_SPAWN_DIST - player.width / 2;
  const arrivalFromY = pcy - arrivalDir.y * RESCUE_ALLY_SPAWN_DIST - player.height / 2;
  const ghost: Summon = {
    id: `ghost-ally-${Date.now()}`,
    x: arrivalFromX, y: arrivalFromY, width: player.width, height: player.height,
    speed: snap?.speed ?? player.speed,
    health: snap?.maxHealth ?? player.maxHealth,
    maxHealth: snap?.maxHealth ?? player.maxHealth,
    damage: 0, // kind='ghost-ally'では不使用(実ダメージは都度ghostBuild=計測時ビルドから計算する)
    kind: 'ghost-ally',
    // v0.25.2514: 計測時ビルドの写しをそのまま搭載(欠損=旧プロファイルなら消費側が今の装備を借用)。
    ghostBuild: snap ?? undefined,
    reusedType: 'zombie', // 見た目未使用(pixiSceneがkind==='ghost-ally'を専用分岐で描く)
    level: snap?.level ?? player.level,
    createdAt: Date.now(),
    lastHit: 0,
    ghostBossId: boss.id,
    // v0.25.2467(社長指示): 絵=データ取得元のクラス。プロファイル未記録(旧データ/初回)は
    // ヘビーガンナー(warrior)を既定にする。
    ghostClass: (() => {
      const src = (profile as { srcClass?: string }).srcClass;
      return (src === 'mage' || src === 'warrior' || src === 'rogue' || src === 'necromancer') ? src : 'warrior';
    })(),
    // v0.25.2477(社長指示「守護霊にプレイヤーの名前を頭上に表示」): 名前=データ取得元のプレイヤー名
    // (プロファイルsrcName)。未記録(旧データ/初回)は現在の名前へフォールバック。将来オンラインで
    // 他人のゴーストが来た時は srcName が「その人の名前」になる構造(BOT_AND_GHOST.md §2.5 未決5)。
    // ★v0.25.2766(品質監査D-1): srcName は**必ず displayNameFrom を通す**。旧実装の
    // `srcName ?? loadPlayerName()` は**左辺が無検査**で、フィルタ導入前に保存された絵文字入り/
    // 双方向制御文字入り/長すぎる srcName がそのまま頭上へ描かれていた(浄化されるのは右辺だけ)。
    ghostName: displayNameFrom((profile as { srcName?: unknown }).srcName) ?? loadPlayerName(),
    ghostArrivalComment: arrivalComment,
    ghostDepartureComment: departureComment,
    // v0.25.2477: 現状はローカル完結=常に自分のプロファイル。オンラインで他人のゴーストを迎える時に
    // false を渡す前提の構造(頭上ラベルの「(自分)」添え字がこのフラグで消える)。
    ghostIsOwn: ghostSource === 'own',
    ghostFacing: arrivalToX < arrivalFromX ? -1 : 1,
    ghostArrivalStartedAt: gameTime,
    ghostArrivalFromX: arrivalFromX,
    ghostArrivalFromY: arrivalFromY,
    ghostArrivalToX: arrivalToX,
    ghostArrivalToY: arrivalToY,
    ghostLastShotAt: 0,
    ghostLastMeleeAt: 0,
  };
  // G3(§2.7 制約2): 「このランで一度でもゴーストが実際に召喚された」を打刻(resetGameでリセット)。
  // リザルトのスコア×0.5(resultScoring.ts GHOST_SCORE_MULT)がこのフラグを見る。
  // v0.25.2553(§2.15/§2.16 B): 同行守護霊のカード(持ち主名+ビルド)をラン単位で1回だけ控える。
  // リザルトが読むのはこの**不変の1枚**(summons配列を購読させない=React再描画規律)。
  useGameStore.setState(s => ({
    summons: [...s.summons, ghost],
    // ★v0.25.3972: この個体への召喚は1回きり(旗)。倒れても同じ個体へは再召喚しない(従来意図)。
    enemies: s.enemies.map(e => e.id === boss.id ? { ...e, ghostSummonedOnce: true } : e),
    ghostSummonedThisRun: true,
    ghostSourceThisRun: ghostSource,
    ghostFeedbackTargetThisRun: remote
      ? remoteGhostFeedbackTarget(remote.recordId)
      : fixed
        ? fixedGhostFeedbackTarget(fixed.id, localSlot)
        : null,
    ghostAlly: ghostAllySnapshot(ghost),
  }));
  useGameStore.getState().enqueueNpcDialogue([{
    name: ghost.ghostName ?? '守護霊',
    text: ghost.ghostArrivalComment ?? GHOST_ARRIVAL_COMMENT_DEFAULT,
  }]);
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
    spawnBounds, spawnViewOffsetY, snowTheme, spawnEsc, playerAreaIdx, enemyCap,
    labSpawnAggroRange,
    labVisited,
  } = ctx; // puzzleActiveNow は v0.25.3956 で未使用化(カリングは常に可視域外限定)。ctx型は互換のため残す

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
  // と同思想で、絶対最大引き(ZOOM_MIN_ABS)でも覆える倍率だけ常に外へ広げる(安全側=消えなくなるだけ)。
  const recycleZoomOverscan = (labTheme || indoor) ? 1 : 1 / ZOOM_MIN_ABS; // ★一番引いた時を基準に(v0.25.2412)
  const recycleHalfW = (gameBounds.width / 2) * recycleZoomOverscan + OFFSCREEN_RECYCLE_MARGIN;
  const recycleHalfH = (gameBounds.height / 2) * recycleZoomOverscan + OFFSCREEN_RECYCLE_MARGIN;
  let recycledAnyEnemy = false;
  const recycledEnemies = currentEnemiesForRecycle.map(enemy => {
    // 裏ボスは距離リサイクル(ワープ先回り)対象外。専用コントローラが帰巣/再生を独自に管理する。
    if (isHiddenBoss(enemy.type)) return enemy;
    // §6.38 B1.5-6(賞金首): isEngageableBoss経由の暗黙相乗り(下の行)に任せず、明示条件として
    // 独立させる(v6 B①「専用条件を追加」を実際に追加=isEngageableBossの構成が将来変わっても
    // 賞金首の除外だけは独立して残る・専用コントローラbountyTick.tsが帰巣/再生を管理する)。
    if (isBountyType(enemy.type)) return enemy;
    // v0.25.3060(社長報告「そもそもワープしてくるね これ」): **交戦ボス級は全員**距離リサイクル対象外。
    // 旧方針(v2418「一度起動すれば通常どおりリサイクル」)は、起きた城ボスが画面外(横≈730px)へ
    // 遅れた瞬間に画面端へ湧き直す=ワープで追いつく挙動で、①見た目のワープ ②プレイヤーとの距離が
    // 1500pxまで開かない=離脱(リーシュv3056)が永遠に発火しない、の両方の真因だった。
    // 遠くなったボスの後始末はリーシュ(1500px+1.2秒→待機→歩いて帰巣+回復)が正式に担う。
    if (isEngageableBoss(enemy.type)) return enemy;
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
    // ★v0.25.3956: 気絶中(クリのフィニッシュ受付)もリサイクルしない——気絶した敵を残して移動すると
    // 画面外でテレポート湧き直し(HP新品)=「消えた」ように見える(プラント消失の疑い筋②)。
    if (enemy.stunUntil !== undefined && gameTime < enemy.stunUntil) return enemy;
    // ノックバック中(カウンター等で吹き飛び中)はリサイクルしない。吹き飛んだ敵がリサイクル境界を越えた瞬間に
    // 別の湧き位置へテレポート湧き直し=「消えて違うところにリスポーン」していた(社長報告)。吹き飛ばし演出は
    // そのまま飛んで着地させ、瞬間移動だけ防ぐ。着地後(ノックバック終了後)に遠ければ通常どおりリサイクルされる。
    if (enemy.knockbackUntil !== undefined && enemy.knockbackUntil > Date.now()) return enemy;
    // ジャンプ/ダッシュ攻撃の実行中(jump=滞空移動 / charge=突進)はリサイクルしない。着地/突進先が
    // (溜め開始時のプレイヤー位置=移動で古くなり)リサイクル境界を越えると、実行中にテレポート湧き直し
    // =「急に画面から消える」原因になっていた(社長報告: パンプキンのジャンプ/カウンター時)。攻撃を完遂させ、
    // 終わって(aiPhase解除)から遠ければ通常どおりリサイクルする。
    if (enemy.aiPhase === 'jump' || enemy.aiPhase === 'charge') return enemy;
    // PACING_PUZZLE.md §9-8②(削岩型の突き3州): windup中にリサイクルで飛ばすとロック済みの赤帯だけが
    // 残る=「赤いのに当たらない」(絶対禁止)。pumpkinの aiPhase==='jump' 除外と同じ扱いで除外する。
    if (enemy.aiPhase === 'driller-thrust-windup' || enemy.aiPhase === 'driller-thrust-active' || enemy.aiPhase === 'driller-thrust-recover') return enemy;
    // M66(PACING_PUZZLE.md §6.26-11・stage-3 急降下): 城ボスが「本体が不在(無敵ではなく居ない)」を
    // 表現するため、windup中は実座標を意図的に場外(GIANT_DIVE_AWAY_OFFSET)へ退避させている。この
    // 汎用オフスクリーンリサイクルに捕まると「急に元の場所へワープして戻ってくる」= dive の演出が
    // 壊れるので、jump/chargeと同じ理由で対象外にする(windup終わりでstore側が着地座標へ戻す)。
    if (enemy.aiPhase === 'g-dive-windup') return enemy;
    const enemyCenterX = enemy.x + enemy.width / 2;
    const enemyCenterY = enemy.y + enemy.height / 2;
    // 矩形で「画面外送り」判定。半径ではなく辺基準で一律。
    // ★監査v0.25.3008(重大): 縦中心は**湧き帯と同じだけ北へずらす**(playerCenterY − spawnViewOffsetY)。
    // v2994〜のズーム連動カメラ下げ+縦先読みで湧き帯が最大~1000px北へ動くのに、回収窓が
    // プレイヤー中心のままだと、上辺に湧いた敵が次フレームで窓外=即回収の無限チャーン+
    // 画面上部に見えている敵が毎フレーム回収(HP新品でワープ)されていた。湧き窓⊆回収窓を復元する。
    const offRect = Math.abs(enemyCenterX - playerCenterX) > recycleHalfW
      || Math.abs(enemyCenterY - (playerCenterY - spawnViewOffsetY)) > recycleHalfH;
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
    // ★v0.25.3958(社長報告2026-08-26「動いてて突然消えちゃう敵もいる」「クリティカル解除されたら消えた」):
    // areaInvalid(現在エリアで重み0のタイプ)の強制回収は**画面内でも**発動していた——プレイヤーが
    // エリア境界をまたいだ瞬間、追ってきた敵が目の前で別の敵に湧き直る=「突然消える」。気絶(クリ)中は
    // v3956の保護で守られるが、**解除された次のフレーム**にこの経路で即消えていた(報告と一致)。
    // §5.7「画面内の敵は強制消去しない」の裁定に揃え、可視域(ズーム最大引き考慮)の外に出てから回収する。
    // エリア純度の仕組み自体は不変(視界から外れ次第、余白240pxを待たずに即回収)。ghostの例外化
    // (「割と消える」)と同根のバグの、タイプ個別対処ではない恒久版。
    const outsideView = Math.abs(enemyCenterX - playerCenterX) > recycleHalfW - OFFSCREEN_RECYCLE_MARGIN
      || Math.abs(enemyCenterY - (playerCenterY - spawnViewOffsetY)) > recycleHalfH - OFFSCREEN_RECYCLE_MARGIN;
    if ((!offRect && !(areaInvalid && outsideView)) || waveProtected) return enemy;
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
      if (!placed) { ENEMY_REMOVE_CAUSE.set(enemy.id, 'labNoPlace'); return null; } // 消失ログ用(v0.25.3958)
      replacement.x = placed.x;
      replacement.y = placed.y;
    } else if (SPAWN_CLAMP_ENABLED && useGameStore.getState().corridorMode) {
      // 洋館通路(corridorMode): リサイクル(再配置)も移動不可エリアへ出さない(社長指示v0.25.2391
      // 「ステージ2に限らず」)。新規湧き(useGameLoop.ts側)と同じ clampRectToPlayableArea を使う。
      // `?spawnclamp=0`で従来の挙動へ戻せる。
      const cs = useGameStore.getState();
      const placed = clampRectToPlayableArea(replacement.x, replacement.y, replacement.width, replacement.height, {
        farBackdrop: cs.farBackdrop,
        labTheme: false,
        corridorMode: true,
        m0AdvanceLimitX: null,
        corridorRunInActive: cs.corridorRunInActive,
      });
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
        // PACING_PUZZLE.md §9-7#6(削岩型): 距離リサイクル/個体使い回しで drillerRetreatUntil を
        // 必ずクリアする(他タイプには存在しないフィールドなので無害)。
        drillerRetreatUntil: undefined,
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
    const isProtected = (e: typeof currentEnemiesForCap[number]): boolean => isEnemyCapProtected(e, gameTime);
    // PACING_PUZZLE.md §5.7(M6追補2・実機バグ対処): パズルON時、査定でr7Cap/ランクが
    // 縮小して enemyCap が瞬時に下がっても、画面内の敵は消さない(仕様「在席は強制消去しない・
    // 自然消化」との矛盾=実バグだった)。cull候補を可視域外(リサイクルと同じ矩形・座標系=
    // CONTEXT_ZOOM_MIN のズーム引き考慮込み)に限定する。画面内の超過分は湧き停止+自然消化で
    // 収束させる。?puzzle=0時(puzzleActiveNow=false)は旧挙動(全敵が対象)のまま。
    const cullable = selectCullCandidates(
      currentEnemiesForCap,
      isProtected,
      // 監査v0.25.3008: リサイクル矩形と同じく縦中心を湧き帯ぶん北へ(可視域の実態に合わせる)。
      { centerX: playerCenterX, centerY: playerCenterY - spawnViewOffsetY, halfW: recycleHalfW, halfH: recycleHalfH },
      // ★社長報告2026-08-26「消えちゃう敵がいる。いまはプラントが消えた」(v0.25.3956):
      // 旧: restrictToOffscreen=puzzleActiveNow。**ボスフェーズ(7:00-7:30)や練習ランでは false**になり、
      // 上限超過時に**画面内の敵(遠い順)を消していた**=目の前の敵が突然消える。§5.7の規約
      // 「在席は強制消去しない・自然消化」はパズルON時に限る条件ではないので、常に可視域外に限定する
      // (?puzzle=0 の切り分け時だけ旧挙動が要るなら evParam を足す=今は不要と判断)。
      true
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
    } else if (e.type === 'driller') {
      // 検収監査#8(§9-7#1の取りこぼし): 削岩型の突き予告/発動も「危ないものが起きようとしている」に
      // 数える(pumpkinのjump/crouchと同格の扱い)。
      if (e.aiPhase === 'driller-thrust-active') dangerBias = Math.max(dangerBias, 1);
      else if (e.aiPhase === 'driller-thrust-windup') dangerBias = Math.max(dangerBias, 0.6);
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
      // 案0(v0.25.3530・社長指示「まず数字を画面に出す」): 戦力マージンとescalationも記録だけする。
      // useGameLoop側が毎フレーム publish した値を読むだけ(ここでは計算しない=式の出どころを1本に保つ)。
      ppMargin: getDirectorPower()?.margin,
      buildEsc: getDirectorPower()?.esc,
    });
  }
}
