// M9-A/B/C: ヘッドレスの「デバッグボット」駆動ループ(PACING_PUZZLE.md §5.10)。
// useGameLoop.ts の抽出済みディレクター配線(src/utils/directorTick.ts)+既存のヘッドレス
// ストアAPI(movePlayer/updateEnemies/fireWeapon等)を、Reactもレンダラも無しで固定16.6msステップ
// で回す。目的はデバッグ(バランス測定ではない)なのでボットは「変な動き」を優先する(playtestBot.ts)。
//
// 既知の意図的な簡略化(useGameLoop.tsの全景を再現しているわけではない。M9-Aで切り出したのは
// コマ管理/査定/decideNextSpawn消費/画面外リサイクル+上限カリング/AIディレクター信号だけで、
// ハンター・叫喚型ディレクター・レスキュー/紅き月/囲いイベント・関所ライブ補正・退屈上振れ等は
// useGameLoop.ts側に残っている~500行超のレガシー経路にあり、今回のヘッドレス化の対象外):
// - puzzleActiveNow は常に true 固定(ボス/`?puzzle=0`のレガシー経路は検査対象外)。
// - confining(囲いイベント)/ae(アクティブイベント)は常に無し。rescueAttackers=0。
// - pressureOutdoor/boardDebtNow/upswingBonus/spawnEsc は0固定(関所ライブ補正・退屈上振れ・
//   難易度③escalationは未接続。導入automatic時のspawnEsc=0はゲームの「まだ何も盛られていない」
//   状態に相当し、安全側)。
// - labTheme/indoor/snowTheme は常にfalse(研究所/屋内/雪原ステージは対象外)。
// これらは「今の網に掛からないバグの種類」としてENGINEERING_NOTES.mdに記載する。

import { useGameStore, isKatanaMode } from '../store/gameStore';
import { getActiveGun, getGuns, fireWeapon, RANGE_BY_CATEGORY } from './weaponUtils';
import { areaIndexForPos } from './enemyUtils';
import { phaseAt } from './difficultyDirector';
import { createPuzzleClockState, createKomaAccumulator, createSoftenState } from './rankAssessor';
import { ZERO_NUISANCE } from './scriptPuzzle';
import { createPinchState } from './pityDirector';
import { createDirectorState } from './aiDirector';
import {
  runPityUpkeep, runKomaBoardMaintenance, runOffscreenRecycleAndCull, runDirectorSignalStep,
  computeDirCountCap, computeEnemyCap,
  type KomaState, type PityUpkeepRefs, type KomaMaintenanceRefs, type DirectorSignalRefs,
} from './directorTick';
import { decideBotInput, type BotPersona, type RusherTrackState } from './playtestBot';
import {
  applyPumpkinBlastDamage, applyEnemyFire, applyEnemyProjectileHits, applyMineDamage, applyContactDamage,
  NOOP_COMBAT_EFFECTS, type CombatTunables,
} from './combatTick';

const MAX_ENEMIES = 10; // useGameLoop.ts と同じ既定(コマ管理はcapForStateが実効上限を別途決める)

// PACING_PUZZLE.md §5.18 M17: useGameLoop.ts側のローカル定数と同じ値(叩き台の演出専用チューニング・
// ヘッドレスでは全てno-opなので実行結果には影響しないが、シグネチャを揃えるために複製)。
// useGameLoop.ts側の値を変更した場合はここも合わせること。
const COMBAT_TUNABLES: CombatTunables = {
  thorOrbitDist: RANGE_BY_CATEGORY.handgun + 40, // THOR_ORBIT_MARGIN_PX
  thorCounterLeapMs: 260,
  grenadeBlastRadius: 92,
  grenadeBlastDamageMult: 0.62,
  counterReflectSlowMs: 560,
};

export interface PlaytestRefs {
  pity: PityUpkeepRefs;
  koma: KomaMaintenanceRefs;
  director: DirectorSignalRefs;
}

// useGameLoop.ts の useRef 初期値と同じ形(M9-A extraction時点のスナップショット)。
export const createPlaytestRefs = (): PlaytestRefs => {
  const komaState: KomaState = {
    kind: 'relax', elapsedMs: 0, script: null, scriptSpawned: { ...ZERO_NUISANCE }, seenIds: new Set(),
    lastPatternId: null, acc: createKomaAccumulator(), provisionalDelta: null, pendingFinalDelta: null,
    chaffRamp: { target: 1, msSinceRampMs: 0 }, belowTargetMs: 0,
  };
  const directorShared = { current: { state: createDirectorState(), prevHp: 0, prevKills: 0, nextSampleMs: 0 } };
  return {
    pity: {
      pinchRef: { current: createPinchState() },
      pityEventBlockUntilRef: { current: 0 },
    },
    koma: {
      puzzleKomaRef: { current: komaState },
      puzzleHitRef: { current: { prevHp: -1, lastHitAt: -1e9 } },
      puzzleClockRef: { current: createPuzzleClockState() },
      puzzleCdRef: { current: { lastBaseSpawnAt: 0, lastNuisanceSpawnAt: 0, lastSpecialSpawnAt: 0 } },
      puzzleSoftenRef: { current: createSoftenState() },
      directorRef: directorShared,
      namedFoeRef: { current: { lastAttemptAt: 0 } },
    },
    director: {
      directorRef: directorShared,
      hunterRef: { current: { phase: 'idle' } }, // ヘッドレスではハンター未実装=常にidle(dangerBiasへの寄与0)
      gatePressureRef: { current: { state: { pressure: 0 } } },
    },
  };
};

// 所持銃を巡回して次の武器へ切り替える(ボットの「武器切替」入力)。銃が1丁以下なら何もしない。
const cycleActiveGun = (): void => {
  const player = useGameStore.getState().player;
  const guns = getGuns(player);
  if (guns.length < 2) return;
  const activeGun = getActiveGun(player);
  const idx = activeGun ? guns.findIndex(g => g.id === activeGun.id) : -1;
  const next = guns[(idx + 1) % guns.length];
  useGameStore.getState().setActiveWeapon(next.id);
};

// useGameLoop.ts の自動射撃(3316行付近)と同じ呼び出し(PHILL銃の手動発砲・刀装備中の無射撃も同様に踏襲)。
const autoFireGun = (): void => {
  const { enemies } = useGameStore.getState();
  useGameStore.getState().tickReload();
  useGameStore.getState().autoSwitchIfDry();
  const postReloadPlayer = useGameStore.getState().player;
  const katanaActive = isKatanaMode(postReloadPlayer);
  const activeGun = getActiveGun(postReloadPlayer);
  if (!activeGun || katanaActive || activeGun.category === 'phill') return;
  const newProjectiles = fireWeapon(activeGun, postReloadPlayer, enemies);
  newProjectiles.forEach(p => useGameStore.getState().addProjectile(p));
};

export interface PlaytestTickOptions {
  persona: BotPersona;
  tickIndex: number;
  wanderSeed: number;
  dt: number; // seconds (固定16.6ms=1/60を想定)
  // PACING_PUZZLE.md §5.20 M19: rusherペルソナの詰まり検知用の外部状態(ラン単位で1つ作って
  // 毎tick同じ参照を渡す)。他ペルソナでは未使用。
  rusherState?: RusherTrackState;
}

// 1tick分: ボット入力の合成→適用(移動/自動射撃/近接/武器切替)→物理更新→ディレクター配線。
export const runPlaytestTick = (refs: PlaytestRefs, opts: PlaytestTickOptions): void => {
  const { persona, tickIndex, wanderSeed, dt, rusherState } = opts;
  const store = useGameStore.getState();
  const t = store.gameTime + dt * 1000;
  store.setGameTime(t);

  const { player, enemies } = useGameStore.getState();
  const decision = decideBotInput(persona, player, enemies, t, tickIndex, wanderSeed, rusherState);
  useGameStore.getState().movePlayer(decision.input, dt);
  autoFireGun();
  if (decision.wantsMelee) useGameStore.getState().triggerCounter();
  if (decision.wantsWeaponSwitch) cycleActiveGun();

  useGameStore.getState().updateEnemies(dt);
  useGameStore.getState().updateProjectiles(dt);
  if (useGameStore.getState().suppressionActive) useGameStore.getState().updateSuppression(dt);

  // PACING_PUZZLE.md §5.18 M17: 被ダメ5経路(src/utils/combatTick.ts)。useGameLoop.tsの実フレーム
  // 順序と同じ並び(⑤ジャンプ落下爆風→②敵発砲→③敵弾命中→④地雷→①敵接触)で呼ぶ。演出は全てno-op
  // (NOOP_COMBAT_EFFECTS)=判定条件はuseGameLoop.tsと完全に同じロジックのまま評価される。
  const combatNow = Date.now();
  const combatPlayer = useGameStore.getState().player;
  applyPumpkinBlastDamage(NOOP_COMBAT_EFFECTS, COMBAT_TUNABLES);
  applyEnemyFire(combatNow);
  applyEnemyProjectileHits(combatNow, combatPlayer, false, 0, t, NOOP_COMBAT_EFFECTS, COMBAT_TUNABLES);
  applyMineDamage(NOOP_COMBAT_EFFECTS);
  applyContactDamage(t, false, 0, NOOP_COMBAT_EFFECTS);

  const s = useGameStore.getState();
  const playerAreaIdx = areaIndexForPos(s.player.x, s.player.y);
  const gameBounds = s.gameBounds;
  const playerCenterX = s.player.x + s.player.width / 2;
  const playerCenterY = s.player.y + s.player.height / 2;

  // useGameLoop.ts と同じ順序: enemyCap は「このtickの冒頭で1回だけ」計算し(puzzleClockRefは
  // 前tickまでの値=既存の1フレーム遅延パターン)、査定(koma)更新の前後どちらにも同じ値を使う。
  const dirCountCap = computeDirCountCap(t, false, false, MAX_ENEMIES, { countCapBonus: 0 }, 0, 0);
  const enemyCap = computeEnemyCap(false, 20, null, dirCountCap, 0, true, refs.koma.puzzleClockRef.current);

  runPityUpkeep(refs.pity, {
    pityEnabled: true, player: s.player, enemyCap, deltaTime: dt, gameTime: t,
  });
  runKomaBoardMaintenance(refs.koma, {
    puzzleActiveNow: true, gameTime: t, deltaTime: dt, player: s.player, playerAreaIdx,
    spawnBounds: gameBounds, spawnViewOffsetY: 0, snowTheme: false, spawnEsc: 0,
  });
  runOffscreenRecycleAndCull({
    labTheme: false, indoor: false, gameBounds, player: s.player, playerCenterX, playerCenterY,
    gameTime: t, spawnBounds: gameBounds, spawnViewOffsetY: 0, snowTheme: false, spawnEsc: 0,
    playerAreaIdx, enemyCap, puzzleActiveNow: true, labSpawnAggroRange: 420,
  });
  runDirectorSignalStep(refs.director, {
    directorActive: true, deltaTime: dt, curPhaseKind: phaseAt(t).kind,
    pressureOutdoor: false, playerAreaIdx, boardDebtNow: 0, upswingBonus: 0,
  });
};
