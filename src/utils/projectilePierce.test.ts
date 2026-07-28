// 貫通弾(pierce)の命中記録(社長裁定v0.25.2355・実バグ修正)。
//
// 直したバグ: `hitEnemies` を `passthrough` の弾にしか記録していなかったため、シャープシューター
// (貫通+1/+2/+3)を**非passthrough銃**(ハンドガン/ショットガン/ライフルt2・t3)へ付けると
//   ① 同一敵への再ヒット防止が効かず、重なっている間**毎フレーム当たり続ける**
//   ② `useGameLoop` の除去条件 `hitEnemies.length > pierce` が永久に false = **弾が消えない**
// となり、「貫通+1」が実質「単体ダメージ数倍+無限貫通」として動いていた。
//
// ここで固定する不変条件は「**1発は同じ敵を二度殴らない**」。除去条件(useGameLoop側)はこの記録を
// 基準にしているので、これが守られていれば貫通数も仕様どおりになる。
import { describe, it, expect } from 'vitest';
import { checkProjectileEnemyCollisions } from './collisionUtils';
import type { Enemy, Projectile } from '../types/game';

const proj = (over: Partial<Projectile> = {}): Projectile => ({
  id: 'p1', x: 100, y: 100, width: 8, height: 8,
  speed: 500, damage: 10, direction: { x: 1, y: 0 },
  weaponType: 'handgun', weaponKey: 'handgun-t1',
  duration: 1400, createdAt: 0,
  passthrough: false, hitEnemies: [], hostile: false, reflected: false,
  ...over,
} as unknown as Projectile);

// 弾と必ず重なる位置に置いた敵(接触ボックスは中心基準なので座標をそのまま合わせる)。
const enemy = (id: string): Enemy => ({
  id, type: 'zombie', x: 90, y: 90, width: 40, height: 40,
  health: 100, maxHealth: 100, speed: 40, damage: 10,
} as unknown as Enemy);

describe('貫通弾は命中した敵を記録する(同じ敵を二度殴らない)', () => {
  it('pierce つきの非passthrough弾でも hitEnemies に記録される(バグ再発防止)', () => {
    const p = proj({ pierce: 1 });
    const es = [enemy('e1')];
    const first = checkProjectileEnemyCollisions([p], es);
    expect(first).toHaveLength(1);
    expect(p.hitEnemies).toEqual(['e1']); // 旧実装ではここが [] のままだった
  });

  it('同じ敵には二度当たらない(毎フレーム再ヒットしない)', () => {
    const p = proj({ pierce: 1 });
    const es = [enemy('e1')];
    checkProjectileEnemyCollisions([p], es);            // 1フレーム目
    const second = checkProjectileEnemyCollisions([p], es); // 2フレーム目も重なったまま
    expect(second).toHaveLength(0);
    expect(p.hitEnemies).toEqual(['e1']);
  });

  it('別の敵には当たる(貫通そのものは殺さない)', () => {
    const p = proj({ pierce: 1 });
    checkProjectileEnemyCollisions([p], [enemy('e1')]);
    const hits = checkProjectileEnemyCollisions([p], [enemy('e2')]);
    expect(hits.map(h => h.enemyId)).toEqual(['e2']);
    expect(p.hitEnemies).toEqual(['e1', 'e2']);
    // useGameLoop の除去条件: hitEnemies.length > pierce → 2 > 1 = true で消える。
    // = pierce:1 はちょうど2体を貫く(types/game.ts の "pierce:1 hits two enemies" と一致)。
    expect(p.hitEnemies.length > (p.pierce ?? 0)).toBe(true);
  });

  it('passthrough弾(マグナム等)は従来どおり記録される(挙動不変)', () => {
    const p = proj({ passthrough: true, weaponType: 'rifle', weaponKey: 'rifle-t1', pierce: 1 });
    checkProjectileEnemyCollisions([p], [enemy('e1')]);
    expect(p.hitEnemies).toEqual(['e1']);
  });

  it('貫通なしの素の弾は記録しない(1発で消える側=記録の必要が無い・挙動不変)', () => {
    const p = proj(); // passthrough:false / pierce:undefined
    const hits = checkProjectileEnemyCollisions([p], [enemy('e1')]);
    expect(hits).toHaveLength(1);
    expect(p.hitEnemies).toEqual([]);
  });

  it('同一フレームに複数の敵が重なっていても、それぞれ1回ずつしか当たらない', () => {
    const p = proj({ pierce: 3 });
    const hits = checkProjectileEnemyCollisions([p], [enemy('e1'), enemy('e2'), enemy('e3')]);
    expect(hits.map(h => h.enemyId).sort()).toEqual(['e1', 'e2', 'e3']);
    expect(p.hitEnemies.sort()).toEqual(['e1', 'e2', 'e3']);
  });
});
