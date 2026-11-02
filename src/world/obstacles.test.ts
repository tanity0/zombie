import { describe, it, expect } from 'vitest';
import { footRect, rectsOverlap, segmentBlocked, segmentIntersectsRect, resolveAabb, touchesFromBelow, TOUCH_GAP, TOUCH_SIDE_PAD, type Rect } from './obstacles';

describe('footRect', () => {
  it('anchors the box bottom-centre at the foot (bottom edge on footY)', () => {
    const r = footRect(100, 200, 40, 60);
    expect(r).toEqual({ x: 80, y: 140, width: 40, height: 60 });
    // bottom edge == footY, top rises upward by height
    expect(r.y + r.height).toBe(200);
    expect(r.x + r.width / 2).toBe(100);
  });
});

describe('rectsOverlap', () => {
  const a: Rect = { x: 0, y: 0, width: 10, height: 10 };
  it('detects overlap', () => {
    expect(rectsOverlap(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });
  it('rejects disjoint rects', () => {
    expect(rectsOverlap(a, { x: 20, y: 0, width: 5, height: 5 })).toBe(false);
  });
  it('treats edge-touching as non-overlapping (strict)', () => {
    expect(rectsOverlap(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
  });
});

describe('segmentIntersectsRect / segmentBlocked', () => {
  const wall: Rect = { x: 40, y: -10, width: 20, height: 40 };
  it('true when the segment crosses the wall', () => {
    expect(segmentIntersectsRect(0, 0, 100, 0, wall)).toBe(true);
    expect(segmentBlocked(0, 0, 100, 0, [wall])).toBe(true);
  });
  it('false when the segment misses the wall', () => {
    expect(segmentIntersectsRect(0, 100, 100, 100, wall)).toBe(false);
    expect(segmentBlocked(0, 100, 100, 100, [wall])).toBe(false);
  });
  it('false with no walls', () => {
    expect(segmentBlocked(0, 0, 100, 0, [])).toBe(false);
  });
});

describe('resolveAabb', () => {
  it('leaves the actor untouched when not overlapping any wall', () => {
    const actor: Rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(resolveAabb(actor, [{ x: 100, y: 100, width: 10, height: 10 }])).toEqual({ x: 0, y: 0 });
  });
  it('pushes the actor out along the least-penetration axis', () => {
    // actor overlaps wall by 2px on X, 8px on Y -> resolves on X (smaller)
    const actor: Rect = { x: 0, y: 0, width: 10, height: 10 };
    const wall: Rect = { x: 8, y: 2, width: 10, height: 10 };
    const out = resolveAabb(actor, [wall]);
    expect(out.y).toBe(0);            // Y untouched
    expect(out.x).toBe(-2);           // pushed left out of the wall
    // after resolution the actor no longer overlaps the wall
    expect(rectsOverlap({ ...actor, x: out.x, y: out.y }, wall)).toBe(false);
  });
});

describe('touchesFromBelow(POIの絵に下から触れたら発動・社長指示2026-11-02)', () => {
  const obj = { x: 0, y: 0, width: 100, height: 40 }; // 下端 y=40
  const actor = (x: number, y: number) => ({ x, y, width: 28, height: 28 });
  it('下から押し付けている(上端=下端)と true。少し離れていても TOUCH_GAP 内なら true', () => {
    expect(touchesFromBelow(actor(36, 40), obj)).toBe(true);
    expect(touchesFromBelow(actor(36, 40 + TOUCH_GAP - 1), obj)).toBe(true);
  });
  it('離れている・横から・上(裏)からは false', () => {
    expect(touchesFromBelow(actor(36, 40 + TOUCH_GAP + 2), obj)).toBe(false);
    expect(touchesFromBelow(actor(100 + TOUCH_SIDE_PAD + 1, 40), obj)).toBe(false); // 右へ外れている
    expect(touchesFromBelow(actor(-28, 10), obj)).toBe(false);  // 左の横から(中心が下端より上)
    expect(touchesFromBelow(actor(36, -28), obj)).toBe(false);  // 上(裏)から
  });
  it('押し出しで resolveAabb した直後の位置でも true(実際の流れ)', () => {
    const moved = resolveAabb({ x: 36, y: 30, width: 28, height: 28 }, [obj]);
    expect(touchesFromBelow({ x: moved.x, y: moved.y, width: 28, height: 28 }, obj)).toBe(true);
  });
});
