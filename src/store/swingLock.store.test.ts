// 社長指示2026-10-12「武器振ってる時は方向転換や移動はできなくして」。
// プレイヤー: 振り全体(PLAYER_MELEE_SWING_MS)の間は移動入力を無視し、向き(lastDirection)も変えない。振りの踏み込み(lunge)は残る。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, PLAYER_MELEE_SWING_MS } from './gameStore';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const RIGHT = { up: false, down: false, left: false, right: true } as never;
const LEFT = { up: false, down: false, left: true, right: false } as never;

beforeEach(() => {
  setTreesDisabled(true); setTorchesDisabled(true);
  useGameStore.getState().resetGame('warrior');
  useGameStore.setState(s => ({ player: { ...s.player, vx: 0, vy: 0, lastDirection: { x: 1, y: 0 }, lungeUntil: 0, knockbackUntil: undefined } }));
});

describe('武器を振っている間は動けない・向きが変わらない', () => {
  it('振っている最中は左へ入れても動かず、向きは右のまま', () => {
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: Date.now() } }));
    const x0 = useGameStore.getState().player.x;
    for (let i = 0; i < 10; i++) useGameStore.getState().movePlayer(LEFT, 0.016);
    const p = useGameStore.getState().player;
    expect(Math.abs(p.x - x0)).toBeLessThan(0.5);
    expect(p.lastDirection?.x).toBe(1);
  });
  it('振り終わった後(PLAYER_MELEE_SWING_MS 経過)は普通に動けて向きも変わる', () => {
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: Date.now() - PLAYER_MELEE_SWING_MS - 5 } }));
    const x0 = useGameStore.getState().player.x;
    for (let i = 0; i < 10; i++) useGameStore.getState().movePlayer(LEFT, 0.016);
    const p = useGameStore.getState().player;
    expect(p.x).toBeLessThan(x0 - 5);
    expect(p.lastDirection!.x).toBeLessThan(0);
  });
  it('振りの踏み込み(lunge)は止めない', () => {
    const now = Date.now();
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: now, lungeVx: 300, lungeVy: 0, lungeUntil: now + 200, lungeMs: 200 } }));
    const x0 = useGameStore.getState().player.x;
    useGameStore.getState().movePlayer(RIGHT, 0.016);
    expect(useGameStore.getState().player.x).toBeGreaterThan(x0 + 1);
  });
});
