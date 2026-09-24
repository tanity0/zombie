import { describe, it, expect } from 'vitest';
import { vsBodyInit,
  VS_ENTRIES, parseVsEntry, parseNoAmmo, idForVariant, vsQuery, VS_STAGE,
} from './vsTest';
import { ENEMY_VARIANT_SETS, spriteVariantIndex } from './enemyVariant';
import { BOSS_TEST_ENTRIES } from './bossTest';
import { ENEMY_STATS, isTerminalReaper } from './enemyUtils';

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

// ★★社長報告2026-09-24「**なんか死神に当たり判定無いし、人形も出してこなくなっちゃった**」の再発防止。
// 1対1枠で死神を素のまま湧かせると `reaperChaser` が立たず、`isTerminalReaper` が false になる。
// **その1つのフラグで「攻撃の対象から外れる」と「使者が1体も出ない」が同時に起きる**ので、
// ここは述語そのもので固定する(値の比較ではなく、**本編と同じ述語を満たすか**で見る)。
describe('★1対1枠の死神は「本物の死神」として湧く', () => {
  const CFG = { bodyHealth: 66666, bodyContactDamage: 999, bodySpeedMult: 0.8 };

  it('死神は isTerminalReaper を満たす形になる(=攻撃の対象に入り、使者の召喚も走る)', () => {
    const init = vsBodyInit('reaper', CFG, 200);
    expect(init).not.toBeNull();
    expect(isTerminalReaper({ type: 'reaper', ...init! })).toBe(true);
  });

  it('体力・接触ダメージ・速さは本編と同じ出どころ(枠が独自の値を持たない)', () => {
    const init = vsBodyInit('reaper', CFG, 200)!;
    expect(init.health).toBe(CFG.bodyHealth);
    expect(init.maxHealth).toBe(CFG.bodyHealth);
    expect(init.damage).toBe(CFG.bodyContactDamage);
    expect(init.speed).toBe(200 * CFG.bodySpeedMult);
  });

  it('死神以外は素の湧きのまま(null)', () => {
    for (const t of ['zombie', 'hunter', 'pumpkin', 'hangedman'] as const) {
      expect(vsBodyInit(t, CFG, 200), t).toBeNull();
    }
  });
});
