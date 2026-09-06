import { describe, it, expect } from 'vitest';
import { iceLanceFloorPulseDamage, ICE_LANCE_FLOOR_HALFWIDTH, ICE_LANCE_FLOOR_DURATION_MS, ICE_LANCE_FLOOR_PULSE_MS } from './iceLanceFloor';

describe('iceLanceFloor(氷槍ライフル・UNIQUE_WEAPONS.md §16-2)', () => {
  it('直撃58ダメージなら床の1パルスは20%=12(四捨五入)', () => {
    expect(iceLanceFloorPulseDamage(58)).toBe(12); // 58*0.2=11.6→12
  });

  it('最低1(端数切り捨てで0にならない)', () => {
    expect(iceLanceFloorPulseDamage(1)).toBe(1);
  });

  it('寸法定数: 幅28px(半幅14)/1.2秒/200msごと', () => {
    expect(ICE_LANCE_FLOOR_HALFWIDTH).toBe(14);
    expect(ICE_LANCE_FLOOR_DURATION_MS).toBe(1200);
    expect(ICE_LANCE_FLOOR_PULSE_MS).toBe(200);
  });
});
