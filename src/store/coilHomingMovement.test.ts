// UNIQUE_WEAPONS.md §16-2(バッチC-2): コイルショットガン/誘導散弾ショットガンの弾移動tick
// (gameStore.ts updateProjectiles)の配線テスト。純関数(coilTrajectoryOffsetRad/
// assignHomingShotgunTargets)そのものはcoilShotgun.test.ts/homingShotgun.test.tsで検算済みなので、
// ここでは「store側が正しくフィールドを読んでdirectionを書き換えているか」だけを見る
// (実装精度の規律4「配線ロジックは純関数に切り出してテスト」)。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import type { Projectile } from '../types/game';

const buildProjectile = (over: Partial<Projectile>): Projectile => ({
  id: `t-proj-${Math.random().toString(36).slice(2)}`,
  x: 0, y: 0, width: 8, height: 8, speed: 300, damage: 10,
  direction: { x: 1, y: 0 }, weaponType: 'shotgun', weaponKey: 'shotgun-t2-coil',
  duration: 1400, createdAt: Date.now(), passthrough: false, hitEnemies: [],
  hostile: false, reflected: false, ...over,
});

describe('コイルショットガンの軌道位相(gameStore.updateProjectiles配線)', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
  });

  it('中心弾(coilBaseAngleRad=0)は狙点方向のまま直進する(dyがほぼ0)', () => {
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 },
      coilBaseAngleRad: 0, coilAimDirX: 1, coilAimDirY: 0, createdAt: Date.now() - 90,
    });
    useGameStore.setState({ projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 60);
    const after = useGameStore.getState().projectiles[0];
    expect(after.direction.y).toBeCloseTo(0, 6);
    expect(after.direction.x).toBeCloseTo(1, 6);
  });

  it('外側弾(coilBaseAngleRad>0)は序盤(180ms未満)で狙点方向から外側へ膨らむ(dyが拡散角そのものより大きい方向へ)', () => {
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 },
      coilBaseAngleRad: 0.2, coilAimDirX: 1, coilAimDirY: 0, createdAt: Date.now() - 90,
    });
    useGameStore.setState({ projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 60);
    const after = useGameStore.getState().projectiles[0];
    const angle = Math.atan2(after.direction.y, after.direction.x);
    // 90ms時点のオフセットは正(外側)なので、角度は素の拡散角0.2radより大きいはず。
    expect(angle).toBeGreaterThan(0.2);
  });

  it('420ms以降は素の拡散角そのものへ戻る(収束後)', () => {
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 },
      coilBaseAngleRad: 0.2, coilAimDirX: 1, coilAimDirY: 0, createdAt: Date.now() - 500,
    });
    useGameStore.setState({ projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 60);
    const after = useGameStore.getState().projectiles[0];
    const angle = Math.atan2(after.direction.y, after.direction.x);
    expect(angle).toBeCloseTo(0.2, 3);
  });
});

describe('誘導散弾ショットガンの旋回(gameStore.updateProjectiles配線・homingPelletフラグ)', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
  });

  it('homingPellet+targetEnemyIdを持つ弾は、対象へ向けて旋回する(homing-missileと同じ式)', () => {
    const target = spawnEnemyAt('zombie', 500, 0, useGameStore.getState().gameTime);
    useGameStore.setState({ enemies: [target] });
    // 弾は原点から+x方向(0rad)へ飛んでいるが、対象は同じy=0上のx=500+(幅/2)付近=ほぼ同じ0rad方向
    // …だと旋回の有無が見分けにくいので、対象をy方向にずらして「曲がるべき方向」を作る。
    useGameStore.setState(s => ({
      enemies: s.enemies.map(e => e.id === target.id ? { ...e, y: 300 } : e),
    }));
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 }, speed: 100,
      weaponKey: 'shotgun-t3-homing', targetEnemyId: target.id, homingPellet: true,
      createdAt: Date.now(),
    });
    useGameStore.setState({ projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 4); // 大きめのdeltaTimeで確実に曲がったことを見る
    const after = useGameStore.getState().projectiles[0];
    // 対象は右下(+y)方向にいるので、旋回すればdirection.yが正になっているはず。
    expect(after.direction.y).toBeGreaterThan(0);
  });

  it('対象が消えていれば直進する(homing-missileと同じ「対象が消えたら直進」規則)', () => {
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 }, speed: 100,
      weaponKey: 'shotgun-t3-homing', targetEnemyId: 'does-not-exist', homingPellet: true,
      createdAt: Date.now(),
    });
    useGameStore.setState({ enemies: [], projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 60);
    const after = useGameStore.getState().projectiles[0];
    expect(after.direction).toEqual({ x: 1, y: 0 });
  });

  it('targetEnemyIdもhomingPelletも持たない通常のshotgun弾は旋回しない(回帰ゼロ)', () => {
    const p = buildProjectile({
      x: 0, y: 0, direction: { x: 1, y: 0 }, speed: 100,
      weaponKey: 'shotgun-t1', createdAt: Date.now(),
    });
    useGameStore.setState({ enemies: [], projectiles: [p] });
    useGameStore.getState().updateProjectiles(1 / 60);
    const after = useGameStore.getState().projectiles[0];
    expect(after.direction).toEqual({ x: 1, y: 0 });
  });
});
