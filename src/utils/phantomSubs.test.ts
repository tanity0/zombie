// research/SAME_ARENA.md O-3「幻影がサブウェポンを使う」の土台の受け入れ条件。
// 守護霊との決定的な違い=**狙う相手がプレイヤー**なので、効果を敵対側(hostile)で撒く必要があり、
// かつ**紫の文法=カウンターできない**を守る必要がある(素通しだと打ち返せてしまう)。
import { describe, it, expect } from 'vitest';
import { playerAsOwner, ghostAsOwner, phantomAsOwner, isHostileOwner, ownerGhostId } from './subWeaponOwner';

const body = { x: 100, y: 200, width: 32, height: 48 };

describe('O-3 土台: サブウェポンの主語に幻影を足す', () => {
  it('幻影だけが「効果を敵対側で撒く主語」(プレイヤー/守護霊は false)', () => {
    expect(isHostileOwner(phantomAsOwner({ ...body, id: 'gp-1' }))).toBe(true);
    expect(isHostileOwner(ghostAsOwner({ ...body, id: 'g-1' }))).toBe(false);
    expect(isHostileOwner(playerAsOwner({ ...body, lastDirection: { x: 1, y: 0 } }))).toBe(false);
  });

  it('★CD帳簿の宛先idは幻影でも返る(=3者が別財布で回る)', () => {
    expect(ownerGhostId(phantomAsOwner({ ...body, id: 'gp-1' }))).toBe('gp-1');
    expect(ownerGhostId(ghostAsOwner({ ...body, id: 'g-1' }))).toBe('g-1');
    expect(ownerGhostId(playerAsOwner({ ...body }))).toBeUndefined();
  });

  it('幻影オーナーは実体の座標をそのまま持つ(投擲の起点)', () => {
    const o = phantomAsOwner({ ...body, id: 'gp-1' });
    expect(o.kind).toBe('phantom');
    expect(o.x).toBe(100);
    expect(o.y).toBe(200);
    expect(o.summonId).toBe('gp-1');
  });

  it('向きは呼び出し側が渡す(未指定=null で、各サブ固有のフォールバックへ委ねる)', () => {
    expect(phantomAsOwner({ ...body, id: 'gp-1' }).facing).toBeNull();
    expect(phantomAsOwner({ ...body, id: 'gp-1' }, { x: -1, y: 0 }).facing).toEqual({ x: -1, y: 0 });
  });
});
