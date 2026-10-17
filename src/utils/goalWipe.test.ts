import { describe, it, expect } from 'vitest';
import { planGoalWipe, GOAL_WIPE_RADIUS } from './goalWipe';
import { isBossType } from './enemyUtils';
import type { EnemyType } from '../types/game';

const foe = (id: string, type: EnemyType, x: number, y: number, extra: { health?: number; questTarget?: boolean } = {}) =>
  ({ id, type, x: x - 20, y: y - 20, width: 40, height: 40, health: extra.health ?? 10, questTarget: extra.questTarget });
const none = () => false;

describe('ゴールの一掃(THEONE_ROUND2 §7・社長「爆弾で雑魚一掃。効かない敵はノックバックで遠くへ」)', () => {
  it('雑魚は倒し、強個体・ボス級は外向きに吹き飛ばす', () => {
    const p = planGoalWipe([foe('z', 'zombie', 100, 0), foe('pk', 'pumpkin', 200, 0), foe('t', 'thor', 0, -300)], 0, 0, isBossType, none);
    expect(p.kill).toEqual(['z']);
    expect(p.push.map(q => q.id)).toEqual(['pk', 't']);
    expect(p.push[0].vx).toBeGreaterThan(0);   // 右に居る=右へ
    expect(p.push[1].vy).toBeLessThan(0);      // 上に居る=上へ
  });

  it('遠くの敵・倒れている敵・触れない敵・クエストの討伐対象は倒さない', () => {
    const p = planGoalWipe([
      foe('far', 'zombie', GOAL_WIPE_RADIUS + 50, 0),
      foe('dead', 'zombie', 10, 0, { health: 0 }),
      foe('ghost', 'zombie', 20, 0),
      foe('quest', 'zombie', 30, 0, { questTarget: true }),
    ], 0, 0, isBossType, e => e.id === 'ghost');
    expect(p.kill).toEqual([]);
    expect(p.push.map(q => q.id)).toEqual(['quest']); // 討伐対象は倒さず吹き飛ばすだけ
  });

  it('真上に重なっていても向きが決まる(その場に留まらない)', () => {
    const p = planGoalWipe([foe('t', 'thor', 0, 0)], 0, 0, isBossType, none);
    expect(Math.hypot(p.push[0].vx, p.push[0].vy)).toBeGreaterThan(0);
  });

  it('波の届いた所までだけ・一度当たった敵は二度当てない・近いほど強く飛ぶ', () => {
    const list = [foe('a', 'zombie', 100, 0), foe('b', 'zombie', 500, 0), foe('n', 'pumpkin', 100, 0), foe('f', 'pumpkin', 800, 0)];
    const p1 = planGoalWipe(list, 0, 0, isBossType, none, 300);
    expect(p1.kill).toEqual(['a']);
    const p2 = planGoalWipe(list, 0, 0, isBossType, none, 900, new Set(['a', 'n']));
    expect(p2.kill).toEqual(['b']);
    const all = planGoalWipe(list, 0, 0, isBossType, none);
    const near = all.push.find(q => q.id === 'n')!, far = all.push.find(q => q.id === 'f')!;
    expect(near.vx).toBeGreaterThan(far.vx);
  });
});
