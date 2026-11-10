import { describe, it, expect } from 'vitest';
import { poiTouchStarts, poiTouchEnvelope, POI_TOUCH_TOTAL_MS, POI_TOUCH_SINK_PX, POI_TOUCH_SINK_IN_MS } from './poiTouch';

describe('poiTouchStarts(触れ始めの検出)', () => {
  it('離れていた→触れた で1回だけ出る', () => {
    expect(poiTouchStarts([], ['armory']).started).toEqual(['armory']);
  });
  it('触れ続けている間は出ない', () => {
    expect(poiTouchStarts(['armory'], ['armory']).started).toEqual([]);
  });
  it('離れてまた触れたら、また出る', () => {
    const a = poiTouchStarts(['armory'], []);
    expect(a.started).toEqual([]);
    expect(a.next).toEqual([]);
    expect(poiTouchStarts(a.next, ['armory']).started).toEqual(['armory']);
  });
  it('複数同時でも別々に数え、重複は1つにまとめる', () => {
    const r = poiTouchStarts(['hospital'], ['hospital', 'shrine-body', 'shrine-body']);
    expect(r.started).toEqual(['shrine-body']);
    expect(r.next).toEqual(['hospital', 'shrine-body']);
  });
});

describe('poiTouchEnvelope(建物が受け止める動き)', () => {
  it('触れた瞬間に光が最大、時間とともに単調に抜け、約110msで0', () => {
    expect(poiTouchEnvelope(0).flash).toBeCloseTo(1, 5);
    let prev = 1;
    for (let t = 10; t <= 110; t += 10) { const f = poiTouchEnvelope(t).flash; expect(f).toBeLessThanOrEqual(prev); prev = f; }
    expect(poiTouchEnvelope(110).flash).toBe(0);
  });
  it('沈みは0から最大(2〜3px)まで入り、戻り切って0。急に跳ばない(慣性)', () => {
    expect(poiTouchEnvelope(0).sink).toBe(0);
    expect(poiTouchEnvelope(POI_TOUCH_SINK_IN_MS).sink).toBeCloseTo(POI_TOUCH_SINK_PX, 5);
    expect(POI_TOUCH_SINK_PX).toBeGreaterThanOrEqual(2);
    expect(POI_TOUCH_SINK_PX).toBeLessThanOrEqual(3);
    expect(poiTouchEnvelope(POI_TOUCH_TOTAL_MS).sink).toBe(0);
    for (let t = 0; t < POI_TOUCH_TOTAL_MS; t++) {
      expect(Math.abs(poiTouchEnvelope(t + 1).sink - poiTouchEnvelope(t).sink)).toBeLessThan(0.2);
    }
  });
  it('負・終了後は0', () => {
    expect(poiTouchEnvelope(-5)).toEqual({ flash: 0, sink: 0 });
    expect(poiTouchEnvelope(9999)).toEqual({ flash: 0, sink: 0 });
  });
});
