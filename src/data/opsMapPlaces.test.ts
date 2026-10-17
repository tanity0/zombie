import { describe, it, expect } from 'vitest';
import { storyTrail, OPS_MAP_PLACES } from './opsMapPlaces';
import { STAGES } from './campaign';

describe('作戦室の地図の軌跡(THEONE_ROUND2 §2-5)', () => {
  it('本編と表示する EX の全ステージに場所がある(地図の外に出ない)', () => {
    for (const s of STAGES.filter(s => (s.kind === 'main' || s.kind === 'ex') && !s.hidden)) {
      const at = OPS_MAP_PLACES[s.id];
      expect(at, s.id).toBeDefined();
      expect(at[0] >= 0.05 && at[0] <= 0.95 && at[1] >= 0.05 && at[1] <= 0.95, s.id).toBe(true);
    }
  });

  it('何もクリアしていなければ軌跡は無く、次の目標だけ', () => {
    const t = storyTrail(STAGES, new Set(), 'stage-tutorial');
    expect(t.visited).toEqual([]);
    expect(t.current).toBeNull();
    expect(t.next?.id).toBe('stage-tutorial');
  });

  it('クリアした順(話の順)に延び、今いる所は最後にクリアした場所', () => {
    const t = storyTrail(STAGES, new Set(['stage-1', 'stage-tutorial', 'stage-2']), 'stage-3');
    expect(t.visited.map(v => v.id)).toEqual(['stage-tutorial', 'stage-1', 'stage-2']);
    expect(t.current?.id).toBe('stage-2');
    expect(t.next?.id).toBe('stage-3');
  });

  it('同じ場所が続く所(洋館→洋館跡地)は1つにまとめる', () => {
    const t = storyTrail(STAGES, new Set(['stage-6', 'stage-ex1']), null);
    expect(t.visited.length).toBe(1);
    expect(t.current?.id).toBe('stage-ex1');
    expect(t.next).toBeNull();
  });

  it('全部クリアした後に次の出撃先がクリア済みなら、次の目標は呼び出し側で消す(storyTrail は nextId=null で目標なし)', () => {
    const all = new Set(['stage-tutorial', 'stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-6', 'stage-7', 'stage-ex1']);
    const t = storyTrail(STAGES, all, null);
    expect(t.next).toBeNull();
    expect(t.current?.id).toBe('stage-ex1');
  });
});
