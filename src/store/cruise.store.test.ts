import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, playerCruiseStage, playerCruiseTotalMs } from './gameStore';

// ★B3 巡航+B11(research/THEONE_ROUND2.md §4b)の配線: 被弾で段0 / 撃っても戻らない / 段1以上で装備段階×4%軽く / 強制移動中は保持。
const right = { up: false, down: false, left: false, right: true };

describe('B3 巡航の配線(movePlayer / damagePlayer)', () => {
  beforeEach(() => { useGameStore.getState().resetGame('warrior'); useGameStore.setState(s => ({ player: { ...s.player, invulnerable: false, invulnerableTime: 0 } })); });

  it('素の足: 同じ向きに走り続けると 1秒ごとに段が上がる', () => {
    const T = playerCruiseTotalMs(useGameStore.getState().player);
    expect(T).toBeCloseTo(3000);
    for (let i = 0; i < 66; i++) useGameStore.getState().movePlayer(right, 1 / 60); // 1.1秒
    expect(playerCruiseStage(useGameStore.getState().player)).toBe(1);
    for (let i = 0; i < 60; i++) useGameStore.getState().movePlayer(right, 1 / 60);
    expect(playerCruiseStage(useGameStore.getState().player)).toBe(2);
  });

  it('被弾(吹き飛びの付く当たり)で段0へ戻る', () => {
    useGameStore.setState(s => ({ player: { ...s.player, speedRampSustainMs: 2500 } }));
    expect(playerCruiseStage(useGameStore.getState().player)).toBe(2);
    const p = useGameStore.getState().player;
    useGameStore.getState().damagePlayer(30, 'test', p.x + 100, p.y, undefined, undefined, undefined, 'zz');
    expect(useGameStore.getState().player.speedRampSustainMs).toBe(0);
  });

  it('B11: 段1以上なら機動系の装備段階5で被弾が2割軽い・段0なら変わらない', () => {
    const hit = (sustain: number) => {
      useGameStore.getState().resetGame('warrior');
      useGameStore.setState(s => ({ player: { ...s.player, invulnerable: false, invulnerableTime: 0, speedRampSustainMs: sustain, equipment: { body: 'body-mobility-5', arms: null, accessory: null } } }));
      const p = useGameStore.getState().player;
      const before = p.health;
      useGameStore.getState().damagePlayer(20, 'test', p.x + 100, p.y, undefined, undefined, undefined, 'zz');
      return before - useGameStore.getState().player.health;
    };
    expect(hit(0)).toBeCloseTo(20, 0);
    // 装備段階5: 間隔 1.0−0.5=0.5秒 → 総時間は 3秒より短い。段1の時刻を越えた所で当てる。
    expect(hit(5000)).toBeCloseTo(16, 0);
  });

  it('近接を振って動けない間は段が進まない(保持)', () => {
    useGameStore.setState(s => ({ player: { ...s.player, speedRampSustainMs: 500, meleeSwingAt: Date.now() } }));
    for (let i = 0; i < 10; i++) useGameStore.getState().movePlayer(right, 1 / 60);
    expect(useGameStore.getState().player.speedRampSustainMs).toBe(500);
  });
});
