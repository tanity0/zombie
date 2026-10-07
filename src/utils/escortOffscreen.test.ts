import { describe, it, expect } from 'vitest';
import { escortOffscreenStep, escortOffscreenPace, baseDirectionLabel, ESCORT_OFFSCREEN_SPEED_MULT, type EscortOffscreenInput } from './escortOffscreen';

const base: EscortOffscreenInput = {
  x: 0, y: 0, baseX: 1000, baseY: 0, baseOpen: true, holdForWelcome: false, stalled: false,
  speedPxPerSec: 100, dtSec: 1, dwellMs: 0, captureRadius: 120, captureHoldMs: 10000, captureFrozen: false,
};

describe('escortOffscreenStep', () => {
  it('画面外は通常の5分の1の速さで拠点へまっすぐ進む', () => {
    const r = escortOffscreenStep(base);
    expect(r.x).toBeCloseTo(100 * ESCORT_OFFSCREEN_SPEED_MULT, 6);
    expect(r.y).toBe(0);
    expect(ESCORT_OFFSCREEN_SPEED_MULT).toBe(0.2);
  });
  it('苦戦の通信から20秒の間は進まない(滞在も進まない)', () => {
    const r = escortOffscreenStep({ ...base, stalled: true });
    expect(r.x).toBe(0);
    const inside = escortOffscreenStep({ ...base, x: 1000, stalled: true, dwellMs: 5000 });
    expect(inside.dwellMs).toBe(5000);
    expect(inside.capture).toBe(false);
  });
  it('ウェルカムの間は出撃地点で待つ', () => {
    expect(escortOffscreenStep({ ...base, holdForWelcome: true }).x).toBe(0);
  });
  it('たどり着いて10秒居れば解放される', () => {
    let s = { ...base, x: 990 };
    let captured = false;
    for (let t = 0; t < 11 && !captured; t++) {
      const r = escortOffscreenStep(s);
      s = { ...s, x: r.x, y: r.y, dwellMs: r.dwellMs };
      captured = r.capture;
    }
    expect(captured).toBe(true);
  });
  it('ボス戦中は解放しない(滞在は保つ)', () => {
    const r = escortOffscreenStep({ ...base, x: 1000, dwellMs: 9500, captureFrozen: true });
    expect(r.capture).toBe(false);
    expect(r.dwellMs).toBe(9500);
  });
  it('解放済みの拠点へは進まない', () => {
    expect(escortOffscreenStep({ ...base, baseOpen: false }).x).toBe(0);
  });
  it('中心で行き過ぎない', () => {
    const r = escortOffscreenStep({ ...base, x: 999, speedPxPerSec: 10000 });
    expect(r.x).toBeLessThanOrEqual(1000);
  });
});

describe('baseDirectionLabel', () => {
  it('東西南北(下が南)', () => {
    expect(baseDirectionLabel(500, 0)).toBe('東部');
    expect(baseDirectionLabel(-500, 0)).toBe('西部');
    expect(baseDirectionLabel(0, 500)).toBe('南部');
    expect(baseDirectionLabel(0, -500)).toBe('北部');
  });
});

describe('escortOffscreenPace', () => {
  it('個体ごとに0.85〜1.15倍で、同じ個体はいつも同じ', () => {
    const ids = ['escort-0', 'escort-1', 'escort-2', 'escort-3'];
    const v = ids.map(escortOffscreenPace);
    for (const x of v) { expect(x).toBeGreaterThanOrEqual(0.85); expect(x).toBeLessThanOrEqual(1.15); }
    expect(escortOffscreenPace('escort-2')).toBe(v[2]);
    expect(new Set(v.map(x => x.toFixed(3))).size).toBeGreaterThan(1);
  });
});
