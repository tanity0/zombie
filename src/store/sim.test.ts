// Headless simulation invariants. Drives the renderer-agnostic store
// (no Pixi/React; the store imports no audio and its localStorage readers are
// try/catch-guarded, so it loads cleanly under the default node env) through
// many ticks and asserts the sim never produces NaN/Infinity, never throws,
// and keeps counts/health sane. The "auto-debug" net for the logic layer —
// see CLAUDE.md Testing policy.
import { describe, it, expect } from 'vitest';
import { useGameStore } from './gameStore';

// Minimal ambient declaration so the SIM_FUZZ env gate typechecks without
// pulling in @types/node (the value is read only under the nightly cron).
declare const process: { env?: Record<string, string | undefined> } | undefined;
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
    store.updateSuppression(dt); // no-op unless suppressionActive
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

  it('suppression event: a base captures after ~10s dwell and stays finite', () => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState({ suppressionActive: true });
    const site0 = useGameStore.getState().baseSites[0];
    // Park the player on the first base so its capture circle fills.
    const place = () => useGameStore.setState(st => ({
      player: { ...st.player, x: site0.x - st.player.width / 2, y: site0.y - st.player.height / 2 },
    }));
    place();
    const dt = 1 / 60;
    let t = useGameStore.getState().gameTime;
    for (let i = 0; i < 700; i++) { // ~11.7s > 10s hold
      t += dt * 1000;
      place(); // keep the player pinned inside the circle
      useGameStore.getState().setGameTime(t);
      useGameStore.getState().updateSuppression(dt);
      assertActorsFinite(`supp tick ${i}`);
    }
    const base = useGameStore.getState().baseSites.find(b => b.id === site0.id)!;
    expect(base.status).toBe('captured');
    expect(Number.isFinite(base.hp)).toBe(true);
    expect(base.hp).toBeGreaterThan(0);
    // first capture makes it the merchant's safe base
    expect(useGameStore.getState().safeBaseId).toBe(site0.id);
    // soldiers (キャラ) are assigned RANDOMLY (distinct) from the 8-name roster, so the index is
    // some valid 0..7 (not necessarily 0). They spawn at edge-ish positions (not the center=merchant).
    expect(base.soldierIndex).toBeGreaterThanOrEqual(0);
    expect(base.soldierIndex).toBeLessThan(8);
    expect(base.soldiers.length).toBeGreaterThan(0);
    for (const sol of base.soldiers) {
      const distFromCenter = Math.hypot(sol.x - site0.x, sol.y - site0.y);
      expect(distFromCenter).toBeGreaterThan(10); // not stacked on the center
      expect(distFromCenter).toBeLessThanOrEqual(130 + 1); // within the capture circle
      expect(Number.isFinite(sol.x) && Number.isFinite(sol.y)).toBe(true);
    }
  });

  it('explosions (nonLethalBoss) cannot kill boss-types but still chip them; normal hits do kill', () => {
    useGameStore.getState().resetGame('warrior');
    // ボス系: 爆発(nonLethalBoss)では HP1 で踏みとどまり死なない。
    const boss = spawnEnemyAt('jormungand', 0, 0, 0);
    useGameStore.setState({ enemies: [{ ...boss, health: 30, maxHealth: boss.maxHealth }] });
    const id = useGameStore.getState().enemies[0].id;
    const killedByBlast = useGameStore.getState().damageEnemy(id, 9999, true);
    expect(killedByBlast).toBe(false);
    expect(useGameStore.getState().enemies.find(e => e.id === id)?.health).toBe(1);
    // 通常攻撃(致死可)なら同じボスを倒せる。
    const killedNormal = useGameStore.getState().damageEnemy(id, 9999);
    expect(killedNormal).toBe(true);
    expect(useGameStore.getState().enemies.find(e => e.id === id)).toBeUndefined();
    // 雑魚は爆発でも普通に死ぬ(nonLethalBoss はボス系だけ対象)。
    const zomb = spawnEnemyAt('zombie', 0, 0, 0);
    useGameStore.setState({ enemies: [{ ...zomb, health: 10 }] });
    const zid = useGameStore.getState().enemies[0].id;
    expect(useGameStore.getState().damageEnemy(zid, 9999, true)).toBe(true);
  });

  it('the bomb pickup wipes non-bosses but leaves boss-types alive', () => {
    useGameStore.getState().resetGame('warrior');
    const z = spawnEnemyAt('zombie', 100, 0, 0);
    const g = spawnEnemyAt('giantbat', 200, 0, 0);
    const j = spawnEnemyAt('jormungand', 300, 0, 0);
    useGameStore.setState({ enemies: [z, g, j] });
    useGameStore.getState().addPickup({ id: 'bomb-1', type: 'bomb', x: 0, y: 0, value: 0 } as never);
    useGameStore.getState().collectPickup('bomb-1');
    const left = useGameStore.getState().enemies.map(e => e.type).sort();
    expect(left).toEqual(['giantbat', 'jormungand']); // ボス系は生存・雑魚は消滅
  });

  it('scrap-builder grants bonus initial scrap by level at deploy', () => {
    // No skill → baseline 0 initial scrap.
    useGameStore.setState({ ownedSkills: [], ownedSkillLevels: {}, pendingSkills: [], startWithTestStraps: false });
    useGameStore.getState().resetGame('warrior');
    expect(useGameStore.getState().player.straps).toBe(0);
    // Equip scrap-builder Lv2 → +100 initial scrap.
    useGameStore.setState({ ownedSkills: ['scrap-builder'], ownedSkillLevels: { 'scrap-builder': 2 }, pendingSkills: ['scrap-builder'], startWithTestStraps: false });
    useGameStore.getState().resetGame('warrior');
    expect(useGameStore.getState().player.straps).toBe(100);
  });

  it('pullGacha updates pity/dupe state sequentially and keeps invariants', () => {
    useGameStore.setState({ ownedSkills: [], ownedSkillLevels: {}, gachaDupeCounts: {}, gachaPitySinceSuper: 0, goldBalance: 0 });
    for (let i = 0; i < 60; i++) {
      const r = useGameStore.getState().pullGacha();
      expect(r).not.toBeNull();
      if (!r) break;
      const s = useGameStore.getState();
      // pity: super resets to 0, otherwise it grew from the previous pull.
      if (r.rarity === 'super') expect(s.gachaPitySinceSuper).toBe(0);
      else expect(s.gachaPitySinceSuper).toBeGreaterThan(0);
      // owned + level invariants.
      expect(s.ownedSkills).toContain(r.key);
      if (r.promoted) expect(s.ownedSkillLevels[r.key]).toBe(r.newLevel);
      // level never exceeds the skill cap; refund only when not promoted.
      expect(r.newLevel).toBeLessThanOrEqual(3);
      expect(r.refund > 0).toBe(!r.promoted);
    }
  });

  // Nightly fuzz (longer + multiple character classes/seeds). Skipped in normal
  // CI; the nightly cron sets SIM_FUZZ=1. See .github/workflows/nightly.yml.
  it.runIf(typeof process !== 'undefined' && process?.env?.SIM_FUZZ)('fuzz: long randomized sim across classes', () => {
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

  it('攻撃モーション中(zrush)はノックバックで中断されない／気絶では中断される', () => {
    const store = useGameStore.getState();
    const px = store.player.x, py = store.player.y;
    const t0 = store.gameTime + 1000;
    store.setGameTime(t0);

    // プレイヤーの右220px(近接外)に、突進中(zrush)＋右向き(離れる向き)ノックバック付きのゾンビ。
    const z = spawnEnemyAt('zombie', px + 220, py, t0);
    z.aiPhase = 'zrush';
    z.aiPhaseUntil = t0 + 5000;             // 突進継続中(gameTime基準)
    z.knockbackVx = 1000; z.knockbackVy = 0; // 右=プレイヤーから離れる向き
    z.knockbackUntil = Date.now() + 2000;    // ノックバック有効(実時間基準)
    useGameStore.setState({ enemies: [z] });

    const distBefore = Math.abs(useGameStore.getState().enemies[0].x - px);
    let t = t0;
    for (let i = 0; i < 5; i++) { t += 1000 / 60; useGameStore.getState().setGameTime(t); useGameStore.getState().updateEnemies(1 / 60); }
    const after = useGameStore.getState().enemies[0];
    expect(after).toBeTruthy();
    // ノックバック(右/離れる)で押し出されず、突進でプレイヤー側(左)へ寄る=距離が縮む。
    expect(Math.abs(after.x - px)).toBeLessThan(distBefore);
    expect(after.aiPhase).toBe('zrush');

    // 気絶は例外: zrush中でも中断される(aiPhase解除)。
    const z2 = spawnEnemyAt('zombie', px + 220, py, t);
    z2.aiPhase = 'zrush'; z2.aiPhaseUntil = t + 5000;
    z2.stunUntil = t + 2000; // gameTime基準で気絶中
    useGameStore.setState({ enemies: [z2] });
    t += 1000 / 60; useGameStore.getState().setGameTime(t); useGameStore.getState().updateEnemies(1 / 60);
    expect(useGameStore.getState().enemies[0].aiPhase).toBeUndefined();
  });
});
