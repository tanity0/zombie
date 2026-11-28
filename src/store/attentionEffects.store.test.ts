// 撃破の寄り(アテンション)の間も粒は飛び続ける(社長承認 2026-11-28「寄りの間も粒は飛び続ける」)。
// useGameLoop のアテンションの早期 return は、時間停止の枝と同じく updateEffects を実時間(Date.now 差・上限 0.05秒)で回す。
// ここではその updateEffects が、アテンション中(=gameTime・敵・プレイヤーは止まったまま)でも
// ①粒を速度で動かし ②重力で落とし ③寿命切れを捨て ④シミュレーションの状態には触らないことを確かめる。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { VisualEffect } from '../types/game';

const T0 = 1_900_000_000_000;

const particle = (id: string, over: Partial<Extract<VisualEffect, { kind: 'particle' }>> = {}): VisualEffect => ({
  kind: 'particle', id, x: 100, y: 100, vx: 200, vy: -100, color: '#fff', size: 3,
  createdAt: T0, duration: 600, ...over,
});

describe('アテンション中の視覚エフェクト(実時間で進む)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    useGameStore.getState().resetGame('assault');
    useGameStore.setState({
      attention: { x: 0, y: 0, startReal: T0, fromCamX: 0, fromCamY: 0 },
      effects: [particle('spark'), particle('blood', { gravity: 900, vx: 0, vy: 0 }), particle('old', { createdAt: T0 - 5000 })],
    });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('粒は外へ飛び、重力で落ち、寿命で消える。gameTime・プレイヤー・敵は動かない', () => {
    const before = useGameStore.getState();
    const gt0 = before.gameTime, px0 = before.player.x, py0 = before.player.y, enemies0 = before.enemies;
    const frames: { x: number; y: number }[] = [];
    let bloodY = 100;
    for (let i = 0; i < 10; i++) {
      vi.setSystemTime(T0 + (i + 1) * 16);
      useGameStore.getState().updateEffects(0.016);
      const s = useGameStore.getState();
      const sp = s.effects.find(e => e.id === 'spark');
      if (sp && sp.kind === 'particle') frames.push({ x: sp.x, y: sp.y });
      const bl = s.effects.find(e => e.id === 'blood');
      if (bl && bl.kind === 'particle') { expect(bl.y).toBeGreaterThanOrEqual(bloodY); bloodY = bl.y; }
    }
    // ① 外へ飛ぶ(x が単調に増える)
    expect(frames.length).toBe(10);
    for (let i = 1; i < frames.length; i++) expect(frames[i].x).toBeGreaterThan(frames[i - 1].x);
    expect(frames[9].x - 100).toBeCloseTo(200 * 0.016 * 10, 5);
    // ② 重力で落ちる(止まっていた粒が下へ動いた)
    expect(bloodY).toBeGreaterThan(100);
    // ③ 寿命切れは最初の1回で捨てられている
    expect(useGameStore.getState().effects.some(e => e.id === 'old')).toBe(false);
    // ④ シミュレーションは凍結のまま
    const after = useGameStore.getState();
    expect(after.gameTime).toBe(gt0);
    expect(after.player.x).toBe(px0);
    expect(after.player.y).toBe(py0);
    expect(after.enemies).toBe(enemies0);
    expect(after.attention).not.toBeNull();

    // 寿命(600ms)を過ぎたら、動いていた粒も消える
    vi.setSystemTime(T0 + 700);
    useGameStore.getState().updateEffects(0.016);
    expect(useGameStore.getState().effects.some(e => e.id === 'spark' || e.id === 'blood')).toBe(false);
  });
});
