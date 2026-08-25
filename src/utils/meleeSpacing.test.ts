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
  counterWindowOpen = false,
) => stepMeleeSpacing(st, { enemies, pcx, pcy, reachPx: 74, gameTime, swungThisTick, counterWindowOpen });

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
    // ★0ではなく null。0だと消費側が「進入と同時に振る最速の人」と読む=真逆の癖になる。
    expect(p.swingLagMs).toBeNull();
    expect(p.backStepPx).toBeNull();
    expect(p.holdBackStepPx).toBeNull();
  });

  // -------------------------------------------------------------------------------------------
  // ★社長の問い2026-08-25「一切振らずに逃げる人もいると思うけど、その辺も平気?」
  // 平気にするために2つ直した(v0.25.3909): ①測れなかった連続量は null ②振らずに離れた距離も測る。
  // -------------------------------------------------------------------------------------------
  it('★一切振らない人: swingLagMs は null(0=最速 と混ざらない)・積極性は0', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);
    tick(st, 500, []);
    tick(st, 1000, [enemy('z', 50)]);
    tick(st, 1500, []);
    const p = foldMeleeSpacing(st, 1500);
    expect(p.n).toBe(2);
    expect(p.holdRate).toBe(1);
    expect(p.swingsPerEpisode).toBe(0);
    expect(p.swingLagMs).toBeNull();   // 「振らなかった」を「即振り」と読ませない
    expect(p.backStepPx).toBeNull();   // 振り逃げが1件も無い
  });

  it('★振らない人の中の2種類: 待ち構える人(≒0px)と、振らずに逃げる人(下がる)を距離で分ける', () => {
    const stand = createMeleeSpacingState();
    tick(stand, 0, [enemy('z', 50)]);
    tick(stand, 500, []);              // その場のまま相手が離れた

    const flee = createMeleeSpacingState();
    tick(flee, 0, [enemy('z', 50)]);
    tick(flee, 500, [enemy('z', 50)], false, -40); // 自分が40px下がって射程外へ

    const a = foldMeleeSpacing(stand, 500), b = foldMeleeSpacing(flee, 500);
    expect(a.holdRate).toBe(1);
    expect(b.holdRate).toBe(1);        // holdRate だけでは同じ人に見える
    expect(a.holdBackStepPx).toBeCloseTo(0);
    expect(b.holdBackStepPx).toBeCloseTo(40); // ここで初めて別人になる
  });

  it('★振り逃げの距離に「振らずに逃げた」ぶんは混ざらない(別勘定)', () => {
    const st = createMeleeSpacingState();
    // 1件目: 振らずに40px下がって射程外(0 → -40。敵は x=50 なので距離90>74)
    tick(st, 0, [enemy('z', 50)]);
    tick(st, 200, [enemy('z', 50)], false, -40);
    // 2件目: 振ってから80px下がって射程外(-40 → -120。敵は x=20 なので距離140>74)
    tick(st, 400, [enemy('w', 20)], false, -40);
    tick(st, 500, [enemy('w', 20)], true, -40);
    tick(st, 700, [enemy('w', 20)], false, -120);
    const p = foldMeleeSpacing(st, 700);
    expect(p.swingLeaveRate).toBeCloseTo(0.5); // 2件のうち1件だけが振り逃げ
    expect(p.backStepPx).toBeCloseTo(80);      // 振り逃げの距離
    expect(p.holdBackStepPx).toBeCloseTo(40);  // 振らずに逃げた距離(混ざっていない)
  });

  // -------------------------------------------------------------------------------------------
  // ★社長の指摘2026-08-25「もちろん、カウンター狙いで振る人はいる。それも別で癖は取れるよね」
  // カウンター窓の中の振りは**間合いの癖から外して別勘定**にする(v0.25.3910)。
  // -------------------------------------------------------------------------------------------
  it('★カウンター窓の中の振りは間合いの癖に数えない(反応の速さが遅れに紛れない)', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);                           // 進入
    tick(st, 200, [enemy('z', 50)], false, 0, 0, true);       // 窓が開いた(まだ振らない)
    tick(st, 400, [enemy('z', 50)], true, 0, 0, true);        // 窓の中で振った(=カウンター狙い)
    tick(st, 900, []);                                       // 離れて決着
    const p = foldMeleeSpacing(st, 900);
    // 間合い側では「自分からは振らない人」に見える(これが正しい——技に反応しただけ)
    expect(p.holdRate).toBe(1);
    expect(p.swingsPerEpisode).toBe(0);
    expect(p.swingLagMs).toBeNull();
    // カウンター側に立つ
    expect(p.counterAimRate).toBe(1);
    expect(p.counterAimLagMs).toBe(200); // 窓が開いてから振るまで
  });

  it('★「狙って振ったが外した」も残る(成立だけを数える counterChance では取れない)', () => {
    const st = createMeleeSpacingState();
    // 機会1: 窓の中で振った(当たったかどうかはここでは見ない)
    tick(st, 0, [], true, 0, 0, true);
    tick(st, 100, []);          // 窓が閉じる
    // 機会2: 窓が開いたが振らなかった
    tick(st, 200, [], false, 0, 0, true);
    tick(st, 300, []);
    const p = foldMeleeSpacing(st, 300);
    expect(p.counterAimRate).toBeCloseTo(0.5);
  });

  it('★同じ窓で連打しても1票(窓の数で割る率が1を超えない)', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [], true, 0, 0, true);
    tick(st, 50, [], true, 0, 0, true);
    tick(st, 100, [], true, 0, 0, true);
    tick(st, 200, []);
    const p = foldMeleeSpacing(st, 200);
    expect(p.counterAimRate).toBe(1);
    expect(p.counterAimLagMs).toBe(0); // 最初の振りの遅れだけを見る
  });

  it('★カウンター窓を一度も見ていなければ null(0=「一度も狙わない人」と混ざらない)', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);
    tick(st, 500, []);
    const p = foldMeleeSpacing(st, 500);
    expect(p.counterAimRate).toBeNull();
    expect(p.counterAimLagMs).toBeNull();
  });

  it('★複数の敵が同時に居ても、進入ごとに1件ずつ数える', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('a', 50), enemy('b', -50)]);
    tick(st, 1000, []);
    expect(foldMeleeSpacing(st, 1000).n).toBe(2);
  });
});
