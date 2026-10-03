import { describe, it, expect } from 'vitest';
import { padStickToSwipe, PAD_DEAD_ZONE } from './gamepad';

describe('パッドの左スティック → 移動(タッチのスティックと同じ「方向+強さ」)', () => {
  it('デッドゾーンの中は動かない', () => {
    expect(padStickToSwipe(0.1, 0.1)).toBeNull();
    expect(padStickToSwipe(PAD_DEAD_ZONE * 0.99, 0)).toBeNull();
  });
  it('倒し切りで強さ1・向きは正規化', () => {
    const r = padStickToSwipe(1, 0)!;
    expect(r.strength).toBe(1);
    expect(r.dir).toEqual({ x: 1, y: 0 });
  });
  it('途中は比例(デッドゾーンを0に詰める)', () => {
    const r = padStickToSwipe(0, 0.6)!;
    expect(r.strength).toBeCloseTo((0.6 - PAD_DEAD_ZONE) / (1 - PAD_DEAD_ZONE));
    expect(r.dir.y).toBeCloseTo(1);
  });
});
