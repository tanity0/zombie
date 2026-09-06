import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import {
  createWeapon, nextKnifeKey, MELEE_KEYS, MAX_KNIFE_TIER, getWeaponShortName,
  beginWeaponReload, finishWeaponReload, refillWeaponMagazine, weaponAfterGunShot,
  effectiveFireCooldown, effectiveMagSize, weaponReloadReserve,
  resolveShotgunSpreadRad, computeShotDirections, computeShotAngleOffsets, fireWeapon, DUALRANGE_WEAPON_KEY,
} from './weaponUtils';
import { spawnEnemyAt } from './enemyUtils';
import { DUAL_RANGE_STATS } from './dualRangeGun';

describe('knife progression', () => {
  it('MELEE_KEYS is the 5-tier ladder in ascending order', () => {
    expect(MELEE_KEYS).toEqual([
      'knife-t1', 'hatchet-t2', 'machete-t3', 'tactical-knife-t4', 'anti-mutant-knife-t5',
    ]);
    expect(MAX_KNIFE_TIER).toBe(5);
  });

  it('nextKnifeKey returns the tier above the current one', () => {
    expect(nextKnifeKey(1)).toBe('hatchet-t2');
    expect(nextKnifeKey(3)).toBe('tactical-knife-t4');
    expect(nextKnifeKey(4)).toBe('anti-mutant-knife-t5');
  });

  it('nextKnifeKey returns undefined at or above max tier', () => {
    expect(nextKnifeKey(5)).toBeUndefined();
    expect(nextKnifeKey(6)).toBeUndefined();
  });
});

describe('createWeapon', () => {
  it('builds the Tier1 knife to spec (dmg 8 / crit 0.05 / melee)', () => {
    const w = createWeapon('knife-t1');
    expect(w.name).toBe('ナイフ');
    expect(w.damage).toBe(8);
    expect(w.critChance).toBeCloseTo(0.05);
    expect(w.isMelee).toBe(true);
    expect(w.tier).toBe(1);
  });

  it('builds the Tier5 knife to spec (dmg 50 / crit 0.25)', () => {
    const w = createWeapon('anti-mutant-knife-t5');
    expect(w.damage).toBe(50);
    expect(w.critChance).toBeCloseTo(0.25);
    expect(w.tier).toBe(5);
    expect(w.isMelee).toBe(true);
  });

  it('builds a gun fully loaded (magazine == magSize) and not melee', () => {
    const g = createWeapon('handgun-t1');
    expect(g.category).toBe('handgun');
    expect(g.magSize).toBe(12);
    expect(g.magazine).toBe(12);
    expect(g.isMelee).toBeFalsy();
  });

  it('falls back to handgun-t1 for an unknown key', () => {
    const w = createWeapon('does-not-exist');
    expect(w.key).toBe('handgun-t1');
  });
});

describe('getWeaponShortName', () => {
  it('maps the new melee types', () => {
    expect(getWeaponShortName('tactical-knife')).toBe('タクティカルナイフ');
    expect(getWeaponShortName('anti-mutant-knife')).toBe('対変異体ナイフ');
  });
  it('maps gun families and falls back for unknown', () => {
    expect(getWeaponShortName('shotgun')).toBe('ショットガン');
    // @ts-expect-error intentionally unknown type for the fallback branch
    expect(getWeaponShortName('mystery')).toBe('武器');
  });
});

describe('shared magazine/reload cycle', () => {
  it('プレイヤー/守護霊共通の容量・連射・リロード状態を純関数で進める', () => {
    useGameStore.getState().resetGame('warrior');
    const base = useGameStore.getState().player;
    const player = {
      ...base,
      magBonus: 3,
      reloadMult: 0.5,
      equipBonus: { ...base.equipBonus, fireRateMult: 2 },
    };
    const empty = { ...createWeapon('handgun-t1'), magazine: 0 };
    expect(effectiveMagSize(empty, player)).toBe(15);
    expect(effectiveFireCooldown(empty, player)).toBe(empty.cooldown / 2);

    const started = beginWeaponReload(empty, player, Number.POSITIVE_INFINITY, 1000)!;
    expect(started.reloadingWeaponId).toBe(empty.id);
    expect(started.reloadEndsAt).toBeGreaterThan(1000);
    expect(finishWeaponReload(empty, { ...player, ...started }, Number.POSITIVE_INFINITY, started.reloadEndsAt - 1)).toBeNull();
    const finished = finishWeaponReload(empty, { ...player, ...started }, Number.POSITIVE_INFINITY, started.reloadEndsAt)!;
    expect(finished.weapon.magazine).toBe(15);
    expect(finished.reserve).toBe(Number.POSITIVE_INFINITY);
    expect(finished.reloadingWeaponId).toBe('');
  });

  it('クイックマガジンと通常リロードは同じ装填式、1トリガーは1発消費', () => {
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const gun = { ...createWeapon('shotgun-t1'), magazine: 1 };
    const afterShot = weaponAfterGunShot(gun, player, 1234, () => 1);
    expect(afterShot.magazine).toBe(0);
    expect(afterShot.lastFired).toBe(1234);
    const filled = refillWeaponMagazine(afterShot, player, Number.POSITIVE_INFINITY);
    expect(filled.weapon.magazine).toBe(effectiveMagSize(gun, player));
  });
});

// UNIQUE_WEAPONS.md §16(バッチA)の4挺。
describe('バッチA: CATALOGの新規4挺', () => {
  it('制圧型ショットガン(shotgun-t2-suppress): rangeOverride=250・spreadRadOverride=1.30', () => {
    const w = createWeapon('shotgun-t2-suppress');
    expect(w.category).toBe('shotgun');
    expect(w.tier).toBe(2);
    expect(w.rangeOverride).toBe(250);
    expect(w.spreadRadOverride).toBe(1.30);
    expect(w.damage).toBe(4);
    expect(w.count).toBe(12);
  });

  it('ボルトアクション(rifle-t1-bolt): rangeOverride=320・既定T1と同じ貫通クラス', () => {
    const w = createWeapon('rifle-t1-bolt');
    expect(w.category).toBe('rifle');
    expect(w.tier).toBe(1);
    expect(w.rangeOverride).toBe(320);
    expect(w.passthrough).toBe(true);
    expect(w.pierce).toBe(1);
  });

  it('クロスボウ(handgun-t1-crossbow): infiniteAmmo=true・magSize=1', () => {
    const w = createWeapon('handgun-t1-crossbow');
    expect(w.category).toBe('handgun');
    expect(w.tier).toBe(1);
    expect(w.infiniteAmmo).toBe(true);
    expect(w.magSize).toBe(1);
    expect(w.magazine).toBe(1);
  });

  it('デュアルレンジピストル(handgun-t2-dualrange): CATALOGの既定値は「遠」セット・rangeOverride=220', () => {
    const w = createWeapon('handgun-t2-dualrange');
    expect(w.category).toBe('handgun');
    expect(w.tier).toBe(2);
    expect(w.rangeOverride).toBe(220);
    expect(w.damage).toBe(DUAL_RANGE_STATS.far.damage);
    expect(w.cooldown).toBe(DUAL_RANGE_STATS.far.cooldown);
    expect(w.projectileSpeed).toBe(DUAL_RANGE_STATS.far.projectileSpeed);
    expect(w.dualRangeMode).toBeUndefined(); // ランタイム状態。未発射のうちは未設定('far'扱い)
  });
});

// UNIQUE_WEAPONS.md §16-3前提工事(監査C-4): 散り角「武器(+状態)→rad」。
describe('resolveShotgunSpreadRad / computeShotDirections(散り角の武器別化)', () => {
  it('既定3挺(spreadRadOverride無し)はTier別既定のまま(回帰ゼロ)', () => {
    expect(resolveShotgunSpreadRad(createWeapon('shotgun-t1'))).toBeCloseTo(1.00, 5);
    expect(resolveShotgunSpreadRad(createWeapon('shotgun-t2'))).toBeCloseTo(0.70, 5);
    expect(resolveShotgunSpreadRad(createWeapon('shotgun-t3'))).toBeCloseTo(0.36, 5);
  });

  it('制圧型ショットガンはspreadRadOverride(1.30)を使う(Tier2既定の0.70ではない)', () => {
    expect(resolveShotgunSpreadRad(createWeapon('shotgun-t2-suppress'))).toBeCloseTo(1.30, 5);
  });

  it('computeShotDirectionsもspreadRadOverrideを反映する(既定T2より広い扇になる)', () => {
    const baseDir = { x: 1, y: 0 };
    const defaultDirs = computeShotDirections({ ...createWeapon('shotgun-t2'), count: 3 }, baseDir);
    const suppressDirs = computeShotDirections({ ...createWeapon('shotgun-t2-suppress'), count: 3 }, baseDir);
    // 両端弾のy成分の絶対値(=広がりの大きさ)を比較。spreadRadOverrideが広いぶん、端の弾もより開く。
    expect(Math.abs(suppressDirs[0].y)).toBeGreaterThan(Math.abs(defaultDirs[0].y));
  });
});

// UNIQUE_WEAPONS.md §17-4(監査A-4): 装填数アップの除外(magSize<=2)。
describe('effectiveMagSize: magSize<=2は装填数アップを受けない(§17-4)', () => {
  it('クロスボウ(magSize:1)はmagBonusが乗らない', () => {
    useGameStore.getState().resetGame('warrior');
    const player = { ...useGameStore.getState().player, magBonus: 5 };
    const w = createWeapon('handgun-t1-crossbow');
    expect(effectiveMagSize(w, player)).toBe(1);
  });

  it('デリンジャー(magSize:2)も同じ規則で除外される(意図的・§17-4)', () => {
    useGameStore.getState().resetGame('warrior');
    const player = { ...useGameStore.getState().player, magBonus: 5 };
    const w = createWeapon('handgun-t1-derringer');
    expect(effectiveMagSize(w, player)).toBe(2);
  });

  it('magSize:12(既定ハンドガン)は従来どおりmagBonusが乗る(回帰ゼロ)', () => {
    useGameStore.getState().resetGame('warrior');
    const player = { ...useGameStore.getState().player, magBonus: 5 };
    const w = createWeapon('handgun-t1');
    expect(effectiveMagSize(w, player)).toBe(17);
  });
});

// UNIQUE_WEAPONS.md §17-3(監査A-3): 無限弾(クロスボウ)。
describe('無限弾(クロスボウ)のリロード(§17-3)', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
  });

  it('weaponReloadReserve: infiniteAmmoの武器はInfinityを返す(実フィールドは読まない)', () => {
    useGameStore.getState().resetGame('warrior');
    const player = { ...useGameStore.getState().player, ammoHandgun: 0 };
    const w = createWeapon('handgun-t1-crossbow');
    expect(weaponReloadReserve(w, player)).toBe(Number.POSITIVE_INFINITY);
    const normal = createWeapon('handgun-t1');
    expect(weaponReloadReserve(normal, player)).toBe(0);
  });

  it('リザーブ0でもstartReload→tickReloadで満タンになり、実フィールド(ammoHandgun)は書き換わらない', () => {
    const crossbow = { ...createWeapon('handgun-t1-crossbow'), magazine: 0 };
    useGameStore.setState(s => ({
      player: {
        ...s.player,
        weapons: [crossbow, ...s.player.weapons.filter(w => w.isMelee)],
        activeWeaponId: crossbow.id,
        ammoHandgun: 0,
        reloadingWeaponId: '',
        reloadEndsAt: 0,
      },
    }));
    useGameStore.getState().startReload(crossbow.id);
    const afterStart = useGameStore.getState().player;
    expect(afterStart.reloadingWeaponId).toBe(crossbow.id); // リザーブ0でもリロード開始できる
    expect(afterStart.ammoHandgun).toBe(0); // ★フィールドはInfinityへ書き換わらない

    useGameStore.setState(s => ({ player: { ...s.player, reloadEndsAt: Date.now() - 1 } }));
    useGameStore.getState().tickReload();
    const afterFinish = useGameStore.getState().player;
    expect(afterFinish.weapons.find(w => w.id === crossbow.id)?.magazine).toBe(1); // magSize:1へ満タン
    expect(afterFinish.ammoHandgun).toBe(0); // ★実フィールドは0のまま
    expect(afterFinish.reloadingWeaponId).toBe('');
  });

  it('autoSwitchIfDryはリザーブ0でも詰まらずリロードへ入る(旧実装は永久リロードで詰んだ)', () => {
    const crossbow = { ...createWeapon('handgun-t1-crossbow'), magazine: 0 };
    useGameStore.setState(s => ({
      player: {
        ...s.player,
        weapons: [crossbow],
        activeWeaponId: crossbow.id,
        ammoHandgun: 0,
        reloadingWeaponId: '',
        reloadEndsAt: 0,
      },
    }));
    useGameStore.getState().autoSwitchIfDry();
    expect(useGameStore.getState().player.reloadingWeaponId).toBe(crossbow.id);
  });
});

// UNIQUE_WEAPONS.md §16-2/§17-8 C-1: デュアルレンジピストルの距離ヒステリシス配線。
describe('デュアルレンジピストルの配線(fireWeapon・§16-2)', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
  });

  it('至近の敵に対して撃つと「近」セットの数値(damage14・speed=540×1.5)で撃ち、dualRangeModeが"near"として持ち越される', () => {
    const player = useGameStore.getState().player;
    const gun = { ...createWeapon('handgun-t2-dualrange'), lastFired: 0 };
    expect(gun.key).toBe(DUALRANGE_WEAPON_KEY);
    // プレイヤーとほぼ重なる位置(=距離≈0・近ヒステリシス120pxを大きく下回る)に的を置く。
    const target = spawnEnemyAt('zombie', player.x, player.y, useGameStore.getState().gameTime);
    useGameStore.setState(s => ({
      enemies: [target],
      player: { ...s.player, weapons: [gun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id },
    }));
    const shots = fireWeapon(gun, useGameStore.getState().player, [target]);
    expect(shots.length).toBe(1);
    expect(shots[0].speed).toBeCloseTo(DUAL_RANGE_STATS.near.projectileSpeed * 1.5, 5);
    const stored = useGameStore.getState().player.weapons.find(w => w.id === gun.id);
    expect(stored?.dualRangeMode).toBe('near');
  });
});

// UNIQUE_WEAPONS.md §16-2(バッチC-2): 近接切替(ガンブレード)・弾の軌道(コイル/誘導散弾)の3挺の配線。
describe('バッチC-2: 近接切替・弾の軌道の3挺の配線(fireWeapon)', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
  });

  describe('ガンブレード(§16-2/§17-5)', () => {
    it('通常銃モード(90pxより遠い)は素の8ダメージ・knockbackMult無し・gunbladeMeleeMode=falseで持ち越す', () => {
      const player = useGameStore.getState().player;
      const gun = { ...createWeapon('handgun-t3-gunblade'), lastFired: 0 };
      // 150px(=90pxの近接域より遠く、170pxの銃射程より近い)先に的を置く。
      const target = spawnEnemyAt('zombie', player.x, player.y - 150, useGameStore.getState().gameTime);
      useGameStore.setState(s => ({
        enemies: [target],
        player: { ...s.player, weapons: [gun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id },
      }));
      const shots = fireWeapon(gun, useGameStore.getState().player, [target]);
      expect(shots.length).toBe(1);
      expect(shots[0].knockbackMult).toBeUndefined();
      expect(shots[0].gunbladeMeleeHit).toBeUndefined();
      const stored = useGameStore.getState().player.weapons.find(w => w.id === gun.id);
      expect(stored?.gunbladeMeleeMode).toBe(false);
    });

    it('至近(≤90px)は近接モードへ切り替わる(ダメージ×1.6・knockbackMult1.5・gunbladeMeleeHit・体勢はheavy側=useGameLoop.tsが読む)', () => {
      const player = useGameStore.getState().player;
      const rangedGun = { ...createWeapon('handgun-t3-gunblade'), lastFired: 0 };
      const farTarget = spawnEnemyAt('zombie', player.x, player.y - 150, useGameStore.getState().gameTime);
      useGameStore.setState(s => ({
        enemies: [farTarget],
        player: { ...s.player, weapons: [rangedGun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: rangedGun.id },
      }));
      const rangedShots = fireWeapon(rangedGun, useGameStore.getState().player, [farTarget]);
      const rangedDamage = rangedShots[0].damage;

      // 至近(30px)に的を置き直し、cooldownを解いて撃ち直す。
      const nearTarget = spawnEnemyAt('zombie', player.x, player.y - 30, useGameStore.getState().gameTime);
      const gunAfterFar = { ...(useGameStore.getState().player.weapons.find(w => w.id === rangedGun.id)!), lastFired: 0 };
      useGameStore.setState(s => ({
        enemies: [nearTarget],
        player: { ...s.player, weapons: [gunAfterFar, ...s.player.weapons.filter(w => w.isMelee)] },
      }));
      const meleeShots = fireWeapon(gunAfterFar, useGameStore.getState().player, [nearTarget]);
      expect(meleeShots.length).toBe(1);
      expect(meleeShots[0].knockbackMult).toBe(1.5);
      expect(meleeShots[0].gunbladeMeleeHit).toBe(true);
      expect(meleeShots[0].damage).toBeCloseTo(rangedDamage * 1.6, 5);
      const storedMelee = useGameStore.getState().player.weapons.find(w => w.id === rangedGun.id);
      expect(storedMelee?.gunbladeMeleeMode).toBe(true);
    });

    it('allowMelee:false(守護霊/幻影/ボット)なら至近でも空撃ちする', () => {
      const player = useGameStore.getState().player;
      const gun = { ...createWeapon('handgun-t3-gunblade'), lastFired: 0 };
      const nearTarget = spawnEnemyAt('zombie', player.x, player.y - 30, useGameStore.getState().gameTime);
      useGameStore.setState(s => ({
        enemies: [nearTarget],
        player: { ...s.player, weapons: [gun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id },
      }));
      const shots = fireWeapon(gun, useGameStore.getState().player, [nearTarget], { allowMelee: false });
      expect(shots).toEqual([]);
    });
  });

  describe('コイルショットガン(§16-2)', () => {
    it('各ペレットがcomputeShotAngleOffsetsと同じ拡散角+狙点方向(coilAimDirX/Y)を持つ', () => {
      const player = useGameStore.getState().player;
      const gun = { ...createWeapon('shotgun-t2-coil'), lastFired: 0 };
      const target = spawnEnemyAt('zombie', player.x, player.y - 100, useGameStore.getState().gameTime);
      useGameStore.setState(s => ({
        enemies: [target],
        player: { ...s.player, weapons: [gun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id },
      }));
      const shots = fireWeapon(gun, useGameStore.getState().player, [target]);
      expect(shots.length).toBe(9);
      const expectedAngles = computeShotAngleOffsets(gun);
      shots.forEach((shot, i) => {
        expect(shot.coilBaseAngleRad).toBeCloseTo(expectedAngles[i], 6);
        expect(typeof shot.coilAimDirX).toBe('number');
        expect(typeof shot.coilAimDirY).toBe('number');
      });
      // 9発(奇数)の中心弾(index4)は拡散角0=常に直進(コイルの広がりようがない)。
      expect(expectedAngles[4]).toBeCloseTo(0, 10);
    });
  });

  describe('誘導散弾ショットガン(§16-2)', () => {
    it('敵が1体だけなら全弾が同じ対象へ集中する', () => {
      const player = useGameStore.getState().player;
      const gun = { ...createWeapon('shotgun-t3-homing'), lastFired: 0 };
      const target = spawnEnemyAt('zombie', player.x, player.y - 100, useGameStore.getState().gameTime);
      useGameStore.setState(s => ({
        enemies: [target],
        player: { ...s.player, weapons: [gun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id },
      }));
      const shots = fireWeapon(gun, useGameStore.getState().player, [target]);
      expect(shots.length).toBe(9);
      expect(shots.every(s => s.targetEnemyId === target.id && s.homingPellet === true)).toBe(true);
    });

    it('敵が複数なら分散して割り振る(全弾が同じ1体に集中しない)', () => {
      const player = useGameStore.getState().player;
      const gun = { ...createWeapon('shotgun-t3-homing'), lastFired: 0 };
      const t1 = spawnEnemyAt('zombie', player.x, player.y - 100, useGameStore.getState().gameTime);
      const t2 = spawnEnemyAt('zombie', player.x + 20, player.y - 100, useGameStore.getState().gameTime);
      const t3 = spawnEnemyAt('zombie', player.x - 20, player.y - 100, useGameStore.getState().gameTime);
      useGameStore.setState(s => ({
        enemies: [t1, t2, t3],
        player: { ...s.player, weapons: [gun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id },
      }));
      const shots = fireWeapon(gun, useGameStore.getState().player, [t1, t2, t3]);
      expect(shots.length).toBe(9);
      const ids = new Set(shots.map(s => s.targetEnemyId));
      expect(ids.size).toBeGreaterThan(1);
      expect(shots.every(s => s.homingPellet === true)).toBe(true);
    });
  });
});
