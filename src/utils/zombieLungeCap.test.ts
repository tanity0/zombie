import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { ZOMBIE_LUNGE_MAX_MS, ZOMBIE_LUNGE_RANGE_PX } from './chaffMoves';

/**
 * ★踏み込みの上限時間(社長指摘2026-09-17「台本の中で詰め寄ってくる時間に上限ある？なければ設けて」)。
 * 無かったので設けた。**上限が消えると、下がり続けるプレイヤーを18秒追い回し、その間ずっと枠を占有する。**
 */
const ORIGIN = 1400;

const setup = (gt: number, distPx: number) => {
  useGameStore.setState(s => ({
    player: { ...s.player, x: ORIGIN, y: ORIGIN },
    enemies: [{
      id: 'z1', type: 'zombie', x: ORIGIN + distPx, y: ORIGIN, width: 36, height: 36,
      health: 200, maxHealth: 200, speed: 42, damage: 10, lastHit: 0,
      aiPhase: 'z-lunge-in', chaffMove: 'zombie-double', chaffMoveAt: gt,
      biteAt: 0,
    }] as never,
  }));
};

describe('ゾンビの踏み込みには上限時間がある', () => {
  beforeEach(() => { useGameStore.getState().resetGame('assault'); });

  it('★上限は紫の追尾と同じ桁で、踏み込みの尺として現実的', () => {
    expect(ZOMBIE_LUNGE_MAX_MS).toBeGreaterThan(800);
    expect(ZOMBIE_LUNGE_MAX_MS).toBeLessThanOrEqual(3000);
  });

  it('★★上限を過ぎたら、届いていなくても噛む(=空振りする)', () => {
    const gt = 9000;
    setup(gt, 400);                       // 射程(75px)よりはるかに遠い
    useGameStore.getState().setGameTime(gt + ZOMBIE_LUNGE_MAX_MS + 1);
    useGameStore.getState().updateEnemies(1 / 60);
    const e = useGameStore.getState().enemies[0];
    expect(e.aiPhase).toBe('z-bite1');     // 技は前へ進む(止まらない)
    expect(e.biteAt).toBeGreaterThan(0);
  });

  it('上限内で、まだ遠いなら踏み込みを続ける(途中で諦めない)', () => {
    const gt = 9000;
    setup(gt, 400);
    useGameStore.getState().setGameTime(gt + 100);
    useGameStore.getState().updateEnemies(1 / 60);
    expect(useGameStore.getState().enemies[0].aiPhase).toBe('z-lunge-in');
  });

  it('射程に入ったら上限を待たずに噛む(従来どおり)', () => {
    const gt = 9000;
    setup(gt, ZOMBIE_LUNGE_RANGE_PX - 20);
    useGameStore.getState().setGameTime(gt + 100);
    useGameStore.getState().updateEnemies(1 / 60);
    expect(useGameStore.getState().enemies[0].aiPhase).toBe('z-bite1');
  });
});
