import { describe, it, expect } from 'vitest';
import { padStickToSwipe, PAD_DEAD_ZONE, readDpad } from './gamepad';

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

describe('十字キー(配置の違うパッドも読む・v0.25.4881)', () => {
  const none = Array(16).fill(false);
  it('標準配置はボタン12〜15だけを見る', () => {
    const b = [...none]; b[12] = true;
    expect(readDpad('standard', b, [0, 0, 0, 0])).toEqual({ up: true, down: false, left: false, right: false });
    expect(readDpad('standard', none, [0, 0, 0, 0, 0, 0, 0, 0, 0, -1])).toEqual({ up: false, down: false, left: false, right: false });
  });
  it('ハットスイッチ(axes[9])の8方向と中立', () => {
    const ax = (v: number) => [0, 0, 0, 0, 0, 0, 0, 0, 0, v];
    expect(readDpad('', none, ax(-1))).toEqual({ up: true, down: false, left: false, right: false });
    expect(readDpad('', none, ax(-3 / 7))).toEqual({ up: false, down: false, left: false, right: true });
    expect(readDpad('', none, ax(1 / 7))).toEqual({ up: false, down: true, left: false, right: false });
    expect(readDpad('', none, ax(5 / 7))).toEqual({ up: false, down: false, left: true, right: false });
    expect(readDpad('', none, ax(1))).toEqual({ up: true, down: false, left: true, right: false });
    expect(readDpad('', none, ax(3.2857))).toEqual({ up: false, down: false, left: false, right: false }); // 中立
  });
  it('ハットでない軸が0で止まっていても「下」と読まない(刻みに乗っていない)', () => {
    expect(readDpad('', none, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toEqual({ up: false, down: false, left: false, right: false });
  });
});
