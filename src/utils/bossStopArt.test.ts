import { describe, it, expect } from 'vitest';
import { bossStoppedForArt } from './bossStopArt';

describe('ボスが止まっている間は立ち絵', () => {
  it('紫(完全気絶)・致命後の停止の間だけ真', () => {
    expect(bossStoppedForArt({ type: 'miguel', bossFullStunUntil: 5000 }, 4000, true)).toBe(true);
    expect(bossStoppedForArt({ type: 'miguel', bossFullStunUntil: 5000 }, 5000, true)).toBe(false);
    expect(bossStoppedForArt({ type: 'bounty-melee', stunUntil: 3000 }, 2000, false)).toBe(true);
    expect(bossStoppedForArt({ type: 'giantbat', stunUntil: 3000 }, 2000, false)).toBe(true);
    expect(bossStoppedForArt({ type: 'rafi' }, 2000, true)).toBe(false);
  });
  it('雑魚の気絶は対象外', () => {
    expect(bossStoppedForArt({ type: 'zombie', stunUntil: 3000 }, 2000, false)).toBe(false);
    expect(bossStoppedForArt({ type: 'pumpkin', bossFullStunUntil: 3000 }, 2000, false)).toBe(false);
  });
});
