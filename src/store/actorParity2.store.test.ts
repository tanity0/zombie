// 守護霊・幻影をプレイヤーの仕様に揃える(2巡目・社長裁定2026-11-22 の5件)。中身は全部「守護霊/幻影でもプレイヤーと同じ結果になる」こと:
//  ①幻影のカウンターマスターの吹き飛ばし(プレイヤー・守護霊・英雄を、プレイヤーの吹き飛ばしと同じ強さ・同じ関数で・同じフレームで1回)
//  ②(拳鬼の気功の二連発は utils/phantomBrawlerTick.test.ts)
//  ③守護霊の燕返し・一閃の浮かせ・切り傷・殺陣
//  ④守護霊の鞭(1撃目・引き寄せ・叩きつけ・爆発)とハンティング
//  ⑤幻影がプレイヤーの届く距離を読む式(meleeReachOf)
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  useGameStore, combatActorPlayer, counterMasterBlowVector, counterMasterBlowOpponents, KNOCKBACK_SPEED, MELEE_RADIUS,
  meleeReachOf, katanaReach, whipReach, huntingMeleeRadius, huntingReachBonus, swingGhostWhip, tickGhostHunting,
  KATANA_DASH_DISTANCE,
} from './gameStore';
import { applyPhantomCounterMaster } from '../utils/actorCounterMaster';
import { clearGhostBuildCache } from '../utils/ghostBuild';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { GUARDIAN_PHANTOM_TYPE } from '../utils/phantomTick';
import { dashStateOf } from '../utils/dashLocomotion';
import { ghostTsubameDir } from '../utils/ghostDriver';
import { isTsubameCrouching, KATANA_CUT_MAX } from '../utils/katanaTsubame';
import { huntingChargeStep } from '../utils/huntingSequence';
import { HUNTING_CHARGE_MS_BY_LEVEL } from '../config/hunting';
import { brawlerAirborne } from '../utils/brawlerCombo';
import { WHIP_CHAIN_INTERVAL_MS } from '../utils/whipFollowup';
import type { Enemy, PlayerBuildSnapshot, SkillKey, SubWeaponKey, Summon } from '../types/game';

const GID = 'ghost-parity2';
const PID = 'gp-parity2';

const snap = (
  subs: SubWeaponKey[], skills: SkillKey[] = [], skillLevels: Partial<Record<SkillKey, number>> = {},
  subWeaponLevels: Partial<Record<SubWeaponKey, number>> = {},
): PlayerBuildSnapshot => ({
  maxHealth: 100, speed: 200, level: 1,
  gunKeys: ['handgun-t1'], activeGunKey: 'handgun-t1', meleeKey: 'knife-t1',
  subWeapons: subs, subWeaponLevels, skills, skillLevels,
});
const ghostAt = (x: number, y: number, build: PlayerBuildSnapshot, extra: Partial<Summon> = {}): Summon => ({
  id: GID, x, y, width: 32, height: 32, speed: 200,
  health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
  createdAt: Date.now(), lastHit: 0, ghostBossId: 'boss-x', ghostBuild: build, ...extra,
});
const ghost = () => useGameStore.getState().summons.find(s => s.id === GID)!;
const zombieAt = (id: string, x: number, y: number, hp = 99999): Enemy => {
  const z = spawnEnemyAt('zombie', x, y, useGameStore.getState().gameTime);
  z.id = id; z.x = x; z.y = y; z.health = hp; z.maxHealth = hp;
  return z;
};
const enemy = (id: string) => useGameStore.getState().enemies.find(e => e.id === id)!;

beforeEach(() => {
  useGameStore.getState().resetGame('warrior');
  clearGhostBuildCache();
  useGameStore.setState({ gameTime: 100_000 });
});
afterEach(() => { vi.useRealTimers(); });

// ---------------------------------------------------------------------------------------------
describe('①幻影のカウンターマスター: 周りのプレイヤー・守護霊・英雄を、プレイヤーの吹き飛ばしと同じ強さで弾く', () => {
  const placePhantom = (lv: number, extra: Partial<Enemy> = {}) => {
    const e = spawnEnemyAt(GUARDIAN_PHANTOM_TYPE, 2400, 2400, useGameStore.getState().gameTime);
    e.id = PID;
    e.phantomBuild = snap([], ['counter-master'], { 'counter-master': lv });
    Object.assign(e, extra);
    useGameStore.setState(s => ({ enemies: [e], player: { ...s.player, x: e.x + e.width / 2 + 30 - s.player.width / 2, y: e.y + e.height / 2 - s.player.height / 2 } }));
    return e;
  };
  const playerKb = () => { const p = useGameStore.getState().player; return Math.hypot(p.knockbackVx ?? 0, p.knockbackVy ?? 0); };
  for (const lv of [1, 2, 3]) {
    it(`Lv${lv}: プレイヤーが受ける押しの速さ=プレイヤーが敵を弾く強さ(KNOCKBACK_SPEED×${[0, 2, 2.5, 3][lv]})・向きは幻影から離れる向き`, () => {
      const e = placePhantom(lv);
      const gt = useGameStore.getState().gameTime;
      applyPhantomCounterMaster(PID, { nextMeleeAt: 0, reloadEndsAt: 0, reloadingWeaponId: '' }, gt, Date.now(), false);
      const p = useGameStore.getState().player;
      const v = counterMasterBlowVector(e.x + e.width / 2, e.y + e.height / 2, p.x + p.width / 2, p.y + p.height / 2, [0, 2, 2.5, 3][lv])!;
      expect(playerKb()).toBeCloseTo(v.speed, 6);
      expect(v.speed).toBeCloseTo(KNOCKBACK_SPEED * [0, 2, 2.5, 3][lv], 6);
      expect(p.knockbackVx ?? 0).toBeGreaterThan(0); // 幻影の右に居る=右へ
      expect((p.knockbackUntil ?? 0)).toBeGreaterThan(Date.now() - 5);
    });
  }
  it('守護霊も同じ速さで弾かれる・届く距離(MELEE_RADIUS×1.5)の外のプレイヤーは弾かれない', () => {
    const e = placePhantom(2);
    const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
    useGameStore.setState(s => ({
      player: { ...s.player, x: ecx + MELEE_RADIUS * 1.5 + 40, knockbackVx: 0, knockbackVy: 0 },
      summons: [ghostAt(ecx - 30 - 16, ecy - 16, snap([]))],
    }));
    applyPhantomCounterMaster(PID, { nextMeleeAt: 0, reloadEndsAt: 0, reloadingWeaponId: '' }, useGameStore.getState().gameTime, Date.now(), false);
    expect(playerKb()).toBe(0);
    const g = ghost();
    expect(Math.hypot(g.knockbackVx ?? 0, g.knockbackVy ?? 0)).toBeCloseTo(KNOCKBACK_SPEED * 2.5, 6);
    expect(g.knockbackVx ?? 0).toBeLessThan(0);
  });
  it('英雄は敵を弾く時と同じ式(knockbackEnemy)で弾かれる・周りの雑魚は弾かない', () => {
    const e = placePhantom(1);
    const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
    const hero = spawnEnemyAt('mutant-hero', ecx + 20, ecy, useGameStore.getState().gameTime);
    hero.id = 'hero-1'; hero.x = ecx + 20 - hero.width / 2; hero.y = ecy - hero.height / 2;
    const z = zombieAt('z-1', ecx - 40, ecy - 10);
    useGameStore.setState(s => ({ enemies: [...s.enemies, hero, z] }));
    counterMasterBlowOpponents(ecx, ecy, combatActorPlayer(PID)!, PID);
    expect(Math.hypot(enemy('hero-1').knockbackVx ?? 0, enemy('hero-1').knockbackVy ?? 0)).toBeGreaterThan(0);
    expect(enemy('z-1').knockbackVx ?? 0).toBe(0);
  });
  it('同じフレームで2回出さない・格闘の幻影(拳鬼)とスキル無しは弾かない', () => {
    placePhantom(1);
    const gt = useGameStore.getState().gameTime;
    const clocks = { nextMeleeAt: 0, reloadEndsAt: 0, reloadingWeaponId: '' };
    applyPhantomCounterMaster(PID, clocks, gt, Date.now(), false);
    useGameStore.setState(s => ({ player: { ...s.player, knockbackVx: 0, knockbackVy: 0 } }));
    applyPhantomCounterMaster(PID, clocks, gt, Date.now(), false); // 同じ gameTime
    expect(playerKb()).toBe(0);
    // 拳鬼
    useGameStore.getState().resetGame('warrior');
    placePhantom(3);
    applyPhantomCounterMaster(PID, { nextMeleeAt: 0, reloadEndsAt: 0, reloadingWeaponId: '' }, gt, Date.now(), true);
    expect(playerKb()).toBe(0);
    // スキル無し
    useGameStore.getState().resetGame('warrior');
    placePhantom(0, { phantomBuild: snap([]) });
    applyPhantomCounterMaster(PID, { nextMeleeAt: 0, reloadEndsAt: 0, reloadingWeaponId: '' }, gt, Date.now(), false);
    expect(playerKb()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('⑤幻影がプレイヤーの届く距離を読む式=プレイヤーと同じ関数(刀・鞭・ハンティング)', () => {
  const withP = (subs: SubWeaponKey[], charged: boolean) => {
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: subs, subWeaponLevels: { 'striker-hunting': 3 }, huntingCharged: charged } }));
    return useGameStore.getState().player;
  };
  it('刀=katanaReach / 鞭=whipReach / ナイフ=huntingMeleeRadius(どれもハンティングで伸びる)', () => {
    let p = withP(['katana', 'striker-hunting'], true);
    expect(meleeReachOf(p)).toBe(katanaReach(p));
    expect(meleeReachOf(p)).toBeGreaterThan(katanaReach({ ...p, huntingCharged: false }));
    p = withP(['whip', 'striker-hunting'], true);
    expect(meleeReachOf(p)).toBe(whipReach(p));
    expect(meleeReachOf(p) - whipReach({ ...p, huntingCharged: false })).toBe(huntingReachBonus(p));
    p = withP(['striker-hunting'], true);
    expect(meleeReachOf(p)).toBe(huntingMeleeRadius(p));
    expect(meleeReachOf(p)).toBeGreaterThan(MELEE_RADIUS);
  });
});

// ---------------------------------------------------------------------------------------------
describe('③守護霊の燕返し・一閃の浮かせ・切り傷・殺陣(プレイヤーと同じ純関数・同じ一閃)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] }); vi.setSystemTime(10_000_000); });
  const setupGhostKatana = () => {
    useGameStore.setState({ summons: [ghostAt(1000, 1000, snap(['katana']))] });
    const z = zombieAt('z-k', 1000 + 16 + 70 - 16, 1000);
    useGameStore.setState({ enemies: [z] });
  };
  /** 一閃を出して着地まで進める(守護霊の位置は一閃の走りで動かす代わりに、着いた所へ置く)。 */
  const issen = (ghostId: string | undefined, dirX: number, dirY: number, tsubame?: { distance: number }) => {
    const ok = useGameStore.getState().triggerKatanaDash(dirX, dirY, ghostId, tsubame);
    // 一閃の走り(移動はループの役目)の代わりに、着く所へ体を置いてから着地の判定を進める。燕返しは体が動かない=置かない。
    if (ok && !tsubame) {
      const d = KATANA_DASH_DISTANCE;
      if (ghostId === undefined) useGameStore.setState(s => ({ player: { ...s.player, x: s.player.x + dirX * d, y: s.player.y + dirY * d } }));
      else useGameStore.setState(s => ({ summons: s.summons.map(x => (x.id === ghostId ? { ...x, x: x.x + dirX * d, y: x.y + dirY * d } : x)) }));
    }
    vi.advanceTimersByTime(400);
    return ok;
  };
  it('守護霊の一閃が当たると切り傷+1・浮く・燕返しの受付が開く(プレイヤーの一閃と同じ)', () => {
    setupGhostKatana();
    expect(issen(GID, 1, 0)).toBe(true);
    const z = enemy('z-k');
    expect(z.katanaCuts).toBe(1);
    expect(brawlerAirborne(z, Date.now())).toBe(true);
    const w = ghost().ghostTsubameWindow;
    expect(w).toBeTruthy();
    expect(w!.hitIds).toContain('z-k');
    expect(useGameStore.getState().tsubameWindow).toBeNull(); // プレイヤーの受付は開かない(主語ごと)
  });
  it('頭脳(ghostTsubameDir)が受付の中で元の位置へ向きを出し、燕返しは体が動かずしゃがむ・無敵なし・切り傷+1・斬撃1本', () => {
    setupGhostKatana();
    issen(GID, 1, 0);
    const g = ghost();
    const dir = ghostTsubameDir(g.ghostTsubameWindow, g.x + 16, g.y + 16, Date.now());
    expect(dir).not.toBeNull();
    expect(dir!.x).toBeLessThan(-0.99);
    const slashes0 = useGameStore.getState().effects.filter(e => e.kind === 'slash').length;
    expect(useGameStore.getState().tryTsubame(dir!.x, dir!.y, GID)).toBe(true);
    const gd = dashStateOf(ghost().ghostDash);
    expect(isTsubameCrouching(gd, Date.now())).toBe(true);
    expect((ghost().ghostInvulnUntil ?? 0)).toBeLessThan(Date.now() + 1); // 燕返しは無敵を付けない
    expect(ghost().ghostTsubameWindow?.used).toBe(true);
    vi.advanceTimersByTime(400);
    expect(enemy('z-k').katanaCuts).toBe(2);
    const tsubameSlashes = useGameStore.getState().effects.filter(e => e.kind === 'slash').slice(slashes0)
      .filter(e => (e as unknown as { katanaMove?: string }).katanaMove === 'tsubame');
    expect(tsubameSlashes.length).toBe(1);
    // 燕返しの後は受付が開かない(1回まで・連鎖しない)
    expect(ghost().ghostTsubameWindow ?? null).toBeNull();
  });
  it('守護霊が刻んだ傷もプレイヤーと同じ敵の傷=4本の敵へ守護霊の一閃で殺陣(主語=守護霊・体が飛ぶのは守護霊)', () => {
    setupGhostKatana();
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => ({ ...e, katanaCuts: KATANA_CUT_MAX })) }));
    const px0 = useGameStore.getState().player.x;
    const gx0 = ghost().x;
    issen(GID, 1, 0);
    const sat = useGameStore.getState().satsujin;
    expect(sat).toBeTruthy();
    expect(sat!.ownerId).toBe(GID);
    expect(sat!.strikes.length).toBeGreaterThan(0);
    expect(enemy('z-k').katanaCuts).toBe(0);
    expect(useGameStore.getState().player.x).toBe(px0); // プレイヤーは動かない
    expect(ghost().x).not.toBe(gx0); // 守護霊が相手の周りへ飛ぶ
  });
  it('プレイヤーの一閃でも守護霊が刻んだ傷を数える(4本目→殺陣)', () => {
    setupGhostKatana();
    issen(GID, 1, 0); // 傷1(守護霊)
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => ({ ...e, katanaCuts: KATANA_CUT_MAX })) }));
    // プレイヤーを刀にして敵の左へ
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: ['katana'], x: 1000 + 40, y: 1000 } }));
    issen(undefined, 1, 0);
    expect(useGameStore.getState().satsujin?.ownerId).toBeUndefined();
    expect(useGameStore.getState().satsujin).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
describe('④守護霊の鞭: 1撃目の浮き・浮いた敵への叩きつけ・爆発・スラッシャーの連続がプレイヤーと同じ関数(research/WHIP_FOLLOWUP.md §7)', () => {
  const setupWhip = (subs: SubWeaponKey[] = ['whip'], subLv: Partial<Record<SubWeaponKey, number>> = {}, skills: SkillKey[] = [], skillLevels: Partial<Record<SkillKey, number>> = {}) => {
    useGameStore.setState({ summons: [ghostAt(1000, 1000, snap(subs, skills, skillLevels, subLv))] });
    const z = zombieAt('z-w', 1000 + 16 + 90 - 16, 1000);
    const z2 = zombieAt('z-near', 1000 + 16 + 90 - 16 + 40, 1000 + 20);
    useGameStore.setState({ enemies: [z, z2] });
  };
  it('1撃目: プレイヤーの鞭と同じ打撃(同じビルドなら同じダメージ)・当たった地上の敵はその場で浮く・プレイヤーの連続は始まらない', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(20_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.999); // クリなし
    setupWhip();
    const ghostActor = combatActorPlayer(GID)!;
    const hp0 = enemy('z-w').health;
    const res = swingGhostWhip(GID, 1, 0);
    expect(res.hits).toBeGreaterThan(0);
    expect(enemy('z-w').health).toBeLessThan(hp0);
    expect(enemy('z-w').brLiftShape).toBe('whip');
    expect(brawlerAirborne(enemy('z-w'), Date.now() + 500)).toBe(true);
    expect(useGameStore.getState().whipChain).toBeNull();
    expect(ghost().ghostWhipChain ?? null).toBeNull(); // スラッシャーなし=連続なし
    const ghostDmg = hp0 - enemy('z-w').health;
    // 同じビルド・同じ位置関係のプレイヤーが振る(基準)。
    useGameStore.setState({ summons: [], enemies: [zombieAt('z-w', 1000 + 16 + 90 - 16, 1000)], player: { ...ghostActor } });
    const r2 = useGameStore.getState().performWhipStrike(['z-w'], { dir: { x: 1, y: 0 } });
    expect(r2.hits).toBe(1);
    const playerDmg = 99999 - enemy('z-w').health;
    expect(ghostDmg).toBeCloseTo(playerDmg, 6);
    vi.restoreAllMocks();
  });
  it('浮いている敵へ次の振りが当たると自動で叩きつけ: 2倍+周りが爆発で削れる(フリックの頭脳は無い)', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(20_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    setupWhip();
    swingGhostWhip(GID, 1, 0);
    // 浮いた敵はその場にいる(押さない)。爆発だけ当たる敵を鞭の先の奥に置けるよう、少し奥へずらす
    expect(enemy('z-w').knockbackVx ?? 0).toBe(0);
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === 'z-w' ? { ...e, x: e.x + 30 } : e)) }));
    const d1 = 99999 - enemy('z-w').health;
    vi.setSystemTime(Date.now() + 600);
    expect(brawlerAirborne(enemy('z-w'), Date.now())).toBe(true);
    // z-near を z-w の近く(爆発の中)・鞭の先より奥(振りには当たらない)へ
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.id === 'z-near' ? { ...e, x: enemy('z-w').x + 55, y: enemy('z-w').y } : e)) }));
    const hpW = enemy('z-w').health, hpN = enemy('z-near').health;
    const r = swingGhostWhip(GID, 1, 0);
    expect(r.slammed).toBe(1);
    expect(hpW - enemy('z-w').health).toBeGreaterThanOrEqual(d1 * 2 - 1e-6);
    expect(enemy('z-near').health).toBeLessThan(hpN); // 叩きつけの爆発(周りの敵)
    expect(enemy('z-w').brLiftPeak).toBe(0); // 叩き落とし(押し上げ0)
    vi.restoreAllMocks();
  });
  it('スラッシャー Lv3 の守護霊: 0.5秒ごとに追加3つ・浮かせ続けて最後は叩きつけ(プレイヤーと同じ tickWhipChain)', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(20_000_000);
    setupWhip(['whip'], {}, ['slasher'], { slasher: 3 });
    swingGhostWhip(GID, 1, 0);
    expect(ghost().ghostWhipChain?.extras).toBe(3);
    const t0 = Date.now();
    const modes: string[] = [];
    for (let t = 10; t <= 3 * WHIP_CHAIN_INTERVAL_MS + 20; t += 10) {
      vi.setSystemTime(t0 + t);
      const r = useGameStore.getState().tickWhipChain(GID);
      if (r) {
        modes.push(r.mode);
        if (r.mode === 'keep') expect(brawlerAirborne(enemy('z-w'), Date.now())).toBe(true);
        if (r.mode === 'final') expect(r.slammed).toBeGreaterThan(0);
      }
    }
    expect(modes).toEqual(['keep', 'keep', 'final']);
    expect(ghost().ghostWhipChain ?? null).toBeNull();
    expect(useGameStore.getState().whipChain).toBeNull(); // プレイヤーの連続は動かない
  });
});

// ---------------------------------------------------------------------------------------------
describe('④守護霊のハンティング: 動いている間に溜まり、一連の動きの間は伸びる(プレイヤーと同じ純関数)', () => {
  it('溜めの1歩(huntingChargeStep)はプレイヤーの旧式と同じ', () => {
    expect(huntingChargeStep({ enabled: true, active: true, startedAt: 0, charged: false, now: 1000, chargeMs: 500 })).toEqual({ startedAt: 1000, charged: false });
    expect(huntingChargeStep({ enabled: true, active: true, startedAt: 1000, charged: false, now: 1500, chargeMs: 500 })).toEqual({ startedAt: 1000, charged: true });
    expect(huntingChargeStep({ enabled: true, active: false, startedAt: 1000, charged: false, now: 1400, chargeMs: 500 })).toEqual({ startedAt: 0, charged: false });
    expect(huntingChargeStep({ enabled: true, active: false, startedAt: 1000, charged: true, now: 9000, chargeMs: 500 })).toEqual({ startedAt: 1000, charged: true });
  });
  it('守護霊が動き続けると溜まる → 鞭の線がプレイヤーと同じだけ伸びる → 1撃目が当たるとスラッシャーの連続の間は一連(whip)・終わると使い切る', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(30_000_000);
    useGameStore.setState({ summons: [ghostAt(1000, 1000, snap(['whip', 'striker-hunting'], ['slasher'], { slasher: 1 }, { 'striker-hunting': 2 }))] });
    const gt0 = useGameStore.getState().gameTime;
    tickGhostHunting(GID, true);
    expect(combatActorPlayer(GID)!.huntingCharged).toBe(false);
    useGameStore.setState({ gameTime: gt0 + HUNTING_CHARGE_MS_BY_LEVEL[2] + 1 });
    tickGhostHunting(GID, true);
    const a = combatActorPlayer(GID)!;
    expect(a.huntingCharged).toBe(true);
    // プレイヤーが同じ Lv で溜まった時と同じ伸び
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: ['whip', 'striker-hunting'], subWeaponLevels: { 'striker-hunting': 2 }, huntingCharged: true } }));
    expect(whipReach(a)).toBe(whipReach(useGameStore.getState().player));
    // 伸びた先の敵に当たる(伸びていなければ届かない所)
    const baseLen = whipReach({ ...a, huntingCharged: false });
    const z = zombieAt('z-far', 1000 + 16 + baseLen + 10 - 16, 1000);
    useGameStore.setState({ enemies: [z] });
    const res = swingGhostWhip(GID, 1, 0);
    expect(res.hits).toBe(1);
    expect(combatActorPlayer(GID)!.huntingSequence).toBe('whip');
    tickGhostHunting(GID, false);
    expect(combatActorPlayer(GID)!.huntingCharged).toBe(true); // 追加の振りが残っている間
    // 追加の振り(Lv1=1つ=最後の叩きつけ)が出たら使い切る
    vi.setSystemTime(Date.now() + WHIP_CHAIN_INTERVAL_MS + 10);
    useGameStore.getState().tickWhipChain(GID);
    tickGhostHunting(GID, false);
    const b = combatActorPlayer(GID)!;
    expect(b.huntingCharged).toBe(false);
    expect(b.huntingSequence).toBeUndefined();
  });
  it('止まっていると溜まらない・本人の溜まりは写らない(1巡目の決まりのまま)', () => {
    useGameStore.setState(s => ({ player: { ...s.player, huntingCharged: true }, summons: [ghostAt(1000, 1000, snap(['whip', 'striker-hunting'], [], {}, { 'striker-hunting': 1 }))] }));
    const gt0 = useGameStore.getState().gameTime;
    tickGhostHunting(GID, false);
    useGameStore.setState({ gameTime: gt0 + 99999 });
    tickGhostHunting(GID, false);
    expect(combatActorPlayer(GID)!.huntingCharged).toBe(false);
  });
});
