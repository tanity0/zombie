// M9-A/B/C: ヘッドレスの「デバッグボット」駆動ループ(PACING_PUZZLE.md §5.10)。
// useGameLoop.ts の抽出済みディレクター配線(src/utils/directorTick.ts)+既存のヘッドレス
// ストアAPI(movePlayer/updateEnemies/fireWeapon等)を、Reactもレンダラも無しで固定16.6msステップ
// で回す。目的はデバッグ(バランス測定ではない)なのでボットは「変な動き」を優先する(playtestBot.ts)。
//
// 既知の意図的な簡略化(useGameLoop.tsの全景を再現しているわけではない。M9-Aで切り出したのは
// コマ管理/査定/decideNextSpawn消費/画面外リサイクル+上限カリング/AIディレクター信号だけで、
// ハンター・叫喚型ディレクター・レスキュー/紅き月/囲いイベント・関所ライブ補正・退屈上振れ等は
// useGameLoop.ts側に残っている~500行超のレガシー経路にあり、今回のヘッドレス化の対象外):
// M26 Step1(v0.25.1678)で「成長ループ」(ピックアップ回収→レベルアップ→自動強化選択)は接続済み。
// サブウェポンの自動使用は未接続(発火ロジックがuseGameLoopレガシー配線のため。M26 Step2以降で検討)。
// - puzzleActiveNow は常に true 固定(ボス/`?puzzle=0`のレガシー経路は検査対象外)。
// - confining(囲いイベント)/ae(アクティブイベント)は常に無し。rescueAttackers=0。
// - pressureOutdoor/boardDebtNow/upswingBonus/spawnEsc は0固定(関所ライブ補正・退屈上振れ・
//   難易度③escalationは未接続。導入automatic時のspawnEsc=0はゲームの「まだ何も盛られていない」
//   状態に相当し、安全側)。
// - labTheme/indoor/snowTheme は常にfalse(研究所/屋内/雪原ステージは対象外)。
// これらは「今の網に掛からないバグの種類」としてENGINEERING_NOTES.mdに記載する。

import {
  useGameStore, isKatanaMode, hasSkill, AMMO_MAX,
  skillCritMult, skillOutgoingDamageMult, skillComboMasterMult, sniperGunMult,
  CRIT_DAMAGE_MULT, BOSS_CRIT_DAMAGE_MULT, PUMPKIN_EXPLOSION_RADIUS, HUNTER_VISION_RANGE,
} from '../store/gameStore';
import { getActiveGun, getGuns, fireWeapon, ammoPoolFor, RANGE_BY_CATEGORY } from './weaponUtils';
import { pickAmmoDropType } from './ammoDrop';
import { isPlayerInAttackTelegraph } from './levelUpGate';
import { shouldTriggerGate1, entersGate1Penalty } from './gate1';
import { shouldTriggerGate2 } from './gate2';
import { detectWallBreach } from './wallProgress';
import { shouldTriggerViciousHunter, pickViciousSpawnPoint, VICIOUS_REARM_MS } from './viciousHunter';
import { runAngelBossTick, tickAngelBossFires, createAngelBossState, NOOP_ANGEL_SFX, type AngelBossState } from './angelBossTick';
import { GAME_SPEED } from '../config/gameSpeed';
import type { AmmoType } from '../types/game';
import { areaIndexForPos, isBossType, spawnEnemyAt, spawnEnemyAtWithTier, AREA_THRESHOLDS } from './enemyUtils';
import { checkProjectileEnemyCollisions, checkPlayerPickupCollisions } from './collisionUtils';
import { weaknessCritBonus } from './weaknessCrit';
import { applyEnemyCritPenalty } from './critPenalty';
import { phaseAt } from './difficultyDirector';
import { createPuzzleClockState, createKomaAccumulator, createSoftenState, clampRank } from './rankAssessor';
import { ZERO_NUISANCE, selectPattern, nuisanceTarget, type NuisanceType } from './scriptPuzzle';
import { createPinchState } from './pityDirector';
import { createDirectorState } from './aiDirector';
import {
  runPityUpkeep, runKomaBoardMaintenance, runOffscreenRecycleAndCull, runDirectorSignalStep,
  computeDirCountCap, computeEnemyCap,
  type KomaState, type PityUpkeepRefs, type KomaMaintenanceRefs, type DirectorSignalRefs,
} from './directorTick';
import {
  decideBotInput, pickupSeekInput, adjustBotForMines, decideCounterReaction, createCounterThreatState,
  type BotPersona, type RusherTrackState, type CounterThreatState,
} from './playtestBot';
import { pickUpgrade, mulberry32 } from './botUpgradePolicy';
import {
  applyPumpkinBlastDamage, applyEnemyFire, applyEnemyProjectileHits, applyMineDamage, applyContactDamage,
  NOOP_COMBAT_EFFECTS, type CombatTunables,
} from './combatTick';

const MAX_ENEMIES = 10; // useGameLoop.ts と同じ既定(コマ管理はcapForStateが実効上限を別途決める)

// M26 Step2(§6.2): ゲート1/2+凶悪ハンターのヘッドレス接続に使う定数(useGameLoop.tsのローカル定数と同値。
// useGameLoop.ts側を変えたらここも合わせる=COMBAT_TUNABLESと同じ流儀)。
const GATE_ARENA_RADIUS = 300;
const GATE_FAIL_KNOCKBACK_MARGIN = 400;
const ARENA_HORDE_DURATION_MS = 40000;
const GATE2_BOSS_DURATION_MS = 300000;
const ARENA_END_GRACE_MS = 600;
const EVENT_SPAWN_AGGRO_RANGE = 300;
const HUNTER_START_MS = 180000;

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
  // M26 Step1(§6.2): 成長ループ用。レベルアップ自動選択の決定的乱数(シード固定=同ラン再現可能)。
  growth: { rand: () => number };
  // M26 Step2(§6.2): ゲート1/2+凶悪ハンターのヘッドレス状態(useGameLoopの各refの写し)。
  gate: {
    areaZone: number;                 // -1=初回未採用(areaZoneRef相当)
    gate1Pending: boolean; gate2Pending: boolean;
    gate1Cleared: boolean; gate2Cleared: boolean;
    gate1DoneThisRun: boolean; gate1PassedThisRun: boolean;
    activeGate: 1 | 2 | null;
    hordeSpawned: number; hordeTotal: number; // gate1台本の全数即配置(誤終了ガード用)
    hunterRearmAt: number;                     // 凶悪ハンター撃破後の再アーム時刻
    hunterWasAlive: boolean;                   // 撃破検知(rearm計時)用
  };
  // M26 Step3(§6.2): 天使(ゲート2ボス)コントローラの状態(angelBossTick.ts=実プレイと共用)。
  angel: AngelBossState;
  // M37(§6.14): 人間反応のカウンター検知状態(ラン単位で1つ保持)。
  counterThreat: CounterThreatState;
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
    growth: { rand: mulberry32(1) },
    gate: {
      areaZone: -1,
      gate1Pending: false, gate2Pending: false,
      gate1Cleared: false, gate2Cleared: false,
      gate1DoneThisRun: false, gate1PassedThisRun: false,
      activeGate: null,
      hordeSpawned: 0, hordeTotal: 0,
      hunterRearmAt: 0,
      hunterWasAlive: false,
    },
    angel: createAngelBossState(),
    counterThreat: createCounterThreatState(),
  };
};

// M26 Step1(§6.2): プレイヤー弾→敵のヒット処理(ヘッドレス版)。useGameLoop.ts:6168-6560 の忠実ミニ版。
// 判定(checkProjectileEnemyCollisions)とダメージ式(crit/スキル倍率)・despawn則・キル時のXP/通貨ドロップは
// 実装と同じ。**Step0まではこれが無く「銃弾が敵に当たらない」=ヘッドレスのキルは全て近接だった**(kiterキル0の真因)。
// 意図的な省略(FX/SE/護衛セリフ/エリート武器箱/グレネード誘爆/反射弾プラント即死/トラップ根crit=ボットは
// トラップ未使用のため発生しない)。
const applyBotProjectileHits = (gameTime: number): void => {
  const s0 = useGameStore.getState();
  const collisions = checkProjectileEnemyCollisions(s0.projectiles, s0.enemies);
  for (const { projectileId, enemyId, damage, headshot } of collisions) {
    const st = useGameStore.getState();
    const enemy = st.enemies.find(e => e.id === enemyId);
    const projectile = st.projectiles.find(p => p.id === projectileId);
    if (!enemy || !projectile) continue; // 同フレーム内の先行ヒットで死亡/除去済み
    const isBoss = isBossType(enemy.type);
    const weakCrit = Math.random() < applyEnemyCritPenalty(weaknessCritBonus(enemy.type, 'gun'), enemy);
    const hitCrit = !!projectile.crit || weakCrit || headshot === true;
    const player = st.player;
    const critMult = hitCrit ? skillCritMult(player, isBoss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT) : 1;
    const comboMasterMult = skillComboMasterMult(player, gameTime, st.meleeFinishComboCount, st.meleeFinishComboUntil);
    const dmg = damage * critMult * skillOutgoingDamageMult(player) * sniperGunMult(player, enemy) * comboMasterMult;
    const killed = st.damageEnemy(enemyId, dmg, false, hitCrit);
    // despawn則(useGameLoop.ts:6507-6523と同じ): pierce=N発貫通 / passthrough=キルで停止 / それ以外=1発で消滅。
    const removeIt = projectile.pierce !== undefined
      ? projectile.hitEnemies.length > projectile.pierce
      : projectile.passthrough ? killed : true;
    if (removeIt) useGameStore.getState().removeProjectile(projectileId);
    if (killed) {
      const ex = enemy.x + enemy.width / 2, ey = enemy.y + enemy.height / 2;
      useGameStore.getState().dropEnemyCurrency(enemy, ex, ey);
      useGameStore.getState().dropEnemyXp(enemy, ex, ey, 'pickup-xp');
      // 弾薬ドロップ(useGameLoop.ts:6576-6607と同じ経済): キルごとに設定ドロップ率でロールし、
      // RE4式スマート弾種(残弾割合が最小の弾種)で落とす。これが無いと銃専ボットが恒久的に弾切れになる。
      const stKill = useGameStore.getState();
      const kp = stKill.player;
      const gunKillDropRate = Math.max(0, Math.min(1,
        stKill.meleeAmmoDropPercent / 100 + (kp.ammoDropBonus ?? 0) + (kp.equipBonus?.ammoDropBonus ?? 0)));
      if (!hasSkill(kp, 'knife-master') && Math.random() < gunKillDropRate) {
        const equippedAmmo = getActiveGun(kp)?.ammoType;
        const owned = stKill.player.weapons.filter(w => !w.isMelee).map(w => w.ammoType).filter((tt): tt is AmmoType => !!tt);
        const smartType = pickAmmoDropType(
          owned.map(tt => ({ type: tt, reserve: ammoPoolFor(kp, tt), max: AMMO_MAX[tt] })), equippedAmmo);
        const dropType = smartType ?? equippedAmmo ?? owned[0];
        if (dropType && dropType !== 'phill') {
          useGameStore.getState().addPickup({
            id: `pickup-ammo-${enemy.id}`,
            x: ex - 8 + 16, y: ey - 8,
            type: `ammo-${dropType}` as 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle',
            value: 0, worldDrop: true,
          });
        }
      }
    }
  }
};

// M26 Step2(§6.2): ゲート1/2の発火・終了+凶悪ハンターのヘッドレス接続。useGameLoop.tsのレガシー配線
// (区域クロス検知/ゲート発火/終了・失敗ノックバック/凶悪ハンター発生)の忠実ミニ版。
// **拘束(プレイヤーをサークル内に閉じ込める)は store.movePlayer 側にあるため beginArenaEvent を張るだけで効く。**
// **ハンターの移動も store.updateEnemies の徘徊接近AIが担う**(useGameLoopの状態機械=検知/増援/撤退は簡略化)。
// 省略: バナー/SE/年表/踏破(wallMeta)/ゲート1ペナルティのハンター即時再アーム/**gate2の天使AI(Step3で接続)**。
const zoneIdxOf = (dist: number): number => AREA_THRESHOLDS.filter(th => dist >= th).length;

const runGateAndHunterTick = (refs: PlaytestRefs, t: number): void => {
  const g = refs.gate;
  const p0 = useGameStore.getState().player;
  const pcx = p0.x + p0.width / 2, pcy = p0.y + p0.height / 2;
  const zoneIdx = zoneIdxOf(Math.hypot(pcx, pcy));

  // --- 区域クロス検知(areaZoneRef相当)+ゲート予約(useGameLoop区域ブロックの写し) ---
  if (g.areaZone === -1) {
    g.areaZone = zoneIdx; // 初回は黙って採用
  } else if (zoneIdx !== g.areaZone) {
    const prevZone = g.areaZone;
    g.areaZone = zoneIdx;
    if (g.activeGate === null) {
      const wallIdx = detectWallBreach(prevZone, zoneIdx);
      const gateBlocksThisWall = (wallIdx === 3 && !g.gate1Cleared) || (wallIdx === 4 && !g.gate2Cleared);
      if (wallIdx === 3 && !gateBlocksThisWall) g.gate1PassedThisRun = true; // 開放済み境界の素通り=通過
      if (entersGate1Penalty(wallIdx, g.gate1Cleared)) g.gate1Pending = true;
      else if (wallIdx === 4 && !g.gate2Cleared) g.gate2Pending = true;
    }
  }

  // --- 発火(activeEventが空いた瞬間・useGameLoopゲート発火ブロックの写し) ---
  if (!useGameStore.getState().activeEvent) {
    if (shouldTriggerGate1({ enabled: true, wallIdx: g.gate1Pending ? 3 : null, gate1Cleared: g.gate1Cleared, activeEventActive: false, doneThisRun: g.gate1DoneThisRun })) {
      g.gate1Pending = false;
      const pattern = selectPattern(clampRank(refs.koma.puzzleClockRef.current.rank + 1), new Set(), null, Math.random());
      const counts = nuisanceTarget(pattern);
      useGameStore.getState().beginArenaEvent({ kind: 'horde', x: pcx, y: pcy, radius: GATE_ARENA_RADIUS, startedAt: t, endsAt: t + ARENA_HORDE_DURATION_MS, permeable: true });
      let spawned = 0;
      (Object.keys(counts) as NuisanceType[]).forEach(type => {
        for (let i = 0; i < counts[type]; i++) {
          const ang = Math.random() * Math.PI * 2;
          const d0 = GATE_ARENA_RADIUS * (0.4 + Math.random() * 0.52);
          const e = spawnEnemyAtWithTier(type, pcx + Math.cos(ang) * d0 - 20, pcy + Math.sin(ang) * d0 - 20, t, 'red');
          e.fromEvent = true; e.dormant = true; e.aggroRange = EVENT_SPAWN_AGGRO_RANGE; e.vx = 0; e.vy = 0;
          useGameStore.getState().addEnemy(e);
          spawned++;
        }
      });
      g.hordeSpawned = spawned; g.hordeTotal = spawned;
      g.activeGate = 1;
    } else if (shouldTriggerGate2({ enabled: true, wallIdx: g.gate2Pending ? 4 : null, gate2Cleared: g.gate2Cleared, activeEventActive: false })) {
      g.gate2Pending = false;
      useGameStore.getState().beginArenaEvent({ kind: 'boss', x: pcx, y: pcy, radius: GATE_ARENA_RADIUS, startedAt: t, endsAt: t + GATE2_BOSS_DURATION_MS });
      // ヘッドレスのゲート2ボスは当面ミゲル固定(ステージ選択なし)。天使AI(angelBossTick.ts)は
      // M26 Step3で接続済み=実プレイと同じ周回/払い/弾3連で戦う(音のみNOOP)。
      const boss = spawnEnemyAt('miguel', pcx - 24, pcy - GATE_ARENA_RADIUS * 0.5 - 24, t);
      boss.fromEvent = true; boss.bossState = 'chase'; boss.bossNextActionAt = t + 2000;
      boss.homeX = pcx; boss.homeY = pcy;
      useGameStore.getState().addEnemy(boss);
      g.activeGate = 2;
    }
  }

  // --- 終了判定(useGameLoopアリーナ終了ブロックの写し) ---
  const ae = useGameStore.getState().activeEvent;
  if (ae && g.activeGate !== null) {
    const eventEnemies = useGameStore.getState().enemies.filter(e => e.fromEvent).length;
    const hordeSpawnDone = ae.kind !== 'horde' || g.hordeSpawned >= g.hordeTotal;
    const cleared = t - ae.startedAt > ARENA_END_GRACE_MS && eventEnemies === 0 && hordeSpawnDone;
    const timedOut = t >= ae.endsAt;
    if (cleared || timedOut) {
      if (cleared) {
        if (g.activeGate === 1) { g.gate1Cleared = true; g.gate1DoneThisRun = true; g.gate1PassedThisRun = true; }
        if (g.activeGate === 2) { g.gate2Cleared = true; }
      } else {
        // 失敗=境界の内側へ強制ノックバック(areaZoneも内側へ=再クロスで再発火のリトライループ)。
        const boundary = g.activeGate === 2 ? AREA_THRESHOLDS[3] : AREA_THRESHOLDS[2];
        const targetD = Math.max(0, boundary - GATE_FAIL_KNOCKBACK_MARGIN);
        const pl = useGameStore.getState().player;
        const kx = pl.x + pl.width / 2, ky = pl.y + pl.height / 2;
        const kd = Math.hypot(kx, ky) || 1;
        useGameStore.setState(st => ({ player: { ...st.player, x: (kx / kd) * targetD - st.player.width / 2, y: (ky / kd) * targetD - st.player.height / 2 } }));
        g.areaZone = zoneIdxOf(targetD);
      }
      g.activeGate = null;
      useGameStore.getState().endArenaEvent();
    }
  }

  // --- 凶悪ハンター(拠点0×デンジャー以深。判定=純関数、移動=storeの徘徊接近AI任せ) ---
  const hunterAlive = useGameStore.getState().enemies.some(e => e.type === 'hunter');
  if (g.hunterWasAlive && !hunterAlive) g.hunterRearmAt = t + VICIOUS_REARM_MS; // 撃破→短い再アーム
  g.hunterWasAlive = hunterAlive;
  refs.director.hunterRef.current.phase = hunterAlive ? 'chase' : 'idle'; // director信号(dangerBias)にも反映
  if (shouldTriggerViciousHunter({
    gameTime: t,
    hunterStartMs: HUNTER_START_MS,
    spawnBlocked: useGameStore.getState().activeEvent != null,
    hunterIdle: !hunterAlive,
    playerAreaIdx: zoneIdx,
    capturedBaseCount: useGameStore.getState().baseSites.filter(b => b.status === 'captured').length,
    viciousRearmAt: g.hunterRearmAt,
    gate1PassedThisRun: g.gate1PassedThisRun,
  })) {
    const sp = pickViciousSpawnPoint(pcx, pcy, HUNTER_VISION_RANGE);
    useGameStore.getState().addEnemy(spawnEnemyAt('hunter', sp.x - 20, sp.y - 20, t));
  }
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
  // M26 Step2: ゲート1/2+凶悪ハンターの接続。既定ON(通常のスモーク/フル計測)。特定シナリオ試験
  // (M17被ダメカナリア/M19深層ラッシュ=イベント無しのペーシング計測が目的)は false で切る。
  events?: boolean;
}

// 1tick分: ボット入力の合成→適用(移動/自動射撃/近接/武器切替)→物理更新→ディレクター配線。
export const runPlaytestTick = (refs: PlaytestRefs, opts: PlaytestTickOptions): void => {
  const { persona, tickIndex, wanderSeed, dt, rusherState } = opts;
  const store = useGameStore.getState();
  const t = store.gameTime + dt * 1000;
  store.setGameTime(t);

  const { player, enemies } = useGameStore.getState();
  // kiterの射程バンド用に現在の銃の実射程を渡す(M26 Step1)。銃なし/phillは既定値にフォールバック。
  const botGun = getActiveGun(player);
  const botGunRange = botGun && botGun.category !== 'phill'
    ? RANGE_BY_CATEGORY[botGun.category as keyof typeof RANGE_BY_CATEGORY]
    : undefined;
  const decision = decideBotInput(persona, player, enemies, t, tickIndex, wanderSeed, rusherState, botGunRange);
  // 手が空いているtickは近くのドロップ(XP/弾薬)を拾いに歩く(M26 Step1・stationaryは除外)。
  const moveInput = pickupSeekInput(persona, decision.input,
    player.x + player.width / 2, player.y + player.height / 2, useGameStore.getState().pickups);
  // M34(§6.11): 緑卵(地雷)を避ける/叩く(ボット入力のみの後段補正。ペルソナ判断+拾い歩きの後に合成)。
  const mineAdj = adjustBotForMines(
    moveInput, decision.wantsMelee,
    player.x + player.width / 2, player.y + player.height / 2,
    useGameStore.getState().breakableProps.filter(p => p.type === 'mine'),
  );
  // M37(§6.14): 人間反応のカウンター(ジャンプ/突進/敵弾を反応遅延+試行確率でカウンター)。
  // 移動入力は変えない=既存のwantsMelee判断(mine叩き込み)とOR合成するだけ。
  const wantsCounterReaction = decideCounterReaction(
    persona, refs.counterThreat,
    player.x + player.width / 2, player.y + player.height / 2,
    enemies, useGameStore.getState().projectiles, t, player.counterCooldownEnd,
  );
  useGameStore.getState().movePlayer(mineAdj.input, dt);
  autoFireGun();
  if (mineAdj.wantsMelee || wantsCounterReaction) useGameStore.getState().triggerCounter();
  if (decision.wantsWeaponSwitch) cycleActiveGun();

  useGameStore.getState().updateEnemies(dt);
  useGameStore.getState().updateProjectiles(dt);
  applyBotProjectileHits(t); // M26 Step1: プレイヤー弾→敵ヒット(これが無いと銃キルが一切発生しない)
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

  // M26 Step1(§6.2): 成長ループ接続。実プレイと同じ純関数(checkPlayerPickupCollisions)でピックアップを
  // 回収し(useGameLoopの回収配線のヘッドレス版)、レベルアップ演出(levelUpIntroUntil=Date.now基準・
  // フェイクタイマーでgameTimeに同期済み)の経過後にメニューを開き、選択肢を自動選択(決定的乱数)する。
  // サブウェポンの自動使用は未接続(useGameLoop側レガシー配線=既知の簡略化。ヘッダーの注記参照)。
  {
    const growth = useGameStore.getState();
    const pickupHits = checkPlayerPickupCollisions(growth.player, growth.pickups);
    pickupHits.forEach(id => useGameStore.getState().collectPickup(id));
    const introUntil = useGameStore.getState().levelUpIntroUntil;
    if (introUntil > 0 && Date.now() >= introUntil) {
      // useGameLoop.ts の intro→メニュー遷移(7878-7880)と同じ。
      useGameStore.setState({ showUpgradeMenu: true, isPaused: true, levelUpIntroUntil: 0 });
    }
    const menu = useGameStore.getState();
    if (menu.showUpgradeMenu && menu.upgradeOptions.length > 0) {
      menu.selectUpgrade(pickUpgrade(menu.upgradeOptions, refs.growth.rand));
    }
    // 保留レベルアップの再チェック(useGameLoop.ts:7894-7901の写し): 赤ライン当たり判定内でXPが
    // 閾値を跨いだ場合、イベント駆動のチェックだけでは取りこぼす=毎tick再チェックして発動させる。
    // (これが無いとテレグラフ中に閾値越え→以後XPを得てもlevelUpが呼ばれずLv1のまま、が起きる)
    const pend = useGameStore.getState();
    if (
      !pend.rhythm.active && !pend.showUpgradeMenu && pend.levelUpIntroUntil === 0 &&
      pend.player.experience >= pend.player.experienceToNextLevel &&
      !isPlayerInAttackTelegraph(pend.player, pend.enemies, PUMPKIN_EXPLOSION_RADIUS)
    ) {
      pend.levelUp();
    }
  }

  // M26 Step2(§6.2): ゲート1/2+凶悪ハンター(events===falseのシナリオ試験では切る)。
  // M26 Step3: 天使(ゲート2ボス)コントローラ+ジブリルのランタン火tick(実プレイと同じ抽出関数・音NOOP)。
  if (opts.events !== false) {
    runGateAndHunterTick(refs, t);
    runAngelBossTick(refs.angel, t, dt, GAME_SPEED, NOOP_ANGEL_SFX, () => {});
    tickAngelBossFires(t, () => {});
  }

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
