import { describe, expect, it } from 'vitest';
import { canRouteElementNow, clampElementLevel } from './elementLevel';

describe('clampElementLevel(音声要素のつまみに書く値)', () => {
  it('0〜1 の値はそのまま(element.volume と同じ値=聴こえ方を変えない)', () => {
    for (const v of [0, 0.12, 0.33, 0.5, 0.6, 0.64, 0.66, 0.85, 0.9, 1]) expect(clampElementLevel(v, 0.3)).toBe(v);
  });
  it('範囲外は端へ寄せる(例外を投げない)', () => {
    expect(clampElementLevel(-0.2, 0.5)).toBe(0);
    expect(clampElementLevel(1.4, 0.5)).toBe(1);
  });
  it('数でない値は書かない(直前の値を保つ)', () => {
    expect(clampElementLevel(Number.NaN, 0.42)).toBe(0.42);
  });
});

describe('canRouteElementNow(いま WebAudio に通してよいか)', () => {
  it('コンテキストが動いている時だけ通す', () => {
    expect(canRouteElementNow(true, 'running')).toBe(true);
    expect(canRouteElementNow(true, 'suspended')).toBe(false);
    expect(canRouteElementNow(true, 'interrupted')).toBe(false);
    expect(canRouteElementNow(true, 'closed')).toBe(false);
    expect(canRouteElementNow(true, null)).toBe(false);
  });
  it('?bgmroute=off(素再生の確認モード)では通さない', () => {
    expect(canRouteElementNow(false, 'running')).toBe(false);
  });
});
