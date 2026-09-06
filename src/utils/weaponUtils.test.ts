import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '../store/gameStore';
import {
  createWeapon, nextKnifeKey, MELEE_KEYS, MAX_KNIFE_TIER, getWeaponShortName,
  beginWeaponReload, finishWeaponReload, refillWeaponMagazine, weaponAfterGunShot,
  effectiveFireCooldown, effectiveMagSize, weaponReloadReserve,
  resolveShotgunSpreadRad, computeShotDirections, fireWeapon, DUALRANGE_WEAPON_KEY,
  isGrenadeGunKey, isManualOnlyGunKey, hasManualAimGunKey, manualOnlyFallbackWeapon,
  ROCKET_WEAPON_KEY, ALCHEMY_WEAPON_KEY, SIGNAL_WEAPON_KEY, RAILGUN_WEAPON_KEY,
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

  describe('ガンブレード(§16-2/§17-5/§16-5b・2026-09-07 C-2検収A-2で確定)', () => {
    it('通常銃モード(90pxより遠い)は従来どおり弾を作る・knockbackMult無し・gunbladeMeleeMode=falseで持ち越す', () => {
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
      const stored = useGameStore.getState().player.weapons.find(w => w.id === gun.id);
      expect(stored?.gunbladeMeleeMode).toBe(false);
      expect(stored?.magazine).toBe((gun.magazine ?? 0) - 1); // 通常どおり弾薬を消費する
    });

    it('至近(≤90px)は弾を作らず即時に近接判定を解決する(ダメージ×1.6・弾薬/リロード不消費・gunbladeMeleeMode=trueで持ち越す)', () => {
      const randSpy = vi.spyOn(Math, 'random').mockReturnValue(0.999); // クリを外して決定的にする
      try {
        const player = useGameStore.getState().player;
        const gun = { ...createWeapon('handgun-t3-gunblade'), lastFired: 0 };
        const magazineBefore = gun.magazine ?? 0;
        const nearTarget = spawnEnemyAt('zombie', player.x, player.y - 30, useGameStore.getState().gameTime);
        const healthBefore = nearTarget.health;
        useGameStore.setState(s => ({
          enemies: [nearTarget],
          player: { ...s.player, weapons: [gun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id },
        }));
        const meleeShots = fireWeapon(gun, useGameStore.getState().player, [nearTarget]);
        // ★A-2: 弾を1つも作らない。
        expect(meleeShots).toEqual([]);
        // ダメージは即時に適用される(素ダメージ12.8=ranged8×1.6、非クリなので等倍)。
        const hitTarget = useGameStore.getState().enemies.find(e => e.id === nearTarget.id)!;
        expect(healthBefore - hitTarget.health).toBeCloseTo(12.8, 5);
        // 弾薬・リロードは一切消費しない。
        const stored = useGameStore.getState().player.weapons.find(w => w.id === gun.id);
        expect(stored?.magazine).toBe(magazineBefore);
        expect(stored?.gunbladeMeleeMode).toBe(true);
        expect(stored?.lastFired).toBeGreaterThan(0);
      } finally {
        randSpy.mockRestore();
      }
    });

    it('至近でもリロード中/弾切れなら近接は普通に発動する(弾を使わないため=旧実装の不具合の是正)', () => {
      const player = useGameStore.getState().player;
      const gun = { ...createWeapon('handgun-t3-gunblade'), lastFired: 0, magazine: 0 };
      const nearTarget = spawnEnemyAt('zombie', player.x, player.y - 30, useGameStore.getState().gameTime);
      const healthBefore = nearTarget.health;
      useGameStore.setState(s => ({
        enemies: [nearTarget],
        player: {
          ...s.player, weapons: [gun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id,
          reloadingWeaponId: gun.id, reloadEndsAt: Date.now() + 2600, // リロード中(2600ms)
        },
      }));
      const meleeShots = fireWeapon(gun, useGameStore.getState().player, [nearTarget]);
      expect(meleeShots).toEqual([]);
      const hitTarget = useGameStore.getState().enemies.find(e => e.id === nearTarget.id)!;
      expect(hitTarget.health).toBeLessThan(healthBefore);
    });

    it('allowMelee:false(守護霊/幻影/ボット)なら至近でも空撃ちする(弾も作らずダメージも与えない)', () => {
      const player = useGameStore.getState().player;
      const gun = { ...createWeapon('handgun-t3-gunblade'), lastFired: 0 };
      const nearTarget = spawnEnemyAt('zombie', player.x, player.y - 30, useGameStore.getState().gameTime);
      const healthBefore = nearTarget.health;
      useGameStore.setState(s => ({
        enemies: [nearTarget],
        player: { ...s.player, weapons: [gun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id },
      }));
      const shots = fireWeapon(gun, useGameStore.getState().player, [nearTarget], { allowMelee: false });
      expect(shots).toEqual([]);
      const hitTarget = useGameStore.getState().enemies.find(e => e.id === nearTarget.id)!;
      expect(hitTarget.health).toBe(healthBefore);
    });
  });

  describe('コイルショットガン(§16-2・2026-09-07 C-2検収A-1で確定)', () => {
    it('基礎の拡散角を持たない(spreadRadOverride:0)ので全ペレットが同じ狙点方向のまま発射される', () => {
      const player = useGameStore.getState().player;
      const gun = { ...createWeapon('shotgun-t2-coil'), lastFired: 0 };
      expect(gun.spreadRadOverride).toBe(0);
      const target = spawnEnemyAt('zombie', player.x, player.y - 100, useGameStore.getState().gameTime);
      useGameStore.setState(s => ({
        enemies: [target],
        player: { ...s.player, weapons: [gun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id },
      }));
      const shots = fireWeapon(gun, useGameStore.getState().player, [target]);
      expect(shots.length).toBe(9);
      shots.forEach(shot => {
        expect(shot.direction.x).toBeCloseTo(shots[0].direction.x, 10);
        expect(shot.direction.y).toBeCloseTo(shots[0].direction.y, 10);
        expect(typeof shot.coilAimDirX).toBe('number');
        expect(typeof shot.coilAimDirY).toBe('number');
        expect(typeof shot.coilLaunchGameTime).toBe('number');
      });
    });

    it('各ペレットが±44pxの範囲へ等間隔の振幅(coilAmplitudePx)を持つ(中心弾=0)', () => {
      const player = useGameStore.getState().player;
      const gun = { ...createWeapon('shotgun-t2-coil'), lastFired: 0 };
      const target = spawnEnemyAt('zombie', player.x, player.y - 100, useGameStore.getState().gameTime);
      useGameStore.setState(s => ({
        enemies: [target],
        player: { ...s.player, weapons: [gun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id },
      }));
      const shots = fireWeapon(gun, useGameStore.getState().player, [target]);
      expect(shots.length).toBe(9);
      expect(shots[0].coilAmplitudePx).toBeCloseTo(-44, 6);
      expect(shots[8].coilAmplitudePx).toBeCloseTo(44, 6);
      expect(shots[4].coilAmplitudePx).toBeCloseTo(0, 10); // 9発(奇数)の中心弾
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

// UNIQUE_WEAPONS.md §16-3(前提工事): isGrenadeGunKeyのcategory判定への拡張。
describe('isGrenadeGunKey(§16-3・category判定)', () => {
  it('glauncherカテゴリの全キー(既定+ユニーク)でtrue', () => {
    expect(isGrenadeGunKey('glauncher-t1')).toBe(true);
    expect(isGrenadeGunKey('glauncher-t2')).toBe(true);
    expect(isGrenadeGunKey('glauncher-t3')).toBe(true);
    expect(isGrenadeGunKey(ROCKET_WEAPON_KEY)).toBe(true);
    expect(isGrenadeGunKey(ALCHEMY_WEAPON_KEY)).toBe(true);
    expect(isGrenadeGunKey(SIGNAL_WEAPON_KEY)).toBe(true);
  });
  it('glauncher以外・未知キー・undefinedはfalse', () => {
    expect(isGrenadeGunKey('handgun-t1')).toBe(false);
    expect(isGrenadeGunKey('rifle-t3')).toBe(false);
    expect(isGrenadeGunKey('not-a-real-key')).toBe(false);
    expect(isGrenadeGunKey(undefined)).toBe(false);
    expect(isGrenadeGunKey(null)).toBe(false);
  });
});

// UNIQUE_WEAPONS.md §16-3b(手動専用銃の掟)。
describe('isManualOnlyGunKey / manualOnlyFallbackWeapon(§16-3b)', () => {
  it('対象はphill-revolverとシグナルランチャーの2つだけ', () => {
    expect(isManualOnlyGunKey('phill-revolver')).toBe(true);
    expect(isManualOnlyGunKey(SIGNAL_WEAPON_KEY)).toBe(true);
    expect(isManualOnlyGunKey('glauncher-t3')).toBe(false);
    expect(isManualOnlyGunKey(ROCKET_WEAPON_KEY)).toBe(false);
    expect(isManualOnlyGunKey(undefined)).toBe(false);
  });

  // UNIQUE_WEAPONS.md §17-10(#U16裁定): レールガンは「オート+手動」の併存なので、ここへ入れると
  // オート射撃が止まる(useGameLoop.ts/playtestDriver.tsがこの述語でオートを除外している)。
  // 発注文の明示禁止事項=回帰させてはいけない1行なので固定する。
  it('レールガンはオートも持つのでisManualOnlyGunKeyの対象ではない', () => {
    expect(isManualOnlyGunKey(RAILGUN_WEAPON_KEY)).toBe(false);
  });

  it('シグナルは既定の同カテゴリ銃(glauncher-t3)の数値へ差し替わるが、id/lastFired/magazineは実体のまま持ち越す', () => {
    const signal = { ...createWeapon(SIGNAL_WEAPON_KEY), lastFired: 12345, magazine: 1 };
    const fallback = manualOnlyFallbackWeapon(signal);
    expect(fallback.key).toBe('glauncher-t3');
    expect(fallback.damage).toBe(createWeapon('glauncher-t3').damage);
    expect(fallback.id).toBe(signal.id);
    expect(fallback.lastFired).toBe(12345);
    expect(fallback.magazine).toBe(1);
  });

  it('PHILLはフォールバック先が無いので入力をそのまま返す(既存の挙動を変えない)', () => {
    const phill = createWeapon('phill-revolver');
    expect(manualOnlyFallbackWeapon(phill)).toBe(phill); // 同一参照(素通し)
  });
});

// UNIQUE_WEAPONS.md §17-10(#U16裁定): レールガンの手動照準の口(狙いサークルのレティクル計算・
// 描画)を広げる述語。isManualOnlyGunKeyのスーパーセット=PHILL/シグナルはそのままtrue、
// レールガンだけ追加でtrueになる(オート専用武器はfalseのまま)。
describe('hasManualAimGunKey(§17-10・isManualOnlyGunKeyのスーパーセット)', () => {
  it('phill-revolver/シグナル/レールガンの3つでtrue', () => {
    expect(hasManualAimGunKey('phill-revolver')).toBe(true);
    expect(hasManualAimGunKey(SIGNAL_WEAPON_KEY)).toBe(true);
    expect(hasManualAimGunKey(RAILGUN_WEAPON_KEY)).toBe(true);
  });
  it('それ以外(既定rifle-t3・ロケラン・未知キー・undefined)はfalse', () => {
    expect(hasManualAimGunKey('rifle-t3')).toBe(false);
    expect(hasManualAimGunKey(ROCKET_WEAPON_KEY)).toBe(false);
    expect(hasManualAimGunKey('not-a-real-key')).toBe(false);
    expect(hasManualAimGunKey(undefined)).toBe(false);
  });
});

// UNIQUE_WEAPONS.md §16-2/§16-5(バッチD): ランチャー3挺のCATALOG配線。
describe('バッチD: ランチャー3挺のCATALOG', () => {
  it('3挺ともglauncherカテゴリでSLOT_TIERどおりのtierを持つ', () => {
    const rocket = createWeapon(ROCKET_WEAPON_KEY);
    const alchemy = createWeapon(ALCHEMY_WEAPON_KEY);
    const signal = createWeapon(SIGNAL_WEAPON_KEY);
    expect(rocket.category).toBe('glauncher');
    expect(rocket.tier).toBe(1);
    expect(alchemy.category).toBe('glauncher');
    expect(alchemy.tier).toBe(2);
    expect(signal.category).toBe('glauncher');
    expect(signal.tier).toBe(3);
  });

  it('ロケットランチャーは撃った瞬間、速度0で溜め状態(rocketChargeUntil)を持って生成される(受け入れ条件8)', () => {
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const gun = { ...createWeapon(ROCKET_WEAPON_KEY), lastFired: 0 };
    const target = spawnEnemyAt('zombie', player.x, player.y - 100, useGameStore.getState().gameTime);
    useGameStore.setState(s => ({
      enemies: [target],
      player: { ...s.player, weapons: [gun, ...s.player.weapons.filter(w => w.isMelee)], activeWeaponId: gun.id },
    }));
    const shots = fireWeapon(gun, useGameStore.getState().player, [target]);
    expect(shots.length).toBe(1);
    expect(shots[0].speed).toBe(0); // 溜め中は静止(小さい判定として自機前方に置かれる)
    expect(shots[0].rocketChargeUntil).toBeDefined();
    expect(shots[0].rocketLaunchSpeed).toBeGreaterThan(0); // 溜め終わりに戻す本来の飛翔速度
  });
});

// UNIQUE_WEAPONS.md §16-1/§17-2/§17-10(#U16裁定・バッチC漏れの是正): レールガンのCATALOG+
// オート射撃(fireWeapon)。手動射撃(gameStore.fireRailgunShot)はstoreのテスト対象で、ここは
// 「オート射撃は何も足さない」(§17-10)ことだけを固定する——railgun-t3-eyelaser等と同じ形の
// 普通のrifle弾になっていること(headshotEligibleが立たないこと含む)。
describe('レールガン(rifle-t3-railgun)のCATALOG+オート射撃(§17-10)', () => {
  it('rifle T3・damage101/cooldown1300/magSize4/reloadMs2200・passthroughのみ(pierceなし)', () => {
    const w = createWeapon(RAILGUN_WEAPON_KEY);
    expect(w.category).toBe('rifle');
    expect(w.tier).toBe(3);
    expect(w.damage).toBe(101);
    expect(w.cooldown).toBe(1300);
    expect(w.magSize).toBe(4);
    expect(w.reloadMs).toBe(2200);
    expect(w.projectileSpeed).toBe(1400);
    expect(w.projectileSize).toBe(8);
    expect(w.passthrough).toBe(true);
    expect(w.pierce).toBeUndefined();
  });

  it('オート射撃(fireWeapon)は普通のrifle弾を作るだけ(weaponType=rifle・headshotEligibleは立たない)', () => {
    useGameStore.getState().resetGame('warrior');
    const player = useGameStore.getState().player;
    const gun = { ...createWeapon(RAILGUN_WEAPON_KEY), lastFired: 0 };
    const target = spawnEnemyAt('zombie', player.x, player.y - 100, useGameStore.getState().gameTime);
    const shots = fireWeapon(gun, player, [target]);
    expect(shots.length).toBe(1);
    expect(shots[0].weaponType).toBe('rifle');
    expect(shots[0].weaponKey).toBe(RAILGUN_WEAPON_KEY);
    expect(shots[0].headshotEligible).toBeUndefined();
    expect(shots[0].passthrough).toBe(true);
  });

  it('isManualOnlyGunKeyの対象ではない(=fireWeaponのオート射撃から除外されない)', () => {
    expect(isManualOnlyGunKey(RAILGUN_WEAPON_KEY)).toBe(false);
  });
});
