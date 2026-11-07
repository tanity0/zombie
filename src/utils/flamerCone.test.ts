import { describe, it, expect } from 'vitest';
import { flamerCycleDps, flamerEffectiveReloadMs, pickFanHits, FLAMER_HALF_ANGLE_RAD, flamerBurnPatch, FLAMER_BURN_MS, FLAMER_BURN_TICK_DAMAGE,
  phantomFlamerPulseAt, phantomFlamerPhase, PHANTOM_FLAMER_WINDUP_MS, FLAMER_PULSE_MS } from './flamerCone';

describe('flamerCone(火炎放射器・UNIQUE_WEAPONS.md §5-2/§16-1)', () => {
  it('実効リロード(raw1500ms)は×2規則で3000msになる', () => {
    expect(flamerEffectiveReloadMs(1500)).toBe(3000);
  });

  it('80弾×11ダメージ・100ms間隔のサイクル実効DPSは80.0(既定shotgun-t3=26.87比×3.0・延焼は別)', () => {
    // ★社長指示2026-10-28「弾切れが早すぎる」「意外と弱い」→ 装填40→80・1回5→7+延焼。旧は既定比±10%の帯(28.57)だった。
    // ★社長指示2026-11-02「もっと強くしたい 弱い」→ 1回7→11(旧DPS 50.91)。
    const dps = flamerCycleDps();
    expect(dps).toBeCloseTo(80.0, 1);
  });

  it('半角は0.25rad(扇0.5radの半分)', () => {
    expect(FLAMER_HALF_ANGLE_RAD).toBeCloseTo(0.25, 5);
  });
});

describe('pickFanHits', () => {
  const enemy = (id: string, x: number, y: number, w = 20, h = 20) => ({ id, x, y, width: w, height: h });

  it('正面・射程内の敵を拾う', () => {
    const hits = pickFanHits(0, 0, 1, 0, 90, 0.25, [enemy('a', 50, -5, 10, 10)]);
    expect(hits.map(h => h.id)).toEqual(['a']);
  });

  it('射程外は拾わない', () => {
    const hits = pickFanHits(0, 0, 1, 0, 90, 0.25, [enemy('a', 200, -5, 10, 10)]);
    expect(hits).toEqual([]);
  });

  it('扇の外(角度が半角を超える)は拾わない', () => {
    // 真上(90度)は正面(0度)から大きく外れる
    const hits = pickFanHits(0, 0, 1, 0, 90, 0.25, [enemy('a', -5, -50, 10, 10)]);
    expect(hits).toEqual([]);
  });

  it('境界付近: 敵の概算半径ぶんは距離判定に足す', () => {
    // 中心距離95pxだが半径10pxなので range(90)+10=100以内 → 拾う
    const hits = pickFanHits(0, 0, 1, 0, 90, 0.25, [enemy('a', 85, -10, 20, 20)]);
    expect(hits.map(h => h.id)).toEqual(['a']);
  });

  it('複数体のうち扇内だけを拾う', () => {
    const hits = pickFanHits(0, 0, 1, 0, 90, 0.25, [
      enemy('front', 50, -5, 10, 10),
      enemy('behind', -50, -5, 10, 10),
    ]);
    expect(hits.map(h => h.id)).toEqual(['front']);
  });

  it('延焼の付け直し: 時間は延び、強さは高い方、帰属は直近に炙った側(§17-6b)', () => {
    expect(flamerBurnPatch({}, 1000)).toEqual({ burnUntil: 1000 + FLAMER_BURN_MS, burnDpsTick: FLAMER_BURN_TICK_DAMAGE, burnByGhost: undefined });
    const longer = flamerBurnPatch({ burnUntil: 99999, burnDpsTick: 9 }, 1000, true);
    expect(longer).toEqual({ burnUntil: 99999, burnDpsTick: 9, burnByGhost: true });
  });

  it('幻影の炎: 最初の炎=溜め明け(紫の予告が流れ切る瞬間)、以後100msごと(§17-6b)', () => {
    expect(phantomFlamerPulseAt(1000, 0)).toBe(1000 + PHANTOM_FLAMER_WINDUP_MS);
    expect(phantomFlamerPulseAt(1000, 3)).toBe(1000 + PHANTOM_FLAMER_WINDUP_MS + 3 * FLAMER_PULSE_MS);
    expect(phantomFlamerPhase(undefined, 5000)).toBe('none');
    expect(phantomFlamerPhase(1000, 1000 + PHANTOM_FLAMER_WINDUP_MS - 1)).toBe('windup');
    expect(phantomFlamerPhase(1000, 1000 + PHANTOM_FLAMER_WINDUP_MS)).toBe('spray');
  });
});

// 社長報告2026-11-02「塊に向けて銃が撃たれない」: 巨大な箱(変異塊の代理)は中心ではなくいちばん近い縁で測る。
describe('pickFanHits: 測る点の差し替え(変異塊の代理)', () => {
  const big = { id: 'crawler', x: 100, y: -400, width: 742, height: 300 }; // 中心は(471,-250)=右上の遠く
  it('中心で測ると、目の前の縁へ向けた扇には入らない', () => {
    expect(pickFanHits(0, 0, 1, -1, 200, 0.25, [big]).length).toBe(0); // 縁(100,-100)=-45°へ向けても、中心(-28°)は扇の外
  });
  it('いちばん近い縁で測れば入る', () => {
    const near = (e: typeof big) => ({ x: Math.max(e.x, Math.min(e.x + e.width, 0)), y: Math.max(e.y, Math.min(e.y + e.height, 0)) });
    // 近い縁=(100,-100)。そちらへ向けた扇・射程200で拾える。
    expect(pickFanHits(0, 0, 1, -1, 200, 0.25, [big], near).map(e => e.id)).toEqual(['crawler']);
  });
});
