import { describe, it, expect } from 'vitest';
import {
  resolveShallowSchedule, dueShallowSpawns, ringPositions, fanPositions, positionForAngle, pickChaffFromMix,
  type ShallowExpression,
} from './shallowExpression';

const fixedRng = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

describe('resolveShallowSchedule (PACING_V2.mdバッチR4-C台本別パターン表・v0.26.6定量化)', () => {
  it('tempoはスケジュールを持たない', () => {
    const expr: ShallowExpression = { kind: 'tempo', intervalMult: 0.7, mix: { bat: 50, skeleton: 30, zombie: 20 } };
    expect(resolveShallowSchedule(expr, fixedRng(0.5))).toEqual([]);
  });

  it('射線(ring): +5s/+30sの2回・各回8体・45°間隔(開始角ランダム)', () => {
    const expr: ShallowExpression = { kind: 'ring', events: [{ atMs: 5000, count: 8 }, { atMs: 30000, count: 8 }] };
    const resolved = resolveShallowSchedule(expr, fixedRng(0, 0.5));
    expect(resolved.length).toBe(16);
    const first = resolved.filter(s => s.atMs === 5000);
    expect(first.length).toBe(8);
    // 開始角0・45°刻み(rad)で8点。
    for (let i = 0; i < 8; i++) expect(first[i].angleRad).toBeCloseTo((i * Math.PI) / 4, 5);
    const second = resolved.filter(s => s.atMs === 30000);
    expect(second.length).toBe(8);
    expect(second[0].angleRad).toBeCloseTo(0.5 * Math.PI * 2, 5); // 2回目は別の開始角(rngの2番目の値)
  });

  it('襲撃(ring): +10sの1回・10体・36°間隔', () => {
    const expr: ShallowExpression = { kind: 'ring', events: [{ atMs: 10000, count: 10 }] };
    const resolved = resolveShallowSchedule(expr, fixedRng(0));
    expect(resolved.length).toBe(10);
    expect(resolved.every(s => s.atMs === 10000)).toBe(true);
    expect(resolved[1].angleRad - resolved[0].angleRad).toBeCloseTo((36 * Math.PI) / 180, 5);
  });

  it('判断(pincer): +5/20/35/50sの4回・各回2方向×3体=6体/回(計24体)', () => {
    const expr: ShallowExpression = {
      kind: 'pincer',
      events: [5000, 20000, 35000, 50000].map(atMs => ({ atMs, perSide: 3, wobbleDeg: 15 })),
    };
    const resolved = resolveShallowSchedule(expr, fixedRng(0));
    expect(resolved.length).toBe(24);
    const first = resolved.filter(s => s.atMs === 5000);
    expect(first.length).toBe(6);
    // 軸角0とその+180°(π)からそれぞれ3体。
    const sideA = first.slice(0, 3), sideB = first.slice(3, 6);
    for (const s of sideA) expect(Math.abs(s.angleRad)).toBeLessThanOrEqual((15 * Math.PI) / 180 + 1e-6);
    for (const s of sideB) expect(Math.abs(s.angleRad - Math.PI)).toBeLessThanOrEqual((15 * Math.PI) / 180 + 1e-6);
  });

  it('三択(waves): +5/25/45sの3波・各波6体・扇±30°・方向が波ごとに120°回転(初期角ランダム)', () => {
    const expr: ShallowExpression = {
      kind: 'waves',
      events: [5000, 25000, 45000].map(atMs => ({ atMs, count: 6, spreadDeg: 30 })),
      rotateDeg: 120,
    };
    const resolved = resolveShallowSchedule(expr, fixedRng(0));
    expect(resolved.length).toBe(18);
    const wave0 = resolved.filter(s => s.atMs === 5000);
    const wave1 = resolved.filter(s => s.atMs === 25000);
    const wave2 = resolved.filter(s => s.atMs === 45000);
    expect(wave0.length).toBe(6); expect(wave1.length).toBe(6); expect(wave2.length).toBe(6);
    // 各波の中心角(扇の中央=平均)が120°ずつ回転している。
    const centerOf = (ws: typeof wave0) => ws.reduce((a, b) => a + b.angleRad, 0) / ws.length;
    expect(centerOf(wave1) - centerOf(wave0)).toBeCloseTo((120 * Math.PI) / 180, 4);
    expect(centerOf(wave2) - centerOf(wave1)).toBeCloseTo((120 * Math.PI) / 180, 4);
  });

  it('スパイク(burst): +10sの1回・10体を2秒(durationMs=2000)かけて5体/秒(200ms間隔)で投入・1方向±20°', () => {
    const expr: ShallowExpression = { kind: 'burst', events: [{ atMs: 10000, count: 10, durationMs: 2000, spreadDeg: 20 }] };
    const resolved = resolveShallowSchedule(expr, fixedRng(0));
    expect(resolved.length).toBe(10);
    const times = resolved.map(s => s.atMs).sort((a, b) => a - b);
    for (let i = 0; i < 10; i++) expect(times[i]).toBeCloseTo(10000 + i * 200, 5); // 5体/秒=200ms間隔
    for (const s of resolved) {
      const spreadFromFirst = Math.abs(s.angleRad - resolved[0].angleRad);
      expect(spreadFromFirst).toBeLessThanOrEqual((40 * Math.PI) / 180 + 1e-6); // ±20°の全幅=40°以内
    }
  });
});

describe('dueShallowSpawns: prev/nowの境界で1回ずつ発火(二重発火なし)', () => {
  const resolved = [{ atMs: 5000, angleRad: 0 }, { atMs: 5000, angleRad: 1 }, { atMs: 10000, angleRad: 2 }];
  const gateStartMs = 100000;

  it('境界をまたいだフレームでだけ発火する', () => {
    expect(dueShallowSpawns(resolved, gateStartMs, 100000, 104999)).toEqual([]);
    const due = dueShallowSpawns(resolved, gateStartMs, 104999, 105001);
    expect(due.length).toBe(2);
  });

  it('同一時刻を跨ぐフレームを2回処理しても二重に発火しない(prevを進めて呼ぶのが呼び出し側の責務)', () => {
    const firstCall = dueShallowSpawns(resolved, gateStartMs, 104999, 105001);
    expect(firstCall.length).toBe(2);
    const secondCallSamePrev = dueShallowSpawns(resolved, gateStartMs, 105001, 106000);
    expect(secondCallSamePrev.length).toBe(0); // prevを進めていれば再発火しない
  });

  it('複数の発火時刻を1フレームでまとめて跨いでも全て拾う', () => {
    const due = dueShallowSpawns(resolved, gateStartMs, 100000, 111000);
    expect(due.length).toBe(3);
  });
});

describe('ringPositions/fanPositions: 等間隔・等距離', () => {
  it('ringPositionsは全点が中心から等距離、隣接角度差が360/countで一定', () => {
    const center = { x: 0, y: 0 };
    const pts = ringPositions(center, 100, 8, 0);
    expect(pts.length).toBe(8);
    for (const p of pts) expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeCloseTo(100, 5);
    const angles = pts.map(p => Math.atan2(p.y - center.y, p.x - center.x));
    for (let i = 1; i < angles.length; i++) {
      let diff = angles[i] - angles[i - 1];
      if (diff < 0) diff += Math.PI * 2;
      expect(diff).toBeCloseTo((Math.PI * 2) / 8, 5);
    }
  });

  it('fanPositionsは中心角の周りに均等配置され、端点が±spreadDegに収まる', () => {
    const center = { x: 10, y: 20 };
    const pts = fanPositions(center, 50, 5, 0, 30);
    expect(pts.length).toBe(5);
    for (const p of pts) expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeCloseTo(50, 5);
    const firstAngle = Math.atan2(pts[0].y - center.y, pts[0].x - center.x);
    const lastAngle = Math.atan2(pts[4].y - center.y, pts[4].x - center.x);
    expect(firstAngle).toBeCloseTo((-30 * Math.PI) / 180, 5);
    expect(lastAngle).toBeCloseTo((30 * Math.PI) / 180, 5);
  });

  it('positionForAngleは中心+距離+角度から座標を返す(0radは+x方向)', () => {
    const p = positionForAngle({ x: 5, y: 5 }, 10, 0);
    expect(p.x).toBeCloseTo(15, 5);
    expect(p.y).toBeCloseTo(5, 5);
  });
});

describe('pickChaffFromMix: チャフ3種のみに限られる', () => {
  it('比率どおりに3種のいずれかを返す(境界値含む)', () => {
    const mix = { bat: 50, skeleton: 30, zombie: 20 };
    expect(pickChaffFromMix(mix, 0)).toBe('bat');
    expect(pickChaffFromMix(mix, 0.49)).toBe('bat');
    expect(pickChaffFromMix(mix, 0.51)).toBe('skeleton');
    expect(pickChaffFromMix(mix, 0.79)).toBe('skeleton');
    expect(pickChaffFromMix(mix, 0.81)).toBe('zombie');
    expect(pickChaffFromMix(mix, 0.999)).toBe('zombie');
  });

  it('大量サンプルでも常にチャフ3種(bat/skeleton/zombie)のいずれかしか返さない', () => {
    const mix = { bat: 1, skeleton: 1, zombie: 1 };
    const allowed = new Set(['bat', 'skeleton', 'zombie']);
    for (let i = 0; i <= 100; i++) expect(allowed.has(pickChaffFromMix(mix, i / 100))).toBe(true);
  });
});
