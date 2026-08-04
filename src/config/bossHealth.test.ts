import { describe, expect, it } from 'vitest';
import { spawnEnemyAt } from '../utils/enemyUtils';
import {
  GATE_BOSS_HEALTH,
  HIDDEN_BOSS_HEALTH,
  STAGE_BOSS_HEALTH_BY_STAGE,
  stageBossHealthFor,
} from './bossHealth';

describe('boss health progression', () => {
  it('raises the castle boss health by stage without using PHILL-specific firepower', () => {
    const stages = ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-6'];
    expect(stages.map(stageBossHealthFor)).toEqual([3500, 4000, 4500, 5000, 5500, 6000]);
    expect(Object.values(STAGE_BOSS_HEALTH_BY_STAGE).every((hp, i, all) => i === 0 || hp > all[i - 1])).toBe(true);
  });

  it('raises gate bosses in encounter order', () => {
    const types = ['miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel'] as const;
    expect(types.map(type => GATE_BOSS_HEALTH[type])).toEqual([8000, 9000, 10000, 11000, 12000, 13000]);
    expect(types.map(type => spawnEnemyAt(type, 0, 0, 0).maxHealth)).toEqual([8000, 9000, 10000, 11000, 12000, 13000]);
  });

  it('raises hidden bosses from stage 1 through stage 5', () => {
    const types = ['mimir', 'idol', 'jormungand', 'skadi', 'thor'] as const;
    expect(types.map(type => HIDDEN_BOSS_HEALTH[type])).toEqual([14000, 16000, 18000, 20000, 22000]);
    expect(types.map(type => spawnEnemyAt(type, 0, 0, 0).maxHealth)).toEqual([14000, 16000, 18000, 20000, 22000]);
  });
});
