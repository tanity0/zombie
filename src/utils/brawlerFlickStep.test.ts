// ★技ポイントが足りないフリックをステップに変える判定(社長指示2026-11-12「技ポイントが無い状態でフリックすると、その方向にステップ発動」)。
import { describe, it, expect } from 'vitest';
import { brawlerFlickStepInstead, initialBrawlerState, brawlerStepAllowed } from './brawler';

describe('brawlerFlickStepInstead', () => {
  const idle = initialBrawlerState();
  it('払える時は変えない(今どおり技)', () => {
    expect(brawlerFlickStepInstead(idle, 1000, true)).toBe(false);
  });
  it('払えず、ステップを出せる(待機)ならステップ', () => {
    expect(brawlerStepAllowed(idle, 1000)).toBe(true);
    expect(brawlerFlickStepInstead(idle, 1000, false)).toBe(true);
  });
  it('払えなくても、ステップを出せない時(ステップの最中・構えの最中・秘奥義)は変えない', () => {
    expect(brawlerFlickStepInstead({ ...idle, stepUntil: 1100 }, 1000, false)).toBe(false);
    expect(brawlerFlickStepInstead({ ...idle, phase: 'tech', tech: 'guard', guardUntil: 2000, guardSince: 900 }, 1000, false)).toBe(false);
    expect(brawlerFlickStepInstead({ ...idle, secret: { phase: 'ignite', phaseAt: 900, hits: 0, nextAt: 1500, igniteAt: 0 } }, 1000, false)).toBe(false);
  });
});
