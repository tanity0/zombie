import { describe, it, expect } from 'vitest';
import {
  VS_ENTRIES, parseVsEntry, parseNoAmmo, idForVariant, vsQuery, VS_STAGE,
} from './vsTest';
import { ENEMY_VARIANT_SETS, spriteVariantIndex } from './enemyVariant';
import { BOSS_TEST_ENTRIES } from './bossTest';
import { ENEMY_STATS } from './enemyUtils';

describe('vsTest（1対1の間合い・BOSS_MAKER.md §21）', () => {
  it('キーは重複しない', () => {
    const keys = VS_ENTRIES.map(e => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('全ての型が実在する（ENEMY_STATSに載っている）', () => {
    for (const e of VS_ENTRIES) expect(ENEMY_STATS[e.type]).toBeDefined();
  });

  it('既存のボス戦テストと重複しない（§21-3）', () => {
    const bossTypes = new Set(BOSS_TEST_ENTRIES.map(b => b.boss));
    for (const e of VS_ENTRIES) expect(bossTypes.has(e.type)).toBe(false);
  });

  it('変種を持つ型は変種ぶん載っている（片方しか見られないと確認にならない）', () => {
    for (const [type, set] of Object.entries(ENEMY_VARIANT_SETS)) {
      if (set.length <= 1) continue;
      const rows = VS_ENTRIES.filter(e => e.type === type);
      if (rows.length === 0) continue;   // そもそも載せない型（ボス側）は対象外
      expect(rows.length).toBe(set.length);
      expect(new Set(rows.map(r => r.variantIndex)).size).toBe(set.length);
    }
  });

  it('parseVsEntry: 未指定・未知は null', () => {
    expect(parseVsEntry('')).toBeNull();
    expect(parseVsEntry('?vs=')).toBeNull();
    expect(parseVsEntry('?vs=nosuchenemy')).toBeNull();
    expect(parseVsEntry('?vs=zombie')?.type).toBe('zombie');
  });

  it('parseNoAmmo: 1 のときだけ真', () => {
    expect(parseNoAmmo('?noammo=1')).toBe(true);
    expect(parseNoAmmo('?noammo=0')).toBe(false);
    expect(parseNoAmmo('')).toBe(false);
  });

  it('idForVariant: 狙った変種の添字になるIDを返す', () => {
    for (const [type, set] of Object.entries(ENEMY_VARIANT_SETS)) {
      if (set.length <= 1) continue;
      for (let want = 0; want < set.length; want++) {
        for (const base of ['e1', 'enemy-42', 'x']) {
          const id = idForVariant(base, type, want);
          expect(spriteVariantIndex(id, set.length)).toBe(want);
          expect(id.startsWith(base)).toBe(true);
        }
      }
    }
  });

  it('idForVariant: 変種を持たない型・未指定は元のIDのまま', () => {
    expect(idForVariant('e1', 'zombie', 0)).toBe('e1');
    expect(idForVariant('e1', 'bat', undefined)).toBe('e1');
    expect(idForVariant('e1', 'nosuchtype', 1)).toBe('e1');
  });

  it('vsQuery: 湧きを止め、狙った相手で、弾ゼロを載せる', () => {
    const e = VS_ENTRIES[0];
    const q = new URLSearchParams(vsQuery(e, 'warrior', true));
    expect(q.get('nospawn')).toBe('1');
    expect(q.get('vs')).toBe(e.key);
    expect(q.get('noammo')).toBe('1');
    expect(q.get('stage')).toBe(VS_STAGE);
    expect(q.get('smoke')).toBe('1');
    expect(q.get('class')).toBe('warrior');
    // 弾ゼロを外した時は付かない（既定の挙動を変えない）
    expect(new URLSearchParams(vsQuery(e, 'warrior', false)).get('noammo')).toBeNull();
  });
});
