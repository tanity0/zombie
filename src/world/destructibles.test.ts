import { describe, it, expect, afterEach } from 'vitest';
import { treesInRegion } from './trees';
import { cityPropsInRegion } from './cityProps';
import { markObstacleDestroyed, clearDestroyedObstacles, destroyedObstacleCount } from './destructibles';

afterEach(() => clearDestroyedObstacles());

describe('destructibles (裏ボスが壊した障害物の欠番)', () => {
  it('a marked tree disappears from the region query, and returns after clear', () => {
    const region = [-2000, -2000, 2000, 2000] as const;
    const before = treesInRegion(...region);
    expect(before.length).toBeGreaterThan(0);
    const victim = before[0];
    markObstacleDestroyed(victim.key);
    const after = treesInRegion(...region);
    expect(after.find(t => t.key === victim.key)).toBeUndefined();
    expect(after.length).toBe(before.length - 1);
    clearDestroyedObstacles();
    expect(treesInRegion(...region).find(t => t.key === victim.key)).toBeDefined();
  });

  it('a marked city prop disappears from the region query', () => {
    const region = ['city', -3000, -3000, 3000, 3000] as const;
    const before = cityPropsInRegion(...region);
    expect(before.length).toBeGreaterThan(0);
    const victim = before[0];
    markObstacleDestroyed(victim.id);
    const after = cityPropsInRegion(...region);
    expect(after.find(p => p.id === victim.id)).toBeUndefined();
  });

  it('clear resets the count', () => {
    markObstacleDestroyed('a'); markObstacleDestroyed('b');
    expect(destroyedObstacleCount()).toBe(2);
    clearDestroyedObstacles();
    expect(destroyedObstacleCount()).toBe(0);
  });
});
