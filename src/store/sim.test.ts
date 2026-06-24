// Headless simulation invariants. Drives the renderer-agnostic store
// (no Pixi/React; the store imports no audio and its localStorage readers are
// try/catch-guarded, so it loads cleanly under the default node env) through
// many ticks and asserts the sim never produces NaN/Infinity, never throws,
// and keeps counts/health sane. The "auto-debug" net for the logic layer —
// see CLAUDE.md Testing policy.
import { describe, it, expect } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import type { InputState, Projectile, EnemyType } from '../types/game';

const finite = (n: number | undefined) => n === undefined || Number.isFinite(n);

const assertActorsFinite = (label: string) => {
  const s = useGameStore.getState();
  for (const e of s.enemies) {
    expect(finite(e.x) && finite(e.y) && finite(e.vx) && finite(e.vy) && finite(e.health),
      `${label}: enemy ${e.id} (${e.type}) has non-finite field`).toBe(true);
  }
  for (const p of s.projectiles) {
    expect(finite(p.x) && finite(p.y) && finite(p.direction.x) && finite(p.direction.y),
      `${label}: projectile ${p.id} has non-finite field`).toBe(true);
  }
  const pl = s.player;
  expect(finite(pl.x) && finite(pl.y) && finite(pl.health),
    `${label}: player has non-finite field`).toBe(true);
};

const buildProjectile = (over: Partial<Projectile>): Projectile => ({
  id: `t-proj-${Math.random().toString(36).slice(2)}`,
  x: 0, y: 0, width: 8, height: 8, speed: 300, damage: 10,
  direction: { x: 1, y: 0 }, weaponType: 'handgun', weaponKey: 'handgun-t1',
  duration: 1400, createdAt: Date.now(), passthrough: false, hitEnemies: [],
  hostile: false, reflected: false, ...over,
});

// Spawn a varied pack of enemies around the player to exercise every AI path
// (zombie pause/rush cycle, werewolf dash, plant, lich orbit, bat, dormant boss).
const seedField = () => {
  const store = useGameStore.getState();
  const { x, y } = store.player;
  const types: EnemyType[] = ['zombie', 'werewolf', 'plant', 'lich', 'bat', 'skeleton', 'ghost'];
  for (let i = 0; i < 28; i++) {
    const ang = (i / 28) * Math.PI * 2;
    const dist = 120 + (i % 5) * 90;
    const t = types[i % types.length];
    store.addEnemy(spawnEnemyAt(t, x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, store.gameTime));
  }
  // A dormant giant (exercises the "wait until approached" path).
  const giant = spawnEnemyAt('giantbat', x + 500, y - 500, store.gameTime);
  giant.dormant = true; giant.aggroRange = 380;
  store.addEnemy(giant);
  // A few projectiles: player bullet, homing missile (targets first enemy), hostile bolt.
  store.addProjectile(buildProjectile({ x: x + 10, y, direction: { x: 1, y: 0.2 } }));
  const firstEnemy = useGameStore.getState().enemies[0];
  store.addProjectile(buildProjectile({
    x, y, speed: 200, weaponType: 'homing-missile', weaponKey: 'sub-homing',
    explodeOnHit: true, explodeRadius: 66, targetEnemyId: firstEnemy?.id,
  }));
  store.addProjectile(buildProjectile({ x: x - 200, y: y - 60, weaponType: 'enemy_bolt', hostile: true, direction: { x: 0.6, y: 0.8 } }));
};

// Run the core sim for `ticks` frames at a fixed dt, varying movement input so
// the player roams (waking dormant enemies, entering/leaving melee range).
const runSim = (ticks: number, inputAt: (i: number) => InputState) => {
  const dt = 1 / 60;
  let t = useGameStore.getState().gameTime;
  for (let i = 0; i < ticks; i++) {
    t += dt * 1000;
    const store = useGameStore.getState();
    store.setGameTime(t);
    store.movePlayer(inputAt(i), dt);
    store.updateEnemies(dt);
    store.updateProjectiles(dt);
    if (i % 30 === 0) assertActorsFinite(`tick ${i}`);
  }
  assertActorsFinite(`tick ${ticks} (final)`);
};

// Roam in a slowly rotating direction so the player covers ground.
const roamingInput = (i: number): InputState => {
  const phase = Math.floor(i / 45) % 4;
  return { up: phase === 0, right: phase === 1, down: phase === 2, left: phase === 3 };
};

describe('headless simulation invariants', () => {
  it('runs ~10s with a full enemy/projectile field without NaN or crash', () => {
    useGameStore.getState().resetGame('warrior');
    seedField();
    runSim(600, roamingInput);
    const s = useGameStore.getState();
    expect(s.enemies.length).toBeLessThan(500);     // no runaway growth (no spawner here)
    expect(s.player.health).toBeGreaterThan(0);     // store sim alone never kills the player
    expect(s.player.health).toBeLessThanOrEqual(s.player.maxHealth);
  });

  // Nightly fuzz (longer + multiple character classes/seeds). Skipped in normal
  // CI; the nightly cron sets SIM_FUZZ=1. See .github/workflows/nightly.yml.
  it.runIf(process.env.SIM_FUZZ)('fuzz: long randomized sim across classes', () => {
    const classes = ['warrior', 'mage', 'rogue', 'necromancer'];
    for (const cls of classes) {
      useGameStore.getState().resetGame(cls);
      seedField();
      runSim(3600, (i) => {
        // pseudo-random but input-only; sim invariants must hold regardless
        const r = (i * 2654435761) >>> 0;
        return { up: !!(r & 1), down: !!(r & 2), left: !!(r & 4), right: !!(r & 8) };
      });
    }
  });
});
