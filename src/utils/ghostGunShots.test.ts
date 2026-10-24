// GHOST-GUN-PARITY(v0.25.2511): 守護霊の借用銃がプレイヤーのfireWeaponと同じ飛翔規則
// (count発/拡散/PROJECTILE_SPEED_MULT/projectileSize/passthrough・pierce)を共有することの固定。
// 共通ヘルパ(computeShotDirections/projectileFlightStats)は純関数=ヘッドレスで検証可能。
import { describe, it, expect } from 'vitest';
import {
  computeShotDirections, projectileFlightStats, buildGhostGunShots,
  gunShotBaseDamage, gunShotCritChance, isDirectGunWeaponKey,
} from './weaponUtils';
import { useGameStore } from '../store/gameStore';
import type { Player, Weapon } from '../types/game';

const gun = (over: Partial<Weapon> = {}): Weapon => ({
  id: 'w1', key: 'shotgun-t1', name: 'テスト銃', type: 'shotgun', category: 'shotgun', tier: 1,
  damage: 10, cooldown: 900, projectileSpeed: 480, projectileSize: 7, count: 7,
  magSize: 6, reloadMs: 1800, lastFired: 0, magazine: 6,
  ...over,
} as unknown as Weapon);

describe('computeShotDirections(共通拡散規則)', () => {
  it('ショットガンはcount本の弾を左右対称の扇で返す', () => {
    const dirs = computeShotDirections(gun({ count: 7 }), { x: 1, y: 0 });
    expect(dirs).toHaveLength(7);
    // 中央の弾はbaseDirそのまま・両端は左右対称(y成分の符号が逆で絶対値一致)
    expect(dirs[3].x).toBeCloseTo(1, 5);
    expect(dirs[3].y).toBeCloseTo(0, 5);
    expect(dirs[0].y).toBeCloseTo(-dirs[6].y, 5);
    expect(dirs[0].x).toBeCloseTo(dirs[6].x, 5);
  });
  it('count=1はbaseDirのコピー1本のみ(拡散しない)', () => {
    const dirs = computeShotDirections(gun({ count: 1, category: 'handgun' }), { x: 0, y: 1 });
    expect(dirs).toEqual([{ x: 0, y: 1 }]);
  });
});

describe('projectileFlightStats(速度×1.5・サイズ=武器値)', () => {
  it('速度はPROJECTILE_SPEED_MULT(1.5)を掛けた値・サイズは武器のprojectileSize', () => {
    const { size, speed } = projectileFlightStats(gun({ projectileSpeed: 480, projectileSize: 7 }));
    expect(size).toBe(7);
    expect(speed).toBeCloseTo(480 * 1.5, 5);
  });
});

describe('buildGhostGunShots(守護霊の借用銃)', () => {
  it('ショットガンはcount発生成され、weaponKey=ghost-gun・素damage・貫通は武器値', () => {
    const shots = buildGhostGunShots(gun({ count: 7, passthrough: true, pierce: 2 }), 100, 100, { x: 1, y: 0 }, 1000, 'proj-ghost-g1');
    expect(shots).toHaveLength(7);
    for (const s of shots) {
      expect(s.weaponKey).toBe('ghost-gun');
      expect(s.damage).toBe(10);
      expect(s.passthrough).toBe(true);
      expect(s.pierce).toBe(2);
      expect(s.speed).toBeCloseTo(480 * 1.5, 5);
      expect(s.width).toBe(7);
    }
    expect(new Set(shots.map(s => s.id)).size).toBe(7); // idは弾ごとに一意
  });
});

// GHOST-BUILD-1(v0.25.2514・§2.11訂正「スキル倍率・装備ボーナス・射撃クリも再現する」)
describe('buildGhostGunShots(計測時ビルドの倍率・クリ率・PHILL)', () => {
  const ghostPlayer = (over: Partial<Player> = {}): Player => {
    useGameStore.getState().resetGame('warrior');
    const base = useGameStore.getState().player;
    return { ...base, critChance: 0.15, equipBonus: { ...base.equipBonus, damageMult: 1.3, critBonus: 0.03 }, ...over };
  };

  it('buildを渡すとダメージ/クリ率がプレイヤーの発射と同じ共通ヘルパの値になる', () => {
    const w = gun({ count: 1, category: 'handgun', damage: 20, critChance: 0.1 });
    const player = ghostPlayer();
    const shots = buildGhostGunShots(w, 0, 0, { x: 1, y: 0 }, 1000, 'proj-ghost-g1', { player, gameTime: 0 });
    expect(shots).toHaveLength(1);
    expect(shots[0].damage).toBeCloseTo(gunShotBaseDamage(w, player, 0), 9);
    expect(shots[0].critChance).toBeCloseTo(gunShotCritChance(w, player, 0), 9);
    expect(shots[0].damage).toBeCloseTo(20 * 1.3, 6);         // 装備火力+30%が乗る
    expect(shots[0].critChance).toBeCloseTo(0.1 + 0.15 + 0.03, 6); // 武器+本体+装備
  });

  it('buildを省略すると旧挙動(素damage・crit無し)=後方互換', () => {
    const shots = buildGhostGunShots(gun({ count: 1, damage: 20 }), 0, 0, { x: 1, y: 0 }, 1000, 'p');
    expect(shots[0].damage).toBe(20);
    expect(shots[0].critChance).toBe(0);
    expect(shots[0].headshot).toBeUndefined();
  });

  it('headshot=trueの弾には印が付く(裁定4のPHILL=着弾側がロールを飛ばして確定クリ)', () => {
    const shots = buildGhostGunShots(gun({ count: 1 }), 0, 0, { x: 1, y: 0 }, 1000, 'p',
      { player: ghostPlayer(), gameTime: 0, headshot: true });
    expect(shots[0].headshot).toBe(true);
  });

  it('ghost-gunは「プレイヤー直接武器」の集合に含まれる(トラップ/弱点の着弾ロール対象)', () => {
    expect(isDirectGunWeaponKey('ghost-gun')).toBe(true);
    expect(isDirectGunWeaponKey('escort')).toBe(false); // 護衛NPCは対象外のまま
  });
});
