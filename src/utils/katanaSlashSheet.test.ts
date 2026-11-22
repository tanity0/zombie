import { describe, expect, it } from 'vitest';
import {
  KATANA_SLASH_CELL_H, KATANA_SLASH_CELL_W, KATANA_SLASH_THICK_CAP, katanaCutDeathAlpha, katanaCutLayout, katanaCutLength,
  katanaCutOpen, katanaCutRgb, katanaSlashIntScale, katanaSlashJitter, katanaSlashPose, katanaSlashVisibleMid,
} from './katanaSlashSheet';

describe('刀の斬撃シート(fx/katana-slash-sheet)', () => {
  it('セルは等間隔(378÷3)', () => {
    expect(KATANA_SLASH_CELL_W * 3).toBe(378);
    expect(KATANA_SLASH_CELL_H).toBe(34);
  });

  it('倍率は整数で、太さは上限に収まる', () => {
    for (const len of [40, 117, 140, 234, 400, 700]) {
      const { kx, ky } = katanaSlashIntScale(len);
      expect(Number.isInteger(kx) && Number.isInteger(ky)).toBe(true);
      expect(ky).toBeLessThanOrEqual(kx);
      expect(ky * KATANA_SLASH_CELL_H).toBeLessThanOrEqual(Math.max(KATANA_SLASH_CELL_H, KATANA_SLASH_THICK_CAP));
    }
  });

  it('進行は 出(尾を固定)→振り切り→余韻(刃先を固定) の順で戻らない', () => {
    for (const move of ['swing', 'issen', 'kill', 'tsubame', 'satsujin'] as const) {
      let last = 0;
      for (let i = 0; i <= 100; i++) {
        const p = katanaSlashPose(i / 100, move);
        expect(p.frame).toBeGreaterThanOrEqual(last);
        last = p.frame;
        expect(p.side).toBe(p.frame === 0 ? 'tail' : p.frame === 1 ? 'full' : 'tip');
      }
    }
  });

  it('出は減速しながら伸び、余韻は加速しながら尾が追いつく(慣性)', () => {
    const r = (t: number) => katanaSlashPose(t).reveal;
    expect(r(0.05) - r(0)).toBeGreaterThan(r(0.19) - r(0.14));
    expect(r(0.6) - r(0.7)).toBeLessThan(r(0.85) - r(0.95));
    expect(katanaSlashPose(0).alpha).toBe(0);
    expect(katanaSlashPose(1).alpha).toBe(0);
  });

  it('一閃・喉搔きは振り切りが長く、余韻が短い', () => {
    const holdLen = (m: 'swing' | 'issen') => [...Array(101).keys()].filter(i => katanaSlashPose(i / 100, m).frame === 1).length;
    expect(holdLen('issen')).toBeGreaterThan(holdLen('swing'));
  });

  it('当たりの光は振り切りに入る瞬間に最大で、見せている区間の中心に付く', () => {
    expect(katanaSlashPose(0.21).burstGrow).toBe(1);
    expect(katanaSlashPose(0.05).burstGrow).toBeLessThan(1);
    expect(katanaSlashVisibleMid({ side: 'tail', reveal: 0.4 })).toBeCloseTo(0.2);
    expect(katanaSlashVisibleMid({ side: 'tip', reveal: 0.4 })).toBeCloseTo(0.8);
  });

  it('1振りの揺らぎは ±5〜8°', () => {
    for (const id of ['a', 'fx-slash-1', 'fx-slash-2', 'zz']) {
      const d = Math.abs(katanaSlashJitter(id)) * 180 / Math.PI;
      expect(d).toBeGreaterThanOrEqual(5);
      expect(d).toBeLessThanOrEqual(8);
    }
  });
});

describe('刀の切り傷', () => {
  it('長さは絵の高さに比例する(雑魚とボスで同じ割合)', () => {
    expect(katanaCutLength(110) / 110).toBeCloseTo(katanaCutLength(370) / 370, 6);
  });

  it('個体ごとに決まった値で散り、梯子(等差・平行)にならない', () => {
    const a = [0, 1, 2, 3].map(i => katanaCutLayout('enemy-7', i));
    expect(a).toEqual([0, 1, 2, 3].map(i => katanaCutLayout('enemy-7', i)));
    for (const c of a) { expect(c.len).toBeGreaterThanOrEqual(0.7); expect(c.len).toBeLessThanOrEqual(1.2); }
    expect(a.some(c => c.ang > 0) && a.some(c => c.ang < 0)).toBe(true); // 交差が混ざる
  });

  it('芯は暗い血の色(明るい赤の予告と明るさで見分けられる)', () => {
    const [r, g, b] = katanaCutRgb(1);
    expect(r).toBeLessThanOrEqual(170);
    expect(g).toBeLessThanOrEqual(15);
    expect(b).toBeLessThanOrEqual(15);
  });

  it('開きは減速、倒れた時の消えは加速', () => {
    expect(katanaCutOpen(0)).toBe(0);
    expect(katanaCutOpen(30) - katanaCutOpen(0)).toBeGreaterThan(katanaCutOpen(120) - katanaCutOpen(90));
    expect(katanaCutDeathAlpha(0)).toBe(1);
    expect(katanaCutDeathAlpha(80) - katanaCutDeathAlpha(160)).toBeLessThan(katanaCutDeathAlpha(240) - katanaCutDeathAlpha(320));
  });
});
