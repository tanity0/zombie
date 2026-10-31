import { describe, it, expect } from 'vitest';
import { isBackingAway, backpedalFaceSide } from './backpedal';

describe('後ずさり(こちらを向いたまま下がる)', () => {
  it('プレイヤーが右に居て左へ動く=後ずさり→右(プレイヤーの側)を向く', () => {
    expect(backpedalFaceSide(-60, 100, 300)).toBe(1);
    expect(backpedalFaceSide(60, 300, 100)).toBe(-1);
  });
  it('プレイヤーへ向かう/ほぼ止まっている間は 0(従来どおり進む向き)', () => {
    expect(backpedalFaceSide(60, 100, 300)).toBe(0);
    expect(backpedalFaceSide(10, 300, 100)).toBe(0);
  });
  it('遠ざかる判定は内積の符号', () => {
    expect(isBackingAway(-1, 0, 1, 0)).toBe(true);
    expect(isBackingAway(1, 0, 1, 0)).toBe(false);
    expect(isBackingAway(0, 1, 1, 0)).toBe(false);
  });
});
