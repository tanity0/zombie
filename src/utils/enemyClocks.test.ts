import { describe, it, expect } from 'vitest';
import { isEnemyFrozenForClocks, isBossMidMove } from './enemyClocks';
import type { Enemy } from '../types/game';

// 社長報告2026-10-16「ミゲルが突進攻撃中に何かに引っかかってるみたいに突進モーションのまま小刻みに震えながら止まって、
// しばらくしたら再開して突進」(マークスマン・トラップLv1)。原因: 拘束(e)の凍結判定が `aiPhase` だけを見ていて、
// `bossState` で技を持つボスは突進中も凍結=台帳の aiStartedAt が据え置かれてツイーンが進まなかった。
const base = (over: Partial<Enemy>): Enemy => ({ id: 'e', type: 'miguel', x: 0, y: 0, width: 10, height: 10, health: 1, maxHealth: 1, speed: 1, damage: 1, ...over } as unknown as Enemy);

describe('isEnemyFrozenForClocks × 拘束(root)とボスの技', () => {
  it('ミゲルが突進中(bossState=mdash-move)に拘束されても時計は凍らない(技は完走する)', () => {
    const e = base({ bossState: 'mdash-move', rootUntil: 5000 });
    expect(isBossMidMove(e)).toBe(true);
    expect(isEnemyFrozenForClocks(e, 1000, 1000)).toBe(false);
  });
  it('平常時(chase)の拘束は従来どおり凍る', () => {
    const e = base({ bossState: 'chase', rootUntil: 5000 });
    expect(isEnemyFrozenForClocks(e, 1000, 1000)).toBe(true);
  });
  it('技後の硬直相(-recover)は拘束に関係なく凍る(a)', () => {
    const e = base({ bossState: 'mdash-recover', bossStateUntil: 2000, rootUntil: 5000 });
    expect(isBossMidMove(e)).toBe(false);
    expect(isEnemyFrozenForClocks(e, 1000, 1000)).toBe(true);
  });
  it('雑魚の拘束は aiPhase 無しなら凍る・技中(aiPhase あり)なら凍らない(従来どおり)', () => {
    expect(isEnemyFrozenForClocks(base({ type: 'zombie', rootUntil: 5000 }), 1000, 1000)).toBe(true);
    expect(isEnemyFrozenForClocks(base({ type: 'zombie', rootUntil: 5000, aiPhase: 'windup' }), 1000, 1000)).toBe(false);
  });
  it('拘束が明けていれば凍らない', () => {
    expect(isEnemyFrozenForClocks(base({ bossState: 'chase', rootUntil: 500 }), 1000, 1000)).toBe(false);
  });
});
