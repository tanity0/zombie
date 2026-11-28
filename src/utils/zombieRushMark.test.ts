// research/TELEGRAPH_FIXES.md N05: ゾンビの zrush の体当たり ⇔ 紫の印(順12のテスト)。
import { describe, it, expect } from 'vitest';
import { zombieRushMarkPhase, ZOMBIE_PAUSE_MS_MIRROR, ZOMBIE_RUSH_MARK_ERASE_MS } from './zombieRushMark';
import { isBodySlamNow, ZOMBIE_RUSH_BODY_SLAM_MS, ZOMBIE_RUSH_MS_MIRROR } from './enemyBite';
import { ZOMBIE_PAUSE_MS, ZOMBIE_RUSH_MS } from '../store/gameStore';

type ZE = Parameters<typeof isBodySlamNow>[0];
const Z = (o: Record<string, unknown>): ZE => ({ type: 'zombie', bossState: undefined, biteAt: undefined, ...o }) as unknown as ZE;

const drawn = (ph: { prog: number; erase: number } | null) => ph !== null && ph.prog - ph.erase > 0.001;

describe('N05 ゾンビの紫の追尾の印', () => {
  it('複製した尺は gameStore の値と同じ', () => {
    expect(ZOMBIE_PAUSE_MS_MIRROR).toBe(ZOMBIE_PAUSE_MS);
    expect(ZOMBIE_RUSH_MS_MIRROR).toBe(ZOMBIE_RUSH_MS);
  });
  it('zpause の頭で出る(prog=0)・停止の間は描きが進む', () => {
    const start = 5000;
    const e = Z({ aiPhase: 'zpause', aiPhaseUntil: start + ZOMBIE_PAUSE_MS_MIRROR });
    expect(zombieRushMarkPhase(e, start)).toEqual({ prog: 0, erase: 0 });
    expect(zombieRushMarkPhase(e, start + 300)!.prog).toBeGreaterThan(0);
  });
  it('zrush の全区間で「体当たりが生きている ⇔ 印が描かれている」・1600ms で er=1', () => {
    const start = 10000;
    const e = Z({ aiPhase: 'zrush', aiPhaseUntil: start + ZOMBIE_RUSH_MS_MIRROR });
    for (let t = start; t < start + ZOMBIE_RUSH_MS_MIRROR; t += 1000 / 120) {
      expect(drawn(zombieRushMarkPhase(e, t)), `t=${t - start}`).toBe(isBodySlamNow(e, t));
    }
    // 消し切る時刻=体当たりが切れる時刻(=1600ms)。直前は er<1、ERASE より前は er=0。
    expect(zombieRushMarkPhase(e, start + ZOMBIE_RUSH_BODY_SLAM_MS - ZOMBIE_RUSH_MARK_ERASE_MS)!.erase).toBe(0);
    expect(zombieRushMarkPhase(e, start + ZOMBIE_RUSH_BODY_SLAM_MS - 0.001)!.erase).toBeCloseTo(1, 4);
    expect(zombieRushMarkPhase(e, start + ZOMBIE_RUSH_BODY_SLAM_MS)).toBeNull();
  });
  it('biteAt が立つ(噛みの割り込み)と、体当たりと一緒に印も消える', () => {
    const start = 10000;
    for (const t of [start + 100, start + 800, start + 1500]) {
      const e = Z({ aiPhase: 'zrush', aiPhaseUntil: start + ZOMBIE_RUSH_MS_MIRROR, biteAt: t - 10 });
      expect(isBodySlamNow(e, t)).toBe(false);
      expect(zombieRushMarkPhase(e, t)).toBeNull();
    }
  });
  it('ゾンビ以外・ほかの相では出ない', () => {
    expect(zombieRushMarkPhase(Z({ type: 'skeleton', aiPhase: 'zrush', aiPhaseUntil: 2000 }), 100)).toBeNull();
    expect(zombieRushMarkPhase(Z({ aiPhase: 'z-wait', aiPhaseUntil: 2000 }), 100)).toBeNull();
  });
});
