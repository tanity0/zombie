// マークスマンのトラップの捕獲判定(社長裁定v0.25.2326「a」=体が円に触れたら掛かる)。
// 「見た目の円と挙動が一致する」ことを不変条件として固定する。
import { describe, it, expect } from 'vitest';
import { selectTrapTargets, trapReachesEnemy, trapEdgeDistance } from './marksmanTrap';
import type { Enemy, EnemyType } from '../types/game';

// 幅=高さの正方形。x,y は左上なので、中心を指定して作る。
const at = (id: string, cx: number, cy: number, w = 30, over: Partial<Enemy> = {}): Enemy =>
  ({ id, x: cx - w / 2, y: cy - w / 2, width: w, height: w, type: 'zombie' as EnemyType, ...over } as unknown as Enemy);

const R = 50; // Lv1 の半径(MARKSMAN_TRAP_RADIUS_BY_LEVEL[1])

describe('trapReachesEnemy(体が円に触れたら掛かる)', () => {
  it('中心が円の外でも、体が触れていれば掛かる(旧実装で漏れていたケース)', () => {
    // 幅30の敵の中心が 60px(半径50の外)。縁は 60-15=45 で円の内側。
    expect(trapReachesEnemy(0, 0, R, at('a', 60, 0))).toBe(true);
  });

  it('体が完全に外なら掛からない', () => {
    // 中心 70、縁は 70-15=55 で半径50の外。
    expect(trapReachesEnemy(0, 0, R, at('a', 70, 0))).toBe(false);
  });

  it('縁がちょうど円周上なら掛かる(境界は含む)', () => {
    expect(trapReachesEnemy(0, 0, R, at('a', R + 15, 0))).toBe(true);
  });

  it('大型ほど旧実装との差が大きい(ジャイアントバット幅60=半幅30ぶん得をする)', () => {
    const giant = at('g', 75, 0, 60);
    expect(trapEdgeDistance(0, 0, giant)).toBeCloseTo(45, 6); // 75-30
    expect(trapReachesEnemy(0, 0, R, giant)).toBe(true);      // 新: 掛かる
    expect(Math.hypot(75, 0) <= R).toBe(false);               // 旧(中心判定): 掛からなかった
  });
});

describe('selectTrapTargets', () => {
  const NONE = new Set<string>();

  it('円外は選ばない', () => {
    const got = selectTrapTargets([at('far', 300, 0)], 0, 0, R, 3, NONE);
    expect(got).toEqual([]);
  });

  it('残り枠ぶんだけ、体の縁が近い順に取る', () => {
    const near = at('near', 20, 0);
    const mid = at('mid', 45, 0);
    const far = at('far', 62, 0);
    const got = selectTrapTargets([far, mid, near], 0, 0, R, 2, NONE);
    expect(got.map(e => e.id)).toEqual(['near', 'mid']);
  });

  it('捕獲済みは除く', () => {
    const got = selectTrapTargets([at('a', 20, 0), at('b', 25, 0)], 0, 0, R, 3, new Set(['a']));
    expect(got.map(e => e.id)).toEqual(['b']);
  });

  it('残り枠0なら何も取らない', () => {
    expect(selectTrapTargets([at('a', 0, 0)], 0, 0, R, 0, NONE)).toEqual([]);
  });

  it('不倒の通常リーパーは対象外・深奥チェイサーは対象', () => {
    const plain = at('r1', 10, 0, 30, { type: 'reaper' as EnemyType });
    const chaser = at('r2', 12, 0, 30, { type: 'reaper' as EnemyType, reaperChaser: true });
    const got = selectTrapTargets([plain, chaser], 0, 0, R, 5, NONE);
    expect(got.map(e => e.id)).toEqual(['r2']);
  });

  it('レベルごとの枠(1/2/3体)を超えて取らない', () => {
    const mob = [at('a', 10, 0), at('b', 12, 0), at('c', 14, 0), at('d', 16, 0)];
    for (const cap of [1, 2, 3]) {
      expect(selectTrapTargets(mob, 0, 0, R, cap, NONE)).toHaveLength(cap);
    }
  });
});
