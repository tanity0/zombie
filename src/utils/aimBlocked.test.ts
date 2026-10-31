// オート射撃は壁や遮蔽物の向こうの敵を狙わない(社長「推薦で」2026-10-25)。
// 狙いの選び方(enemyUtils.pickNearestTarget の isBlocked 版)と、線分と壁の判定(world/obstacles.segmentBlocked)の組み合わせを固定する。
import { describe, it, expect } from 'vitest';
import { pickNearestTarget, spawnEnemyAt } from './enemyUtils';
import { segmentBlocked, type Rect } from '../world/obstacles';
import type { Enemy } from '../types/game';

const at = (id: string, cx: number, cy: number, over: Partial<Enemy> = {}): Enemy => {
  const e = { ...spawnEnemyAt('zombie', 0, 0, 0), id, ...over };
  e.x = cx - e.width / 2; e.y = cy - e.height / 2;
  return e;
};
const blockedBy = (walls: Rect[]) => (e: Enemy) => segmentBlocked(0, 0, e.x + e.width / 2, e.y + e.height / 2, walls);

describe('オート射撃の狙い: 遮られている敵は飛ばす', () => {
  const wall: Rect = { x: 80, y: -40, width: 20, height: 80 }; // 右の近い所に縦の壁
  const near = at('near', 150, 0);   // 壁の向こう(近い)
  const far = at('far', -300, 0);    // 遮られていない(遠い)
  it('一番近い敵が壁の向こうなら、遮られていない次に近い敵を狙う', () => {
    expect(pickNearestTarget(0, 0, [near, far], 0)?.id).toBe('near'); // 従来(壁を見ない)
    expect(pickNearestTarget(0, 0, [near, far], 0, Infinity, blockedBy([wall]))?.id).toBe('far');
  });
  it('全員遮られていれば狙わない(=撃たない)', () => {
    expect(pickNearestTarget(0, 0, [near], 0, Infinity, blockedBy([wall]))).toBeNull();
  });
  it('壁が無ければ従来の選び方と同じ', () => {
    expect(pickNearestTarget(0, 0, [near, far], 0, Infinity, blockedBy([]))?.id).toBe('near');
  });
  it('スタン中は最終手段のまま(遮られていない通常の敵を先に選ぶ)', () => {
    const stunnedNear = at('sn', 0, 60, { stunUntil: 1000 });
    expect(pickNearestTarget(0, 0, [stunnedNear, far], 0, Infinity, blockedBy([wall]))?.id).toBe('far');
    expect(pickNearestTarget(0, 0, [stunnedNear, near], 0, Infinity, blockedBy([wall]))?.id).toBe('sn');
  });
  it('射程(maxDist2)の外は選ばない', () => {
    expect(pickNearestTarget(0, 0, [far], 0, 100 * 100, blockedBy([wall]))).toBeNull();
  });
});
