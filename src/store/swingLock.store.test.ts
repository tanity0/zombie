// 社長指示2026-10-12「武器振ってる時は方向転換や移動はできなくして」。
// プレイヤー: 振り全体(PLAYER_MELEE_SWING_MS)の間は移動入力を無視し、向き(lastDirection)も変えない。振りの踏み込み(lunge)は残る。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, PLAYER_MELEE_SWING_MS, COUNTER_WINDOW } from './gameStore';
import { MELEE_RECOVER_MS } from '../utils/meleeRecover';
import { MELEE_AFTER_STOP_RAMP_MS } from '../utils/meleeAfterMove';
import { setTreesDisabled } from '../world/trees';
import { setTorchesDisabled } from '../world/torches';

const RIGHT = { up: false, down: false, left: false, right: true } as never;
const LEFT = { up: false, down: false, left: true, right: false } as never;

beforeEach(() => {
  useGameStore.getState().resetGame('warrior');
  setTreesDisabled(true); setTorchesDisabled(true);
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
  it('振り終わった後(PLAYER_MELEE_SWING_MS 経過)は動けて向きも変わる(ナイフ以外=鞭)', () => {
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: ['whip'], meleeSwingAt: Date.now() - PLAYER_MELEE_SWING_MS - 5 } }));
    const x0 = useGameStore.getState().player.x;
    for (let i = 0; i < 10; i++) useGameStore.getState().movePlayer(LEFT, 0.016);
    const p = useGameStore.getState().player;
    expect(p.x).toBeLessThan(x0 - 2); // 振り終わった直後は振った後の硬直(足が重い)で遅いが、動ける(v0.25.4998〜 隙間なしで硬直へ)
    expect(p.lastDirection!.x).toBeLessThan(0);
  });
  it('ナイフ: 振り終わった後の硬直の間は完全に止まり、硬直が明けて立ち上がった後は動ける(社長指示2026-11-26)', () => {
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: Date.now() - PLAYER_MELEE_SWING_MS - 5 } }));
    const x0 = useGameStore.getState().player.x;
    for (let i = 0; i < 10; i++) useGameStore.getState().movePlayer(LEFT, 0.016);
    expect(Math.abs(useGameStore.getState().player.x - x0)).toBeLessThan(0.5);
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: Date.now() - (COUNTER_WINDOW + MELEE_RECOVER_MS + MELEE_AFTER_STOP_RAMP_MS + 5) } }));
    const x1 = useGameStore.getState().player.x;
    for (let i = 0; i < 10; i++) useGameStore.getState().movePlayer(LEFT, 0.016);
    expect(useGameStore.getState().player.x).toBeLessThan(x1 - 2);
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
    // ナイフは振りの後の硬直(止まり)の間も向きを変えない(社長指示2026-11-27)=止まりが明けた後で確かめる。
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: Date.now() - (COUNTER_WINDOW + MELEE_RECOVER_MS + MELEE_AFTER_STOP_RAMP_MS + 5) } }));
    useGameStore.getState().setLastDirection({ x: -1, y: 0 });
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: -1, y: 0 });
  });
});

// 社長指示2026-11-27「攻撃後に止まってる時に振り返れちゃうのは変だ」: 振りの後で体が止まっている間は、入力で向きが変わらない(utils/facingLock)。
describe('攻撃の後で止まっている間は振り返らない', () => {
  it('ナイフ: 振りの後の硬直(止まり)の間は左へ入れても向きは右のまま・明けて動き出したら左を向く', () => {
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: Date.now() - PLAYER_MELEE_SWING_MS - 5 } }));
    useGameStore.getState().setLastDirection({ x: -1, y: 0 }); // スティック/キーの向き書き
    for (let i = 0; i < 5; i++) useGameStore.getState().movePlayer(LEFT, 0.016);
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: 1, y: 0 });
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: Date.now() - (COUNTER_WINDOW + MELEE_RECOVER_MS + MELEE_AFTER_STOP_RAMP_MS + 5) } }));
    useGameStore.getState().setLastDirection({ x: -1, y: 0 });
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: -1, y: 0 });
    useGameStore.setState(s => ({ player: { ...s.player, lastDirection: { x: 1, y: 0 } } }));
    for (let i = 0; i < 5; i++) useGameStore.getState().movePlayer(LEFT, 0.016);
    expect(useGameStore.getState().player.lastDirection!.x).toBeLessThan(0);
  });
  it('ナイフ3段目: 後の隙の間は振り返らない', () => {
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: 0, knifeComboStage: 3, knifeComboAt: Date.now() - PLAYER_MELEE_SWING_MS - 100 } }));
    useGameStore.getState().setLastDirection({ x: -1, y: 0 });
    for (let i = 0; i < 5; i++) useGameStore.getState().movePlayer(LEFT, 0.016);
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: 1, y: 0 });
  });
  it('刀の着地の硬直の間は振り返らない・明けたら向く', () => {
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: ['katana'], meleeSwingAt: 0, katanaDashUntil: 0, katanaRecoveryUntil: Date.now() + 500 } }));
    useGameStore.getState().setLastDirection({ x: -1, y: 0 });
    for (let i = 0; i < 5; i++) useGameStore.getState().movePlayer(LEFT, 0.016);
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: 1, y: 0 });
    useGameStore.setState(s => ({ player: { ...s.player, katanaRecoveryUntil: 0 } }));
    useGameStore.getState().setLastDirection({ x: -1, y: 0 });
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: -1, y: 0 });
  });
  it('鞭の1段目の後(重いが動ける)は今どおり振り返れる', () => {
    useGameStore.setState(s => ({ player: { ...s.player, subWeapons: ['whip'], meleeSwingAt: Date.now() - PLAYER_MELEE_SWING_MS - 5, whipComboStage: 1, whipComboAt: Date.now() - PLAYER_MELEE_SWING_MS - 5 } }));
    useGameStore.getState().setLastDirection({ x: -1, y: 0 });
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: -1, y: 0 });
  });
});

// 社長裁定2026-11-27「止まり中に入れた向きを覚えて、次の段の振り始めでその向きへ振る」(utils/facingLock)。
describe('止まり中に入れた向きへ次の段を振る', () => {
  it('ナイフ1段目を右へ振った止まり中に左を入れる→止まり中は右のまま→2段目は左へ振る', () => {
    const now = Date.now();
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: now - 400, knifeComboStage: 1, knifeComboAt: now - 400, counterCooldownEnd: now - 1, pendingSwingAt: 0, heldFacingDir: undefined, aimX: 0.8, aimY: 0 } }));
    useGameStore.getState().setLastDirection({ x: -1, y: 0 });
    useGameStore.getState().movePlayer(LEFT, 0.016);
    expect(useGameStore.getState().player.lastDirection).toEqual({ x: 1, y: 0 });
    expect(useGameStore.getState().beginMeleeSwing()).toBe(true);
    const p = useGameStore.getState().player;
    expect(p.knifeComboStage).toBe(2);
    expect(p.lastDirection).toEqual({ x: -1, y: 0 });
    expect(p.heldFacingDir).toBeUndefined();
    expect(p.lungeVx).toBeLessThan(0); // 踏み込みも左へ
    expect(p.aimX).toBeLessThan(-0.5); // 照準(手元の弧の向き)も左へ
  });
  it('止まりが明けたら覚えた向きは捨てる(明けた後の振りは今の向き)', () => {
    const now = Date.now();
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: now - 400, knifeComboStage: 1, knifeComboAt: now - 400 } }));
    useGameStore.getState().setLastDirection({ x: -1, y: 0 });
    expect(useGameStore.getState().player.heldFacingDir).toEqual({ x: -1, y: 0 });
    useGameStore.setState(s => ({ player: { ...s.player, meleeSwingAt: now - 2000, knifeComboAt: now - 2000, counterCooldownEnd: 0, pendingSwingAt: 0 } }));
    useGameStore.getState().movePlayer(RIGHT, 0.016);
    expect(useGameStore.getState().player.heldFacingDir).toBeUndefined();
  });
});
