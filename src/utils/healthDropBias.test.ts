import { describe, it, expect } from 'vitest';
import { healthDropMult } from './healthDropBias';

describe('healthDropMult(回復の出やすさ=体力連動・C9)', () => {
  it('満タン寄りは1倍・50%以下で1.5倍・20%以下で2倍', () => {
    expect(healthDropMult(100, 100)).toBe(1);
    expect(healthDropMult(51, 100)).toBe(1);
    expect(healthDropMult(50, 100)).toBe(1.5);
    expect(healthDropMult(21, 100)).toBe(1.5);
    expect(healthDropMult(20, 100)).toBe(2);
    expect(healthDropMult(1, 100)).toBe(2);
  });
  it('最大体力が0以下なら1倍(壊れた入力で確率を膨らませない)', () => {
    expect(healthDropMult(10, 0)).toBe(1);
  });
});
