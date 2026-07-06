// Headless simulation invariants. Drives the renderer-agnostic store
// (no Pixi/React; the store imports no audio and its localStorage readers are
// try/catch-guarded, so it loads cleanly under the default node env) through
// many ticks and asserts the sim never produces NaN/Infinity, never throws,
// and keeps counts/health sane. The "auto-debug" net for the logic layer —
// see CLAUDE.md Testing policy.
import { describe, it, expect, vi } from 'vitest';
import { useGameStore, bumpBossCrit, BOSS_FULLSTUN_CRITS, BOSS_FULLSTUN_MS, PUMPKIN_JUMP_MAX_DIST } from './gameStore';

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

  it('eggcarrier (ghost) scatters a 3-egg burst then holds for the CD', () => {
    useGameStore.getState().resetGame('warrior');
    const { x, y } = useGameStore.getState().player;
    // One eggcarrier near the player; clear any reset-time props so we count only its eggs.
    useGameStore.setState({
      breakableProps: [],
      enemies: [spawnEnemyAt('ghost', x + 200, y, useGameStore.getState().gameTime)],
    });
    const dt = 1 / 60;
    let t = useGameStore.getState().gameTime;
    const step = (frames: number) => { for (let i = 0; i < frames; i++) { t += dt * 1000; useGameStore.getState().setGameTime(t); useGameStore.getState().updateEnemies(dt); } };
    step(140); // ~2.3s: the first burst (0.5/1.0/1.5s) is done, CD not yet elapsed
    let eggs = useGameStore.getState().breakableProps.filter(p => p.id.startsWith('egg-gc-'));
    expect(eggs.length).toBe(3);                       // exactly one burst of 3
    expect(eggs.every(e => e.type === 'mine')).toBe(true);
    // scattered around the ghost (not all stacked at one point)
    const uniqueX = new Set(eggs.map(e => Math.round(e.footX)));
    expect(uniqueX.size).toBeGreaterThan(1);
    step(140); // ~4.6s: past the 3s CD → a second burst has started
    eggs = useGameStore.getState().breakableProps.filter(p => p.id.startsWith('egg-gc-'));
    expect(eggs.length).toBeGreaterThan(3);
  });

  it('screamer winds up after ~5s then opens a ~7s buff window (社長指示: 出現から発動まで計7秒)', () => {
    useGameStore.getState().resetGame('warrior');
    const { x, y } = useGameStore.getState().player;
    useGameStore.setState({
      enemies: [spawnEnemyAt('screamer', x + 260, y, useGameStore.getState().gameTime)],
      screamerBuffUntil: 0,
    });
    const dt = 1 / 60;
    let t = useGameStore.getState().gameTime;
    const step = (frames: number) => { for (let i = 0; i < frames; i++) { t += dt * 1000; useGameStore.getState().setGameTime(t); useGameStore.getState().updateEnemies(dt); } };
    step(270); // ~4.5s: before windup starts(5s) → no buff yet
    expect(useGameStore.getState().screamerBuffUntil).toBeLessThanOrEqual(t);
    step(200); // ~7.8s: past windup start(5s)+windup(2s)=7s activation → buff window opened
    const buf = useGameStore.getState().screamerBuffUntil;
    expect(buf).toBeGreaterThan(t);                 // active
    expect(buf).toBeLessThanOrEqual(t + 7000 + 50); // ~7s window from activation
  });

  it('killing the screamer before activation prevents the buff (阻止)', () => {
    useGameStore.getState().resetGame('warrior');
    const { x, y } = useGameStore.getState().player;
    useGameStore.setState({
      enemies: [spawnEnemyAt('screamer', x + 260, y, useGameStore.getState().gameTime)],
      screamerBuffUntil: 0,
    });
    const dt = 1 / 60;
    let t = useGameStore.getState().gameTime;
    const step = (frames: number) => { for (let i = 0; i < frames; i++) { t += dt * 1000; useGameStore.getState().setGameTime(t); useGameStore.getState().updateEnemies(dt); } };
    step(360); // ~6.0s: now in the 2s windup (溜め中。windupは5s開始→7sで発動)
    expect(useGameStore.getState().enemies[0]?.aiPhase).toBe('scream');
    useGameStore.setState({ enemies: [] }); // 倒した=溜め完了前に除去
    step(120); // past where activation would have been
    expect(useGameStore.getState().screamerBuffUntil).toBeLessThanOrEqual(t); // never activated
  });

  it('killing the screamer while its buff is active cuts the buff immediately(社長指示: 撃破時に即失効)', () => {
    useGameStore.getState().resetGame('warrior');
    const { x, y } = useGameStore.getState().player;
    const screamer = spawnEnemyAt('screamer', x + 260, y, useGameStore.getState().gameTime);
    useGameStore.setState({ enemies: [screamer], screamerBuffUntil: useGameStore.getState().gameTime + 7000 });
    expect(useGameStore.getState().screamerBuffUntil).toBeGreaterThan(useGameStore.getState().gameTime);
    useGameStore.getState().damageEnemy(screamer.id, 9999);
    expect(useGameStore.getState().screamerBuffUntil).toBeLessThanOrEqual(useGameStore.getState().gameTime);
  });

  it('hidden boss enters full stun (purple) after N crits, then ignores further counting', () => {
    const t = 10_000;
    let e = spawnEnemyAt('mimir', 0, 0, 0);
    for (let i = 0; i < BOSS_FULLSTUN_CRITS - 1; i++) {
      const r = bumpBossCrit(e, t);
      expect(r).not.toBeNull();
      expect(r!.triggered).toBe(false);
      e = { ...e, ...r!.patch };
    }
    const last = bumpBossCrit(e, t);
    expect(last!.triggered).toBe(true);
    expect(last!.patch.bossFullStunUntil).toBe(t + BOSS_FULLSTUN_MS);
    expect(last!.patch.stunUntil).toBe(t + BOSS_FULLSTUN_MS);
    expect(last!.patch.bossCritCount).toBe(0); // counter resets after triggering
    e = { ...e, ...last!.patch };
    // while fully stunned, further crits don't re-count / extend
    expect(bumpBossCrit(e, t + 100)).toBeNull();
    // non-hidden-boss enemies are never affected
    expect(bumpBossCrit(spawnEnemyAt('zombie', 0, 0, 0), t)).toBeNull();
  });

  it('suppression event: an escort NPC captures its base after ~10s dwell and stays finite', () => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState({ suppressionActive: true });
    const site0 = useGameStore.getState().baseSites[0];
    // 護衛NPCが配置されている前提(屋外)。base-0 担当の護衛を拠点中心に留め、カメラを近づけて on-screen にする。
    expect(useGameStore.getState().escorts.length).toBeGreaterThan(0);
    const pin = () => useGameStore.setState(st => ({
      camera: { x: site0.x - 100, y: site0.y - 100 }, // 護衛を画面内にして前進/占拠を動かす
      escorts: st.escorts.map(e => e.baseId === site0.id ? { ...e, x: site0.x, y: site0.y } : e),
    }));
    pin();
    const dt = 1 / 60;
    let t = useGameStore.getState().gameTime;
    for (let i = 0; i < 700; i++) { // ~11.7s > 10s hold
      t += dt * 1000;
      pin(); // keep the escort pinned inside its base circle
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
    // escort soldierIndex は拠点固定(base-0=0..)。0..7 の有効値。
    expect(base.soldierIndex).toBeGreaterThanOrEqual(0);
    expect(base.soldierIndex).toBeLessThan(8);
    // 新システム: 駐留 garrison は廃止(flag off)。防衛は護衛NPCが担う=base.soldiers は空。
    expect(base.soldiers.length).toBe(0);
    // 担当護衛は座標を保ち、拠点中心付近に居る(占拠完了地点)。
    const escort = useGameStore.getState().escorts.find(e => e.baseId === site0.id)!;
    expect(Number.isFinite(escort.x) && Number.isFinite(escort.y)).toBe(true);
    expect(Math.hypot(escort.x - site0.x, escort.y - site0.y)).toBeLessThanOrEqual(130 + 1);
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

  it('player.critChance now boosts the regular knife swing (社長指示: 近接武器にも乗せる)', () => {
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    // ゾンビは近接弱点補正の対象外(weaknessCrit表は'gun'側のみ=+0.10)なので、素の近接クリ率は
    // 装備ナイフ(knife-t1)固定の0.05のみ(スキル未所持=Benkei/ナイフマスター等のボーナスも0)。
    const spawnCloseZombie = () => {
      const z = spawnEnemyAt('zombie', pcx + 4, pcy, useGameStore.getState().gameTime);
      z.health = 9999; // 生存させて damageNumber を確実に出す(倒れて即消滅しないように)
      useGameStore.setState({ enemies: [z], effects: [] });
    };
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5); // 0.05 < 0.5 < 1.0 な決定的な値

    spawnCloseZombie();
    useGameStore.setState(s => ({ player: { ...s.player, critChance: 0, counterCooldownEnd: 0 } }));
    useGameStore.getState().triggerCounter();
    const critsWithoutBonus = useGameStore.getState().effects.filter(e => e.kind === 'damageNumber' && e.crit);
    expect(critsWithoutBonus.length).toBe(0); // 0.05(素のナイフ)だけでは 0.5 に届かずクリティカルしない

    spawnCloseZombie();
    // 直前のスイングが付けたカウンターCDを解除しないと2回目が不発(空振り)になるため明示的に0へ。
    useGameStore.setState(s => ({ player: { ...s.player, critChance: 1, counterCooldownEnd: 0 } }));
    useGameStore.getState().triggerCounter();
    const critsWithBonus = useGameStore.getState().effects.filter(e => e.kind === 'damageNumber' && e.crit);
    expect(critsWithBonus.length).toBeGreaterThan(0); // player.critChance=1 が乗れば必ずクリティカルする

    randomSpy.mockRestore();
  });

  it('a melee crit now stuns the target too (社長指示: 銃/刀と同じくクリで痺れてフィニッシュ受付にする)', () => {
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const z = spawnEnemyAt('zombie', pcx + 4, pcy, useGameStore.getState().gameTime);
    z.health = 9999; // 生存させてstunUntilが付くか見る(倒れて消えないように)
    useGameStore.setState({ enemies: [z], effects: [] });
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // 常にクリティカル
    useGameStore.setState(s => ({ player: { ...s.player, critChance: 1, counterCooldownEnd: 0 } }));
    const gt = useGameStore.getState().gameTime;

    useGameStore.getState().triggerCounter();

    const after = useGameStore.getState().enemies[0];
    expect(after).toBeTruthy();
    expect(after.stunUntil).toBeDefined();
    expect(after.stunUntil!).toBeGreaterThan(gt); // クリでスタン=以後gameTime基準でフィニッシュ受付になる

    randomSpy.mockRestore();
  });

  it('pumpkin jump lands clamped to PUMPKIN_JUMP_MAX_DIST from the takeoff point (社長採用M16: ボット実測350px)', () => {
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    // 溜め終了の瞬間、プレイヤーは発動位置から500px離れている(=350クランプが効く距離)。
    const p = spawnEnemyAt('pumpkin', pcx + 500, pcy, useGameStore.getState().gameTime);
    const ecx = p.x + p.width / 2, ecy = p.y + p.height / 2;
    const t0 = useGameStore.getState().gameTime;
    p.aiPhase = 'crouch';
    p.aiPhaseUntil = t0 - 1; // 既に溜め終了=次tickでジャンプ開始
    useGameStore.setState({ enemies: [p] });

    useGameStore.getState().updateEnemies(1 / 60);

    const after = useGameStore.getState().enemies[0];
    expect(after.aiPhase).toBe('jump');
    const tx = (after.aiTargetX ?? 0) + after.width / 2;
    const ty = (after.aiTargetY ?? 0) + after.height / 2;
    const dist = Math.hypot(tx - ecx, ty - ecy);
    expect(dist).toBeCloseTo(PUMPKIN_JUMP_MAX_DIST, 0); // 発動位置から最大350pxまでにクランプ
  });
});
