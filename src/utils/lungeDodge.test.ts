// research/LUNGE_DODGE.md: 踏み込み回避の純関数と、コマへの記録(`lg`)のテスト。
import { describe, it, expect, beforeEach } from 'vitest';
import { lungeOutward, lungeDirClass } from './lungeDodge';
import { settleEpisode, notePressEdge, tickHabitEpisodeMaintenance, takeRunHabitFold, resetRunHabitState } from './habitEpisode';
import { MELEE_LUNGE_MS_REC } from './playerTraits';
import { MELEE_LUNGE_MS } from '../store/gameStore';

const RECT = { x: -20, y: -20, width: 40, height: 40 };

describe('外向き(§2-1)', () => {
  it('円=中心→自分', () => {
    const o = lungeOutward({ kind: 'circle', cx: 0, cy: 0, radius: 100 }, RECT, 50, 0)!;
    expect(o.x).toBeCloseTo(1); expect(o.y).toBeCloseTo(0);
  });
  it('帯=軸から自分のいる側への垂直', () => {
    const band = { kind: 'band' as const, bands: [{ fx: 0, fy: 0, tx: 200, ty: 0, halfWidth: 40 }] };
    const below = lungeOutward(band, RECT, 100, 20)!;
    expect(below.x).toBeCloseTo(0); expect(below.y).toBeCloseTo(1);
    const above = lungeOutward(band, RECT, 100, -20)!;
    expect(above.y).toBeCloseTo(-1);
  });
  it('体=矩形の最近点→自分(中なら中心→自分)', () => {
    const o = lungeOutward({ kind: 'body' }, RECT, 60, 0)!;
    expect(o.x).toBeCloseTo(1);
    const inside = lungeOutward({ kind: 'body' }, RECT, 0, -10)!;
    expect(inside.y).toBeCloseTo(-1);
  });
  it('紫(none)は決められない', () => {
    expect(lungeOutward({ kind: 'none' }, RECT, 10, 10)).toBeNull();
  });
});

describe('向きの分類', () => {
  const circle = { kind: 'circle' as const, cx: 0, cy: 0, radius: 100 };
  it('外/横/内/踏み込まない', () => {
    expect(lungeDirClass(circle, RECT, 50, 0, 1, 0)).toBe(1);
    expect(lungeDirClass(circle, RECT, 50, 0, 0, 1)).toBe(2);
    expect(lungeDirClass(circle, RECT, 50, 0, -1, 0)).toBe(3);
    expect(lungeDirClass(circle, RECT, 50, 0, 0, 0)).toBe(0);
  });
  it('60°ちょうどまでは外', () => {
    const a = Math.PI / 3 - 1e-3;
    expect(lungeDirClass(circle, RECT, 50, 0, Math.cos(a), Math.sin(a))).toBe(1);
  });
});

describe('コマへの記録(lg)', () => {
  beforeEach(() => resetRunHabitState());
  const base = (T: number) => ({
    gameTime: T, enemyType: 'thor', state: 'issen-windup',
    bcx: 0, bcy: 0, pcx: 100, pcy: 0, bossRect: RECT,
    playerHealth: 100, playerMaxHealth: 100, lastDamagedAtGame: undefined,
  });
  it('踏み込んだ押下には分類が付き、その場で振った押下は0', () => {
    const T = 10_000;
    notePressEdge(0, 0);
    notePressEdge(T - 200, 1, 1, { dirX: 0, dirY: 0, x: 100, y: 0 });
    settleEpisode(base(T));
    tickHabitEpisodeMaintenance(T + 300);
    expect(takeRunHabitFold()!.episodes['thor:issen-windup'][0].lg).toBe(0);

    notePressEdge(0, 0);
    notePressEdge(T - 200, 5, 5, { dirX: 0, dirY: 1, x: 100, y: 10 });
    settleEpisode(base(T));
    tickHabitEpisodeMaintenance(T + 300);
    const lg = takeRunHabitFold()!.episodes['thor:issen-windup'][0].lg;
    expect([1, 2, 3]).toContain(lg);
  });
  it('踏み込みの情報が無い押下・押していないコマには付かない', () => {
    const T = 10_000;
    notePressEdge(0, 0);
    notePressEdge(T - 200, 1);
    settleEpisode(base(T));
    settleEpisode({ ...base(T + 5000) });
    tickHabitEpisodeMaintenance(T + 5300);
    const eps = takeRunHabitFold()!.episodes['thor:issen-windup'];
    expect(eps[0].lg).toBeUndefined();
    expect(eps[1].pressOfs).toBeNull();
    expect(eps[1].lg).toBeUndefined();
  });
  it('踏み込みの長さの写しが本体と一致', () => {
    expect(MELEE_LUNGE_MS_REC).toBe(MELEE_LUNGE_MS);
  });
});
