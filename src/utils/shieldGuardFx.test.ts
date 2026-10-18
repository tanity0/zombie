import { describe, it, expect } from 'vitest';
import {
  shieldPushCurve, shieldPushPx, shieldHoldAmount, shieldHoldJitter, shieldGuardGlow, shieldChipDark, shieldGhostPose,
  SHIELD_PUSH_SNAP_MS, SHIELD_PUSH_HEAVY_MIN_PX, SHIELD_PUSH_HEAVY_MAX_PX, SHIELD_PUSH_LIGHT_PX, SHIELD_HOLD_JITTER_PX,
  METAL_PALETTE, shieldBeamPalette, reflectAlongTravel, takeTechniqueStart, TECHNIQUE_GAP_MS, beamHoldGain, SHIELD_GHOST_LIFE_MS,
  type TechniqueGateState,
} from './shieldGuardFx';

describe('盾の押し戻しの曲線(第2回クリエイティブ監査)', () => {
  it('30〜50ms で最大まで出て、そのあと行き過ぎて(負へ)戻り、0 に収まる=往復対称ではない', () => {
    expect(SHIELD_PUSH_SNAP_MS).toBeGreaterThanOrEqual(30);
    expect(SHIELD_PUSH_SNAP_MS).toBeLessThanOrEqual(50);
    expect(shieldPushCurve(0)).toBe(0);
    expect(shieldPushCurve(SHIELD_PUSH_SNAP_MS)).toBeCloseTo(1, 5);
    let min = 0;
    for (let t = 0; t < 900; t += 5) min = Math.min(min, shieldPushCurve(t));
    expect(min).toBeLessThan(-0.05); // わずかに行き過ぎる
    expect(min).toBeGreaterThan(-0.3);
    expect(Math.abs(shieldPushCurve(900))).toBeLessThan(0.01);
    // 出る側(40ms)より戻る側は長い(非対称)。
    let tRet = SHIELD_PUSH_SNAP_MS;
    while (shieldPushCurve(tRet) > 0 && tRet < 900) tRet += 1;
    expect(tRet - SHIELD_PUSH_SNAP_MS).toBeGreaterThan(SHIELD_PUSH_SNAP_MS);
  });
  it('出だしは最速(ease-out)=最初の10msの進みが次の10msより大きい', () => {
    expect(shieldPushCurve(10)).toBeGreaterThan(shieldPushCurve(20) - shieldPushCurve(10));
  });
  it('大きさ: ボス級は 10〜14px(防ぎごとにばらつく)・それ以外は 6px', () => {
    for (let seed = 1; seed < 200; seed += 7) {
      const px = shieldPushPx(true, seed * 1234.5);
      expect(px).toBeGreaterThanOrEqual(SHIELD_PUSH_HEAVY_MIN_PX);
      expect(px).toBeLessThanOrEqual(SHIELD_PUSH_HEAVY_MAX_PX);
    }
    const set = new Set([1, 2, 3, 4, 5].map(s => shieldPushPx(true, s * 977).toFixed(2)));
    expect(set.size).toBeGreaterThan(1);
    expect(shieldPushPx(false, 123)).toBe(SHIELD_PUSH_LIGHT_PX);
  });
  it('当たり続けている間の震えは 2〜3px 以内で、純粋な正弦ではない(周期が見えない)', () => {
    const amt = shieldHoldAmount(1000, 0);
    expect(amt).toBeCloseTo(1, 5);
    let max = 0;
    const vals: number[] = [];
    for (let t = 0; t < 4000; t += 3) { const v = shieldHoldJitter(t, 42, amt); vals.push(v); max = Math.max(max, Math.abs(v)); }
    expect(max).toBeLessThanOrEqual(SHIELD_HOLD_JITTER_PX + 1e-6);
    expect(max).toBeGreaterThan(1.5);
    // 純正弦なら一定周期でほぼ同じ値に戻る。3つの周期の重ね合わせは、どの周期ずらしでも一致しない。
    let bestDiff = Infinity;
    for (let lag = 20; lag < 400; lag++) {
      let d = 0; for (let i = 0; i + lag < vals.length; i += 4) d += Math.abs(vals[i] - vals[i + lag]);
      bestDiff = Math.min(bestDiff, d / Math.floor((vals.length - lag) / 4));
    }
    expect(bestDiff).toBeGreaterThan(0.1);
    expect(shieldHoldJitter(100, 1, 0)).toBe(0);
  });
  it('押されたままの量: 短い防ぎは 0・長く当たると立ち上がり・離れると滑らかに戻る', () => {
    expect(shieldHoldAmount(60, 0)).toBe(0);
    expect(shieldHoldAmount(500, 0)).toBe(1);
    const a = shieldHoldAmount(500, 50), b = shieldHoldAmount(500, 200);
    expect(a).toBeLessThan(1); expect(b).toBeLessThan(a); expect(b).toBeGreaterThan(0);
  });
  it('光(shieldGuardGlow)は一瞬で立ち上がり退く / 暗さ(shieldChipDark)は削れた直後に濁りゆっくり戻る', () => {
    expect(shieldGuardGlow(0, 0)).toBe(0);
    expect(shieldGuardGlow(20, 0)).toBeGreaterThan(0.9);
    expect(shieldGuardGlow(600, 0)).toBeLessThan(0.05);
    expect(shieldGuardGlow(600, 1)).toBeGreaterThan(0.3); // 当たり続けは薄く残る
    expect(shieldChipDark(0)).toBe(0);
    expect(shieldChipDark(30)).toBeGreaterThan(0.95);
    expect(shieldChipDark(2000)).toBeLessThan(0.03);
  });
});

describe('壊れた盾の残骸(shieldGhostPose)', () => {
  it('出だしは速度 0(加速)・飛ぶほど減衰・薄れて消える', () => {
    expect(shieldGhostPose(0).dist).toBe(0);
    const d1 = shieldGhostPose(5).dist, d2 = shieldGhostPose(10).dist;
    expect(d1).toBeGreaterThan(0);
    expect(d2 - d1).toBeGreaterThan(d1); // 加速している
    const v = (t: number) => shieldGhostPose(t + 20).dist - shieldGhostPose(t).dist;
    expect(v(500)).toBeLessThan(v(100)); // 減衰
    expect(shieldGhostPose(SHIELD_GHOST_LIFE_MS).alpha).toBeCloseTo(0, 5);
    expect(shieldGhostPose(50).alpha).toBe(1);
  });
});

describe('色と刃の跳ね返り・技の関門', () => {
  it('物理=金属(白→淡い金)・紫の光線は紫・赤い光線は赤(紫は物理/赤を防ぐ色にしない)', () => {
    expect(METAL_PALETTE.sparks[0]).toBe('#ffffff');
    expect(shieldBeamPalette('mimir').glow).toContain('192,132,252');
    expect(shieldBeamPalette('bounty').glow).not.toContain('192,132,252');
    expect(shieldBeamPalette(undefined).glow).not.toBe(shieldBeamPalette('mimir').glow);
    expect(METAL_PALETTE.glow).not.toContain('192,132,252');
  });
  it('刃の欠片は盾の面で反射した向き(進行の主軸だけ反転・横は残す)', () => {
    const z = reflectAlongTravel(0, 1); expect(z.x).toBeCloseTo(0); expect(z.y).toBe(-1);
    const r = reflectAlongTravel(0.3, -0.95);
    expect(r.x).toBeCloseTo(0.3); expect(r.y).toBeCloseTo(0.95);
    const h = reflectAlongTravel(1, 0.2);
    expect(h.x).toBeCloseTo(-1); expect(h.y).toBeCloseTo(0.2);
  });
  it('大きな衝撃は技ごとに1度: 同じ key は間隔 1.5 秒以内なら続き・別の key や長い間のあとは新しい技', () => {
    const g: TechniqueGateState = { key: undefined, lastAt: 0 };
    expect(takeTechniqueStart(g, 'mimir:a:1000', 10)).toBe(true);
    // 車輪の各本が 250ms おきに盾を横切っても再発しない。
    for (let t = 260; t < 1400; t += 250) expect(takeTechniqueStart(g, 'mimir:a:1000', t)).toBe(false);
    expect(takeTechniqueStart(g, 'mimir:a:5000', 1500)).toBe(true); // 次の技(開始時刻が違う)
    expect(takeTechniqueStart(g, 'mimir:a:5000', 1500 + TECHNIQUE_GAP_MS + 1)).toBe(true); // 同じ key でも長く空いた
    expect(takeTechniqueStart(g, undefined, 9000)).toBe(true);
  });
  it('当たり続けの接触音は包絡で細る', () => {
    expect(beamHoldGain(0)).toBeGreaterThan(beamHoldGain(3000));
    expect(beamHoldGain(10000)).toBeGreaterThan(0);
  });
});
