import { describe, expect, it } from 'vitest';
import { nextLeadRoute, type NextLeadInput } from './mapNextLead';

const base: Omit<NextLeadInput, 'x' | 'avoid'> = { y0: 100, y1: 260, pad: 8, above: 7, minX: 4, maxX: 380 };
const place = { l: 14, r: 160, t: 200, b: 218 }; // 場所の名
const others = { l: 300, r: 370, t: 205, b: 218 }; // ほかの地域

describe('nextLeadRoute', () => {
  it('文字に掛からなければまっすぐ帯の上の縁まで', () => {
    const r = nextLeadRoute({ ...base, x: 220, avoid: [place, others] });
    expect(r.bendX).toBeNull();
    expect(r.d).toBe('M220,100 V260');
  });
  it('場所の名に掛かる時は文字の上端の手前で近い脇へ寄り、文字の外を帯まで降りる', () => {
    const r = nextLeadRoute({ ...base, x: 120, avoid: [place, others] });
    expect(r.bendX).toBe(168); // 右の脇(左の脇 6 より近い)
    expect(r.d.endsWith('V260')).toBe(true);
    expect(r.d).toContain('168,193 V260'); // 文字の上端 200 の 7 上までに寄せ切り、脇を降りる
  });
  it('左の脇が近ければ左へ', () => {
    const r = nextLeadRoute({ ...base, x: 30, avoid: [place, others] });
    expect(r.bendX).toBe(6);
  });
  it('左の脇が枠の外なら右へ', () => {
    const r = nextLeadRoute({ ...base, minX: 10, x: 30, avoid: [place, others] });
    expect(r.bendX).toBe(168);
  });
  it('脇が別の文字に掛かるならその脇は使わない', () => {
    const r = nextLeadRoute({ ...base, x: 350, avoid: [place, { l: 300, r: 375, t: 205, b: 218 }], maxX: 378 });
    expect(r.bendX).toBe(292);
  });
  it('印より上の文字はよけない', () => {
    const r = nextLeadRoute({ ...base, x: 120, avoid: [{ l: 100, r: 140, t: 40, b: 60 }] });
    expect(r.bendX).toBeNull();
  });
});
