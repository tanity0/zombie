import { describe, it, expect } from 'vitest';
import {
  spriteVariantIndex, variantTextureName, ENEMY_VARIANT_SETS, ALL_VARIANT_TEXTURES,
} from './enemyVariant';

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
});

describe('variantTextureName', () => {
  it('表に無い type は null(=従来のステージ別解決へ落ちる)', () => {
    for (const t of ['plant', 'ghost', 'werewolf', 'pumpkin', 'giantbat', 'reaper', 'lich']) {
      expect(variantTextureName(t, 'e1')).toBeNull();
    }
  });

  it('★1種しか無い敵(zombie)も同じ表で扱える。どのIDでも同じ1枚', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => variantTextureName('zombie', 'e' + i)));
    expect([...names]).toEqual(['zombie-common']);
  });

  it('返すのは登録済みの名前だけ', () => {
    for (const [type, set] of Object.entries(ENEMY_VARIANT_SETS)) {
      for (let i = 0; i < 200; i++) {
        expect(set).toContain(variantTextureName(type, type + '-' + i));
      }
    }
  });

  it('同じIDなら同じ絵', () => {
    expect(variantTextureName('bat', 'e77')).toBe(variantTextureName('bat', 'e77'));
    expect(variantTextureName('skeleton', 'e77')).toBe(variantTextureName('skeleton', 'e77'));
  });

  it('★500体で全バリアントが出る(片方だけにならない)', () => {
    for (const [type, set] of Object.entries(ENEMY_VARIANT_SETS)) {
      const seen = new Set(Array.from({ length: 500 }, (_, i) => variantTextureName(type, 'e' + i)));
      expect(seen.size).toBe(set.length);
    }
  });

  it('★同じIDでも type が違えば別々に決まる(bat と skeleton が連動しない)', () => {
    // 片方だけを見て「常に同じ組み合わせ」になっていないこと=表ごとに独立していること。
    const pairs = new Set(
      Array.from({ length: 200 }, (_, i) =>
        `${variantTextureName('bat', 'e' + i)}|${variantTextureName('skeleton', 'e' + i)}`),
    );
    expect(pairs.size).toBeGreaterThan(1);
  });
});

describe('ALL_VARIANT_TEXTURES — ロード/アスペクト登録の取りこぼし防止', () => {
  it('全バリアントを重複なく列挙する', () => {
    const flat = Object.values(ENEMY_VARIANT_SETS).flatMap((v) => [...v]);
    expect([...ALL_VARIANT_TEXTURES].sort()).toEqual([...flat].sort());
    expect(new Set(ALL_VARIANT_TEXTURES).size).toBe(ALL_VARIANT_TEXTURES.length);
  });
});
