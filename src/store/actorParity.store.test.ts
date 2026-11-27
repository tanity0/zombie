// 守護霊(ghost-ally)・幻影(guardian-phantom)の武器・スキルをプレイヤーの今の仕様に揃えた分の固定
// (社長指示2026-11-22「守護霊や幻影も揃えないと矛盾する。矛盾するものは残さない」)。
// 中身は全部「守護霊/幻影でもプレイヤーと同じ結果になる」こと:
//  ①カウンターマスターの前倒し(近接・サブウェポン・リロード・刀の一閃)・周りの吹き飛ばし・覚醒の+30%
//  ②刀の斬撃の絵(社長支給の刀の斬撃シート)
//  ③ハンティングの溜まり・覚醒は本人の今の状態=守護霊・幻影へ写らない(召喚の瞬間に溜まっていても伸びない)
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useGameStore, combatActorPlayer, applyCounterMasterRefund, counterMasterOnCounterSuccess, huntingReachBonus,
  huntingMeleeRadius, katanaReach, skillOutgoingDamageMult, COUNTER_MASTER_AWAKEN_BUFF_MS, KATANA_AUTO_SLASH_FX_SCALE,
} from './gameStore';
import { applyGhostCounterMaster, applyPhantomCounterMaster, refundStartAnchor } from '../utils/actorCounterMaster';
import { applyGhostCounterEffect } from '../utils/ghostCounter';
import { clearGhostBuildCache } from '../utils/ghostBuild';
import { GHOST_MELEE_COOLDOWN_MS } from '../utils/ghostDriver';
import { counterMasterRefundFrac } from '../utils/counterMaster';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { createPhantomTickState, runPhantomTick, GUARDIAN_PHANTOM_TYPE } from '../utils/phantomTick';
import { dashStateOf } from '../utils/dashLocomotion';
import type { Enemy, PlayerBuildSnapshot, SkillKey, SubWeaponKey, Summon } from '../types/game';

const GID = 'ghost-parity';
const PID = 'gp-parity';

const snap = (
  subs: SubWeaponKey[], skills: SkillKey[] = [], skillLevels: Partial<Record<SkillKey, number>> = {},
): PlayerBuildSnapshot => ({
  maxHealth: 100, speed: 200, level: 1,
  gunKeys: ['handgun-t1'], activeGunKey: 'handgun-t1', meleeKey: 'knife-t1',
  subWeapons: subs, subWeaponLevels: {}, skills, skillLevels,
});
const ghostAt = (x: number, y: number, build: PlayerBuildSnapshot, extra: Partial<Summon> = {}): Summon => ({
  id: GID, x, y, width: 32, height: 32, speed: 200,
  health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
  createdAt: Date.now(), lastHit: 0, ghostBossId: 'boss-x', ghostBuild: build, ...extra,
});
const ghost = () => useGameStore.getState().summons.find(s => s.id === GID)!;
const placePhantom = (build: PlayerBuildSnapshot, extra: Partial<Enemy> = {}) => {
  const gt = useGameStore.getState().gameTime;
  const e = spawnEnemyAt(GUARDIAN_PHANTOM_TYPE, 2400, 2400, gt);
  e.id = PID;
  e.phantomBuild = build;
  Object.assign(e, extra);
  useGameStore.setState(s => ({ enemies: [e], player: { ...s.player, x: 600, y: 600 } }));
};
const phantom = () => useGameStore.getState().enemies.find(x => x.id === PID)!;
/** 本人に同じスキル・サブを持たせる(プレイヤー側の基準を取るため)。 */
const givePlayer = (subs: SubWeaponKey[], skills: SkillKey[], skillLevels: Partial<Record<SkillKey, number>>) => {
  useGameStore.setState(s => ({ player: { ...s.player, subWeapons: subs, skills, skillLevels } }));
};

beforeEach(() => {
  useGameStore.getState().resetGame('warrior');
  clearGhostBuildCache();
  useGameStore.setState({ gameTime: 100_000 });
});

describe('カウンターマスター: 守護霊でもプレイヤーと同じ割合で待ち時間が縮む', () => {
  for (const lv of [1, 2, 3]) {
    it(`Lv${lv}: サブウェポン・リロード・近接の残りがプレイヤーと同じ割合だけ前倒しになる`, () => {
      const now = 5_000_000;
      const gt = useGameStore.getState().gameTime;
      // ---- プレイヤー(基準) ----
      givePlayer(['heavy-grenade'], ['counter-master'], { 'counter-master': lv });
      useGameStore.setState(s => ({ player: {
        ...s.player, subWeaponCooldowns: { 'heavy-grenade': gt + 4000 },
        reloadingWeaponId: s.player.activeWeaponId, reloadEndsAt: now + 1000, counterCooldownEnd: now + 500,
      } }));
      applyCounterMasterRefund(now);
      const p = useGameStore.getState().player;
      const pSub = (p.subWeaponCooldowns['heavy-grenade'] ?? 0) - gt;
      const pReload = p.reloadEndsAt - now;
      const pMelee = p.counterCooldownEnd - now;

      // ---- 守護霊(同じスキル・同じ残り) ----
      useGameStore.getState().resetGame('warrior');
      clearGhostBuildCache();
      useGameStore.setState({ gameTime: gt });
      useGameStore.setState({ summons: [ghostAt(500, 500, snap(['heavy-grenade'], ['counter-master'], { 'counter-master': lv }), {
        ghostSubWeaponCooldowns: { 'heavy-grenade': gt + 4000 },
        ghostReloadingWeaponId: 'w', ghostReloadEndsAt: now + 1000,
        ghostLastMeleeAt: now + 500 - GHOST_MELEE_COOLDOWN_MS, // 次に振れるまで残り500(プレイヤーと同じ)
      })] });
      applyGhostCounterMaster(GID, now);
      const g = ghost();
      expect((g.ghostSubWeaponCooldowns?.['heavy-grenade'] ?? 0) - gt).toBeCloseTo(pSub, 6);
      expect((g.ghostReloadEndsAt ?? 0) - now).toBeCloseTo(pReload, 6);
      expect((g.ghostLastMeleeAt ?? 0) + GHOST_MELEE_COOLDOWN_MS - now).toBeCloseTo(pMelee, 6);
      // 割合そのものもスキルの表どおり(4000 → 4000×(1−frac))。
      expect(pSub).toBeCloseTo(4000 * (1 - counterMasterRefundFrac(lv)), 6);
    });
  }

  it('刀の一閃のCDも同じ割合(守護霊の一閃の帳簿=ghostDash)', () => {
    const now = 5_000_000;
    givePlayer(['katana'], ['counter-master'], { 'counter-master': 2 });
    useGameStore.setState(s => ({ player: { ...s.player, katanaDashCooldownEnd: now + 1000, katanaDashUntil: 0 } }));
    applyCounterMasterRefund(now);
    const pRemain = useGameStore.getState().player.katanaDashCooldownEnd - now;

    useGameStore.getState().resetGame('warrior');
    clearGhostBuildCache();
    useGameStore.setState({ summons: [ghostAt(500, 500, snap(['katana'], ['counter-master'], { 'counter-master': 2 }), {
      ghostDash: { ...dashStateOf(undefined), katanaDashCooldownEnd: now + 1000 },
    })] });
    applyGhostCounterMaster(GID, now);
    expect(dashStateOf(ghost().ghostDash).katanaDashCooldownEnd - now).toBeCloseTo(pRemain, 6);
    expect(pRemain).toBeCloseTo(300, 6);
  });

  it('スキルを持たない守護霊は何も変わらない(プレイヤーの未所持と同じ)', () => {
    const now = 5_000_000;
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState({ summons: [ghostAt(500, 500, snap(['heavy-grenade']), { ghostSubWeaponCooldowns: { 'heavy-grenade': gt + 4000 } })] });
    applyGhostCounterMaster(GID, now);
    expect(ghost().ghostSubWeaponCooldowns?.['heavy-grenade']).toBe(gt + 4000);
  });

  it('守護霊のカウンター成立(applyGhostCounterEffect)から呼ばれる', () => {
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState({ summons: [ghostAt(500, 500, snap(['heavy-grenade'], ['counter-master'], { 'counter-master': 3 }), {
      ghostSubWeaponCooldowns: { 'heavy-grenade': gt + 4000 },
    })] });
    const boss = { id: 'nobody', x: 900, y: 900, width: 40, height: 40 };
    applyGhostCounterEffect(boss, 520, 520, { claim: { bossId: 'nobody', ghostX: 516, ghostY: 516, dmg: 1, atMs: Date.now() }, sfxGain: 0 }, null);
    expect(ghost().ghostSubWeaponCooldowns?.['heavy-grenade']).toBe(gt); // Lv3=100% → 即使用可
  });

  it('起点型の前倒し(refundStartAnchor): 残りが frac ぶん縮む・未振りはそのまま', () => {
    expect(refundStartAnchor(1000, 600, 1100, 0.5)).toBe(750); // 残り500 → 250(次=1350)
    expect(refundStartAnchor(undefined, 600, 1100, 1)).toBeUndefined();
    expect(refundStartAnchor(0, 600, 1100, 1)).toBe(0); // もう振れる=変えない
  });
});

describe('カウンターマスター: 周りの敵の吹き飛ばし(守護霊=守護霊の体の周り・強さはプレイヤーと同じ)', () => {
  const zombieNear = (cx: number, cy: number): Enemy => {
    const z = spawnEnemyAt('zombie', cx + 30, cy, useGameStore.getState().gameTime);
    z.id = 'z-near';
    return z;
  };
  const kbSpeed = () => {
    const z = useGameStore.getState().enemies.find(e => e.id === 'z-near')!;
    return Math.hypot(z.knockbackVx ?? 0, z.knockbackVy ?? 0);
  };
  it('Lv2: 同じ距離の敵が同じ速さで弾かれる', () => {
    // プレイヤー(基準)
    givePlayer([], ['counter-master'], { 'counter-master': 2 });
    const p = useGameStore.getState().player;
    const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
    const zp = zombieNear(pcx, pcy);
    zp.x = pcx + 30 - zp.width / 2; zp.y = pcy - zp.height / 2;
    useGameStore.setState({ enemies: [zp] });
    counterMasterOnCounterSuccess();
    const playerKb = kbSpeed();
    expect(playerKb).toBeGreaterThan(0);

    // 守護霊(プレイヤーから遠い所)
    useGameStore.getState().resetGame('warrior');
    clearGhostBuildCache();
    useGameStore.setState({ gameTime: 100_000 });
    const gx = useGameStore.getState().player.x + 2000, gy = useGameStore.getState().player.y + 2000;
    useGameStore.setState({ summons: [ghostAt(gx, gy, snap([], ['counter-master'], { 'counter-master': 2 }))] });
    const gcx = gx + 16, gcy = gy + 16;
    const zg = zombieNear(gcx, gcy);
    zg.x = gcx + 30 - zg.width / 2; zg.y = gcy - zg.height / 2;
    useGameStore.setState({ enemies: [zg] });
    applyGhostCounterMaster(GID);
    expect(kbSpeed()).toBeCloseTo(playerKb, 6);
  });

  it('同じフレーム(gameTime)に何度成立しても吹き飛ばしは1回(プレイヤーの成立の縁と同じ)', () => {
    useGameStore.setState({ summons: [ghostAt(500, 500, snap([], ['counter-master'], { 'counter-master': 1 }))] });
    applyGhostCounterMaster(GID);
    expect(ghost().ghostCounterMasterBlowAt).toBe(useGameStore.getState().gameTime);
    const z = spawnEnemyAt('zombie', 530, 500, useGameStore.getState().gameTime);
    z.id = 'z-near';
    useGameStore.setState({ enemies: [z] });
    applyGhostCounterMaster(GID); // 同じ gameTime
    expect(kbSpeed()).toBe(0);
  });
});

describe('カウンターマスター覚醒(Lv3): 守護霊・幻影も自分の成立で3秒+30%', () => {
  it('守護霊: 成立で締め切りが付き、与ダメの倍率がプレイヤーの覚醒中と同じになる', () => {
    const gt = useGameStore.getState().gameTime;
    givePlayer([], ['counter-master'], { 'counter-master': 3 });
    useGameStore.setState(s => ({ player: { ...s.player, counterMasterBuffUntil: gt + COUNTER_MASTER_AWAKEN_BUFF_MS } }));
    const playerMult = skillOutgoingDamageMult(useGameStore.getState().player);
    useGameStore.setState(s => ({ player: { ...s.player, counterMasterBuffUntil: 0 } })); // 本人の覚醒は守護霊へ写らない
    useGameStore.setState({ summons: [ghostAt(500, 500, snap([], ['counter-master'], { 'counter-master': 3 }))] });
    const before = skillOutgoingDamageMult(combatActorPlayer(GID)!);
    applyGhostCounterMaster(GID);
    const actor = combatActorPlayer(GID)!;
    expect(actor.counterMasterBuffUntil).toBe(gt + COUNTER_MASTER_AWAKEN_BUFF_MS);
    expect(skillOutgoingDamageMult(actor)).toBeCloseTo(playerMult, 6);
    expect(skillOutgoingDamageMult(actor)).toBeCloseTo(before * 1.3, 6);
  });

  it('本人の覚醒中に呼んだ守護霊は、本人の覚醒を借りない', () => {
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({ player: { ...s.player, counterMasterBuffUntil: gt + 3000 } }));
    useGameStore.setState({ summons: [ghostAt(500, 500, snap([], ['counter-master'], { 'counter-master': 3 }))] });
    expect(combatActorPlayer(GID)!.counterMasterBuffUntil).toBe(0);
  });

  it('幻影: 成立で締め切りが付く', () => {
    const gt = useGameStore.getState().gameTime;
    placePhantom(snap([], ['counter-master'], { 'counter-master': 3 }));
    applyPhantomCounterMaster(PID, { nextMeleeAt: 0, reloadEndsAt: 0, reloadingWeaponId: '' }, gt, Date.now(), false);
    expect(combatActorPlayer(PID)!.counterMasterBuffUntil).toBe(gt + COUNTER_MASTER_AWAKEN_BUFF_MS);
  });
});

describe('カウンターマスター: 幻影でもプレイヤーと同じ割合で待ち時間が縮む', () => {
  it('Lv2: 近接の周期・サブ・リロードが70%前倒し(プレイヤーの割合と同じ)', () => {
    const gt = useGameStore.getState().gameTime;
    const now = 5_000_000;
    placePhantom(snap(['heavy-grenade'], ['counter-master'], { 'counter-master': 2 }), { phantomSubWeaponCooldowns: { 'heavy-grenade': gt + 4000 } });
    const clocks = { nextMeleeAt: gt + 800, reloadEndsAt: now + 1000, reloadingWeaponId: 'w' };
    applyPhantomCounterMaster(PID, clocks, gt, now, false);
    const frac = counterMasterRefundFrac(2);
    expect(clocks.nextMeleeAt - gt).toBeCloseTo(800 * (1 - frac), 6);
    expect(clocks.reloadEndsAt - now).toBeCloseTo(1000 * (1 - frac), 6);
    expect((phantom().phantomSubWeaponCooldowns?.['heavy-grenade'] ?? 0) - gt).toBeCloseTo(4000 * (1 - frac), 6);
  });

  it('格闘の幻影(拳鬼)は前倒しなし(プレイヤーの格闘と同じ)', () => {
    const gt = useGameStore.getState().gameTime;
    placePhantom(snap(['heavy-grenade'], ['counter-master'], { 'counter-master': 2 }), { phantomSubWeaponCooldowns: { 'heavy-grenade': gt + 4000 } });
    const clocks = { nextMeleeAt: gt + 800, reloadEndsAt: 0, reloadingWeaponId: '' };
    applyPhantomCounterMaster(PID, clocks, gt, Date.now(), true);
    expect(clocks.nextMeleeAt).toBe(gt + 800);
    expect(phantom().phantomSubWeaponCooldowns?.['heavy-grenade']).toBe(gt + 4000);
  });

  it('幻影の成立の打刻(gpParriedAt)を幻影の1tickが拾い、1回だけ前倒しする', () => {
    const gt = useGameStore.getState().gameTime;
    placePhantom(snap(['heavy-grenade'], ['counter-master'], { 'counter-master': 1 }), {
      phantomSubWeaponCooldowns: { 'heavy-grenade': gt + 4000 }, gpParriedAt: gt,
    });
    const s = createPhantomTickState();
    runPhantomTick(phantom(), s, gt, 0.016, 1, Date.now());
    const once = (phantom().phantomSubWeaponCooldowns?.['heavy-grenade'] ?? 0) - gt;
    expect(once).toBeCloseTo(4000 * (1 - counterMasterRefundFrac(1)), 6);
    runPhantomTick(phantom(), s, gt, 0.016, 1, Date.now()); // 同じ打刻=もう縮まない
    expect((phantom().phantomSubWeaponCooldowns?.['heavy-grenade'] ?? 0) - gt).toBeCloseTo(once, 6);
  });
});

describe('ハンティング: 本人の溜まりは守護霊・幻影へ写らない(写ると召喚の瞬間に溜まっていた分だけ永久に伸びる)', () => {
  it('本人が溜まった状態で呼んだ守護霊も、届く距離は伸びない', () => {
    useGameStore.setState(s => ({ player: {
      ...s.player, subWeapons: ['striker-hunting', 'katana'], subWeaponLevels: { 'striker-hunting': 3 }, huntingCharged: true,
    } }));
    expect(huntingReachBonus(useGameStore.getState().player)).toBeGreaterThan(0);
    useGameStore.setState({ summons: [ghostAt(500, 500, snap(['katana']))] });
    const g = combatActorPlayer(GID)!;
    expect(g.huntingCharged).toBe(false);
    expect(huntingReachBonus(g)).toBe(0);
    expect(katanaReach(g)).toBe(katanaReach({ ...g, huntingCharged: false }));
  });
  it('幻影も同じ', () => {
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: ['striker-hunting'], subWeaponLevels: { 'striker-hunting': 3 }, huntingCharged: true } }));
    placePhantom(snap([]));
    const a = combatActorPlayer(PID)!;
    expect(a.huntingCharged).toBe(false);
    expect(huntingMeleeRadius(a)).toBe(huntingMeleeRadius({ ...a, huntingCharged: false }));
  });
});

describe('刀の斬撃の絵: 守護霊の刀もプレイヤーと同じ刀の斬撃シート', () => {
  const lastSlash = () => {
    const fx = useGameStore.getState().effects.filter(e => e.kind === 'slash');
    return fx[fx.length - 1] as unknown as { katana?: boolean; katanaMove?: string; length: number; face: number };
  };
  const zombieAt = (x: number, y: number) => {
    const z = spawnEnemyAt('zombie', x, y, useGameStore.getState().gameTime);
    z.id = 'z-target';
    z.health = 99999; z.maxHealth = 99999;
    useGameStore.setState({ enemies: [z] });
  };
  for (const [label, allowFinisher, move] of [['オート斬撃', false, 'swing'], ['一閃の当たり', true, 'issen']] as const) {
    it(`${label}: 斬撃は刀の斬撃シート(${move})・大きさもプレイヤーと同じ倍率`, () => {
      useGameStore.setState(s => ({ player: { ...s.player, subWeapons: ['katana'] } }));
      const p = useGameStore.getState().player;
      zombieAt(p.x + 40, p.y);
      useGameStore.getState().performKatanaStrike(['z-target'], 1, allowFinisher);
      const ps = lastSlash();
      expect(ps.katana).toBe(true);
      expect(ps.katanaMove).toBe(move);

      useGameStore.getState().resetGame('warrior');
      clearGhostBuildCache();
      useGameStore.setState({ summons: [ghostAt(1500, 1500, snap(['katana']), { ghostFacing: -1 })] });
      zombieAt(1540, 1500);
      useGameStore.getState().performKatanaStrike(['z-target'], 1, allowFinisher, GID);
      const gs = lastSlash();
      expect(gs.katana).toBe(true);
      expect(gs.katanaMove).toBe(move);
      // 長さは乱数(72〜88)×倍率=同じ倍率の範囲に入る(オート斬撃=KATANA_AUTO_SLASH_FX_SCALE・一閃=1倍)
      const scale = allowFinisher ? 1 : KATANA_AUTO_SLASH_FX_SCALE;
      expect(gs.length).toBeGreaterThanOrEqual(72 * scale);
      expect(gs.length).toBeLessThanOrEqual(88 * scale);
      expect(gs.face).toBe(-1); // 向きは守護霊の向き(プレイヤーの向きではない)
    });
  }
});
