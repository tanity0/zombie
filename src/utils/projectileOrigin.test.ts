// research/GHOST_BOSS.md v9「2. 弾パリィ=反応時間モデル」の土台=**弾の発射点**のテスト。
//
// 守りたいのは2つ:
//  ① 発射点は**storeへの挿入の合流点**で必ず焼かれる(生成側が散在していても付け忘れが起きない)
//  ② 飛翔時間は「距離÷速度」で出し、**速度0/発射点なし**を比較に流さない(Infinity/NaNの水際)
import { describe, it, expect, beforeEach } from 'vitest';
import { ensureProjectileOrigin, projectileFlightMsTo, type ProjectileOriginFields } from './projectileOrigin';
import { useGameStore } from '../store/gameStore';
import { createWeapon, fireWeapon } from './weaponUtils';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';
import { spawnEnemyAt } from './enemyUtils';
import type { Projectile } from '../types/game';

beforeEach(() => {
  setTreesDisabled(true);
  setTorchesDisabled(true);
  useGameStore.getState().resetGame('assault');
});

/** プレイヤーの直接銃弾を実際の生成経路(fireWeapon)で作る。射程ゲートがあるので的を1体置く。 */
const firePlayerGun = (): Projectile[] => {
  const player = useGameStore.getState().player;
  const target = spawnEnemyAt('zombie', player.x + 60, player.y, useGameStore.getState().gameTime);
  useGameStore.setState({ enemies: [target] });
  const gun = createWeapon('handgun-t1');
  gun.lastFired = 0;
  return fireWeapon(gun, player, [target]);
};

describe('ensureProjectileOrigin(発射点の補完)', () => {
  it('未設定なら今の座標を焼く / 既に持っていれば書き換えない', () => {
    const fresh = ensureProjectileOrigin({ x: 120, y: 340 } as ProjectileOriginFields);
    expect(fresh.originX).toBe(120);
    expect(fresh.originY).toBe(340);
    const kept = ensureProjectileOrigin({ x: 120, y: 340, originX: 5, originY: 7 });
    expect(kept.originX).toBe(5);
    expect(kept.originY).toBe(7);
  });

  it('挿入統合: addProjectile を通った直接銃弾は必ず発射点を持つ(生成側は焼いていない)', () => {
    const shots = firePlayerGun();
    expect(shots.length).toBeGreaterThan(0);
    expect(shots[0].originX).toBeUndefined(); // 生成側では焼いていない=合流点の仕事
    useGameStore.setState({ projectiles: [] });
    shots.forEach(p => useGameStore.getState().addProjectile(p));
    for (const p of useGameStore.getState().projectiles) {
      expect(p.originX).toBe(p.x);
      expect(p.originY).toBe(p.y);
    }
  });

  it('反射(reflectProjectile)は発射点を反射点へ打ち直す=判定は常に「直近の飛翔」', () => {
    const shot = firePlayerGun()[0];
    useGameStore.setState({ projectiles: [] });
    useGameStore.getState().addProjectile(shot);
    // 弾を遠くまで飛ばしてから反射する。
    useGameStore.setState(s => ({ projectiles: s.projectiles.map(p => ({ ...p, x: p.x + 900, y: p.y + 400 })) }));
    const flown = useGameStore.getState().projectiles[0];
    useGameStore.getState().reflectProjectile(flown.id);
    const reflected = useGameStore.getState().projectiles[0];
    expect(reflected.originX).toBe(flown.x);
    expect(reflected.originY).toBe(flown.y);
  });
});

describe('projectileFlightMsTo(飛翔時間=距離÷速度)', () => {
  const base = { x: 0, y: 0, speed: 300, originX: 0, originY: 0 };

  it('距離÷速度×1000 で出る(時計を跨がない)', () => {
    expect(projectileFlightMsTo({ ...base }, 300, 0)).toBeCloseTo(1000, 5);
    expect(projectileFlightMsTo({ ...base, speed: 600 }, 300, 0)).toBeCloseTo(500, 5);
  });

  it('瞬間着弾のガード: 速度0以下は0ms(=反応不可)。Infinity/NaN を返さない', () => {
    for (const speed of [0, -5, NaN]) {
      const ms = projectileFlightMsTo({ ...base, speed }, 300, 0);
      expect(ms).toBe(0);
      expect(Number.isFinite(ms)).toBe(true);
    }
    // 発射点=着弾点(距離0)も 0ms 側に出る(0/速度=0。NaN にならない)。
    expect(projectileFlightMsTo({ ...base }, 0, 0)).toBe(0);
  });

  it('発射点が無い弾は Infinity(=判定材料が無い→従来どおり反応できた側へ倒す)', () => {
    const p = { x: 10, y: 10, speed: 300 } as Projectile;
    expect(projectileFlightMsTo(p, 300, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
