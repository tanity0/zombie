import { describe, it, expect } from 'vitest';
import { padStickToSwipe, PAD_DEAD_ZONE, readDpad, padTakesAim, normalizePadButtons, isAndroidLayoutPad } from './gamepad';

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

describe('パッドに触れたらマウスの照準を外す(照準を持つ銃をスティックで狙える・2026-10-20)', () => {
  it('マウスの照準が付いていれば、パッドに触れるたびに外す(最初の1回だけではない)', () => {
    expect(padTakesAim(true, { x: 10, y: 5 })).toBe(true);
    // 一度外した後にマウスが動いて付き直しても、次にパッドに触れたらまた外す
    expect(padTakesAim(true, { x: -3, y: 40 })).toBe(true);
  });
  it('パッドに触れていない/もう外れている時は何もしない', () => {
    expect(padTakesAim(false, { x: 10, y: 5 })).toBe(false);
    expect(padTakesAim(true, null)).toBe(false);
  });
});

describe('Android 配置のパッド(GameSir・8BitDo)を標準の並びへ(2026-10-20「スタートボタンがLRボタンは意外すぎる」)', () => {
  const press = (...idx: number[]) => { const b = new Array(17).fill(false); for (const i of idx) b[i] = true; return b; };
  const GS = 'Gamesir-T4 Pro (Vendor: 3537 Product: 1012)';
  it('スタート(11)とセレクト(10)が標準の 9/8 になる。L2/R2(8/9)では一時停止にならない', () => {
    expect(normalizePadButtons('', GS, press(11))[9]).toBe(true);
    expect(normalizePadButtons('', GS, press(10))[8]).toBe(true);
    const lr2 = normalizePadButtons('', GS, press(8, 9));
    expect(lr2[8]).toBe(false); expect(lr2[9]).toBe(false);
    expect(lr2[6]).toBe(true); expect(lr2[7]).toBe(true); // L2/R2 は標準の 6/7
  });
  it('肩と顔のボタンも標準の位置へ(上=3・L1=4・R1=5)', () => {
    const b = normalizePadButtons('', GS, press(4, 6, 7, 0, 1, 3));
    expect([b[0], b[1], b[2], b[3], b[4], b[5]]).toEqual([true, true, true, true, true, true]);
  });
  it('標準配置のパッド・名前の違うパッドは素通し', () => {
    expect(normalizePadButtons('standard', GS, press(9))[9]).toBe(true);
    expect(isAndroidLayoutPad('standard', GS)).toBe(false);
    expect(isAndroidLayoutPad('', 'USB Gamepad (Vendor: 0079 Product: 0006)')).toBe(false);
    expect(normalizePadButtons('', 'USB Gamepad (Vendor: 0079 Product: 0006)', press(9))[9]).toBe(true);
    expect(isAndroidLayoutPad('', '8BitDo Pro 2 (Vendor: 2dc8 Product: 6003)')).toBe(true);
    expect(isAndroidLayoutPad('', '3537-1012-Gamesir-T4 Pro')).toBe(true);
  });
});
