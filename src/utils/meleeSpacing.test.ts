import { describe, it, expect } from 'vitest';
import {
  createMeleeSpacingState, stepMeleeSpacing, foldMeleeSpacing,
  PRE_SWING_WINDOW_MS, SWING_LEAVE_WINDOW_MS,
} from './meleeSpacing';

// ★近接の「間合いの癖」の計測(SAME_ARENA §8)。社長が挙げた5つの癖が、
// **距離と時間だけ**で正しく分類されることを固定する。
// 掟: 連続量(時間・距離)は抽選を通さない=ここで出す値がそのまま消費側のスカラーになる。
const enemy = (id: string, x: number, y = 0) => ({ id, x, y, width: 0, height: 0 });

/** 1tick進める小道具(射程74px=ナイフ相当。プレイヤーは原点に居る想定)。 */
const tick = (
  st: ReturnType<typeof createMeleeSpacingState>,
  gameTime: number,
  enemies: ReturnType<typeof enemy>[],
  swungThisTick = false,
  pcx = 0, pcy = 0,
) => stepMeleeSpacing(st, { enemies, pcx, pcy, reachPx: 74, gameTime, swungThisTick });

describe('接敵イベントの分類(社長の5つの癖)', () => {
  it('①進入してから振るまでの遅れを測る(連続量・抽選なし)', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, []);                       // 誰も居ない
    tick(st, 100, [enemy('z', 50)]);       // 進入
    tick(st, 350, [enemy('z', 50)], true); // 250ms後に振った
    tick(st, 1100, [enemy('z', 50)]);      // 留まったまま窓を過ぎる→決着
    const p = foldMeleeSpacing(st, 1100);
    expect(p.n).toBe(1);
    expect(p.swingLagMs).toBe(250);
    expect(p.holdRate).toBe(0);
  });

  it('③進入の直前に振っていたら「先出し」', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [], true);                  // 何も居ないうちに振っておく
    tick(st, PRE_SWING_WINDOW_MS, [enemy('z', 50)]); // 窓ちょうどで進入
    tick(st, 2000, []);                     // 離れて決着
    expect(foldMeleeSpacing(st, 2000).preSwingRate).toBe(1);
  });

  it('③窓を過ぎていれば「先出し」ではない', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [], true);
    tick(st, PRE_SWING_WINDOW_MS + 1, [enemy('z', 50)]);
    tick(st, 2000, []);
    expect(foldMeleeSpacing(st, 2000).preSwingRate).toBe(0);
  });

  it('④振った直後に射程外へ出たら「振り逃げ」+下がった距離を測る', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);              // 進入
    tick(st, 100, [enemy('z', 50)], true);      // 振る
    tick(st, 300, [enemy('z', 50)], false, -40); // プレイヤーが40px下がって射程外へ
    const p = foldMeleeSpacing(st, 300);
    expect(p.swingLeaveRate).toBe(1);
    expect(p.backStepPx).toBeCloseTo(40);
  });

  it('④振っても留まっていれば「振り逃げ」ではない', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);
    tick(st, 100, [enemy('z', 50)], true);
    tick(st, 100 + SWING_LEAVE_WINDOW_MS + 1, [enemy('z', 50)]);
    const p = foldMeleeSpacing(st, 2000);
    expect(p.swingLeaveRate).toBe(0);
    expect(p.n).toBe(1);
  });

  it('②一度も振らずに終えたら「待ち」。境界を跨いだ回数も数える', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);   // 進入(1回目の跨ぎ)
    tick(st, 500, []);               // 退出(2回目の跨ぎ)→振っていないので「待ち」
    const p = foldMeleeSpacing(st, 60_000); // 1分ぶん
    expect(p.holdRate).toBe(1);
    expect(p.reentryPerMin).toBeCloseTo(2);
  });

  it('★「積極的に振ってくる」癖は振った回数で出る(社長の問い2026-08-25)', () => {
    // 同じ遅れ(進入100ms後に初振り)でも、1回で引く人と振り続ける人は別物として残る。
    const once = createMeleeSpacingState();
    tick(once, 0, [enemy('z', 50)]);
    tick(once, 100, [enemy('z', 50)], true);
    tick(once, 900, []);

    const many = createMeleeSpacingState();
    tick(many, 0, [enemy('z', 50)]);
    tick(many, 100, [enemy('z', 50)], true);
    tick(many, 300, [enemy('z', 50)], true);
    tick(many, 500, [enemy('z', 50)], true);
    tick(many, 1300, []);

    const a = foldMeleeSpacing(once, 1000), b = foldMeleeSpacing(many, 1400);
    expect(a.swingLagMs).toBe(b.swingLagMs);          // 遅れは同じ
    expect(a.swingsPerEpisode).toBe(1);
    expect(b.swingsPerEpisode).toBe(3);               // ここで積極性が分かれる
  });

  it('★記録が無ければ n=0(消費側は従来のメトロノームへ落ちる合図)', () => {
    const p = foldMeleeSpacing(createMeleeSpacingState(), 1000);
    expect(p.n).toBe(0);
    expect(p.swingLagMs).toBe(0);
  });

  it('★複数の敵が同時に居ても、進入ごとに1件ずつ数える', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('a', 50), enemy('b', -50)]);
    tick(st, 1000, []);
    expect(foldMeleeSpacing(st, 1000).n).toBe(2);
  });
});
