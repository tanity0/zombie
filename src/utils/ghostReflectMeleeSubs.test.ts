// GHOST-REFLECT-MELEE-SUBS(v0.25.2525 / research/GHOST_PARITY_LEDGER.md 発注A・B・C)。
// 掟の機械化: 守護霊は**プレイヤーと同じ窓・同じ条件・同じ式**で弾を反射し、気絶敵を処刑し、
// 近接スイング相乗り型サブを撃つ。差分は除外1(演出)/除外4(運用系)だけ。
//  A: 弾反射     — 窓(ghostCounterWindowEnd=COUNTER_WINDOW)中の被弾は反射になる。反射弾は
//                  'ghost-reflect'帰属(計測除外/ヘイト分離)で、プレイヤーのCD/成立時刻は動かない。
//  B: 気絶フィニッシュ — ボス5×(完全気絶中は気絶維持)/強個体3×/雑魚即死。裁定はプレイヤーと同じ純関数。
//  C: サブの相乗り — ドローンブーメラン/フレアガン/ジャンクウェポン。スクラップは消費しない。
//                  ※v0.25.2541(§2.11追補・GHOST-SAME-SPEC)で「1つの財布」は廃止=CDはゴースト
//                    自前の帳簿(Summon.ghostSubWeaponCooldowns)。分身/センサー地雷も同じ入口に合流。
//                    追加ぶんの不変条件は ghostSameSpec.test.ts が持つ。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useGameStore, COUNTER_WINDOW, COUNTER_EXTEND_PER_HIT, REFLECT_DAMAGE_MULTIPLIER,
  BOSS_MELEE_STUN_MULT, DRONE_BOOM_COOLDOWN_MS, meleeSwingBaseDamage, combatActorPlayer,
} from '../store/gameStore';
import { applyEnemyProjectileHits, NOOP_COMBAT_EFFECTS } from './combatTick';
import { clearGhostBuildCache } from './ghostBuild';
import { ELITE_MELEE_STUN_MULT } from './meleeExecute';
import { spawnEnemyAt } from './enemyUtils';
import { classifyProjectileDamageChannel } from './botTelemetry';
import { GHOST_REFLECT_WEAPON_KEY } from './weaponUtils';
import type { PlayerBuildSnapshot, Projectile, Summon, SubWeaponKey } from '../types/game';

const GID = 'ghost-test';
const GX = 2400, GY = 2400; // プレイヤー(初期位置)から十分離す=プレイヤー側の判定に混ざらない

const snap = (
  subs: SubWeaponKey[],
  levels: Partial<Record<SubWeaponKey, number>> = {},
  extra: Partial<PlayerBuildSnapshot> = {},
): PlayerBuildSnapshot => ({
  maxHealth: 100, speed: 200, level: 1,
  gunKeys: ['handgun-t1'], activeGunKey: 'handgun-t1', meleeKey: 'knife-t1',
  subWeapons: subs, subWeaponLevels: levels,
  ...extra,
});

const ghostAt = (build: PlayerBuildSnapshot): Summon => ({
  id: GID, x: GX, y: GY, width: 32, height: 32, speed: 200,
  health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
  createdAt: Date.now(), lastHit: 0, ghostBossId: 'boss-x', ghostBuild: build,
});

const place = (build: PlayerBuildSnapshot) => {
  useGameStore.getState().resetGame('warrior');
  clearGhostBuildCache();
  useGameStore.setState({ summons: [ghostAt(build)] });
};
const ghost = () => useGameStore.getState().summons.find(s => s.id === GID);

/** ゴーストに重なるボス弾(giantbat=isEngageableBoss)。 */
const bossBoltOnGhost = (): Projectile => ({
  id: 'p-boss-bolt', x: GX + 8, y: GY + 8, width: 10, height: 10,
  speed: 200, damage: 7, direction: { x: 1, y: 0 },
  weaponType: 'enemy_bolt', duration: 4000, createdAt: Date.now(),
  passthrough: false, hitEnemies: [], hostile: true, reflected: false,
  ownerType: 'giantbat',
});

const TUNABLES = { grenadeBlastRadius: 100, grenadeBlastDamageMult: 1, counterReflectSlowMs: 360 };
const runProjectileHits = () => {
  const s = useGameStore.getState();
  applyEnemyProjectileHits(Date.now(), s.player, false, 0, s.gameTime, NOOP_COMBAT_EFFECTS, TUNABLES);
};
const openGhostWindow = () => {
  useGameStore.setState(st => ({
    summons: st.summons.map(g => g.id === GID ? { ...g, ghostCounterWindowEnd: Date.now() + COUNTER_WINDOW } : g),
  }));
};

beforeEach(() => { useGameStore.getState().resetGame('warrior'); clearGhostBuildCache(); });

// ---------------------------------------------------------------------------
describe('A: 弾反射(台帳§4-1)', () => {
  it('窓が開いていればボス弾を反射する(プレイヤーの反射と同じ生成: 逆向き/×10/貫通なし)', () => {
    place(snap([]));
    useGameStore.getState().addProjectile(bossBoltOnGhost());
    openGhostWindow();
    const hpBefore = ghost()!.health;
    runProjectileHits();
    const p = useGameStore.getState().projectiles.find(x => x.id === 'p-boss-bolt')!;
    expect(p).toBeDefined();
    expect(p.hostile).toBe(false);
    expect(p.reflected).toBe(true);
    expect(p.passthrough).toBe(false);
    expect(p.damage).toBe(7 * REFLECT_DAMAGE_MULTIPLIER);
    expect(p.direction.x).toBe(-1);
    expect(ghost()!.health).toBe(hpBefore); // 反射した=ダメージにならない
  });

  it('窓が閉じていれば従来どおり被弾(反射しない・弾は消える)', () => {
    place(snap([]));
    useGameStore.getState().addProjectile(bossBoltOnGhost());
    const hpBefore = ghost()!.health;
    runProjectileHits();
    expect(useGameStore.getState().projectiles.find(x => x.id === 'p-boss-bolt')).toBeUndefined();
    expect(ghost()!.health).toBeLessThan(hpBefore);
  });

  it('反射弾は守護霊帰属(ghost-reflect)=プレイヤーの計測を汚さない(除外4)', () => {
    place(snap([]));
    useGameStore.getState().addProjectile(bossBoltOnGhost());
    openGhostWindow();
    runProjectileHits();
    const p = useGameStore.getState().projectiles.find(x => x.id === 'p-boss-bolt')!;
    expect(p.weaponKey).toBe(GHOST_REFLECT_WEAPON_KEY);
    expect(classifyProjectileDamageChannel(p.weaponType, p.weaponKey)).toBeNull();
  });

  it('反射のたびに窓が延長される(プレイヤーと同じ COUNTER_EXTEND_PER_HIT)', () => {
    place(snap([]));
    useGameStore.getState().addProjectile(bossBoltOnGhost());
    // 窓を「あと1ms」まで詰めてから反射させる=延長が効いたことが分かる
    const now = Date.now();
    useGameStore.setState(st => ({
      summons: st.summons.map(g => g.id === GID ? { ...g, ghostCounterWindowEnd: now + 1 } : g),
    }));
    runProjectileHits();
    expect(ghost()!.ghostCounterWindowEnd).toBeGreaterThanOrEqual(now + COUNTER_EXTEND_PER_HIT);
  });

  it('守護霊の反射でプレイヤーのシステム値(窓/CD/成立時刻)は1bitも動かない(除外4)', () => {
    place(snap([]));
    const before = useGameStore.getState().player;
    useGameStore.getState().addProjectile(bossBoltOnGhost());
    openGhostWindow();
    runProjectileHits();
    const after = useGameStore.getState().player;
    expect(after.counterWindowEnd).toBe(before.counterWindowEnd);
    expect(after.counterCooldownEnd).toBe(before.counterCooldownEnd);
    expect(after.lastCounterSuccessTime).toBe(before.lastCounterSuccessTime);
  });

  it('ボムカウンター(スキル)の主語は計測時ビルドの疑似Player=ゴーストのビルドで爆発化する', () => {
    place(snap([], {}, { skills: ['bomb-counter'], skillLevels: { 'bomb-counter': 1 } }));
    expect(useGameStore.getState().player.skills).not.toContain('bomb-counter'); // 本人は未所持
    useGameStore.getState().addProjectile(bossBoltOnGhost());
    openGhostWindow();
    runProjectileHits();
    const p = useGameStore.getState().projectiles.find(x => x.id === 'p-boss-bolt')!;
    expect(p.explodeOnHit).toBe(true);
  });

  it('【プレイヤー対照】プレイヤーの反射は従来どおり(帰属キー無し+成立時刻の打刻あり)', () => {
    useGameStore.getState().resetGame('warrior');
    const pl = useGameStore.getState().player;
    const now = Date.now();
    useGameStore.setState({
      player: { ...pl, counterWindowEnd: now + COUNTER_WINDOW },
      projectiles: [{
        ...bossBoltOnGhost(),
        id: 'p-on-player', x: pl.x + 4, y: pl.y + 4,
      }],
    });
    runProjectileHits();
    const p = useGameStore.getState().projectiles.find(x => x.id === 'p-on-player')!;
    expect(p.reflected).toBe(true);
    expect(p.weaponKey).toBeUndefined(); // プレイヤーの反射弾は帰属キーを持たない(従来と同じ)
    expect(useGameStore.getState().player.lastCounterSuccessTime).toBeGreaterThanOrEqual(now);
  });
});

// ---------------------------------------------------------------------------
describe('B: 気絶敵への近接フィニッシュ(台帳§3-3)', () => {
  const putEnemy = (type: Parameters<typeof spawnEnemyAt>[0], opts: Partial<ReturnType<typeof spawnEnemyAt>> = {}) => {
    const e = { ...spawnEnemyAt(type, GX + 20, GY, 0), id: 'e1', ...opts };
    useGameStore.setState({ enemies: [e] });
    return useGameStore.getState().enemies[0];
  };
  const ghostBaseMelee = () => {
    const actor = combatActorPlayer(GID)!;
    return meleeSwingBaseDamage(actor.weapons.find(w => w.isMelee), actor);
  };

  it('気絶していない敵ではnull(=通常スイング経路のまま)', () => {
    place(snap([]));
    putEnemy('zombie');
    expect(useGameStore.getState().applyGhostMeleeFinisher(GID, 'e1')).toBeNull();
  });

  it('気絶した雑魚は即時処刑(viaMeleeFinish 経路)', () => {
    place(snap([]));
    putEnemy('zombie', { stunUntil: useGameStore.getState().gameTime + 5000 });
    const r = useGameStore.getState().applyGhostMeleeFinisher(GID, 'e1');
    expect(r?.kind).toBe('execute');
    expect(r?.killed).toBe(true);
    // v0.25.3264(KILL吹き飛び): 撃破後は即消滅ではなく約0.28秒「死体」(corpseUntil)として残って
    // 吹き飛んでから消える。処刑=killedの検証はr.killedで済んでおり、盤面上は死体化を確認する。
    const executed = useGameStore.getState().enemies.find(e => e.id === 'e1');
    expect(executed === undefined || executed.corpseUntil !== undefined).toBe(true);
    if (executed) expect(executed.health).toBe(0);
  });

  it('気絶したボスは即死せず近接×5+気絶解除+浮き(プレイヤーのナイフと同じ値)', () => {
    place(snap([]));
    const gt = useGameStore.getState().gameTime;
    putEnemy('giantbat', { stunUntil: gt + 5000, health: 99999, maxHealth: 99999 });
    const expected = Math.max(1, Math.round(ghostBaseMelee() * BOSS_MELEE_STUN_MULT));
    const r = useGameStore.getState().applyGhostMeleeFinisher(GID, 'e1');
    expect(r?.kind).toBe('boss');
    expect(r?.dmg).toBe(expected);
    expect(r?.killed).toBe(false);
    const e = useGameStore.getState().enemies.find(x => x.id === 'e1')!;
    expect(e.health).toBe(99999 - expected);
    expect(e.stunUntil).toBeUndefined();     // 通常の気絶は1発で解除
    expect(e.liftUntil ?? 0).toBeGreaterThan(0);
  });

  it('完全気絶(紫)中のボスは気絶を維持したまま5×を受け続ける', () => {
    place(snap([]));
    const gt = useGameStore.getState().gameTime;
    putEnemy('giantbat', { stunUntil: gt + 5000, bossFullStunUntil: gt + 5000, health: 99999, maxHealth: 99999 });
    useGameStore.getState().applyGhostMeleeFinisher(GID, 'e1');
    expect(useGameStore.getState().enemies.find(x => x.id === 'e1')!.stunUntil).toBe(gt + 5000);
  });

  // 強個体=**非ボス型のネームド/クエスト個体**(pumpkin/lab-zombie-3 は isBossType 側で先に拾われる)。
  it('強個体(HP50%以上)は即死せず×3+気絶解除', () => {
    place(snap([]));
    const gt = useGameStore.getState().gameTime;
    putEnemy('zombie', { stunUntil: gt + 5000, isNamed: true, health: 99999, maxHealth: 99999 });
    const expected = Math.max(1, Math.round(ghostBaseMelee() * ELITE_MELEE_STUN_MULT));
    const r = useGameStore.getState().applyGhostMeleeFinisher(GID, 'e1');
    expect(r?.kind).toBe('heavy');
    expect(r?.dmg).toBe(expected);
    expect(useGameStore.getState().enemies.find(x => x.id === 'e1')!.stunUntil).toBeUndefined();
  });

  it('ゴーストが居ない(解散後)なら何も起きない', () => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState({ enemies: [{ ...spawnEnemyAt('zombie', 100, 100, 0), id: 'e1', stunUntil: 999999 }] });
    expect(useGameStore.getState().applyGhostMeleeFinisher(GID, 'e1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('C: 近接スイング相乗り型サブ(台帳§7)', () => {
  // v0.25.2541(§2.11追補): CDは「1つの財布」を**廃止**し、守護霊の自前帳簿へ入る
  // (ghostSubWeaponCooldowns)。プレイヤーのCD表は動かない=2人分が独立に回る。
  it('ドローンブーメラン: ゴースト位置から出て、CDはゴースト自前の帳簿に入る(プレイヤーは動かない)', () => {
    place(snap(['drone-boomerang']));
    const r = useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    expect(r.boomerang).toBe(true);
    const boom = useGameStore.getState().projectiles.find(p => p.weaponKey === 'sub-drone-boomerang')!;
    expect(boom).toBeDefined();
    expect(boom.ownerGhost).toBe(true);
    expect(boom.boomOriginX).toBe(GX + 16); // ゴースト中心
    expect(ghost()!.ghostSubWeaponCooldowns?.['drone-boomerang'])
      .toBeGreaterThanOrEqual(useGameStore.getState().gameTime + DRONE_BOOM_COOLDOWN_MS - 1);
    expect(useGameStore.getState().player.subWeaponCooldowns['drone-boomerang']).toBeUndefined();
    // CD中の次のスイングでは出ない(プレイヤーと同条件)
    expect(useGameStore.getState().fireGhostMeleeSwingSubs(GID).boomerang).toBe(false);
  });

  it('フレアガン: ゴースト位置から発射され、CDはゴースト自前の帳簿に入る', () => {
    place(snap(['flare-gun']));
    const r = useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    expect(r.flare).toBe(true);
    const flare = useGameStore.getState().flareGunFlares[0];
    expect(flare.fromX).toBe(GX + 16);
    expect(ghost()!.ghostSubWeaponCooldowns?.['flare-gun'])
      .toBeGreaterThan(useGameStore.getState().gameTime);
    expect(useGameStore.getState().player.subWeaponCooldowns['flare-gun']).toBeUndefined();
    expect(useGameStore.getState().fireGhostMeleeSwingSubs(GID).flare).toBe(false);
  });

  it('ジャンクウェポン: 5発出るがスクラップは消費しない(除外4=弾薬非消費)', () => {
    place(snap(['junk-weapon']));
    useGameStore.setState(s => ({ player: { ...s.player, straps: 0 } })); // 在庫0でも撃てる(弾薬の概念が無い)
    const r = useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    expect(r.junk).toBe(true);
    const pellets = useGameStore.getState().projectiles.filter(p => p.weaponKey === 'sub-junk-weapon');
    expect(pellets.length).toBe(5);
    expect(pellets.every(p => p.ownerGhost === true)).toBe(true);
    expect(useGameStore.getState().player.straps).toBe(0);
    expect(useGameStore.getState().gameStats.strapsSpent).toBe(0);
  });

  it('刀ビルドでは相乗り型サブは出ない(プレイヤーと同じ排他=subWeaponBlockedByKatana)', () => {
    place(snap(['katana', 'drone-boomerang', 'flare-gun', 'junk-weapon', 'shadow-clone', 'sensor-mine']));
    const r = useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    expect(r).toEqual({ boomerang: false, flare: false, junk: false, clone: false, mine: false });
    expect(useGameStore.getState().projectiles.length).toBe(0);
    expect(useGameStore.getState().sensorMines.length).toBe(0);
    expect(ghost()!.ghostShadowClone).toBeUndefined();
  });

  it('持っていないサブは出ない / ゴースト不在なら何も起きない', () => {
    place(snap([]));
    const none = { boomerang: false, flare: false, junk: false, clone: false, mine: false };
    expect(useGameStore.getState().fireGhostMeleeSwingSubs(GID)).toEqual(none);
    expect(useGameStore.getState().fireGhostMeleeSwingSubs('nope')).toEqual(none);
  });

  it('プレイヤーのスクラップ/CD以外の持ち物は動かない(ゴースト発動でプレイヤー在庫は減らない)', () => {
    place(snap(['junk-weapon', 'drone-boomerang']));
    const before = useGameStore.getState().player;
    useGameStore.getState().fireGhostMeleeSwingSubs(GID);
    const after = useGameStore.getState().player;
    expect(after.straps).toBe(before.straps);
    expect(after.ammoHandgun).toBe(before.ammoHandgun);
    expect(after.health).toBe(before.health);
  });
});
