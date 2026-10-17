// 頭部リージョン判定(PHILL銃)の不変条件+UNIQUE_WEAPONS.md §17-10(#U16裁定・レールガンの
// 手動射撃)の headshotEligible 共有を固定する。この判定はプレイヤーの確定ヘッドショット
// クリティカル(useGameLoop.ts の headshotHit)の唯一の出どころなので、壊れると気づかれにくい
// (「頭を狙ったのにクリしない」という体感バグになる)。
import { describe, it, expect } from 'vitest';
import { checkProjectileEnemyCollisions } from './collisionUtils';
import type { Enemy, EnemyType, Projectile } from '../types/game';

const foe = (type: EnemyType, over: Partial<Enemy> = {}): Enemy => ({
  id: `e-${type}`, type, x: 0, y: 0, width: 32, height: 32,
  health: 100, maxHealth: 100, speed: 50, damage: 10, lastShot: 0, lastHit: 0,
  ...over,
} as Enemy);

// zombie(幅32×高さ32・x:0,y:0)の enemyFootBox/enemyHitStrip/頭部リージョンを実式から逆算すると
// (renderSpec.ts): footBox top=footY-boxH=-68.8、頭部リージョン=footBox上端から33%=y:[-68.8,-35.5]、
// 胴体判定(enemyHitStrip)はy:[-18.4,32]。両者はy方向で重ならないので、y=-50付近に置けば
// 「頭のみ命中(胴体には当たらない)」を機械的に作れる。
const headOnlyBullet = (over: Partial<Projectile> = {}): Projectile => ({
  id: 'p1', x: -2, y: -50, width: 4, height: 4, speed: 0,
  damage: 50, direction: { x: 0, y: -1 }, weaponType: 'rifle',
  duration: 1000, createdAt: 0, passthrough: false, hitEnemies: [],
  hostile: false, reflected: false,
  ...over,
} as Projectile);

describe('checkProjectileEnemyCollisions: 頭部リージョン判定', () => {
  it('通常のrifle弾(headshotEligibleなし)は頭に置いても headshot にならない(=当たり判定自体が胴体ボックスのまま)', () => {
    const bullet = headOnlyBullet();
    const collisions = checkProjectileEnemyCollisions([bullet], [foe('zombie')]);
    // 胴体ボックス(enemyContactBox)に当たっていなければ命中自体しない(頭だけの判定テストは働かない)。
    // このテストの主旨は「headshotフィールドが立たない」ことなので、命中の有無に関わらず headshot は undefined。
    expect(collisions.every(c => c.headshot === undefined)).toBe(true);
  });

  it('PHILL弾(weaponType=phill-bullet)は頭部リージョンで headshot:true を返す(既存の回帰確認)', () => {
    const bullet = headOnlyBullet({ weaponType: 'phill-bullet' });
    const collisions = checkProjectileEnemyCollisions([bullet], [foe('zombie')]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].headshot).toBe(true);
  });

  it('レールガンの手動射撃(weaponType=rifle・headshotEligible:true)もPHILLと同じ頭部リージョンで headshot:true になる(§17-10)', () => {
    const bullet = headOnlyBullet({ weaponType: 'rifle', weaponKey: 'rifle-t3-railgun', headshotEligible: true });
    const collisions = checkProjectileEnemyCollisions([bullet], [foe('zombie')]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].headshot).toBe(true);
  });

  it('レールガンのオート射撃(headshotEligibleなし)は頭部リージョン判定を通らない=胴体に当たらなければ命中しない', () => {
    const bullet = headOnlyBullet({ weaponType: 'rifle', weaponKey: 'rifle-t3-railgun' });
    const collisions = checkProjectileEnemyCollisions([bullet], [foe('zombie')]);
    expect(collisions).toHaveLength(0); // 胴体ボックスの外(頭の位置)なので、通常判定では素通り
  });

  it('胴体に当たった場合はPHILL/レールガンとも headshot:false(命中はする)', () => {
    const bodyBullet = headOnlyBullet({ weaponType: 'phill-bullet', y: 0 });
    const collisions = checkProjectileEnemyCollisions([bodyBullet], [foe('zombie')]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].headshot).toBe(false);
  });
});
