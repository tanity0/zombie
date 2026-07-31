// Headless simulation invariants. Drives the renderer-agnostic store
// (no Pixi/React; the store imports no audio and its localStorage readers are
// try/catch-guarded, so it loads cleanly under the default node env) through
// many ticks and asserts the sim never produces NaN/Infinity, never throws,
// and keeps counts/health sane. The "auto-debug" net for the logic layer —
// see CLAUDE.md Testing policy.
import { describe, it, expect, vi } from 'vitest';
import {
  useGameStore, bumpBossCrit, BOSS_FULLSTUN_CRITS, BOSS_FULLSTUN_MS, PUMPKIN_JUMP_MAX_DIST,
  bossCritCdMult, BOSS_CRIT_CD_MULT, STUN_DURATION_MS, canShoveEnemy,
} from './gameStore';
import type { Enemy } from '../types/game';

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

  it('MOVEMENT_REWORK.md 仕様1: 速度ボーナスはランプで立ち上がり、急な切り返し/停止でゼロへ戻る(movePlayer結線の裏取り)', () => {
    useGameStore.getState().resetGame('warrior');
    // ランナーLv3のみ装備(P=1.20固定。マークスマンはmage専用・ウォームアップ/装備は未所持=中立の1)。
    useGameStore.setState(s => ({ player: { ...s.player, skills: ['runner'], skillLevels: { runner: 3 } } }));
    const baseSpeed = useGameStore.getState().player.speed; // PLAYER_BASE_SPEED(基礎速度・即応でランプ対象外)
    const noInput: InputState = { up: false, down: false, left: false, right: false };
    const rightInput: InputState = { up: false, down: false, left: false, right: true };
    const leftInput: InputState = { up: false, down: false, left: true, right: false };
    const dt = 1 / 60;

    // 1フレーム目: ランプはほぼ0なので+20%はまだほとんど乗っていない(基礎速度に近い)。
    useGameStore.getState().movePlayer(rightInput, dt);
    const vxFrame1 = useGameStore.getState().player.vx;
    expect(vxFrame1).toBeGreaterThan(baseSpeed * 0.99);
    expect(vxFrame1).toBeLessThan(baseSpeed * 1.02);

    // 90フレーム(≈1500ms=RAMP_FULL_MS)同方向へ走り続けるとフルランプ(+20%満額)に達する。
    for (let i = 0; i < 89; i++) useGameStore.getState().movePlayer(rightInput, dt);
    const vxFull = useGameStore.getState().player.vx;
    expect(vxFull).toBeCloseTo(baseSpeed * 1.20, 0);

    // 75°以上の急な切り返し(右→左=180°)で即ゼロへ戻る=基礎速度のみに戻る。
    useGameStore.getState().movePlayer(leftInput, dt);
    const vxAfterTurn = useGameStore.getState().player.vx;
    expect(Math.abs(vxAfterTurn)).toBeCloseTo(baseSpeed, 0);

    // 停止でもゼロへ戻る: 直後に同方向へ走ってもフレーム1からやり直しになる。
    useGameStore.getState().movePlayer(noInput, dt);
    useGameStore.getState().movePlayer(rightInput, dt);
    const vxAfterStopResume = useGameStore.getState().player.vx;
    expect(vxAfterStopResume).toBeLessThan(baseSpeed * 1.02);
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

  it('CRIT-UNIFY §9.2: bossCritCdMult=クリ窓中のボスは次行動CDに×2、窓外・非ボスは×1', () => {
    const t = 10_000;
    const boss = spawnEnemyAt('pumpkin', 0, 0, 0);
    // 窓が無い(bossSlowUntil未設定)ボスは×1。
    expect(bossCritCdMult(boss, t)).toBe(1);
    // 窓中(bossSlowUntil > t)のボスは×2。
    const bossInWindow = { ...boss, bossSlowUntil: t + 3000 };
    expect(bossCritCdMult(bossInWindow, t)).toBe(BOSS_CRIT_CD_MULT);
    expect(bossCritCdMult(bossInWindow, t)).toBe(2);
    // 窓が過ぎたら×1に戻る。
    const bossWindowExpired = { ...boss, bossSlowUntil: t - 1 };
    expect(bossCritCdMult(bossWindowExpired, t)).toBe(1);
    // 非ボス(zombie)は同じbossSlowUntilが立っていても常に×1(ボス以外には無関係のフィールド)。
    const zombie = { ...spawnEnemyAt('zombie', 0, 0, 0), bossSlowUntil: t + 3000 };
    expect(bossCritCdMult(zombie, t)).toBe(1);
  });

  it('CRIT-UNIFY §9.2同梱修正: 刀のクリ気絶にもstunDurationMult(気絶時間アップ)が乗る(旧実装漏れ)', () => {
    useGameStore.getState().resetGame('warrior');
    // 刀の実ダメージ判定はperformKatanaStrike(targetIds, damageMult, allowFinisher)が持つ
    // (triggerCounterのisKatanaMode分岐は窓/CDを開くだけで通常スイープを行わない=一閃は別入口)。
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: [...s.player.subWeapons, 'katana'] } }));
    const player = useGameStore.getState().player;
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const z = spawnEnemyAt('zombie', pcx + 4, pcy, useGameStore.getState().gameTime);
    z.health = 9999; // 反撃で倒れないように(気絶時間を観測するため生存させる)
    useGameStore.setState({ enemies: [z], effects: [] });
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // 常にクリティカル
    useGameStore.setState(s => ({ player: { ...s.player, critChance: 1, stunDurationMult: 2 } }));
    const gt = useGameStore.getState().gameTime;

    useGameStore.getState().performKatanaStrike([z.id], 1, true);

    const after = useGameStore.getState().enemies.find(e => e.id === z.id);
    expect(after).toBeTruthy();
    expect(after!.stunUntil).toBeDefined();
    // 修正前は stunDurationMult を無視して常に +STUN_DURATION_MS(5秒)だった。
    expect(after!.stunUntil!).toBeCloseTo(gt + STUN_DURATION_MS * 2, -1);

    randomSpy.mockRestore();
  });

  it('CRIT-UNIFY §9.4(現行漏れの解消): 分身(shadow clone)のクリもbumpBossCritへ正しく乗る', () => {
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const boss = spawnEnemyAt('giantbat', player.x, player.y, useGameStore.getState().gameTime);
    boss.health = boss.maxHealth;
    boss.bossCritCount = 0;
    useGameStore.setState({ enemies: [boss], effects: [] });
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // 常にクリティカル
    useGameStore.setState(s => ({ player: { ...s.player, critChance: 1 } }));
    const clone = {
      x: player.x, y: player.y, width: player.width, height: player.height,
      facingLeft: false, characterClass: player.characterClass,
      spawnedAt: useGameStore.getState().gameTime, attacksDone: 0, nextAttackAt: useGameStore.getState().gameTime,
    };

    useGameStore.getState().shadowCloneStrike(clone);

    const after = useGameStore.getState().enemies.find(e => e.id === boss.id);
    expect(after).toBeTruthy();
    // 修正前は分身のクリがbumpBossCritを一切呼んでおらず、常に0のままだった。
    expect(after!.bossCritCount).toBe(1);
    expect(after!.bossSlowUntil).toBeGreaterThan(useGameStore.getState().gameTime);

    randomSpy.mockRestore();
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

  it('explosions kill boss-types normally (nonLethalBoss floor abolished v0.25.1571)', () => {
    useGameStore.getState().resetGame('warrior');
    // 廃止(v0.25.1571・owner:廃止): 爆発(旧nonLethalBoss)もボス系を普通に倒せる。
    // damageEnemy の nonLethalBoss 引数は互換のため残置だが、渡しても floor は効かない。
    const boss = spawnEnemyAt('jormungand', 0, 0, 0);
    useGameStore.setState({ enemies: [{ ...boss, health: 30, maxHealth: boss.maxHealth }] });
    const id = useGameStore.getState().enemies[0].id;
    const killedByBlast = useGameStore.getState().damageEnemy(id, 9999, true);
    expect(killedByBlast).toBe(true);
    expect(useGameStore.getState().enemies.find(e => e.id === id)).toBeUndefined();
    // 雑魚は爆発でも従来どおり普通に死ぬ。
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
    // このテストが見たいのは **pity/被り/Lvの不変条件**であって経済ではない。
    // v0.25.2337 でガチャを有料化(0g→100g)、v0.25.2344 で階段式(10→20→35→50)にした際、
    // `goldBalance: 0` のままだったので `pullGacha` が残高不足で null を返し続けて落ちていた
    // (60回ぶんの実費は 5×10+10×20+15×35+30×50 = 2,275g)。**残高を潤沢に積んで経済を判定から外す**。
    // `gachaPullsTotal: 0` も明示リセットする(階段の段は累計回数で決まるため、他テストの影響を受けない)。
    useGameStore.setState({
      ownedSkills: [], ownedSkillLevels: {}, gachaDupeCounts: {}, gachaPitySinceSuper: 0,
      gachaPullsTotal: 0, goldBalance: 1_000_000,
    });
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

  it('MOVEMENT_REWORK.md 仕様2: skaterRiding中はtriggerCounter(近接/カウンター+同入力の各種サブ)が封印される', () => {
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const spawnCloseZombie = () => {
      const z = spawnEnemyAt('zombie', pcx + 4, pcy, useGameStore.getState().gameTime);
      z.health = 9999; // 倒れて即消滅しないように(空振り/命中どちらも観測できる状態を維持)
      useGameStore.setState({ enemies: [z], effects: [] });
    };

    // 乗車中: スイングも当たり判定も一切出ない(swung/hit/finishすべてfalse・effectsも0件)。
    spawnCloseZombie();
    useGameStore.setState(s => ({ player: { ...s.player, skaterRiding: true, counterCooldownEnd: 0 } }));
    const whileRiding = useGameStore.getState().triggerCounter();
    expect(whileRiding).toEqual({ swung: false, hit: false, finish: false, killed: 0 });
    expect(useGameStore.getState().effects.length).toBe(0);
    expect(useGameStore.getState().enemies[0].health).toBe(9999); // ダメージも一切乗らない

    // 降車すれば同じ状況で即座に通常どおり振れる(「降りて即反撃」が成立することの裏取り)。
    useGameStore.setState(s => ({ player: { ...s.player, skaterRiding: false, counterCooldownEnd: 0 } }));
    const afterDismount = useGameStore.getState().triggerCounter();
    expect(afterDismount.swung).toBe(true);
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

  it('索敵中のハンターは静止せず徘徊し、ネットではプレイヤーへ距離を詰める(社長指示: ランダムっぽく見せて実は接近・実配線の検証)', () => {
    // 純関数(hunterWander.test.ts)はロジック単体(乱数注入可)で検証済み。ここでは実際の
    // updateEnemies 経由の配線(dormant分岐→hunterWanderStep→resolveMove→x/y反映)が正しく
    // 繋がっているかを見る。Math.random を固定してフレーク化を防ぐ(実乱数だと20秒程度の
    // 短尺では稀に分散がバイアスを上回ることがある=実測で1回flakeを確認済み)。
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      useGameStore.getState().resetGame('warrior');
      const player = useGameStore.getState().player;
      const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
      const startX = pcx + 2000, startY = pcy; // プレイヤーから2000px離れた索敵中ハンター(索敵範囲外)
      const hunter = spawnEnemyAt('hunter', startX, startY, useGameStore.getState().gameTime);
      hunter.dormant = true;
      hunter.aggroRange = 0; // 実装(spawnHunter)と同じ: 索敵中は自動起床させない
      useGameStore.setState({ enemies: [hunter] });

      const dt = 1 / 60;
      let t = useGameStore.getState().gameTime;
      const initial = useGameStore.getState().enemies[0];
      const startDist = Math.hypot((initial.x + initial.width / 2) - pcx, (initial.y + initial.height / 2) - pcy);

      let everMoved = false;
      for (let i = 0; i < 20 * 60; i++) { // 20秒相当
        t += dt * 1000;
        useGameStore.getState().setGameTime(t);
        useGameStore.getState().updateEnemies(dt);
        const e = useGameStore.getState().enemies[0];
        if (e && (e.x !== startX || e.y !== startY)) everMoved = true;
      }

      const after = useGameStore.getState().enemies[0];
      expect(after).toBeTruthy();
      expect(after.dormant).toBe(true); // 20秒では発見されない距離のまま(索敵状態を維持)
      expect(everMoved).toBe(true); // 静止(vx=vy=0固定)ではなく実際に動いている
      const endDist = Math.hypot((after.x + after.width / 2) - pcx, (after.y + after.height / 2) - pcy);
      expect(endDist).toBeLessThan(startDist); // プレイヤー方向へじわじわ接近する
    } finally {
      randomSpy.mockRestore();
    }
  });
});

// v0.25.2607(社長裁定「2にしよう」): ボスは通常の殴り/弾では押されない。押し道具(鞭・シールド
// バッシュ)を当てた時だけ押される。直した不格好さは①紫の完全気絶中に巨体がズルズル動く
// ②天使がイベントのサークルから押し出されクランプに引き戻される綱引き(押される→すぐ戻る)。
describe('canShoveEnemy: ボスは押し道具でだけ押される', () => {
  const e = (type: string, shoveUntil?: number) =>
    ({ type, knockbackShoveUntil: shoveUntil } as unknown as Pick<Enemy, 'type' | 'knockbackShoveUntil'>);

  it('通常敵は従来どおり常に押せる(押し道具でなくても)', () => {
    expect(canShoveEnemy(e('zombie'), 1000)).toBe(true);
    expect(canShoveEnemy(e('runner'), 1000)).toBe(true);
  });

  it('ボスは押し道具の印が無ければ押せない', () => {
    for (const t of ['giantbat', 'thor', 'idol', 'jibril', 'acrasiel', 'mimir', 'skadi']) {
      expect(canShoveEnemy(e(t), 1000)).toBe(false);
    }
  });

  it('ボスも押し道具(鞭/バッシュ)の有効期限内なら押せる', () => {
    expect(canShoveEnemy(e('giantbat', 1500), 1000)).toBe(true);
    expect(canShoveEnemy(e('idol', 1500), 1000)).toBe(true);
  });

  it('押し道具の印は時刻で切れる(解除処理は要らない)', () => {
    expect(canShoveEnemy(e('giantbat', 1000), 1000)).toBe(false); // 期限ちょうど=もう押せない
    expect(canShoveEnemy(e('giantbat', 999), 1000)).toBe(false);
  });
});
