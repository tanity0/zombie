import { describe, it, expect } from 'vitest';
import { isOutsideCullRect, selectCullCandidates, type CullRect } from './enemyCulling';

const rect: CullRect = { centerX: 0, centerY: 0, halfW: 100, halfH: 100 };
const noneProtected = () => false;

const mk = (id: string, x: number, y: number) => ({ id, x, y, width: 10, height: 10 });

describe('isOutsideCullRect', () => {
  it('内側(halfW/halfH以内)はfalse', () => {
    expect(isOutsideCullRect(mk('a', 0, 0), rect)).toBe(false);
    expect(isOutsideCullRect(mk('a', 90, 90), rect)).toBe(false);
  });
  it('外側(どちらかの辺を超える)はtrue', () => {
    expect(isOutsideCullRect(mk('a', 200, 0), rect)).toBe(true);
    expect(isOutsideCullRect(mk('a', 0, -200), rect)).toBe(true);
  });
});

describe('selectCullCandidates (PACING_PUZZLE.md §5.7 M6追補2)', () => {
  it('restrictToOffscreen=trueの時、可視域内の敵は選ばれない', () => {
    const enemies = [mk('near', 10, 10), mk('far', 300, 0)];
    const result = selectCullCandidates(enemies, noneProtected, rect, true);
    expect(result.map(e => e.id)).toEqual(['far']);
  });
  it('restrictToOffscreen=trueの時、可視域外は遠い順(降順)に並ぶ', () => {
    const enemies = [mk('mid', 150, 0), mk('farthest', 500, 0), mk('near-edge', 105, 0)];
    const result = selectCullCandidates(enemies, noneProtected, rect, true);
    expect(result.map(e => e.id)).toEqual(['farthest', 'mid', 'near-edge']);
  });
  it('restrictToOffscreen=falseの時は可視域内も候補に含め、遠い順に並ぶ(旧挙動)', () => {
    const enemies = [mk('near', 10, 0), mk('far', 300, 0)];
    const result = selectCullCandidates(enemies, noneProtected, rect, false);
    expect(result.map(e => e.id)).toEqual(['far', 'near']);
  });
  it('isProtectedがtrueの敵は候補から除外される(可視域外でも)', () => {
    const enemies = [mk('boss', 300, 0), mk('normal', 300, 10)];
    const result = selectCullCandidates(enemies, e => e.id === 'boss', rect, true);
    expect(result.map(e => e.id)).toEqual(['normal']);
  });
});
