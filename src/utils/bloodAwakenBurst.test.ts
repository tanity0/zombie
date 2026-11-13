// B10 血の覚醒に入った瞬間の押し返し(bloodBurstShoves)の純関数テスト。
import { describe, it, expect } from 'vitest';
import { bloodBurstShoves, BLOOD_AWAKEN_BURST_RADIUS, type BloodBurstTarget } from './bloodAwakenBurst';

const SP = 100;
const at = (id: string, type: string, cx: number, cy: number, extra: Partial<BloodBurstTarget> = {}): BloodBurstTarget =>
  ({ id, type, x: cx - 18, y: cy - 18, width: 36, height: 36, ...extra } as BloodBurstTarget);

describe('bloodBurstShoves(誰をどちらへ押すか)', () => {
  it('半径140が叩き台', () => { expect(BLOOD_AWAKEN_BURST_RADIUS).toBe(140); });
  it('範囲内の雑魚を外向きへ押す・近いほど強い・範囲外は押さない', () => {
    const r = bloodBurstShoves([at('a', 'zombie', 40, 0), at('b', 'zombie', 0, -120), at('c', 'zombie', 200, 0)], 0, 0, 0, SP);
    expect(r.get('a')!.vx).toBeGreaterThan(0);
    expect(r.get('a')!.vy).toBeCloseTo(0);
    expect(r.get('b')!.vy).toBeLessThan(0);
    expect(Math.hypot(r.get('a')!.vx, r.get('a')!.vy)).toBeGreaterThan(Math.hypot(r.get('b')!.vx, r.get('b')!.vy));
    expect(Math.hypot(r.get('b')!.vx, r.get('b')!.vy)).toBeGreaterThanOrEqual(SP * 0.5);
    expect(r.has('c')).toBe(false);
  });
  it('強個体(パンプキン・赤い個体)は押す・ボス級と終端の死神は押さない', () => {
    const r = bloodBurstShoves([at('p', 'pumpkin', 50, 0), at('red', 'zombie', 0, 50, { colorTier: 'red' } as Partial<BloodBurstTarget>), at('t', 'thor', -50, 0), at('end', 'reaper', 0, -50, { reaperChaser: true } as Partial<BloodBurstTarget>), at('hero', 'mutant-hero', 30, 30)], 0, 0, 0, SP);
    expect(r.has('p')).toBe(true);
    expect(r.has('red')).toBe(true);
    expect(r.has('t')).toBe(false);
    expect(r.has('end')).toBe(false);
    expect(r.has('hero')).toBe(false);
  });
  it('死体・何も当たらない個体は押さない・技の最中は押す(社長裁定2026-11-13)', () => {
    const r = bloodBurstShoves([
      at('corpse', 'zombie', 30, 0, { corpseUntil: 999 }),
      at('ghost', 'zombie', 0, 30, { wraithPhased: true } as Partial<BloodBurstTarget>),
      at('atk', 'zombie', -30, 0, { aiPhase: 'windup' } as Partial<BloodBurstTarget>),
      at('stunned', 'zombie', 0, -30, { aiPhase: 'windup', stunUntil: 5000 } as Partial<BloodBurstTarget>),
    ], 0, 0, 1000, SP);
    expect([...r.keys()]).toEqual(['atk', 'stunned']);
  });
  it('中心が重なっていても数値が壊れない(右へ押す)', () => {
    const v = bloodBurstShoves([at('z', 'zombie', 0, 0)], 0, 0, 0, SP).get('z')!;
    expect(v.vx).toBeCloseTo(SP);
    expect(v.vy).toBe(0);
  });
});
