import { describe, it, expect } from 'vitest';
import { flamerCycleDps, flamerEffectiveReloadMs, pickFanHits, FLAMER_HALF_ANGLE_RAD, flamerBurnPatch, FLAMER_BURN_MS, FLAMER_BURN_TICK_DAMAGE } from './flamerCone';

describe('flamerCone(火炎放射器・UNIQUE_WEAPONS.md §5-2/§16-1)', () => {
  it('実効リロード(raw1500ms)は×2規則で3000msになる', () => {
    expect(flamerEffectiveReloadMs(1500)).toBe(3000);
  });

  it('80弾×7ダメージ・100ms間隔のサイクル実効DPSは50.91(既定shotgun-t3=26.87比+89%・延焼は別)', () => {
    // ★社長指示2026-10-28「弾切れが早すぎる」「意外と弱い」→ 装填40→80・1回5→7+延焼。旧は既定比±10%の帯(28.57)だった。
    const dps = flamerCycleDps();
    expect(dps).toBeCloseTo(50.91, 1);
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
});
