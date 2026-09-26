// ジャスト吸着(社長指示2026-08-20「無理やりちょうどのタイミングでSEと動きを合わせる」)の
// 土台=drainRhythmPending の拍ゲート。壊れると「技が入力より先に出る」「四神技が永遠に出ない」
// 系の順序バグになるので不変条件をここで固定する。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import type { RhythmPending } from '../types/game';

const setPending = (pending: RhythmPending[]) =>
  useGameStore.setState(s => ({ rhythm: { ...s.rhythm, pending } }));

beforeEach(() => setPending([]));

describe('drainRhythmPending(拍ゲート)', () => {
  it('nowMs 省略(?beat=0 の従来経路)は全部返す', () => {
    setPending([{ kind: 'tap', atMs: 999999 }, { kind: 'finish' }]);
    const out = useGameStore.getState().drainRhythmPending();
    expect(out.map(p => p.kind)).toEqual(['tap', 'finish']);
    expect(useGameStore.getState().rhythm.pending).toHaveLength(0);
  });

  it('拍(atMs)が来たものだけ先頭から返し、まだの項目で止まる(飛ばさない)', () => {
    setPending([
      { kind: 'tap', atMs: 100 },
      { kind: 'flick', arrow: 'up', atMs: 200 },
      { kind: 'god', god: 'suzaku', x: 0, y: 0 }, // atMs なし=直前のflickに続いて出る
      { kind: 'finish' },
    ]);
    const first = useGameStore.getState().drainRhythmPending(150);
    expect(first.map(p => p.kind)).toEqual(['tap']);
    // flick(200)がまだ=後ろの god/finish も出ない(順序保持=技が入力より先に出ない)
    expect(useGameStore.getState().rhythm.pending.map(p => p.kind)).toEqual(['flick', 'god', 'finish']);
    const second = useGameStore.getState().drainRhythmPending(200);
    expect(second.map(p => p.kind)).toEqual(['flick', 'god', 'finish']);
    expect(useGameStore.getState().rhythm.pending).toHaveLength(0);
  });

  it('先頭がまだ来ていなければ何も返さず、キューは不変', () => {
    setPending([{ kind: 'tap', atMs: 500 }]);
    expect(useGameStore.getState().drainRhythmPending(499)).toHaveLength(0);
    expect(useGameStore.getState().rhythm.pending).toHaveLength(1);
  });

  it('atMs の無い項目(旧形式・god/finish)はゲートに掛からず即出る', () => {
    setPending([{ kind: 'tap' }, { kind: 'finish' }]);
    const out = useGameStore.getState().drainRhythmPending(0);
    expect(out.map(p => p.kind)).toEqual(['tap', 'finish']);
  });
});
