// グラビティショットの渦(tickGravityWells)の回帰テスト。
// ★v0.25.4074の実バグ固定(社長報告2026-08-29「引き寄せてる感じがしない。ほんと？」):
// 渦の吸引は knockbackVx/Vy+knockbackUntil で書くが、knockbackUntil の消費側(updateEnemies)は
// **Date.now 基準**。gameTime(数十万ms)で書くと常に期限切れ=吸引が一度も効かない。
// 「どちらの時計で書くか」をここで機械化する(ENGINEERING_NOTES「gameTimeと実時間を混ぜない」の実例)。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';

const zombieAt = (x: number, y: number) => ({
  id: 'gw-e1', type: 'zombie', x, y, width: 20, height: 20,
  health: 30, maxHealth: 30, speed: 10, damage: 1, experienceValue: 1,
} as never);

describe('tickGravityWells(グラビティショットの吸引)', () => {
  beforeEach(() => {
    useGameStore.setState({
      gameTime: 10_000,
      gravityWells: [{ id: 'gw1', x: 100, y: 100, radius: 140, createdAt: 9_900 } as never],
      enemies: [zombieAt(160, 90)], // 中心(170,100)は渦から70px=半径内
    });
  });

  it('半径内の通常敵に、渦へ向かう速度と【Date.now基準の】期限が書かれる', () => {
    const t0 = Date.now();
    useGameStore.getState().tickGravityWells();
    const e = useGameStore.getState().enemies[0] as unknown as {
      knockbackVx?: number; knockbackVy?: number; knockbackUntil?: number;
    };
    // 渦(100,100)は敵中心(170,100)の左=Vxは負(引き寄せ)、Vyはほぼ0。
    expect(e.knockbackVx ?? 0).toBeLessThan(0);
    expect(Math.abs(e.knockbackVy ?? 0)).toBeLessThan(1);
    // ★期限は実時間(Date.now)の未来。gameTime基準(≈10秒)で書くと消費側で常に期限切れ=吸引ゼロ。
    expect(e.knockbackUntil ?? 0).toBeGreaterThan(t0);
  });

  it('半径外の敵には書かない', () => {
    useGameStore.setState({ enemies: [zombieAt(400, 400)] });
    useGameStore.getState().tickGravityWells();
    const e = useGameStore.getState().enemies[0] as unknown as { knockbackUntil?: number };
    expect(e.knockbackUntil ?? 0).toBe(0);
  });

  it('渦は寿命(既定400ms)を過ぎると消える', () => {
    useGameStore.setState({ gameTime: 9_900 + 401 });
    useGameStore.getState().tickGravityWells();
    expect(useGameStore.getState().gravityWells.length).toBe(0);
  });
});
