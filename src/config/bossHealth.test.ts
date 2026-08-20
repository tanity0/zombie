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
    // research/STAGE_DIFFICULTY.md(社長裁定2026-08-20「7は単純にHPを第一と第2それぞれ2倍くらいに」):
    // stage-7(ラスボス=グレン)だけ 6000→12000。**第二形態も同じ行を読む**ので、この1行で両形態が2倍。
    const stages = ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-7'];
    expect(stages.map(stageBossHealthFor)).toEqual([3500, 4000, 4500, 5000, 5500, 12000]);
    expect(STAGE_BOSS_HEALTH_BY_STAGE).not.toHaveProperty('stage-6');
    expect(STAGE_BOSS_HEALTH_BY_STAGE['stage-7']).toBe(12000);
    expect(Object.values(STAGE_BOSS_HEALTH_BY_STAGE).every((hp, i, all) => i === 0 || hp > all[i - 1])).toBe(true);
  });

  it('raises gate bosses in encounter order', () => {
    const types = ['miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel'] as const;
    expect(types.map(type => GATE_BOSS_HEALTH[type])).toEqual([5000, 6000, 7000, 8000, 9000, 10000]);
    expect(types.map(type => spawnEnemyAt(type, 0, 0, 0).maxHealth)).toEqual([5000, 6000, 7000, 8000, 9000, 10000]);
    expect(GATE_BOSS_HEALTH.miguel).toBeGreaterThan(STAGE_BOSS_HEALTH_BY_STAGE['stage-1']);
    expect(GATE_BOSS_HEALTH.miguel).toBeLessThan(STAGE_BOSS_HEALTH_BY_STAGE['stage-5']);
    expect(GATE_BOSS_HEALTH.jibril).toBeGreaterThan(STAGE_BOSS_HEALTH_BY_STAGE['stage-3']);
    expect(GATE_BOSS_HEALTH.rafi).toBeGreaterThan(STAGE_BOSS_HEALTH_BY_STAGE['stage-4']);
    expect(GATE_BOSS_HEALTH.uri).toBeGreaterThan(STAGE_BOSS_HEALTH_BY_STAGE['stage-5']);
    // ※旧: suriel(stage-6のゲート2ボス)を STAGE_BOSS_HEALTH_BY_STAGE['stage-7'] と比べていたが、
    //   この行は research/STAGE_DIFFICULTY.md でラスボス(グレン)専用の2倍値(12000)になったため、
    //   「城ボスより上」の比較対象としては使えない(stage-6に城ボスは居ない)。比較を外し、
    //   ゲート2の登場順の単調増加は上の toEqual が引き続き守る。
  });

  it('raises hidden bosses from stage 1 through stage 5', () => {
    const types = ['mimir', 'idol', 'jormungand', 'skadi', 'thor'] as const;
    expect(types.map(type => HIDDEN_BOSS_HEALTH[type])).toEqual([14000, 16000, 18000, 20000, 22000]);
    expect(types.map(type => spawnEnemyAt(type, 0, 0, 0).maxHealth)).toEqual([14000, 16000, 18000, 20000, 22000]);
  });
});
