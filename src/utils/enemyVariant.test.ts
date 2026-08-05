import { describe, it, expect } from 'vitest';
import { spriteVariantIndex, batTextureName, BAT_VARIANTS } from './enemyVariant';

describe('spriteVariantIndex — 同じ個体は生涯ずっと同じ絵', () => {
  it('同じIDなら何度呼んでも同じ', () => {
    for (const id of ['e1', 'enemy-42', 'abcdefghijklmnop']) {
      const first = spriteVariantIndex(id, 2);
      for (let i = 0; i < 10; i++) expect(spriteVariantIndex(id, 2)).toBe(first);
    }
  });

  it('必ず 0..count-1 の範囲に入る(負のハッシュでも)', () => {
    for (let i = 0; i < 500; i++) {
      const v = spriteVariantIndex('enemy-' + i, 2);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2);
    }
  });

  it('空ID・count<=1 でも落ちない', () => {
    expect(spriteVariantIndex('', 2)).toBe(0);
    expect(spriteVariantIndex('x', 1)).toBe(0);
    expect(spriteVariantIndex('x', 0)).toBe(0);
    expect(spriteVariantIndex('x', NaN)).toBe(0);
  });

  it('★片方に寄り切らない(500体で両方が出る)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(spriteVariantIndex('enemy-' + i, 2));
    expect(seen.size).toBe(2);
  });
});

describe('batTextureName', () => {
  it('返すのは登録済みの2種だけ', () => {
    for (let i = 0; i < 200; i++) {
      expect(BAT_VARIANTS).toContain(batTextureName('bat-' + i));
    }
  });

  it('同じIDなら同じ絵', () => {
    expect(batTextureName('e77')).toBe(batTextureName('e77'));
  });

  it('★500体で男女とも出る(片方だけにならない)', () => {
    const seen = new Set(Array.from({ length: 500 }, (_, i) => batTextureName('e' + i)));
    expect(seen.size).toBe(2);
  });
});
