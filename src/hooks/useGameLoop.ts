import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useGameStore,
  INVULN_MS,
  COUNTER_EXTEND_PER_HIT,
  STUN_DURATION_MS,
  CRIT_DAMAGE_MULT,
  BOSS_CRIT_DAMAGE_MULT,
  MINE_DAMAGE,
  isKatanaMode,
  subWeaponBlockedByKatana,
  katanaRange,
  KATANA_SLASH_INTERVAL_MS
} from '../store/gameStore';
import { rollWeaponKey } from '../utils/weaponDrop';
import type { AmmoType, Pickup, Projectile } from '../types/game';
import {
  checkCollision,
  checkProjectileEnemyCollisions,
  checkPlayerEnemyCollisions,
  checkPlayerPickupCollisions,
  checkProjectilePlayerCollisions
} from '../utils/collisionUtils';
import {
  createEnemyProjectile,
  generateEnemy,
  getEnemyFireProfile,
  getEnemySpawnCount,
  getEnemySpawnInterval,
  isBossType,
  spawnEnemyAt
} from '../utils/enemyUtils';
import { consumeDueWaves, newConsumedWaves } from '../utils/stageDirector';
import { fireWeapon, getActiveGun, getGuns } from '../utils/weaponUtils';
import { playSfx, playEnemyDeath } from '../audio/audioManager';
import { HUNTING_CHARGE_MS_BY_LEVEL } from '../config/hunting';

const GRENADE_WEAPON_KEY = 'rifle-t3';
const GRENADE_BLAST_RADIUS = 92;
const GRENADE_BLAST_DAMAGE_MULT = 0.62;
const HEAVY_GRENADE_COOLDOWN_MS = 5000;
const HEAVY_GRENADE_FUSE_MS = 2000;
const HEAVY_GRENADE_RADIUS = 66;
const HEAVY_GRENADE_DAMAGE = 42;
const HEAVY_GRENADE_SPEED = 118;
const HEAVY_GRENADE_KNOCKBACK_MULT = 3.6;
const MARKSMAN_TRAP_COOLDOWN_MS = 6500;
const MARKSMAN_TRAP_DURATION_MS = 9000;
const MARKSMAN_TRAP_STUN_MS = 3000;
const MARKSMAN_TRAP_CRIT_BONUS = 0.10;
const MARKSMAN_TRAP_RADIUS_BY_LEVEL = [0, 34, 42, 50];
const STRIKER_QUICK_MAG_COOLDOWN_BY_LEVEL = [0, 10000, 8000, 6000];
const STRIKER_QUICK_MAG_THROW_DISTANCE = 82;
const STRIKER_QUICK_MAG_THROW_MS = 360;
const DOG_PICKUP_COOLDOWN_BY_LEVEL = [0, 900, 760, 620];
const DOG_EMPTY_RETRY_MS = 260;
const DOG_FETCH_TARGET_RADIUS_BY_LEVEL = [0, 240, 310, 380];
const DOG_COLLECT_RADIUS_BY_LEVEL = [0, 48, 64, 80];
const DOG_COLLECT_BURST_LIMIT = 8;
const DOG_FETCH_PICKUP_MS = 330;
const DOG_FETCH_DURATION_MS = 620;
// デコイ: 進行方向へ投げる円盤型の弾迎撃装置。設置中0.5秒ごとに、射程内の
// 最も近い敵弾を1発だけ迎撃して消す(高速弾の取りこぼしは許容)。
const DECOY_COOLDOWN_MS = 10000;                  // 全Lv共通
const DECOY_DURATION_BY_LEVEL = [0, 5000, 6000, 7000]; // 設置持続(Lv1/2/3)
const DECOY_PULSE_MS = 500;                       // 迎撃間隔(全Lv共通)
const DECOY_THROW_DISTANCE = 78;                  // TODO(デコイ): 仮値。投げる距離
const DECOY_THROW_MS = 240;                       // TODO(デコイ): 仮値。着地までの時間
// TODO(デコイ): 仮値。射程(全Lv共通)。局所防御だが少し広め。距離は二乗比較。
// 旧150の約3倍。射程値はデコイ projectile の `area` に載せ、描画側と共有する。
const DECOY_RANGE = 450;
const DECOY_RANGE_SQ = DECOY_RANGE * DECOY_RANGE;
const GRENADE_SPREAD_BY_LEVEL: Record<number, number[]> = {
  1: [0],
  2: [-0.9, 0.9],
  3: [0, (Math.PI * 2) / 3, -(Math.PI * 2) / 3]
};
const MAX_ENEMIES = 10;
const WAVE_GRACE_MS = 10000;
const ENEMY_RECYCLE_DISTANCE_MULT = 0.86;
const PICKUP_HARD_CAP = 120;
const XP_PICKUP_KEEP_COUNT = 82;
const STRAP_PICKUP_KEEP_COUNT = 60;
const CASTLE_BOSS_SPAWN_MS = 5 * 60 * 1000;
const PLAYER_DEATH_SLOW_MS = 820;
const CASTLE_SPAWN_SLOW_MS = 900;
const HEAVY_GRENADE_EXPLOSION_EFFECT_MS = 440;
const COUNTER_REFLECT_SLOW_MS = 560;
const GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS = 440;

type DogFetchJob = {
  collectAt: number;
  finishAt: number;
  targetX: number;
  targetY: number;
  radius: number;
  collected: boolean;
};

export const useGameLoop = (onGameOver: () => void, options: { benchmarkMode?: boolean } = {}) => {
  const [fps, setFps] = useState(0);
  const benchmarkModeRef = useRef(Boolean(options.benchmarkMode));
  const frameRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const lastEnemySpawnRef = useRef(0);
  const fpsCounterRef = useRef({ frames: 0, lastCheck: 0 });
  // Scripted-wave consumption set; survives across frames within one run
  // and is reset whenever gameTime rolls back to ~0 (i.e. a fresh game).
  const consumedWavesRef = useRef(newConsumedWaves());
  const lastSeenGameTimeRef = useRef(0);
  // Air-dropped supply timer. Tracks the gameTime of the last map ammo drop
  // and the (randomized) wait until the next one, so resupply crates appear at
  // an irregular but bounded cadence.
  const lastAmmoDropRef = useRef(0);
  const nextAmmoDropDelayRef = useRef(0);
  // How many of the scripted supply weapon-crates have dropped this run.
  const cratesDroppedRef = useRef(0);
  const prevLevelRef = useRef(1);
  const prevCounterSuccessRef = useRef(0);
  const prevHealthRef = useRef(0);
  const gameOverTriggeredRef = useRef(false);
  const dogFetchRef = useRef<DogFetchJob | null>(null);
  // Katana auto-slash timer (gameTime-based so it pauses with the game).
  const lastKatanaSlashRef = useRef(0);
  // Decoy next-pulse time per decoy id (gameTime ms, so it pauses with the game).
  const decoyPulseRef = useRef<Map<string, number>>(new Map());
  
  // Game actions
  const movePlayer = useGameStore(state => state.movePlayer);
  const fireWeapons = useGameStore(state => state.fireWeapons);
  const updateEnemies = useGameStore(state => state.updateEnemies);
  const updateProjectiles = useGameStore(state => state.updateProjectiles);
  const addEnemy = useGameStore(state => state.addEnemy);
  const markCastleBossSpawned = useGameStore(state => state.markCastleBossSpawned);
  const damageEnemy = useGameStore(state => state.damageEnemy);
  const damagePlayer = useGameStore(state => state.damagePlayer);
  const removeProjectile = useGameStore(state => state.removeProjectile);
  const reflectProjectile = useGameStore(state => state.reflectProjectile);
  const addProjectile = useGameStore(state => state.addProjectile);
  const setSubWeaponCooldown = useGameStore(state => state.setSubWeaponCooldown);
  const performKatanaStrike = useGameStore(state => state.performKatanaStrike);
  const rootEnemy = useGameStore(state => state.rootEnemy);
  const updateHuntingCharge = useGameStore(state => state.updateHuntingCharge);
  const collectPickup = useGameStore(state => state.collectPickup);
  const addPickup = useGameStore(state => state.addPickup);
  const syncBreakableProps = useGameStore(state => state.syncBreakableProps);
  const damageBreakableProp = useGameStore(state => state.damageBreakableProp);
  const dropBreakablePropLoot = useGameStore(state => state.dropBreakablePropLoot);
  const autoSwitchIfDry = useGameStore(state => state.autoSwitchIfDry);
  const tickReload = useGameStore(state => state.tickReload);
  const setGameTime = useGameStore(state => state.setGameTime);
  const updateGameStats = useGameStore(state => state.updateGameStats);
  const setCameraPosition = useGameStore(state => state.setCameraPosition);
  const addMeleeFinishCombo = useGameStore(state => state.addMeleeFinishCombo);
  const spawnBurst = useGameStore(state => state.spawnBurst);
  const spawnDamageNumber = useGameStore(state => state.spawnDamageNumber);
  const spawnRing = useGameStore(state => state.spawnRing);
  const spawnFlash = useGameStore(state => state.spawnFlash);
  const spawnEffect = useGameStore(state => state.spawnEffect);
  const updateEffects = useGameStore(state => state.updateEffects);

  useEffect(() => {
    benchmarkModeRef.current = Boolean(options.benchmarkMode);
  }, [options.benchmarkMode]);

  const triggerPlayerDeath = useCallback((x: number, y: number) => {
    if (gameOverTriggeredRef.current) return;
    gameOverTriggeredRef.current = true;
    playSfx('player-damage');
    spawnFlash('rgba(127, 29, 29, 0.48)', 520);
    spawnRing(x, y, 8, 118, 'rgba(220,38,38,0.9)', 7, 620);
    spawnRing(x, y, 24, 168, 'rgba(127,29,29,0.66)', 4, 760);
    useGameStore.getState().spawnGlow(x, y, 96, 'rgba(220,38,38,', PLAYER_DEATH_SLOW_MS);
    useGameStore.getState().triggerTimeSlow(0.32, PLAYER_DEATH_SLOW_MS);
    spawnBurst(x, y, '#ef4444', 36);
    spawnBurst(x, y, '#7f1d1d', 22);
    window.setTimeout(onGameOver, 650);
  }, [onGameOver, spawnBurst, spawnFlash, spawnRing]);

  const spawnEggFluidSplash = useCallback((x: number, y: number, intensity = 1) => {
    const now = Date.now();
    const count = Math.round(30 * intensity);
    const colors = ['#a3e635', '#65a30d', '#15803d', '#052e16'];
    for (let i = 0; i < count; i++) {
      const upwardBias = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.92;
      const angle = Math.random() < 0.72 ? upwardBias : Math.random() * Math.PI * 2;
      const speed = 54 + Math.random() * 190 * intensity;
      const size = 1.6 + Math.random() * (2.6 + intensity);
      spawnEffect({
        kind: 'particle',
        id: `fx-egg-fluid-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.78,
        color: colors[i % colors.length],
        size,
        createdAt: now,
        duration: 420 + Math.random() * 260,
        drag: 3.4,
        liquid: true,
      });
    }
  }, [spawnEffect]);

  // Game loop
  useEffect(() => {
    const gameLoop = (timestamp: number) => {
      // The game can sit idle (tab in background, game-over screen, paused
      // mid-render, etc.) for arbitrary amounts of time. We must NOT pass
      // huge deltas into the simulation — they cause physics teleports
      // (every enemy slammed into the player, projectiles flying off the
      // map, gameTime jumping minutes). On the very first frame after a
      // (re)mount, lastFrameTimeRef is 0 and `timestamp - 0` is the entire
      // page-lifetime, which is the worst case. Establish the time origin
      // and skip the simulation step on that frame.
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = timestamp;
        frameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      const rawDelta = (timestamp - lastFrameTimeRef.current) / 1000;
      const baseDeltaTime = Math.min(0.05, rawDelta);
      lastFrameTimeRef.current = timestamp;

      // Hitstop: a melee finisher freezes the whole simulation for a beat. Keep
      // the time origin current so we don't get a giant delta when it lapses.
      const nowMs = Date.now();
      if (nowMs < useGameStore.getState().hitstopUntil) {
        frameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // Update FPS counter
      fpsCounterRef.current.frames++;
      if (timestamp - fpsCounterRef.current.lastCheck >= 1000) {
        setFps(fpsCounterRef.current.frames);
        fpsCounterRef.current.frames = 0;
        fpsCounterRef.current.lastCheck = timestamp;
      }
      
      // Skip updates if game is paused. Read fresh from the store (not the
      // captured closure) so a level-up / pause takes effect immediately even
      // before React re-runs this effect with the new value.
      if (!useGameStore.getState().isPaused) {
        const loopState = useGameStore.getState();
        const {
          gameTime,
          player,
          enemies,
          pickups,
          inputState,
          swipeDirection,
          gameBounds,
        } = loopState;
        const timeScale = nowMs < loopState.timeSlowUntil ? loopState.timeSlowScale : 1;
        const deltaTime = baseDeltaTime * timeScale;

        if (benchmarkModeRef.current) {
          const targetCameraX = player.x - gameBounds.width / 2 + player.width / 2;
          const targetCameraY = player.y - gameBounds.height / 2 + player.height / 2;
          setCameraPosition(targetCameraX, targetCameraY);
          updateEffects(deltaTime);
          frameRef.current = requestAnimationFrame(gameLoop);
          return;
        }

        // Update game time
        const newGameTime = gameTime + deltaTime * 1000;
        setGameTime(newGameTime);
        updateGameStats({ timeAlive: gameTime / 1000 });

        // Detect a fresh run (gameTime rewound to ~0) and reset scripted
        // wave consumption so the same player can re-fight the schedule.
        if (newGameTime < lastSeenGameTimeRef.current) {
          consumedWavesRef.current = newConsumedWaves();
          lastAmmoDropRef.current = 0;
          nextAmmoDropDelayRef.current = 0;
          cratesDroppedRef.current = 0;
        }
        lastSeenGameTimeRef.current = newGameTime;

        const castle = useGameStore.getState().castleEvent;
        if (!castle.bossSpawned && newGameTime >= CASTLE_BOSS_SPAWN_MS) {
          markCastleBossSpawned();
          const boss = spawnEnemyAt('giantbat', castle.x, castle.y, newGameTime);
          addEnemy(boss);
          spawnFlash('rgba(127,29,29,0.28)', 420);
          spawnRing(castle.x, castle.y, 18, 170, 'rgba(239,68,68,0.9)', 7, 720);
          spawnRing(castle.x, castle.y, 42, 260, 'rgba(127,29,29,0.62)', 4, 920);
          useGameStore.getState().spawnGlow(castle.x, castle.y, 150, 'rgba(239,68,68,', 900);
          useGameStore.getState().triggerTimeSlow(0.36, CASTLE_SPAWN_SLOW_MS);
          spawnBurst(castle.x, castle.y + 20, '#7f1d1d', 28);
        }

        // Update player invulnerability
        if (player.invulnerable && Date.now() - player.invulnerableTime > INVULN_MS) {
          useGameStore.setState(state => ({
            player: {
              ...state.player,
              invulnerable: false
            }
          }));
        }

        // Move player based on input or swipe direction
        movePlayer(inputState, deltaTime);

        const huntingInputActive =
          useGameStore.getState().touchActive ||
          swipeDirection !== null ||
          inputState.up ||
          inputState.down ||
          inputState.left ||
          inputState.right;
        const huntingPlayer = useGameStore.getState().player;
        const huntingLevel = Math.max(0, Math.min(3, huntingPlayer.subWeaponLevels['striker-hunting'] ?? 0));
        if (
          huntingPlayer.subWeapons.includes('striker-hunting') &&
          !subWeaponBlockedByKatana(huntingPlayer, 'striker-hunting') &&
          huntingLevel > 0 &&
          huntingInputActive
        ) {
          const startedAt = huntingPlayer.huntingChargeStartedAt > 0
            ? huntingPlayer.huntingChargeStartedAt
            : newGameTime;
          updateHuntingCharge(
            startedAt,
            huntingPlayer.huntingCharged ||
              newGameTime - startedAt >= HUNTING_CHARGE_MS_BY_LEVEL[huntingLevel]
          );
        } else if (!huntingPlayer.huntingCharged && huntingPlayer.huntingChargeStartedAt !== 0) {
          updateHuntingCharge(0, false);
        }

        // Infinite-world camera: center the player exactly.
        const targetCameraX = player.x - gameBounds.width / 2 + player.width / 2;
        const targetCameraY = player.y - gameBounds.height / 2 + player.height / 2;
        setCameraPosition(targetCameraX, targetCameraY);
        syncBreakableProps({ x: targetCameraX, y: targetCameraY }, gameBounds);
        
        // Complete any finished reload, then ensure the active gun is
        // shootable (reload it / swap off a fully-dry gun), then fire it.
        const reloadBeforeAutoSwitch = useGameStore.getState().player.reloadingWeaponId;
        tickReload();
        autoSwitchIfDry();
        const postReloadPlayer = useGameStore.getState().player;
        if (!reloadBeforeAutoSwitch && postReloadPlayer.reloadingWeaponId) {
          playSfx('reload');
        }
        // 刀装備中は銃の自動射撃を完全に止める(弾薬/リロード処理は通常どおり
        // 進むので、刀を外す実装が将来入っても副作用が残らない)。
        const katanaActive = isKatanaMode(postReloadPlayer);
        const activeGun = getActiveGun(postReloadPlayer);
        if (activeGun && !katanaActive) {
          const newProjectiles = fireWeapon(activeGun, postReloadPlayer, enemies);
          if (newProjectiles.length > 0) {
            if (activeGun.category === 'handgun') playSfx('handgun-fire');
            if (activeGun.category === 'shotgun') playSfx('shotgun-fire');
            if (activeGun.category === 'rifle') playSfx('rifle-fire');
            // Muzzle flash at the gun, pointed along the shot.
            const md = newProjectiles[0].direction;
            const mpx = postReloadPlayer.x + postReloadPlayer.width / 2 + md.x * 18;
            const mpy = postReloadPlayer.y + postReloadPlayer.height / 2 + md.y * 18;
            useGameStore.getState().spawnGlow(
              mpx, mpy, activeGun.category === 'shotgun' ? 22 : 15, 'rgba(255,238,170,', 90
            );
          }
          newProjectiles.forEach(proj => useGameStore.getState().addProjectile(proj));
        }

        // Katana auto-slash: the gun auto-fire idea in melee form. Targets the
        // nearest non-stunned enemy first (stunned fallback = finisher chance),
        // Hunting-Lv3-equivalent reach, one cut per interval. Guns and the
        // release knife sweep are disabled while the katana is owned.
        if (katanaActive) {
          if (gameTime < lastKatanaSlashRef.current) lastKatanaSlashRef.current = 0; // new run
          if (gameTime - lastKatanaSlashRef.current >= KATANA_SLASH_INTERVAL_MS) {
            const kp = useGameStore.getState().player;
            const kcx = kp.x + kp.width / 2;
            const kcy = kp.y + kp.height / 2;
            const kRange = katanaRange(kp);
            let best: { id: string; d2: number } | null = null;
            let bestStunned: { id: string; d2: number } | null = null;
            for (const e of useGameStore.getState().enemies) {
              if (e.type === 'reaper') continue;
              const dx = e.x + e.width / 2 - kcx;
              const dy = e.y + e.height / 2 - kcy;
              const d2 = dx * dx + dy * dy;
              if (d2 > kRange * kRange) continue;
              // 自動射撃と同じ優先順位: スタン中の敵は後回し(最後の手段)。
              const stunned = e.stunUntil !== undefined && gameTime < e.stunUntil;
              if (stunned) {
                if (!bestStunned || d2 < bestStunned.d2) bestStunned = { id: e.id, d2 };
              } else if (!best || d2 < best.d2) {
                best = { id: e.id, d2 };
              }
            }
            const target = best ?? bestStunned;
            if (target) {
              lastKatanaSlashRef.current = gameTime;
              // 近接フィニッシュは一閃のみ: オート斬撃はallowFinisher=false。
              const result = performKatanaStrike([target.id], 1, false);
              if (result.finish) playSfx('melee-finish');
              else if (result.hit) playSfx('slash-damage');
              if (result.killed > 0) playEnemyDeath();
            }
          }
        }

        // 刀装備中は他のサブウェポンを発動させない(許可制、現状すべて停止)。
        const subWeaponPlayer = useGameStore.getState().player;
        if (
          subWeaponPlayer.subWeapons.includes('heavy-grenade') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'heavy-grenade') &&
          gameTime >= (subWeaponPlayer.subWeaponCooldowns['heavy-grenade'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['heavy-grenade'] ?? 1));
          const pcx = subWeaponPlayer.x + subWeaponPlayer.width / 2;
          const pcy = subWeaponPlayer.y + subWeaponPlayer.height / 2;
          const target = useGameStore.getState().enemies
            .filter(e => e.type !== 'reaper')
            .map(e => ({
              enemy: e,
              dist: Math.hypot(e.x + e.width / 2 - pcx, e.y + e.height / 2 - pcy)
            }))
            .sort((a, b) => a.dist - b.dist)[0]?.enemy;
          const aimX = target ? target.x + target.width / 2 - pcx : subWeaponPlayer.lastDirection?.x ?? 1;
          const aimY = target ? target.y + target.height / 2 - pcy : subWeaponPlayer.lastDirection?.y ?? 0;
          const mag = Math.max(0.001, Math.hypot(aimX, aimY));
          const baseDir = { x: aimX / mag, y: aimY / mag };
          const angles = GRENADE_SPREAD_BY_LEVEL[level] ?? GRENADE_SPREAD_BY_LEVEL[1];
          angles.forEach((angle, index) => {
            const ca = Math.cos(angle);
            const sa = Math.sin(angle);
            addProjectile({
              id: `proj-heavy-grenade-${Date.now()}-${index}`,
              x: pcx - 7,
              y: pcy - 7,
              width: 14,
              height: 14,
              speed: HEAVY_GRENADE_SPEED,
              damage: HEAVY_GRENADE_DAMAGE,
              direction: { x: baseDir.x * ca - baseDir.y * sa, y: baseDir.x * sa + baseDir.y * ca },
              weaponType: 'grenade',
              weaponKey: 'sub-heavy-grenade',
              duration: HEAVY_GRENADE_FUSE_MS,
              createdAt: Date.now(),
              passthrough: false,
              hitEnemies: [],
              hostile: false,
              reflected: false
            });
          });
          setSubWeaponCooldown('heavy-grenade', gameTime + HEAVY_GRENADE_COOLDOWN_MS);
        }

        if (
          subWeaponPlayer.subWeapons.includes('marksman-trap') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'marksman-trap') &&
          gameTime >= (subWeaponPlayer.subWeaponCooldowns['marksman-trap'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['marksman-trap'] ?? 1));
          const pcx = subWeaponPlayer.x + subWeaponPlayer.width / 2;
          const pcy = subWeaponPlayer.y + subWeaponPlayer.height / 2;
          addProjectile({
            id: `proj-marksman-trap-${Date.now()}`,
            x: pcx - 8,
            y: pcy - 8,
            width: 16,
            height: 16,
            speed: 0,
            damage: 0,
            direction: { x: 0, y: 0 },
            weaponType: 'trap',
            weaponKey: 'sub-marksman-trap',
            duration: MARKSMAN_TRAP_DURATION_MS,
            createdAt: Date.now(),
            passthrough: false,
            hitEnemies: [],
            hostile: false,
            reflected: false,
            area: MARKSMAN_TRAP_RADIUS_BY_LEVEL[level],
            count: level
          });
          spawnRing(pcx, pcy, 4, MARKSMAN_TRAP_RADIUS_BY_LEVEL[level], 'rgba(56,189,248,0.46)', 2, 280);
          setSubWeaponCooldown('marksman-trap', gameTime + MARKSMAN_TRAP_COOLDOWN_MS);
        }

        if (
          subWeaponPlayer.subWeapons.includes('striker-quick-mag') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'striker-quick-mag') &&
          gameTime >= (subWeaponPlayer.subWeaponCooldowns['striker-quick-mag'] ?? 0) &&
          !useGameStore.getState().pickups.some(p => p.type === 'quick-magazine')
        ) {
          const active = getActiveGun(subWeaponPlayer);
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['striker-quick-mag'] ?? 1));
          const maxMag = active?.magSize != null ? active.magSize + subWeaponPlayer.magBonus : 0;
          const reserve = active?.ammoType === 'handgun'
            ? subWeaponPlayer.ammoHandgun
            : active?.ammoType === 'shotgun'
              ? subWeaponPlayer.ammoShotgun
              : active?.ammoType === 'rifle'
                ? subWeaponPlayer.ammoRifle
                : 0;
          if (active?.ammoType && (active.magazine ?? 0) < maxMag && reserve > 0) {
            const dir = subWeaponPlayer.lastDirection ?? { x: 1, y: 0 };
            const dirMag = Math.max(0.001, Math.hypot(dir.x, dir.y));
            const px = subWeaponPlayer.x + subWeaponPlayer.width / 2
              + (dir.x / dirMag) * STRIKER_QUICK_MAG_THROW_DISTANCE;
            const py = subWeaponPlayer.y + subWeaponPlayer.height / 2
              + (dir.y / dirMag) * STRIKER_QUICK_MAG_THROW_DISTANCE;
            const fromX = subWeaponPlayer.x + subWeaponPlayer.width / 2 - 8;
            const fromY = subWeaponPlayer.y + subWeaponPlayer.height / 2 - 8;
            addPickup({
              id: `pickup-quick-mag-${Date.now()}`,
              x: px - 8,
              y: py - 8,
              type: 'quick-magazine',
              value: 1,
              throwFromX: fromX,
              throwFromY: fromY,
              throwStartAt: Date.now(),
              throwDuration: STRIKER_QUICK_MAG_THROW_MS
            });
            spawnRing(fromX + 8, fromY + 8, 4, 18, 'rgba(203,213,225,0.72)', 2, 220);
            spawnRing(px, py, 4, 22, 'rgba(148,163,184,0.7)', 2, 260);
            spawnBurst(px, py, '#cbd5e1', 6);
            setSubWeaponCooldown(
              'striker-quick-mag',
              gameTime + STRIKER_QUICK_MAG_COOLDOWN_BY_LEVEL[level]
            );
          }
        }

        if (
          subWeaponPlayer.subWeapons.includes('dog') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'dog')
        ) {
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels.dog ?? 1));
          const dogReadyAt = subWeaponPlayer.subWeaponCooldowns.dog ?? gameTime;
          const nowMs = Date.now();
          const activeFetch = dogFetchRef.current;

          if (activeFetch) {
            if (!activeFetch.collected && nowMs >= activeFetch.collectAt) {
              const state = useGameStore.getState();
              const eligiblePickups = state.pickups
                .filter(p => p.type !== 'health' || state.player.health < state.player.maxHealth)
                .filter(p => {
                  if (
                    p.throwStartAt !== undefined &&
                    p.throwDuration !== undefined &&
                    nowMs - p.throwStartAt < p.throwDuration
                  ) {
                    return false;
                  }
                  const px = p.x + 8;
                  const py = p.y + 8;
                  return Math.hypot(px - activeFetch.targetX, py - activeFetch.targetY) <= activeFetch.radius;
                });

              if (eligiblePickups.length > 0) {
                const hasAmmoPickup = eligiblePickups.some(p =>
                  p.type === 'ammo-handgun' ||
                  p.type === 'ammo-shotgun' ||
                  p.type === 'ammo-rifle'
                );
                const hasWeaponPickup = eligiblePickups.some(p =>
                  p.type === 'weapon-drop' ||
                  p.type === 'weapon-crate'
                );
                const hasHealthPickup = eligiblePickups.some(p => p.type === 'health');
                const hasBombPickup = eligiblePickups.some(p => p.type === 'bomb');

                if (hasAmmoPickup) playSfx('ammo-pickup');
                else if (hasWeaponPickup) playSfx('weapon-pickup');
                else if (hasHealthPickup) playSfx('eat');
                else if (hasBombPickup) playSfx('bomb');
                else playSfx('pickup');

                spawnRing(activeFetch.targetX, activeFetch.targetY, 5, activeFetch.radius, 'rgba(203,213,225,0.34)', 2, 240);
                eligiblePickups.slice(0, DOG_COLLECT_BURST_LIMIT).forEach(p => {
                  spawnBurst(p.x + 8, p.y + 8, '#cbd5e1', p.type === 'strap' ? 3 : 5);
                });
                eligiblePickups.forEach(p => collectPickup(p.id));
              }
              activeFetch.collected = true;
            }

            if (nowMs >= activeFetch.finishAt) {
              dogFetchRef.current = null;
              setSubWeaponCooldown('dog', gameTime + DOG_PICKUP_COOLDOWN_BY_LEVEL[level]);
            }
          } else if (gameTime >= dogReadyAt) {
            const state = useGameStore.getState();
            const targetRadius = DOG_FETCH_TARGET_RADIUS_BY_LEVEL[level];
            const collectRadius = DOG_COLLECT_RADIUS_BY_LEVEL[level];
            const playerX = state.player.x + state.player.width / 2;
            const playerY = state.player.y + state.player.height / 2;
            const eligiblePickups = state.pickups
              .filter(p => p.type !== 'health' || state.player.health < state.player.maxHealth)
              .filter(p => {
                if (
                  p.throwStartAt !== undefined &&
                  p.throwDuration !== undefined &&
                  nowMs - p.throwStartAt < p.throwDuration
                ) {
                  return false;
                }
                const px = p.x + 8;
                const py = p.y + 8;
                return Math.hypot(px - playerX, py - playerY) <= targetRadius;
              })
              .sort((a: Pickup, b: Pickup) => {
                const ax = a.x + 8 - playerX;
                const ay = a.y + 8 - playerY;
                const bx = b.x + 8 - playerX;
                const by = b.y + 8 - playerY;
                return ax * ax + ay * ay - (bx * bx + by * by);
              });

            const target = eligiblePickups[0];
            if (target) {
              const targetX = target.x + 8;
              const targetY = target.y + 8;
              dogFetchRef.current = {
                collectAt: nowMs + DOG_FETCH_PICKUP_MS,
                finishAt: nowMs + DOG_FETCH_DURATION_MS,
                targetX,
                targetY,
                radius: collectRadius,
                collected: false,
              };
              spawnEffect({
                kind: 'dogFetch',
                id: `fx-dog-fetch-${Math.floor(nowMs)}-${target.id}`,
                fromX: playerX,
                fromY: playerY,
                targetX,
                targetY,
                toX: playerX,
                toY: playerY,
                createdAt: nowMs,
                pickupAt: nowMs + DOG_FETCH_PICKUP_MS,
                duration: DOG_FETCH_DURATION_MS
              });
            } else {
              setSubWeaponCooldown('dog', gameTime + DOG_EMPTY_RETRY_MS);
            }
          }
        } else {
          dogFetchRef.current = null;
        }

        // Decoy: 10秒ごとに進行方向へ円盤を投げる。設置中は0.5秒ごとに射程内の
        // 最も近い敵弾を1発だけ迎撃する(高速弾の取りこぼしは許容)。
        if (
          subWeaponPlayer.subWeapons.includes('decoy') &&
          !subWeaponBlockedByKatana(subWeaponPlayer, 'decoy') &&
          gameTime >= (subWeaponPlayer.subWeaponCooldowns['decoy'] ?? 0)
        ) {
          const level = Math.max(1, Math.min(3, subWeaponPlayer.subWeaponLevels['decoy'] ?? 1));
          const dir = subWeaponPlayer.lastDirection ?? { x: 1, y: 0 };
          const dmag = Math.max(0.001, Math.hypot(dir.x, dir.y));
          const ux = dir.x / dmag;
          const uy = dir.y / dmag;
          const nowMs = Date.now();
          // 同時設置は1個: 既存のデコイがあれば消す。
          for (const d of useGameStore.getState().projectiles.filter(p => p.weaponType === 'decoy')) {
            removeProjectile(d.id);
            decoyPulseRef.current.delete(d.id);
          }
          const size = 16;
          const pcx = subWeaponPlayer.x + subWeaponPlayer.width / 2;
          const pcy = subWeaponPlayer.y + subWeaponPlayer.height / 2;
          const decoyId = `proj-decoy-${nowMs}`;
          addProjectile({
            id: decoyId,
            x: pcx - size / 2,
            y: pcy - size / 2,
            width: size,
            height: size,
            speed: DECOY_THROW_DISTANCE / (DECOY_THROW_MS / 1000),
            damage: 0,
            direction: { x: ux, y: uy },
            weaponType: 'decoy',
            weaponKey: 'sub-decoy',
            duration: DECOY_THROW_MS + DECOY_DURATION_BY_LEVEL[level],
            createdAt: nowMs,
            passthrough: false,
            hitEnemies: [],
            hostile: false,
            reflected: false,
            decoyLandAt: nowMs + DECOY_THROW_MS,
            area: DECOY_RANGE, // 射程(描画のサークル半径と共有)
          });
          // 初回迎撃は着地の0.5秒後。
          decoyPulseRef.current.set(decoyId, gameTime + DECOY_THROW_MS + DECOY_PULSE_MS);
          spawnRing(pcx, pcy, 4, 18, 'rgba(56,189,248,0.6)', 2, 220);
          setSubWeaponCooldown('decoy', gameTime + DECOY_COOLDOWN_MS);
        }

        // デコイの迎撃パルス(設置中、0.5秒ごとに1発)。毎フレーム判定ではなく
        // パルス方式。距離は二乗比較。高速弾の取りこぼしは許容(swept判定なし)。
        {
          const dstate = useGameStore.getState();
          const decoys = dstate.projectiles.filter(p => p.weaponType === 'decoy');
          if (decoys.length === 0) {
            if (decoyPulseRef.current.size > 0) decoyPulseRef.current.clear();
          } else {
            const liveIds = new Set(decoys.map(d => d.id));
            for (const id of [...decoyPulseRef.current.keys()]) {
              if (!liveIds.has(id)) decoyPulseRef.current.delete(id);
            }
            for (const decoy of decoys) {
              const nextPulse = decoyPulseRef.current.get(decoy.id) ?? (gameTime + DECOY_PULSE_MS);
              if (gameTime < nextPulse) {
                decoyPulseRef.current.set(decoy.id, nextPulse);
                continue;
              }
              decoyPulseRef.current.set(decoy.id, gameTime + DECOY_PULSE_MS);
              const dcx = decoy.x + decoy.width / 2;
              const dcy = decoy.y + decoy.height / 2;
              let nearest: Projectile | null = null;
              let nearestD2 = DECOY_RANGE_SQ;
              for (const b of dstate.projectiles) {
                if (!b.hostile) continue; // 敵弾のみ。味方弾/プレイヤー弾には干渉しない。
                const bx = b.x + b.width / 2;
                const by = b.y + b.height / 2;
                const d2 = (bx - dcx) * (bx - dcx) + (by - dcy) * (by - dcy);
                if (d2 <= nearestD2) {
                  nearestD2 = d2;
                  nearest = b;
                }
              }
              if (nearest) {
                const bx = nearest.x + nearest.width / 2;
                const by = nearest.y + nearest.height / 2;
                // 短命のピクセルレーザー(デコイ→敵弾)。trail を流用。
                spawnEffect({
                  kind: 'trail',
                  id: `fx-decoy-laser-${Math.floor(Date.now())}-${nearest.id}`,
                  fromX: dcx,
                  fromY: dcy,
                  toX: bx,
                  toY: by,
                  color: 'rgba(125,211,252,0.95)',
                  createdAt: Date.now(),
                  duration: 140,
                });
                removeProjectile(nearest.id); // 敵弾を消すだけ(爆発・範囲なし)。
              }
            }
          }
        }

        // Update enemies
        updateEnemies(deltaTime);
        
        // Update projectiles
        updateProjectiles(deltaTime);

        const timedGrenades = useGameStore.getState().projectiles
          .filter(p => p.weaponType === 'grenade' && Date.now() - p.createdAt >= p.duration);
        for (const grenade of timedGrenades) {
          const gx = grenade.x + grenade.width / 2;
          const gy = grenade.y + grenade.height / 2;
          removeProjectile(grenade.id);
          playSfx('bomb');
          spawnRing(gx, gy, 8, HEAVY_GRENADE_RADIUS, 'rgba(251,146,60,0.82)', 4, HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
          spawnBurst(gx, gy, '#f97316', 20);
          spawnBurst(gx, gy, '#7f1d1d', 8);
          useGameStore.getState().spawnGlow(gx, gy, 50, 'rgba(251,146,60,', HEAVY_GRENADE_EXPLOSION_EFFECT_MS);
          for (const enemy of useGameStore.getState().enemies) {
            if (enemy.type === 'reaper') continue;
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            const dist = Math.hypot(ex - gx, ey - gy);
            if (dist > HEAVY_GRENADE_RADIUS) continue;
            const falloff = 1 - dist / HEAVY_GRENADE_RADIUS;
            const splashDamage = Math.max(1, Math.round(HEAVY_GRENADE_DAMAGE * (0.55 + falloff * 0.45)));
            const killed = damageEnemy(enemy.id, splashDamage);
            spawnDamageNumber(ex, enemy.y, splashDamage, false);
            spawnBurst(ex, ey, '#b91c1c', 4);
            if (
              !killed &&
              enemy.type !== 'giantbat' &&
              enemy.type !== 'pumpkin'
            ) {
              const norm = Math.max(0.001, dist);
              useGameStore.getState().knockbackEnemy(
                enemy.id,
                (ex - gx) / norm,
                (ey - gy) / norm,
                HEAVY_GRENADE_KNOCKBACK_MULT * (0.55 + falloff * 0.45)
              );
            }
            if (killed) {
              playEnemyDeath();
              addPickup({
                id: `pickup-xp-heavy-grenade-${enemy.id}`,
                x: ex - 8,
                y: ey - 8,
                type: 'experience',
                value: enemy.experienceValue
              });
            }
          }
        }

        const armedTraps = useGameStore.getState().projectiles.filter(p => p.weaponType === 'trap');
        for (const trap of armedTraps) {
          const tx = trap.x + trap.width / 2;
          const ty = trap.y + trap.height / 2;
          const radius = trap.area ?? MARKSMAN_TRAP_RADIUS_BY_LEVEL[1];
          const maxTargets = Math.max(1, trap.count ?? 1);
          const alreadyHit = new Set(trap.hitEnemies);
          const remainingTargets = maxTargets - alreadyHit.size;
          if (remainingTargets <= 0) {
            removeProjectile(trap.id);
            continue;
          }
          const targets = useGameStore.getState().enemies
            .filter(enemy => enemy.type !== 'reaper')
            .filter(enemy => !alreadyHit.has(enemy.id))
            .map(enemy => ({
              enemy,
              dist: Math.hypot(enemy.x + enemy.width / 2 - tx, enemy.y + enemy.height / 2 - ty)
            }))
            .filter(hit => hit.dist <= radius)
            .sort((a, b) => a.dist - b.dist)
            .slice(0, remainingTargets);
          if (targets.length === 0) continue;
          spawnRing(tx, ty, 8, radius + 12, 'rgba(56,189,248,0.9)', 3, 360);
          spawnBurst(tx, ty, '#38bdf8', 14);
          useGameStore.getState().spawnGlow(tx, ty, radius + 28, 'rgba(56,189,248,', 320);
          targets.forEach(({ enemy }) => {
            const ex = enemy.x + enemy.width / 2;
            const ey = enemy.y + enemy.height / 2;
            rootEnemy(enemy.id, gameTime + MARKSMAN_TRAP_STUN_MS);
            spawnRing(ex, ey, 5, 28, 'rgba(125,211,252,0.86)', 2, 260);
          });
          const nextHitEnemies = [...trap.hitEnemies, ...targets.map(({ enemy }) => enemy.id)];
          if (nextHitEnemies.length >= maxTargets) {
            removeProjectile(trap.id);
          } else {
            useGameStore.setState(state => ({
              projectiles: state.projectiles.map(p =>
                p.id === trap.id ? { ...p, hitEnemies: nextHitEnemies } : p
              )
            }));
          }
        }

        // Every enemy that has a fire profile periodically lobs a hostile
        // projectile at the player. Each type has its own cadence/range
        // so grunts shoot rarely and ranged/boss shoot often. We read the
        // enemies/player fresh from the store here because updateEnemies
        // just mutated them — the React closure values are one frame
        // stale, and a stale `lastShot` would have us refire on enemies
        // that already shot earlier in this very frame.
        const now = Date.now();
        const liveEnemies = useGameStore.getState().enemies;
        const livePlayer = useGameStore.getState().player;
        const liveGameTime = useGameStore.getState().gameTime;
        const firedIds: string[] = [];
        liveEnemies.forEach(enemy => {
          // Stunned enemies are frozen — they can't spit projectiles either.
          if (enemy.stunUntil !== undefined && liveGameTime < enemy.stunUntil) return;
          const profile = getEnemyFireProfile(enemy);
          if (!profile) return;
          if (now - enemy.lastShot < profile.interval) return;
          const dx = livePlayer.x - enemy.x;
          const dy = livePlayer.y - enemy.y;
          if (Math.hypot(dx, dy) > profile.range) return;

          addProjectile(createEnemyProjectile(enemy, livePlayer));
          firedIds.push(enemy.id);
        });
        if (firedIds.length > 0) {
          useGameStore.setState(state => ({
            enemies: state.enemies.map(e =>
              firedIds.includes(e.id) ? { ...e, lastShot: now } : e
            )
          }));
        }

        // Hostile projectiles vs player. If the counter window is currently
        // open (the player just lifted their finger / tapped Space), reflect
        // the bolt back at the firing enemy. Otherwise it does damage.
        const liveProjectiles = useGameStore.getState().projectiles;
        const incoming = checkProjectilePlayerCollisions(liveProjectiles, player);
        let reflectedAny = false;
        for (const proj of incoming) {
          const currentPlayer = useGameStore.getState().player;
          if (now <= currentPlayer.counterWindowEnd) {
            reflectProjectile(proj.id);
            reflectedAny = true;
            // Each successful reflect refreshes the window so a barrage
            // can be turned back fully. The cooldown still gates a NEW
            // counter trigger once the chain finally lapses.
            useGameStore.setState(state => ({
              player: {
                ...state.player,
                counterWindowEnd: Math.max(
                  state.player.counterWindowEnd,
                  now + COUNTER_EXTEND_PER_HIT
                ),
                lastCounterSuccessTime: now
              }
            }));
          } else {
            const wasVulnerable = !useGameStore.getState().player.invulnerable;
            const playerDied = damagePlayer(proj.damage);
            if (wasVulnerable) {
              playSfx('player-damage');
              spawnFlash('rgba(239,68,68,0.22)', 200);
            }
            removeProjectile(proj.id);
            spawnBurst(
              player.x + player.width / 2,
              player.y + player.height / 2,
              '#ef4444',
              5
            );
            if (playerDied) {
              triggerPlayerDeath(
                player.x + player.width / 2,
                player.y + player.height / 2
              );
            }
          }
        }
        // "Counter!" only when a bullet was actually reflected (once per frame).
        if (reflectedAny) {
          addMeleeFinishCombo(1);
          playSfx('counter');
          const pcx = player.x + player.width / 2;
          const pcy = player.y + player.height / 2;
          useGameStore.getState().spawnGlow(pcx, pcy, 78, 'rgba(56,189,248,', COUNTER_REFLECT_SLOW_MS);
          useGameStore.getState().triggerTimeSlow(0.34, COUNTER_REFLECT_SLOW_MS);
          spawnRing(pcx, pcy, 12, 110, 'rgba(56,189,248,0.9)', 3, COUNTER_REFLECT_SLOW_MS);
          spawnBurst(pcx, pcy, '#38bdf8', 14);
          useGameStore.getState().spawnCallout(pcx, pcy - 12, 'Counter!', '#38bdf8');
        }

        // Check for collisions between projectiles and enemies. Read fresh
        // after updateProjectiles/updateEnemies so bullets fired or moved this
        // frame can actually hit.
        const collisionState = useGameStore.getState();
        const collisionProjectiles = collisionState.projectiles;
        const collisionEnemies = collisionState.enemies;
        const projectileEnemyCollisions = checkProjectileEnemyCollisions(collisionProjectiles, collisionEnemies);
        const projectileHitCountsByEnemy = new Map<string, number>();
        for (const { enemyId } of projectileEnemyCollisions) {
          projectileHitCountsByEnemy.set(enemyId, (projectileHitCountsByEnemy.get(enemyId) ?? 0) + 1);
        }
        const projectilesRemovedThisFrame = new Set<string>();
        const grenadeExplodedThisFrame = new Set<string>();
        
        projectileEnemyCollisions.forEach(({ projectileId, enemyId, damage }) => {
          const enemyForFx = collisionEnemies.find(e => e.id === enemyId);
          const projectile = collisionProjectiles.find(p => p.id === projectileId);

          // Apply the crit multiplier at hit time: bosses take 5× on a crit,
          // normal enemies 1.5×. `damage` is the projectile's base damage.
          const isBoss = enemyForFx ? isBossType(enemyForFx.type) : false;
          const trapCritBonus =
            enemyForFx?.rootUntil !== undefined &&
            gameTime < enemyForFx.rootUntil &&
            Math.random() < MARKSMAN_TRAP_CRIT_BONUS;
          const hitCrit = !!projectile?.crit || trapCritBonus;
          const critMult = hitCrit
            ? (isBoss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT)
            : 1;
          const dmg = damage * critMult;
          const enemyKilled = damageEnemy(enemyId, dmg);
          playSfx(hitCrit ? 'headshot' : 'shot-damage');

          if (enemyForFx) {
            const hitX = enemyForFx.x + enemyForFx.width / 2;
            const hitY = enemyForFx.y + enemyForFx.height / 2;
            spawnBurst(hitX, hitY, '#b91c1c', hitCrit ? 8 : 5);
            spawnBurst(hitX, hitY, '#7f1d1d', hitCrit ? 4 : 2);
          }

          // Crit / headshot juice: gold shockwave + sparks + glow.
          if (hitCrit && enemyForFx) {
            const cex = enemyForFx.x + enemyForFx.width / 2;
            const cey = enemyForFx.y + enemyForFx.height / 2;
            spawnRing(cex, cey, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
            spawnBurst(cex, cey, '#fde047', 10);
            useGameStore.getState().spawnGlow(cex, cey, 34, 'rgba(253,224,71,', 240);
          }

          if (
            projectile?.weaponKey === GRENADE_WEAPON_KEY &&
            enemyForFx &&
            !grenadeExplodedThisFrame.has(projectileId)
          ) {
            grenadeExplodedThisFrame.add(projectileId);
            const blastX = enemyForFx.x + enemyForFx.width / 2;
            const blastY = enemyForFx.y + enemyForFx.height / 2;
            spawnRing(blastX, blastY, 10, GRENADE_BLAST_RADIUS, 'rgba(251,146,60,0.82)', 5, GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS);
            spawnBurst(blastX, blastY, '#f97316', 24);
            spawnBurst(blastX, blastY, '#7f1d1d', 10);
            useGameStore.getState().spawnGlow(blastX, blastY, 58, 'rgba(251,146,60,', GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS);

            const splashBase = dmg * GRENADE_BLAST_DAMAGE_MULT;
            for (const splashEnemy of useGameStore.getState().enemies) {
              if (splashEnemy.id === enemyId || splashEnemy.type === 'reaper') continue;
              const sx = splashEnemy.x + splashEnemy.width / 2;
              const sy = splashEnemy.y + splashEnemy.height / 2;
              const dist = Math.hypot(sx - blastX, sy - blastY);
              if (dist > GRENADE_BLAST_RADIUS) continue;
              const falloff = 1 - dist / GRENADE_BLAST_RADIUS;
              const splashDamage = Math.max(1, Math.round(splashBase * (0.55 + falloff * 0.45)));
              const splashKilled = damageEnemy(splashEnemy.id, splashDamage);
              spawnDamageNumber(sx, splashEnemy.y, splashDamage, hitCrit);
              spawnBurst(sx, sy, '#b91c1c', hitCrit ? 7 : 4);
              if (splashKilled) {
                playEnemyDeath();
                spawnBurst(sx, sy, '#dc2626', 12);
                useGameStore.getState().dropEnemyCurrency(splashEnemy, sx, sy);
                addPickup({
                  id: `pickup-xp-grenade-${splashEnemy.id}`,
                  x: sx - 8,
                  y: sy - 8,
                  type: 'experience',
                  value: splashEnemy.experienceValue
                });
              }
            }
          }

          // Floating damage number at the enemy's body. Reflected bolts and
          // crits both render in the gold "big hit" color.
          if (enemyForFx) {
            spawnDamageNumber(
              enemyForFx.x + enemyForFx.width / 2,
              enemyForFx.y,
              dmg,
              !!projectile?.reflected || hitCrit
            );
          }

          // Light knockback on every connecting bullet — staggers normal
          // enemies along the shot line. Heavies/bosses are immovable so they
          // don't get shoved around by chip damage.
          if (
            !enemyKilled && enemyForFx && projectile &&
            enemyForFx.type !== 'reaper' && enemyForFx.type !== 'giantbat' &&
            enemyForFx.type !== 'pumpkin'
          ) {
            const hitCount = projectileHitCountsByEnemy.get(enemyId) ?? 1;
            const pelletKnockback = projectile.weaponType === 'shotgun' ? 1.35 : 1;
            useGameStore.getState().knockbackEnemy(
              enemyId,
              projectile.direction.x,
              projectile.direction.y,
              Math.min(3, hitCount * pelletKnockback)
            );
          }

          // Crit that didn't outright kill → stun the target so it can be
          // executed with a melee finisher. Mark it with a brief yellow ring.
          if (hitCrit && !enemyKilled && enemyForFx) {
            useGameStore.getState().stunEnemy(enemyId, gameTime + STUN_DURATION_MS);
            spawnRing(
              enemyForFx.x + enemyForFx.width / 2,
              enemyForFx.y + enemyForFx.height / 2,
              6, 30, 'rgba(250, 204, 21, 0.9)', 2, 260
            );
          }

          // Despawn rules:
          //  - piercing N rounds (revolver): pass through anything until they've
          //    struck pierce+1 enemies, regardless of kills.
          //  - unlimited passthrough (sniper/grenade): stop on a kill.
          //  - everything else: stop on first hit.
          if (projectile) {
            const removeIt =
              projectile.weaponKey === GRENADE_WEAPON_KEY
                ? true
                : projectile.pierce !== undefined
                ? projectile.hitEnemies.length > projectile.pierce
                : projectile.passthrough
                  ? enemyKilled
                  : true;
            if (removeIt) removeProjectile(projectileId);
            if (removeIt) projectilesRemovedThisFrame.add(projectileId);
          }

          // If enemy was killed, spawn pickups. VS-style drop table:
          //   - always an XP gem; its `value` becomes the gem tier.
          //   - rare chicken (HP), magnet, bomb. Elites/giantbats roll richer.
          if (enemyKilled) {
            // Random zombie grunt on a gun/projectile kill. Melee finishers use
            // kill.mp3 instead (wired via the counter result); bomb clears use
            // the bomb sound, so they don't double up here.
            playEnemyDeath();
            const enemy = collisionEnemies.find(e => e.id === enemyId);
            if (enemy) {
              // Death splash: red burst so kills read as blood/hit impact.
              const ex = enemy.x + enemy.width / 2;
              const ey = enemy.y + enemy.height / 2;
              const bloodCount = enemy.type === 'pumpkin' || enemy.type === 'giantbat' ? 30 : 16;
              spawnBurst(
                ex,
                ey,
                '#dc2626',
                bloodCount
              );
              spawnBurst(ex, ey, '#7f1d1d', Math.max(6, Math.floor(bloodCount * 0.45)));
              spawnRing(ex, ey, 4, enemy.type === 'pumpkin' || enemy.type === 'giantbat' ? 38 : 24, 'rgba(185,28,28,0.72)', 3, 300);
              useGameStore.getState().dropEnemyCurrency(enemy, ex, ey);

              addPickup({
                id: `pickup-xp-${enemy.id}`,
                x: enemy.x + enemy.width / 2 - 8,
                y: enemy.y + enemy.height / 2 - 8,
                type: 'experience',
                value: enemy.experienceValue
              });
              const isElite = enemy.type === 'pumpkin' || enemy.type === 'giantbat';
              if (isElite) {
                // Mid-boss drop — a weapon crate. Picking it up opens it and
                // rolls a new gun (category & tier weighted by run time).
                addPickup({
                  id: `pickup-crate-${enemy.id}`,
                  x: enemy.x + enemy.width / 2 - 8,
                  y: enemy.y + enemy.height / 2 - 8 - 18,
                  type: 'weapon-crate',
                  value: 0,
                  worldDrop: true
                });
                spawnRing(
                  enemy.x + enemy.width / 2,
                  enemy.y + enemy.height / 2,
                  10, 80, 'rgba(96,165,250,0.7)', 3, 500
                );
              }
              // Ammo resupply: every kill rolls an ammo drop at the start-screen
              // drop rate, so the slider governs the whole ammo economy. (Before,
              // only melee kills dropped — but the gun lands most killing blows,
              // so the rate felt far lower than set.) Active gun's family.
              const gunKillDropRate = useGameStore.getState().meleeAmmoDropPercent / 100;
              if (Math.random() < gunKillDropRate) {
                const equippedAmmo = getActiveGun(player)?.ammoType;
                const owned = getGuns(player)
                  .map(w => w.ammoType)
                  .filter((t): t is AmmoType => !!t);
                const dropType = equippedAmmo ?? owned[0];
                if (dropType) {
                  addPickup({
                    id: `pickup-ammo-${enemy.id}`,
                    x: enemy.x + enemy.width / 2 - 8 + 16,
                    y: enemy.y + enemy.height / 2 - 8,
                    type: `ammo-${dropType}` as 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle',
                    value: 0,
                    worldDrop: true
                  });
                }
              }
              // Rare world weapon drop (~1%, elites a bit higher).
              if (Math.random() < (isElite ? 0.06 : 0.01)) {
                addPickup({
                  id: `pickup-weapon-${enemy.id}`,
                  x: enemy.x + enemy.width / 2 - 8,
                  y: enemy.y + enemy.height / 2 - 8 + 16,
                  type: 'weapon-drop',
                  value: 0,
                  weaponKey: rollWeaponKey(gameTime),
                  worldDrop: true
                });
              }
              const chickenChance = isElite ? 0.35 : 0.015;
              const magnetChance = isElite ? 0.15 : 0.004;
              const bombChance = isElite ? 0.1 : 0.002;
              if (Math.random() < chickenChance) {
                addPickup({
                  id: `pickup-chicken-${enemy.id}`,
                  x: enemy.x + enemy.width / 2 - 8,
                  y: enemy.y + enemy.height / 2 - 8 + 18,
                  type: 'health',
                  value: 30,
                  worldDrop: true
                });
              }
              if (Math.random() < magnetChance) {
                addPickup({
                  id: `pickup-magnet-${enemy.id}`,
                  x: enemy.x + enemy.width / 2 - 8 + 14,
                  y: enemy.y + enemy.height / 2 - 8,
                  type: 'magnet',
                  value: 0
                });
              }
              if (Math.random() < bombChance) {
                addPickup({
                  id: `pickup-bomb-${enemy.id}`,
                  x: enemy.x + enemy.width / 2 - 8 - 14,
                  y: enemy.y + enemy.height / 2 - 8,
                  type: 'bomb',
                  value: 0
                });
              }
            }
          }
        });

        // Projectiles can also break small environmental props such as torches.
        const propProjectiles = useGameStore.getState().projectiles;
        const liveProps = useGameStore.getState().breakableProps;
        for (const projectile of propProjectiles) {
          if (projectilesRemovedThisFrame.has(projectile.id)) continue;
          if (projectile.hostile || projectile.createdAt > now) continue;
          const hitProp = liveProps.find(prop => checkCollision(projectile, prop));
          if (!hitProp) continue;

          const broken = damageBreakableProp(hitProp.id, projectile.damage);
          removeProjectile(projectile.id);
          projectilesRemovedThisFrame.add(projectile.id);

          const fxX = hitProp.footX;
          const fxY = hitProp.footY - hitProp.height * 0.9;
          if (broken) {
            if (broken.type === 'mine') {
              spawnEggFluidSplash(fxX, fxY, 0.82);
            } else {
              spawnBurst(fxX, fxY, '#f97316', 20);
              spawnBurst(fxX, fxY, '#fde68a', 8);
              spawnRing(fxX, fxY, 6, 36, 'rgba(251,146,60,0.86)', 3, 340);
              useGameStore.getState().spawnGlow(fxX, fxY, 48, 'rgba(251,146,60,', 380);
              dropBreakablePropLoot(broken);
            }
          } else {
            spawnBurst(fxX, fxY, '#fbbf24', 5);
          }
        }

        // Insect eggs are passable traps: no loot, one hit to burst, but
        // stepping on one splashes corrosive green fluid and hurts the player.
        // The invulnerability window keeps a clustered patch from deleting the
        // whole HP bar at once.
        const currentPlayerForMine = useGameStore.getState().player;
        const mineHit = useGameStore.getState().breakableProps.find(prop =>
          prop.type === 'mine' && checkCollision(currentPlayerForMine, prop)
        );
        if (mineHit) {
          const broken = damageBreakableProp(mineHit.id, 999);
          const fxX = mineHit.footX;
          const fxY = mineHit.footY - mineHit.height * 0.5;
          spawnEggFluidSplash(fxX, fxY, 1.28);
          if (broken && !currentPlayerForMine.invulnerable) {
            const playerDied = damagePlayer(MINE_DAMAGE);
            playSfx('bomb');
            spawnFlash('rgba(239,68,68,0.18)', 180);
            if (playerDied) {
              triggerPlayerDeath(
                currentPlayerForMine.x + currentPlayerForMine.width / 2,
                currentPlayerForMine.y + currentPlayerForMine.height / 2
              );
            }
          }
        }
        
        // Check for collisions between player and enemies
        const playerEnemyCollisions = checkPlayerEnemyCollisions(player, enemies);
        
        playerEnemyCollisions.forEach(enemy => {
          const damageWasApplied = !player.invulnerable;
          const playerDied = damagePlayer(enemy.damage);
          if (damageWasApplied) {
            playSfx('player-damage');
            spawnFlash('rgba(239,68,68,0.22)', 200);
            spawnBurst(
              player.x + player.width / 2,
              player.y + player.height / 2,
              '#ef4444',
              6
            );
          }
          if (playerDied) {
            triggerPlayerDeath(
              player.x + player.width / 2,
              player.y + player.height / 2
            );
          }
        });
        
        // Check for collisions between player and pickups
        const pickupCollisions = checkPlayerPickupCollisions(player, pickups);

        if (pickupCollisions.length > 0) {
          const collidedPickups = pickupCollisions
            .map(pickupId => pickups.find(p => p.id === pickupId))
            .filter((pk): pk is NonNullable<typeof pk> => pk !== undefined);
          const hasAmmoPickup = collidedPickups.some(pk =>
            pk.type === 'ammo-handgun' ||
            pk.type === 'ammo-shotgun' ||
            pk.type === 'ammo-rifle'
          );
          const hasWeaponPickup = collidedPickups.some(pk =>
            pk.type === 'weapon-drop' ||
            pk.type === 'weapon-crate'
          );
          const hasHealthPickup = collidedPickups.some(pk => pk.type === 'health');
          const hasBombPickup = collidedPickups.some(pk => pk.type === 'bomb');
          const hasOtherPickup = collidedPickups.some(pk =>
            pk.type !== 'ammo-handgun' &&
            pk.type !== 'ammo-shotgun' &&
            pk.type !== 'ammo-rifle' &&
            pk.type !== 'weapon-drop' &&
            pk.type !== 'weapon-crate' &&
            pk.type !== 'health' &&
            pk.type !== 'bomb'
          );
          if (hasOtherPickup) playSfx('pickup');
          if (hasAmmoPickup) playSfx('ammo-pickup');
          if (hasWeaponPickup) playSfx('weapon-pickup');
          if (hasHealthPickup) playSfx('eat');   // meat / health
          if (hasBombPickup) playSfx('bomb');

          pickupCollisions.forEach(pickupId => {
            const pk = pickups.find(p => p.id === pickupId);
            if (pk) {
              // Pickup-specific feedback. Gems get a small color-coded
              // sparkle; heart/magnet/bomb get bolder bursts.
              switch (pk.type) {
                case 'experience': {
                  const color = pk.value >= 5 ? '#fecaca' : pk.value >= 2 ? '#a7f3d0' : '#bfdbfe';
                  const rgb = pk.value >= 5 ? '254,202,202' : pk.value >= 2 ? '167,243,208' : '191,219,254';
                  spawnBurst(pk.x + 8, pk.y + 8, color, pk.value >= 5 ? 10 : pk.value >= 2 ? 8 : 6);
                  spawnRing(pk.x + 8, pk.y + 8, 2, pk.value >= 5 ? 24 : 16, `rgba(${rgb},0.75)`, 2, 260);
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, pk.value >= 5 ? 24 : 16, `rgba(${rgb},`, 220);
                  break;
                }
                case 'health':
                  spawnBurst(pk.x + 8, pk.y + 8, '#fca5a5', 16);
                  spawnRing(
                    player.x + player.width / 2,
                    player.y + player.height / 2,
                    8, 36, 'rgba(248,113,113,0.7)', 3, 380
                  );
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, 30, 'rgba(248,113,113,', 280);
                  break;
                case 'magnet':
                  // Animate every gem flying to the player as a trail before
                  // they're swallowed in `collectPickup`.
                  useGameStore.getState().pickups
                    .filter(p => p.type === 'experience')
                    .forEach(g => {
                      spawnEffect({
                        kind: 'trail',
                        id: `fx-trail-${g.id}`,
                        fromX: g.x + 8, fromY: g.y + 8,
                        toX: player.x + player.width / 2,
                        toY: player.y + player.height / 2,
                        color: 'rgba(96,165,250,0.85)',
                        createdAt: Date.now(),
                        duration: 280
                      });
                    });
                  spawnRing(
                    player.x + player.width / 2,
                    player.y + player.height / 2,
                    8, 220, 'rgba(96,165,250,0.55)', 3, 320
                  );
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, 34, 'rgba(96,165,250,', 260);
                  break;
                case 'chest':
                  spawnFlash('rgba(252, 211, 77, 0.35)', 280);
                  spawnRing(
                    player.x + player.width / 2,
                    player.y + player.height / 2,
                    10, 140, 'rgba(252, 211, 77, 0.95)', 5, 460
                  );
                  spawnBurst(pk.x + 8, pk.y + 8, '#fde68a', 20);
                  break;
                case 'bomb':
                  spawnFlash('rgba(255,255,255,0.85)', 200);
                  spawnRing(
                    player.x + player.width / 2,
                    player.y + player.height / 2,
                    8, 700, 'rgba(253,224,71,0.85)', 6, 420
                  );
                  // Spawn a burst at every enemy slated to die
                  useGameStore.getState().enemies
                    .filter(e => e.type !== 'reaper')
                    .forEach(e => spawnBurst(
                      e.x + e.width / 2,
                      e.y + e.height / 2,
                      '#fde68a',
                      6
                    ));
                  break;
                case 'ammo-handgun':
                case 'ammo-shotgun':
                case 'ammo-rifle':
                  spawnBurst(pk.x + 8, pk.y + 8, '#fde68a', 10);
                  spawnRing(pk.x + 8, pk.y + 8, 3, 18, 'rgba(253,230,138,0.7)', 2, 280);
                  break;
                case 'weapon-drop':
                  spawnBurst(pk.x + 8, pk.y + 8, '#bfdbfe', 18);
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, 34, 'rgba(147,197,253,', 300);
                  spawnRing(
                    player.x + player.width / 2,
                    player.y + player.height / 2,
                    8, 60, 'rgba(147,197,253,0.85)', 3, 360
                  );
                  break;
                case 'weapon-crate':
                  spawnFlash('rgba(96,165,250,0.3)', 260);
                  spawnRing(
                    player.x + player.width / 2,
                    player.y + player.height / 2,
                    10, 120, 'rgba(96,165,250,0.9)', 5, 440
                  );
                  spawnBurst(pk.x + 8, pk.y + 8, '#bfdbfe', 18);
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, 42, 'rgba(191,219,254,', 340);
                  break;
                case 'quick-magazine':
                  playSfx('reload');
                  spawnBurst(pk.x + 8, pk.y + 8, '#cbd5e1', 10);
                  spawnRing(pk.x + 8, pk.y + 8, 3, 22, 'rgba(203,213,225,0.76)', 2, 260);
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, 28, 'rgba(203,213,225,', 240);
                  break;
                case 'strap':
                  spawnBurst(pk.x + 8, pk.y + 8, '#e5e7eb', 3);
                  if (pk.value > 1) {
                    useGameStore.getState().spawnAmmoNumber(player.x + player.width / 2, player.y - 6, pk.value);
                  }
                  break;
                case 'treasure':
                  spawnBurst(pk.x + 8, pk.y + 8, '#facc15', 18);
                  spawnRing(pk.x + 8, pk.y + 8, 4, 34, 'rgba(250,204,21,0.82)', 3, 320);
                  useGameStore.getState().spawnGlow(pk.x + 8, pk.y + 8, 38, 'rgba(250,204,21,', 340);
                  break;
              }
            }
            collectPickup(pickupId);
          });
        }
        
        // Continuous spawner — drip enemies onto the field from off-screen.
        const enemyCountBeforeSpawn = useGameStore.getState().enemies.length;
        if (
          enemyCountBeforeSpawn < MAX_ENEMIES &&
          timestamp - lastEnemySpawnRef.current > getEnemySpawnInterval(gameTime)
        ) {
          const spawnCount = Math.min(
            getEnemySpawnCount(gameTime),
            MAX_ENEMIES - enemyCountBeforeSpawn
          );
          let plantCount = useGameStore.getState().enemies
            .filter(e => e.type === 'plant').length;

          for (let i = 0; i < spawnCount; i++) {
            let enemy = generateEnemy(gameTime, player, gameBounds, undefined, player.lastDirection);
            // Hard cap of 2 live ranged plants — re-roll a plant pick into
            // something else once the field already has two, so ranged pressure
            // never piles up past "annoying".
            if (enemy.type === 'plant' && plantCount >= 2) {
              let tries = 0;
              while (enemy.type === 'plant' && tries < 6) {
                enemy = generateEnemy(gameTime, player, gameBounds, undefined, player.lastDirection);
                tries++;
              }
              if (enemy.type === 'plant') {
                enemy = generateEnemy(gameTime, player, gameBounds, 'skeleton', player.lastDirection);
              }
            }
            if (enemy.type === 'plant') plantCount += 1;
            addEnemy(enemy);
          }

          lastEnemySpawnRef.current = timestamp;
        }

        // Air-dropped ammo supplies (#3). At an irregular cadence a resupply
        // crate appears at a random spot just off-screen, so the player has to
        // break position to go fetch it — guided there by the VS-style edge
        // arrow the renderer draws for worldDrop pickups. Capped so the field
        // never clutters with crates. gameTime-based so pauses don't cheat it.
        const MAX_WORLD_AMMO_DROPS = 1;
        const worldAmmoCount = pickups.filter(
          p => p.worldDrop &&
            (p.type === 'ammo-handgun' || p.type === 'ammo-shotgun' || p.type === 'ammo-rifle')
        ).length;
        if (nextAmmoDropDelayRef.current === 0) {
          nextAmmoDropDelayRef.current = 50000 + Math.random() * 10000; // first drop ~50-60s in
        }
        if (
          worldAmmoCount < MAX_WORLD_AMMO_DROPS &&
          gameTime - lastAmmoDropRef.current > nextAmmoDropDelayRef.current
        ) {
          // Place it just beyond the viewport at a random bearing from the
          // player so it's always off-screen (and within ~1.6 screens away).
          const angle = Math.random() * Math.PI * 2;
          const halfMax = Math.max(gameBounds.width, gameBounds.height) / 2;
          const dist = halfMax * (1.1 + Math.random() * 0.5);
          const px = player.x + player.width / 2 + Math.cos(angle) * dist;
          const py = player.y + player.height / 2 + Math.sin(angle) * dist;
          // Only drop ammo for gun families the player owns, weighted toward
          // the active gun so the trek usually pays off.
          const owned = getGuns(player)
            .map(w => w.ammoType)
            .filter((t): t is AmmoType => !!t);
          const equippedAmmo = getActiveGun(player)?.ammoType;
          const dropType =
            equippedAmmo && Math.random() < 0.7
              ? equippedAmmo
              : owned[Math.floor(Math.random() * owned.length)];
          addPickup({
            id: `pickup-airdrop-${Math.floor(gameTime)}-${Math.floor(Math.random() * 1e6)}`,
            x: px - 8,
            y: py - 8,
            type: `ammo-${dropType}` as 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle',
            value: 0,
            worldDrop: true
          });
          spawnRing(px, py, 10, 70, 'rgba(252, 211, 77, 0.7)', 3, 520);
          lastAmmoDropRef.current = gameTime;
          nextAmmoDropDelayRef.current = 75000 + Math.random() * 30000; // 75-105s between drops
        }

        const playerCenterX = player.x + player.width / 2;
        const playerCenterY = player.y + player.height / 2;

        // Scripted supply crates — three guaranteed weapon crates spread across
        // the run (on top of the crate every mid-boss drops). Placed near the
        // player so they're easy to grab while the action stays hot.
        const CRATE_DROP_TIMES = [50000, 140000, 180000];
        if (
          cratesDroppedRef.current < CRATE_DROP_TIMES.length &&
          gameTime >= CRATE_DROP_TIMES[cratesDroppedRef.current]
        ) {
          const angle = Math.random() * Math.PI * 2;
          const cx = player.x + player.width / 2 + Math.cos(angle) * 200;
          const cy = player.y + player.height / 2 + Math.sin(angle) * 200;
          addPickup({
            id: `pickup-crate-supply-${cratesDroppedRef.current}`,
            x: cx - 8,
            y: cy - 8,
            type: 'weapon-crate',
            value: 0,
            worldDrop: true
          });
          spawnRing(cx, cy, 10, 80, 'rgba(96,165,250,0.8)', 3, 520);
          cratesDroppedRef.current += 1;
        }

        // VS keeps gems around, but this Pixi/HD-2D scene pays for every
        // pickup. Keep important supplies indefinitely and trim only far XP
        // gems once the field grows past the perf guardrail.
        const currentPickupsForCap = useGameStore.getState().pickups;
        if (currentPickupsForCap.length > PICKUP_HARD_CAP) {
          const importantPickups = currentPickupsForCap.filter(p => p.type !== 'experience' && p.type !== 'strap');
          const keptStraps = currentPickupsForCap
            .filter(p => p.type === 'strap')
            .sort((a, b) => {
              const da = Math.hypot(a.x + 8 - playerCenterX, a.y + 8 - playerCenterY);
              const db = Math.hypot(b.x + 8 - playerCenterX, b.y + 8 - playerCenterY);
              return da - db;
            })
            .slice(0, STRAP_PICKUP_KEEP_COUNT);
          const keptXp = currentPickupsForCap
            .filter(p => p.type === 'experience')
            .sort((a, b) => {
              const da = Math.hypot(a.x + 8 - playerCenterX, a.y + 8 - playerCenterY);
              const db = Math.hypot(b.x + 8 - playerCenterX, b.y + 8 - playerCenterY);
              return da - db;
            })
            .slice(0, XP_PICKUP_KEEP_COUNT);
          useGameStore.setState({ pickups: [...importantPickups, ...keptStraps, ...keptXp] });
        }

        // Scripted wave/elite events (compressed 5-min schedule: early plant,
        // mid-boss spikes, the 7-strong onslaught, finale giantbat).
        // consumeDueWaves fires each event exactly once.
        const waveEnemies = consumeDueWaves(
          gameTime,
          consumedWavesRef.current,
          player,
          gameBounds
        );
        waveEnemies.forEach(addEnemy);

        // VS-style recycling: when an enemy drifts far beyond the viewport,
        // bring it back just outside the current screen instead of letting the
        // simulation spend time on a distant actor. Boss-class enemies keep
        // their HP/type/state; regular enemies are refreshed into the current
        // spawn pool while reusing the same renderer id.
        const currentEnemiesForRecycle = useGameStore.getState().enemies;
        const recycleDistance = Math.max(gameBounds.width, gameBounds.height) * ENEMY_RECYCLE_DISTANCE_MULT;
        let recycledAnyEnemy = false;
        const recycledEnemies = currentEnemiesForRecycle.map(enemy => {
          const enemyCenterX = enemy.x + enemy.width / 2;
          const enemyCenterY = enemy.y + enemy.height / 2;
          const distFromPlayer = Math.hypot(enemyCenterX - playerCenterX, enemyCenterY - playerCenterY);
          const waveProtected = enemy.isWave && gameTime - (enemy.spawnedAt ?? 0) < WAVE_GRACE_MS;
          if (distFromPlayer <= recycleDistance || waveProtected) return enemy;

          const preserveEnemyState = enemy.type === 'reaper' || isBossType(enemy.type);
          const replacement = generateEnemy(
            gameTime,
            player,
            gameBounds,
            preserveEnemyState ? enemy.type : undefined,
            player.lastDirection
          );
          recycledAnyEnemy = true;

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
            id: enemy.id
          };
        });
        if (recycledAnyEnemy) {
          useGameStore.setState({ enemies: recycledEnemies });
        }

        // RE-style density: a hard cap of ~10 concurrent enemies. Set-piece
        // elites are never culled, and scripted-wave enemies get a 10-second
        // grace period before they're eligible (otherwise a boss wave gets
        // deleted the instant it spawns under the low cap).
        const currentEnemiesForCap = useGameStore.getState().enemies;
        if (currentEnemiesForCap.length > MAX_ENEMIES) {
          const isProtected = (e: typeof currentEnemiesForCap[number]) =>
            e.type === 'reaper' || e.type === 'giantbat' || e.type === 'pumpkin' ||
            (e.isWave && gameTime - (e.spawnedAt ?? 0) < WAVE_GRACE_MS);
          const cullable = [...currentEnemiesForCap]
            .filter(e => !isProtected(e))
            .sort((a, b) => {
              const distA = Math.hypot(a.x - player.x, a.y - player.y);
              const distB = Math.hypot(b.x - player.x, b.y - player.y);
              return distB - distA;
            });

          const toRemoveIds = new Set(
            cullable
              .slice(0, currentEnemiesForCap.length - MAX_ENEMIES)
              .map(enemy => enemy.id)
          );
          if (toRemoveIds.size > 0) {
            useGameStore.setState({
              enemies: currentEnemiesForCap.filter(enemy => !toRemoveIds.has(enemy.id))
            });
          }
        }

        // Tick visual effects (particles drift, damage numbers float, etc.)
        updateEffects(deltaTime);

        // Detect level-up edge: golden ring around the player.
        const currentPlayer = useGameStore.getState().player;
        if (currentPlayer.level > prevLevelRef.current) {
          const cx = currentPlayer.x + currentPlayer.width / 2;
          const cy = currentPlayer.y + currentPlayer.height / 2;
          spawnFlash('rgba(253,224,71,0.28)', 320);
          spawnRing(
            cx,
            cy,
            8, 126, 'rgba(253,224,71,0.95)', 6, 680
          );
          spawnRing(
            cx,
            cy,
            2, 54, 'rgba(255,255,255,0.95)', 4, 360
          );
          spawnRing(
            cx,
            cy,
            36, 170, 'rgba(251,191,36,0.62)', 3, 820
          );
          useGameStore.getState().spawnGlow(cx, cy, 82, 'rgba(253,224,71,', 520);
          spawnBurst(
            cx,
            cy,
            '#fde68a',
            44
          );
          spawnBurst(cx, cy, '#ffffff', 12);
          useGameStore.getState().spawnCallout(cx, currentPlayer.y - 14, 'LEVEL UP!', '#fde68a');
          prevLevelRef.current = currentPlayer.level;
        } else if (currentPlayer.level < prevLevelRef.current) {
          prevLevelRef.current = currentPlayer.level; // reset after game over
        }

        // Detect successful-counter edge: gold burst + ring.
        if (currentPlayer.lastCounterSuccessTime > prevCounterSuccessRef.current) {
          spawnRing(
            currentPlayer.x + currentPlayer.width / 2,
            currentPlayer.y + currentPlayer.height / 2,
            12, 80, 'rgba(252,211,77,0.95)', 4, 420
          );
          spawnBurst(
            currentPlayer.x + currentPlayer.width / 2,
            currentPlayer.y + currentPlayer.height / 2,
            '#fcd34d',
            12
          );
          prevCounterSuccessRef.current = currentPlayer.lastCounterSuccessTime;
        }

        // Detect HP loss edge: red screen tint flash.
        if (prevHealthRef.current === 0) {
          prevHealthRef.current = currentPlayer.health;
        } else if (currentPlayer.health < prevHealthRef.current) {
          const lost = prevHealthRef.current - currentPlayer.health;
          if (lost > 0.5) {
            spawnFlash('rgba(220, 38, 38, 0.18)', 220);
          }
          prevHealthRef.current = currentPlayer.health;
        } else {
          prevHealthRef.current = currentPlayer.health;
        }
      }

      // Request next frame
      frameRef.current = requestAnimationFrame(gameLoop);
    };
    
    // Start game loop
    frameRef.current = requestAnimationFrame(gameLoop);
    
    // Cleanup
    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [
    movePlayer,
    fireWeapons,
    updateEnemies,
    updateProjectiles,
    addEnemy,
    markCastleBossSpawned,
    addProjectile,
    setSubWeaponCooldown,
    performKatanaStrike,
    rootEnemy,
    updateHuntingCharge,
    damageEnemy,
    damagePlayer,
    removeProjectile,
    reflectProjectile,
    collectPickup,
    addPickup,
    syncBreakableProps,
    damageBreakableProp,
    dropBreakablePropLoot,
    autoSwitchIfDry,
    tickReload,
    setGameTime,
    updateGameStats,
    setCameraPosition,
    addMeleeFinishCombo,
    spawnBurst,
    spawnDamageNumber,
    spawnRing,
    spawnFlash,
    spawnEffect,
    updateEffects,
    onGameOver,
    triggerPlayerDeath,
    spawnEggFluidSplash
  ]);
  
  return { fps };
};
