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

// 社長指摘2026-10-12「チュートリアルステージだけ？なぜか真円の弧が出ない」: 近接を教わる前(m0Unlocked.melee=false)は
// 振りの絵だけ出て判定も輪も出ない「空の振り」になっていた。教わる前は振り自体を始めない。
describe('訓練で近接を教わる前は振らない', () => {
  it('封印中は beginMeleeSwing が何もしない(振りの起点も前隙も打たない)・解禁後は振れる', () => {
    useGameStore.setState(s => ({ m0Unlocked: { ...s.m0Unlocked, melee: false }, player: { ...s.player, meleeSwingAt: 0, pendingSwingAt: 0, counterCooldownEnd: 0 } }));
    expect(useGameStore.getState().beginMeleeSwing()).toBe(false);
    expect(useGameStore.getState().player.meleeSwingAt).toBe(0);
    expect(useGameStore.getState().player.pendingSwingAt).toBe(0);
    useGameStore.setState(s => ({ m0Unlocked: { ...s.m0Unlocked, melee: true } }));
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    expect(useGameStore.getState().player.meleeSwingAt).toBeGreaterThan(0);
  });
});

// 社長指摘2026-10-12「まだナイフ振ってる時でも振り向けちゃう」: 入力側(スティック/十字/キー/マウス)が向きを直接書く入口(setLastDirection)も止める。
describe('振っている間は入力から向きを書き換えられない', () => {
  it('振っている最中の setLastDirection は無視・振り終わりは効く', () => {
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: Date.now(), lastDirection: { x: 1, y: 0 } } }));
    useGameStore.getState().setLastDirection({ x: -1, y: 0 });
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: 1, y: 0 });
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: Date.now() - PLAYER_MELEE_SWING_MS - 5 } }));
    useGameStore.getState().setLastDirection({ x: -1, y: 0 });
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: -1, y: 0 });
  });
});
