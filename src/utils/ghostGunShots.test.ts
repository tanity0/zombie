// GHOST-GUN-PARITY(v0.25.2511): 守護霊の借用銃がプレイヤーのfireWeaponと同じ飛翔規則
// (count発/拡散/PROJECTILE_SPEED_MULT/projectileSize/passthrough・pierce)を共有することの固定。
// 共通ヘルパ(computeShotDirections/projectileFlightStats)は純関数=ヘッドレスで検証可能。
import { describe, it, expect } from 'vitest';
import { computeShotDirections, projectileFlightStats, buildGhostGunShots } from './weaponUtils';
import type { Weapon } from '../types/game';

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
