import { describe, expect, it } from 'vitest';
import { stepObstacleAlpha } from './obstacleAlpha';

describe('stepObstacleAlpha', () => {
  it('作ったばかりの絵は目標の alpha から始まる(既定の1から寄せない=画面下から入る木が一瞬出て消えない)', () => {
    expect(stepObstacleAlpha(1, 0, 0.13, true)).toBe(0);
    expect(stepObstacleAlpha(1, 0.35, 0.13, true)).toBe(0.35);
  });
  it('既にある絵は従来どおり目標へ滑らかに寄せる(透けの出入りは跳ねない)', () => {
    expect(stepObstacleAlpha(1, 0, 0.13, false)).toBeCloseTo(0.87);
    expect(stepObstacleAlpha(0.35, 1, 0.5, false)).toBeCloseTo(0.675);
  });
});
