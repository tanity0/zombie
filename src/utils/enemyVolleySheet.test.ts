// research/LIBERTY_HORDE.md §4c: 矢の雨の号令の絵のコマ送り(最後まで再生→技が続く間は最後の3コマを繰り返す)。
import { describe, it, expect } from 'vitest';
import { volleyFrameAt, ENEMY_VOLLEY_SHEETS, VOLLEY_LOOP_TAIL } from './enemySheets';

describe('矢の雨の号令の絵', () => {
  const N = ENEMY_VOLLEY_SHEETS['mutant-liberty'];
  it('0コマ目から最後まで1回再生する', () => {
    expect(N).toBe(16);
    for (let i = 0; i < N; i++) expect(volleyFrameAt(N, i * 100 + 50, 100)).toBe(i);
  });
  it('最後まで再生したら、最後の3コマを繰り返す', () => {
    expect(VOLLEY_LOOP_TAIL).toBe(3);
    const seq = Array.from({ length: 9 }, (_, k) => volleyFrameAt(N, (N + k) * 100 + 50, 100));
    expect(seq).toEqual([13, 14, 15, 13, 14, 15, 13, 14, 15]);
  });
});
