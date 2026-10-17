import { describe, it, expect } from 'vitest';
import {
  normalizeDir,
  biasedShakeOffset,
  biasedBurstAngle,
  shouldShowMultiHitFx,
  dedupeMultiHitEffects,
  speedLineRemainingMs,
  speedLineAlpha,
  MULTI_HIT_FX_MIN_COUNT,
  SHAKE_DIR_PERP_SCALE,
} from './dirFx';
import type { VisualEffect } from '../types/game';

describe('normalizeDir (M22 Group C1)', () => {
  it('単位ベクトルへ正規化する', () => {
    const r = normalizeDir(3, 4);
    expect(r.x).toBeCloseTo(0.6);
    expect(r.y).toBeCloseTo(0.8);
  });
  it('長さがほぼ0なら{0,0}(番兵値=方向なしのフォールバック)', () => {
    expect(normalizeDir(0, 0)).toEqual({ x: 0, y: 0 });
    expect(normalizeDir(0.00001, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('biasedShakeOffset (M22 C1)', () => {
  it('方向成分(along)は dirX/dirY 軸へ、直交成分(perp)は弱めて90°回転軸へ配分', () => {
    // dir=(1,0)=x軸。along=1(=mag方向いっぱい)・perp=0 なら x=mag, y=0。
    const a = biasedShakeOffset(10, 1, 0, 1, 0);
    expect(a.x).toBeCloseTo(10);
    expect(a.y).toBeCloseTo(0);
    // perpのみ(along=0・perp=1) なら 直交方向(0,1)へ perpScale 倍だけ動く。
    const b = biasedShakeOffset(10, 1, 0, 0, 1);
    expect(b.x).toBeCloseTo(0);
    expect(b.y).toBeCloseTo(10 * SHAKE_DIR_PERP_SCALE);
  });
  it('perp成分はalong成分よりも常に弱い(SHAKE_DIR_PERP_SCALE<1)', () => {
    expect(SHAKE_DIR_PERP_SCALE).toBeLessThan(1);
    expect(SHAKE_DIR_PERP_SCALE).toBeGreaterThan(0);
  });
});

describe('biasedBurstAngle (M22 C1)', () => {
  it('rand01=0.5(中央値)なら基準角(atan2)そのもの', () => {
    const ang = biasedBurstAngle(1, 0, 0.5);
    expect(ang).toBeCloseTo(0);
  });
  it('spawnSprayと同じ円錐幅(±SPREAD/2)に収まる', () => {
    const base = Math.atan2(1, 0); // dir=(0,1)
    for (const rand of [0, 0.25, 0.5, 0.75, 1]) {
      const ang = biasedBurstAngle(0, 1, rand);
      expect(ang).toBeGreaterThanOrEqual(base - 1.05 / 2 - 1e-9);
      expect(ang).toBeLessThanOrEqual(base + 1.05 / 2 + 1e-9);
    }
  });
});

describe('shouldShowMultiHitFx (M22 C3)', () => {
  it('既存registerMultiHitと同じ閾値(count>=2)で「複数」と判定', () => {
    expect(MULTI_HIT_FX_MIN_COUNT).toBe(2);
    expect(shouldShowMultiHitFx(0)).toBe(false);
    expect(shouldShowMultiHitFx(1)).toBe(false);
    expect(shouldShowMultiHitFx(2)).toBe(true);
    expect(shouldShowMultiHitFx(9)).toBe(true);
  });
});

describe('dedupeMultiHitEffects (M22 C3)', () => {
  const mk = (kind: VisualEffect['kind'], id: string): VisualEffect =>
    kind === 'multiHit'
      ? { kind: 'multiHit', id, x: 0, y: 0, count: 3, createdAt: 0, duration: 100 }
      : { kind: 'flash', id, color: '#fff', createdAt: 0, duration: 100 };

  it('multiHit以外はそのまま残す', () => {
    const effects = [mk('flash', 'a'), mk('flash', 'b')];
    expect(dedupeMultiHitEffects(effects)).toEqual(effects);
  });
  it('既存のmultiHitは全て除去(同時キャップ=1=新規追加前に古いものを間引く)', () => {
    const effects = [mk('flash', 'a'), mk('multiHit', 'old1'), mk('multiHit', 'old2')];
    const kept = dedupeMultiHitEffects(effects);
    expect(kept.map(e => e.id)).toEqual(['a']);
  });
});

describe('speedLineRemainingMs (M22 C4)', () => {
  it('katanaダッシュ中は残りms(dashUntil-now)を返す', () => {
    expect(speedLineRemainingMs(1000, 1180, 0, 0, 280)).toBe(180);
  });
  it('wireダッシュ中も同様', () => {
    expect(speedLineRemainingMs(1000, 0, 1150, 0, 280)).toBe(150);
  });
  it('カウンター成立直後(lastCounterSuccessTime基準)も同様', () => {
    // now=1000, lastCounterSuccessTime=900 → 経過100ms → 残り(280-100)=180
    expect(speedLineRemainingMs(1000, 0, 0, 900, 280)).toBe(180);
  });
  it('どれも非アクティブなら負値(呼び出し側で<=0チェック)', () => {
    expect(speedLineRemainingMs(1000, 500, 400, 0, 280)).toBeLessThanOrEqual(0);
  });
  it('複数重なっていたら最大(最も残っている方)を採用', () => {
    // ダッシュ残り50(1050-1000) / カウンター残り200(280-(1000-920)) → 200
    expect(speedLineRemainingMs(1000, 1050, 0, 920, 280)).toBe(200);
  });
});

describe('speedLineAlpha (M22 C4)', () => {
  it('残り0以下は0', () => {
    expect(speedLineAlpha(0, 90, 0.8)).toBe(0);
    expect(speedLineAlpha(-10, 90, 0.8)).toBe(0);
  });
  it('残りがfadeMs以上ならmaxAlpha(フェード開始前)', () => {
    expect(speedLineAlpha(500, 90, 0.8)).toBeCloseTo(0.8);
  });
  it('フェード区間中は線形に比例', () => {
    expect(speedLineAlpha(45, 90, 0.8)).toBeCloseTo(0.4);
  });
});
