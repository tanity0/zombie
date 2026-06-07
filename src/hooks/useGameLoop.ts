import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useGameStore,
  INVULN_MS,
  COUNTER_EXTEND_PER_HIT,
  STUN_DURATION_MS,
  CRIT_DAMAGE_MULT,
  BOSS_CRIT_DAMAGE_MULT
} from '../store/gameStore';
import { rollWeaponKey } from '../utils/weaponDrop';
import type { AmmoType } from '../types/game';
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
  isBossType
} from '../utils/enemyUtils';
import { consumeDueWaves, newConsumedWaves } from '../utils/stageDirector';
import { fireWeapon, getActiveGun, getGuns } from '../utils/weaponUtils';
import { playSfx, playEnemyDeath } from '../audio/audioManager';

const GRENADE_WEAPON_KEY = 'rifle-t3';
const GRENADE_BLAST_RADIUS = 92;
const GRENADE_BLAST_DAMAGE_MULT = 0.62;

export const useGameLoop = (onGameOver: () => void) => {
  const [fps, setFps] = useState(0);
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
  
  // Game state
  const isPaused = useGameStore(state => state.isPaused);
  const gameTime = useGameStore(state => state.gameTime);
  const player = useGameStore(state => state.player);
  const enemies = useGameStore(state => state.enemies);
  const projectiles = useGameStore(state => state.projectiles);
  const pickups = useGameStore(state => state.pickups);
  const breakableProps = useGameStore(state => state.breakableProps);
  const inputState = useGameStore(state => state.inputState);
  const swipeDirection = useGameStore(state => state.swipeDirection);
  const gameBounds = useGameStore(state => state.gameBounds);
  
  // Game actions
  const movePlayer = useGameStore(state => state.movePlayer);
  const fireWeapons = useGameStore(state => state.fireWeapons);
  const updateEnemies = useGameStore(state => state.updateEnemies);
  const updateProjectiles = useGameStore(state => state.updateProjectiles);
  const addEnemy = useGameStore(state => state.addEnemy);
  const damageEnemy = useGameStore(state => state.damageEnemy);
  const damagePlayer = useGameStore(state => state.damagePlayer);
  const removeProjectile = useGameStore(state => state.removeProjectile);
  const reflectProjectile = useGameStore(state => state.reflectProjectile);
  const addProjectile = useGameStore(state => state.addProjectile);
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
  const spawnBurst = useGameStore(state => state.spawnBurst);
  const spawnDamageNumber = useGameStore(state => state.spawnDamageNumber);
  const spawnRing = useGameStore(state => state.spawnRing);
  const spawnFlash = useGameStore(state => state.spawnFlash);
  const spawnEffect = useGameStore(state => state.spawnEffect);
  const updateEffects = useGameStore(state => state.updateEffects);

  const triggerPlayerDeath = useCallback((x: number, y: number) => {
    if (gameOverTriggeredRef.current) return;
    gameOverTriggeredRef.current = true;
    playSfx('player-damage');
    spawnFlash('rgba(127, 29, 29, 0.48)', 520);
    spawnRing(x, y, 8, 118, 'rgba(220,38,38,0.9)', 7, 620);
    spawnRing(x, y, 24, 168, 'rgba(127,29,29,0.66)', 4, 760);
    useGameStore.getState().spawnGlow(x, y, 96, 'rgba(220,38,38,', 620);
    spawnBurst(x, y, '#ef4444', 36);
    spawnBurst(x, y, '#7f1d1d', 22);
    window.setTimeout(onGameOver, 650);
  }, [onGameOver, spawnBurst, spawnFlash, spawnRing]);

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
      const deltaTime = Math.min(0.05, rawDelta);
      lastFrameTimeRef.current = timestamp;

      // Hitstop: a melee finisher freezes the whole simulation for a beat. Keep
      // the time origin current so we don't get a giant delta when it lapses.
      if (Date.now() < useGameStore.getState().hitstopUntil) {
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
        const activeGun = getActiveGun(postReloadPlayer);
        if (activeGun) {
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
        
        // Update enemies
        updateEnemies(deltaTime);
        
        // Update projectiles
        updateProjectiles(deltaTime);

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
          playSfx('counter');
          const pcx = player.x + player.width / 2;
          const pcy = player.y + player.height / 2;
          useGameStore.getState().spawnGlow(pcx, pcy, 78, 'rgba(56,189,248,', 280);
          spawnRing(pcx, pcy, 12, 110, 'rgba(56,189,248,0.9)', 3, 320);
          spawnBurst(pcx, pcy, '#38bdf8', 14);
          useGameStore.getState().spawnCallout(pcx, pcy - 12, 'Counter!', '#38bdf8');
        }

        // Check for collisions between projectiles and enemies
        const projectileEnemyCollisions = checkProjectileEnemyCollisions(useGameStore.getState().projectiles, enemies);
        const projectilesRemovedThisFrame = new Set<string>();
        const grenadeExplodedThisFrame = new Set<string>();
        
        projectileEnemyCollisions.forEach(({ projectileId, enemyId, damage }) => {
          const enemyForFx = enemies.find(e => e.id === enemyId);
          const projectile = projectiles.find(p => p.id === projectileId);

          // Apply the crit multiplier at hit time: bosses take 5× on a crit,
          // normal enemies 1.5×. `damage` is the projectile's base damage.
          const isBoss = enemyForFx ? isBossType(enemyForFx.type) : false;
          const critMult = projectile?.crit
            ? (isBoss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT)
            : 1;
          const dmg = damage * critMult;
          const enemyKilled = damageEnemy(enemyId, dmg);
          playSfx(projectile?.crit ? 'headshot' : 'shot-damage');

          if (enemyForFx) {
            const hitX = enemyForFx.x + enemyForFx.width / 2;
            const hitY = enemyForFx.y + enemyForFx.height / 2;
            spawnBurst(hitX, hitY, '#b91c1c', projectile?.crit ? 8 : 5);
            spawnBurst(hitX, hitY, '#7f1d1d', projectile?.crit ? 4 : 2);
          }

          // Crit / headshot juice: gold shockwave + sparks + glow.
          if (projectile?.crit && enemyForFx) {
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
            spawnRing(blastX, blastY, 10, GRENADE_BLAST_RADIUS, 'rgba(251,146,60,0.82)', 5, 360);
            spawnBurst(blastX, blastY, '#f97316', 24);
            spawnBurst(blastX, blastY, '#7f1d1d', 10);
            useGameStore.getState().spawnGlow(blastX, blastY, 58, 'rgba(251,146,60,', 360);

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
              spawnDamageNumber(sx, splashEnemy.y, splashDamage, !!projectile.crit);
              spawnBurst(sx, sy, '#b91c1c', projectile.crit ? 7 : 4);
              if (splashKilled) {
                playEnemyDeath();
                spawnBurst(sx, sy, '#dc2626', 12);
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
              !!projectile?.reflected || !!projectile?.crit
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
            useGameStore.getState().knockbackEnemy(
              enemyId, projectile.direction.x, projectile.direction.y
            );
          }

          // Crit that didn't outright kill → stun the target so it can be
          // executed with a melee finisher. Mark it with a brief yellow ring.
          if (projectile?.crit && !enemyKilled && enemyForFx) {
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
            const enemy = enemies.find(e => e.id === enemyId);
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
                  value: 0
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
                    value: 0
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
                  weaponKey: rollWeaponKey(gameTime)
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
                  value: 30
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
            spawnBurst(fxX, fxY, '#f97316', 20);
            spawnBurst(fxX, fxY, '#fde68a', 8);
            spawnRing(fxX, fxY, 6, 36, 'rgba(251,146,60,0.86)', 3, 340);
            useGameStore.getState().spawnGlow(fxX, fxY, 48, 'rgba(251,146,60,', 380);
            dropBreakablePropLoot(broken);
          } else {
            spawnBurst(fxX, fxY, '#fbbf24', 5);
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
              }
            }
            collectPickup(pickupId);
          });
        }
        
        // Continuous spawner — drip enemies onto the field from off-screen.
        if (
          timestamp - lastEnemySpawnRef.current > getEnemySpawnInterval(gameTime)
        ) {
          const spawnCount = getEnemySpawnCount(gameTime);
          const plantCount = useGameStore.getState().enemies
            .filter(e => e.type === 'plant').length;

          for (let i = 0; i < spawnCount; i++) {
            let enemy = generateEnemy(gameTime, player, gameBounds);
            // Hard cap of 2 live ranged plants — re-roll a plant pick into
            // something else once the field already has two, so ranged pressure
            // never piles up past "annoying".
            if (enemy.type === 'plant' && plantCount >= 2) {
              let tries = 0;
              while (enemy.type === 'plant' && tries < 6) {
                enemy = generateEnemy(gameTime, player, gameBounds);
                tries++;
              }
              if (enemy.type === 'plant') {
                enemy = generateEnemy(gameTime, player, gameBounds, 'skeleton');
              }
            }
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
            value: 0
          });
          spawnRing(cx, cy, 10, 80, 'rgba(96,165,250,0.8)', 3, 520);
          cratesDroppedRef.current += 1;
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

        // RE-style density: a hard cap of ~10 concurrent enemies. Set-piece
        // elites are never culled, and scripted-wave enemies get a 10-second
        // grace period before they're eligible (otherwise a boss wave gets
        // deleted the instant it spawns under the low cap).
        const MAX_ENEMIES = 10;
        const WAVE_GRACE_MS = 10000;
        if (enemies.length > MAX_ENEMIES) {
          const isProtected = (e: typeof enemies[number]) =>
            e.type === 'reaper' || e.type === 'giantbat' || e.type === 'pumpkin' ||
            (e.isWave && gameTime - (e.spawnedAt ?? 0) < WAVE_GRACE_MS);
          const cullable = [...enemies]
            .filter(e => !isProtected(e))
            .sort((a, b) => {
              const distA = Math.hypot(a.x - player.x, a.y - player.y);
              const distB = Math.hypot(b.x - player.x, b.y - player.y);
              return distB - distA;
            });

          const toRemove = cullable.slice(0, enemies.length - MAX_ENEMIES);
          toRemove.forEach(enemy => {
            useGameStore.getState().removeEnemy(enemy.id);
          });
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
    isPaused,
    gameTime,
    player,
    enemies,
    projectiles,
    pickups,
    breakableProps,
    inputState,
    swipeDirection,
    gameBounds,
    movePlayer,
    fireWeapons,
    updateEnemies,
    updateProjectiles,
    addEnemy,
    addProjectile,
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
    spawnBurst,
    spawnDamageNumber,
    spawnRing,
    spawnFlash,
    spawnEffect,
    updateEffects,
    onGameOver,
    triggerPlayerDeath
  ]);
  
  return { fps };
};
