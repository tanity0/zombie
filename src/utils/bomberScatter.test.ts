import { describe, it, expect } from 'vitest';
import {
  buildBomberMinis,
  BOMBER_MINI_COUNT, BOMBER_MINI_DAMAGE, BOMBER_MINI_SPEED, BOMBER_MINI_BLAST_RADIUS, BOMBER_MINI_FUSE_MS,
} from './bomberScatter';

describe('buildBomberMinis(ボマー子グレネード・§6.10 M33③で散布対象拡大)', () => {
  it('手榴弾の既存散布と同一仕様: 3個・ダメージ42/3・半径66×0.6・速度118×0.8・信管600ms', () => {
    expect(BOMBER_MINI_COUNT).toBe(3);
    expect(BOMBER_MINI_DAMAGE).toBeCloseTo(42 / 3);
    expect(BOMBER_MINI_SPEED).toBeCloseTo(118 * 0.8);
    expect(BOMBER_MINI_BLAST_RADIUS).toBeCloseTo(66 * 0.6);
    expect(BOMBER_MINI_FUSE_MS).toBe(600);
  });

  it('3個の手榴弾projectileを生成し、再散布フラグ(bomberSpawned)と小ブラスト半径を持つ', () => {
    const minis = buildBomberMinis(100, 200, 'test', 1000, () => 0.5);
    expect(minis).toHaveLength(3);
    for (const m of minis) {
      expect(m.weaponType).toBe('grenade');
      expect(m.weaponKey).toBe('sub-heavy-grenade');
      expect(m.damage).toBeCloseTo(14);
      expect(m.explodeRadius).toBeCloseTo(39.6);
      expect(m.bomberSpawned).toBe(true); // 子はこれ以上散布しない
      expect(m.duration).toBe(600);
      expect(m.hostile).toBe(false);
      // 中心(100,200)から生成(10×10の左上=中心-5)
      expect(m.x).toBeCloseTo(95);
      expect(m.y).toBeCloseTo(195);
      // 方向は単位ベクトル
      expect(Math.hypot(m.direction.x, m.direction.y)).toBeCloseTo(1);
    }
    // 3方向は約120°間隔(rng固定なら決定的)
    const ids = new Set(minis.map(m => m.id));
    expect(ids.size).toBe(3);
  });
});
