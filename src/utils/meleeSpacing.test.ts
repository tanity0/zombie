import { describe, it, expect } from 'vitest';
import {
  createMeleeSpacingState, stepMeleeSpacing, foldMeleeSpacing, blendMeleeSpacing,
  PRE_SWING_WINDOW_MS, SWING_LEAVE_WINDOW_MS, SWING_LEAVE_MIN_PX, MELEE_SPACING_V,
  type MeleeSpacingProfile,
} from './meleeSpacing';

// ★近接の「間合いの癖」の計測(SAME_ARENA §8・v2=§8-B2 着手前監査の是正)。社長が挙げた5つの癖が、
// **距離と時間だけ**で正しく分類されることを固定する。
// 掟: 連続量(時間・距離)は抽選を通さない=ここで出す値がそのまま消費側のスカラーになる。
const enemy = (id: string, x: number, y = 0, width = 0, height = 0) => ({ id, x, y, width, height });
/** 射程の外(74pxより遠い)。退出は「相手が消えた」ではなく、ここへ動いたことで作る。 */
const FAR = 300;

type Opt = { swung?: boolean; pressed?: boolean; pcx?: number; pcy?: number; open?: boolean; reach?: number };
/** 1tick進める小道具(既定の射程74px=ナイフ相当。プレイヤーは原点に居る想定)。 */
const tick = (
  st: ReturnType<typeof createMeleeSpacingState>,
  gameTime: number,
  enemies: ReturnType<typeof enemy>[],
  o: Opt = {},
) => stepMeleeSpacing(st, {
  enemies, pcx: o.pcx ?? 0, pcy: o.pcy ?? 0, reachPx: o.reach ?? 74, gameTime,
  swungThisTick: o.swung ?? false, pressedThisTick: o.pressed ?? false, counterWindowOpen: o.open ?? false,
});

describe('接敵イベントの分類(社長の5つの癖)', () => {
  it('①進入してから振るまでの遅れを測る(連続量・抽選なし)', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, []);                                  // 誰も居ない
    tick(st, 100, [enemy('z', 50)]);                  // 進入
    tick(st, 350, [enemy('z', 50)], { swung: true }); // 250ms後に振った
    tick(st, 1100, [enemy('z', FAR)]);                // 相手が離れて決着
    const p = foldMeleeSpacing(st, 1100);
    expect(p.n).toBe(1);
    expect(p.swingLagMs).toBe(250);
    expect(p.holdRate).toBe(0);
  });

  it('★v2: 射程の中に居る間は閉じない(旧=最初の振りから600msで閉じていた)', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);
    tick(st, 100, [enemy('z', 50)], { swung: true });
    tick(st, 100 + SWING_LEAVE_WINDOW_MS + 500, [enemy('z', 50)]);
    expect(foldMeleeSpacing(st, 2000).n).toBe(0);
  });

  it('③進入の直前に振っていたら「先出し」', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [], { swung: true });                  // 何も居ないうちに振っておく
    tick(st, PRE_SWING_WINDOW_MS, [enemy('z', 50)]);   // 窓ちょうどで進入
    tick(st, 2000, [enemy('z', FAR)]);                 // 離れて決着
    expect(foldMeleeSpacing(st, 2000).preSwingRate).toBe(1);
  });

  it('③窓を過ぎていれば「先出し」ではない', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [], { swung: true });
    tick(st, PRE_SWING_WINDOW_MS + 1, [enemy('z', 50)]);
    tick(st, 2000, [enemy('z', FAR)]);
    expect(foldMeleeSpacing(st, 2000).preSwingRate).toBe(0);
  });

  it('④振った直後に自分で射程外へ出たら「振り逃げ」+自分で離れた量を測る', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);                        // 進入
    tick(st, 100, [enemy('z', 50)], { swung: true });     // 振る
    tick(st, 300, [enemy('z', 50)], { pcx: -40 });        // プレイヤーが40px下がって射程外へ
    const p = foldMeleeSpacing(st, 300);
    expect(p.swingLeaveRate).toBe(1);
    expect(p.backStepPx).toBeCloseTo(40);
  });

  it('★v2: 振った後に相手が離れただけなら「振り逃げ」ではない(自分は動いていない)', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);
    tick(st, 100, [enemy('z', 50)], { swung: true });
    tick(st, 300, [enemy('z', FAR)]);                     // 相手が飛ばされた/下がった
    const p = foldMeleeSpacing(st, 300);
    expect(p.n).toBe(1);
    expect(p.swingLeaveRate).toBe(0);
    expect(p.backStepPx).toBeNull();
  });

  it(`★v2: 自分で離れた量が ${SWING_LEAVE_MIN_PX}px 未満なら「振り逃げ」ではない`, () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 70)]);
    tick(st, 100, [enemy('z', 70)], { swung: true });
    tick(st, 300, [enemy('z', 70)], { pcx: -(SWING_LEAVE_MIN_PX - 2) }); // 少し下がっただけで射程の縁を出た
    expect(foldMeleeSpacing(st, 300).swingLeaveRate).toBe(0);
  });

  it('★v2: 前へ踏み込んでから下がった時、離れた量に踏み込みぶんを足さない', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 60)]);
    tick(st, 100, [enemy('z', 60)], { swung: true, pcx: 20 }); // 踏み込みながら振った(中心20)
    tick(st, 300, [enemy('z', 60)], { pcx: -30 });              // そこから50px下がって射程外
    expect(foldMeleeSpacing(st, 300).backStepPx).toBeCloseTo(50);
  });

  it('④振っても留まっていれば「振り逃げ」ではない', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);
    tick(st, 100, [enemy('z', 50)], { swung: true });
    tick(st, 100 + SWING_LEAVE_WINDOW_MS + 1, [enemy('z', 50)]); // 窓を過ぎても中に居る
    tick(st, 2000, [enemy('z', 50)], { pcx: -40 });               // ずっと後に下がって出た
    const p = foldMeleeSpacing(st, 2000);
    expect(p.swingLeaveRate).toBe(0);
    expect(p.n).toBe(1);
  });

  it('★v2: 相手が一覧から消えて終わった接敵は数えない(倒した・退場=癖ではない)', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);
    tick(st, 100, [enemy('z', 50)], { swung: true });
    tick(st, 200, []);                                    // 倒した
    const p = foldMeleeSpacing(st, 200);
    expect(p.n).toBe(0);
    expect(p.swingLeaveRate).toBe(0);
  });

  it('②一度も振らずに終えたら「待ち」。境界を跨いだ回数も数える', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);   // 進入(1回目の跨ぎ)
    tick(st, 500, [enemy('z', FAR)]); // 退出(2回目の跨ぎ)→振っていないので「待ち」
    const p = foldMeleeSpacing(st, 60_000); // 1分ぶん
    expect(p.holdRate).toBe(1);
    expect(p.reentryPerMin).toBeCloseTo(2);
  });

  it('★「積極的に振ってくる」癖は振った回数で出る(v2=近接CDより長く居ても2回目以降が入る)', () => {
    // 同じ遅れ(進入100ms後に初振り)でも、1回で引く人と振り続ける人は別物として残る。
    const once = createMeleeSpacingState();
    tick(once, 0, [enemy('z', 50)]);
    tick(once, 100, [enemy('z', 50)], { swung: true });
    tick(once, 2600, [enemy('z', FAR)]);

    const many = createMeleeSpacingState();
    tick(many, 0, [enemy('z', 50)]);
    tick(many, 100, [enemy('z', 50)], { swung: true });
    tick(many, 920, [enemy('z', 50)], { swung: true });   // 近接CD(820ms)明けに2回目
    tick(many, 1740, [enemy('z', 50)], { swung: true });  // 3回目
    tick(many, 2600, [enemy('z', FAR)]);

    const a = foldMeleeSpacing(once, 2600), b = foldMeleeSpacing(many, 2600);
    expect(a.swingLagMs).toBe(b.swingLagMs);          // 遅れは同じ
    expect(a.swingsPerEpisode).toBe(1);
    expect(b.swingsPerEpisode).toBe(3);               // ここで積極性が分かれる
  });

  it('★記録が無ければ n=0(消費側は従来の周期へ落ちる合図)', () => {
    const p = foldMeleeSpacing(createMeleeSpacingState(), 1000);
    expect(p.n).toBe(0);
    expect(p.v).toBe(MELEE_SPACING_V);
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
    tick(st, 500, [enemy('z', FAR)]);
    tick(st, 1000, [enemy('z', 50)]);
    tick(st, 1500, [enemy('z', FAR)]);
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
    tick(stand, 500, [enemy('z', FAR)]);          // その場のまま相手が離れた

    const flee = createMeleeSpacingState();
    tick(flee, 0, [enemy('z', 50)]);
    tick(flee, 500, [enemy('z', 50)], { pcx: -40 }); // 自分が40px下がって射程外へ

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
    tick(st, 200, [enemy('z', 50)], { pcx: -40 });
    // 2件目: 振ってから80px下がって射程外(-40 → -120。敵は x=20 なので距離140>74)
    tick(st, 400, [enemy('z', 50), enemy('w', 20)], { pcx: -40 });
    tick(st, 500, [enemy('z', 50), enemy('w', 20)], { swung: true, pcx: -40 });
    tick(st, 700, [enemy('z', 50), enemy('w', 20)], { pcx: -120 });
    const p = foldMeleeSpacing(st, 700);
    expect(p.swingLeaveRate).toBeCloseTo(0.5); // 2件のうち1件だけが振り逃げ
    expect(p.backStepPx).toBeCloseTo(80);      // 振り逃げの距離
    expect(p.holdBackStepPx).toBeCloseTo(40);  // 振らずに逃げた距離(混ざっていない)
  });

  it('★v2: 距離は相手の当たり判定の矩形の最近点まで・射程は渡された実射程', () => {
    // 中心は200px先でも、矩形の縁が60px先なら射程74の中。
    const big = (): ReturnType<typeof enemy> => enemy('boss', 60, -100, 280, 200);
    const st = createMeleeSpacingState();
    tick(st, 0, [big()]);
    tick(st, 500, [big()], { pcx: -40 });       // 100px先=射程の外へ
    expect(foldMeleeSpacing(st, 500).n).toBe(1);

    // 同じ立ち位置でも、射程が長ければ中に居続ける(=閉じない)。
    const st2 = createMeleeSpacingState();
    tick(st2, 0, [big()], { reach: 120 });
    tick(st2, 500, [big()], { pcx: -40, reach: 120 });
    expect(foldMeleeSpacing(st2, 500).n).toBe(0);
  });

  // -------------------------------------------------------------------------------------------
  // ★社長の指摘2026-08-25「もちろん、カウンター狙いで振る人はいる。それも別で癖は取れるよね」
  // カウンター窓の中の振りは**間合いの癖から外して別勘定**にする(v0.25.3910)。
  // v2(社長 2026-10-27「推薦で」): 押した時刻を**当たる瞬間(=窓が閉じた時刻)からの差**で持つ(後の先の再現用)。
  // -------------------------------------------------------------------------------------------
  it('★カウンター窓の中の振りは間合いの癖に数えない(反応の速さが遅れに紛れない)', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);                                       // 進入
    tick(st, 200, [enemy('z', 50)], { open: true });                     // 窓が開いた(まだ振らない)
    tick(st, 400, [enemy('z', 50)], { open: true, swung: true, pressed: true }); // 窓の中で押した
    tick(st, 500, [enemy('z', 50)]);                                     // 窓が閉じた(=当たる瞬間)
    tick(st, 900, [enemy('z', FAR)]);                                    // 離れて決着
    const p = foldMeleeSpacing(st, 900);
    // 間合い側では「自分からは振らない人」に見える(これが正しい——技に反応しただけ)
    expect(p.holdRate).toBe(1);
    expect(p.swingsPerEpisode).toBe(0);
    expect(p.swingLagMs).toBeNull();
    // カウンター側に立つ
    expect(p.counterAimRate).toBe(1);
    expect(p.counterAimOffsetMs).toBe(-100); // 当たる100ms前に押した
  });

  it('★「狙って振ったが外した」も残る(成立だけを数える counterChance では取れない)', () => {
    const st = createMeleeSpacingState();
    // 機会1: 窓の中で押した(当たったかどうかはここでは見ない)
    tick(st, 0, [], { open: true, pressed: true });
    tick(st, 100, []);          // 窓が閉じる
    // 機会2: 窓が開いたが押さなかった
    tick(st, 200, [], { open: true });
    tick(st, 300, []);
    const p = foldMeleeSpacing(st, 300);
    expect(p.counterAimRate).toBeCloseTo(0.5);
    expect(p.counterAimOffsetMs).toBe(-100); // 押さなかった窓は時刻の平均に入らない
  });

  it('★同じ窓で連打しても1票・時刻は最初に押した時', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [], { open: true, pressed: true });
    tick(st, 50, [], { open: true, pressed: true });
    tick(st, 100, [], { open: true, pressed: true });
    tick(st, 200, []);
    const p = foldMeleeSpacing(st, 200);
    expect(p.counterAimRate).toBe(1);
    expect(p.counterAimOffsetMs).toBe(-200);
  });

  it('★v2: カウンター狙いは「押した瞬間」で数える(打刻=前隙の後 ではない)', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [], { open: true });
    tick(st, 100, [], { open: true, pressed: true });  // 押した
    tick(st, 300, [], { open: false, swung: true });  // 打刻は窓が閉じた後(前隙200ms)
    const p = foldMeleeSpacing(st, 300);
    expect(p.counterAimRate).toBe(1);
    expect(p.counterAimOffsetMs).toBe(-200);
  });

  it('★カウンター窓を一度も見ていなければ null(0=「一度も狙わない人」と混ざらない)', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('z', 50)]);
    tick(st, 500, [enemy('z', FAR)]);
    const p = foldMeleeSpacing(st, 500);
    expect(p.counterAimRate).toBeNull();
    expect(p.counterAimOffsetMs).toBeNull();
  });

  it('★複数の敵が同時に居ても、進入ごとに1件ずつ数える', () => {
    const st = createMeleeSpacingState();
    tick(st, 0, [enemy('a', 50), enemy('b', -50)]);
    tick(st, 1000, [enemy('a', FAR), enemy('b', -FAR)]);
    expect(foldMeleeSpacing(st, 1000).n).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------
// ★プロファイルへの混合(v0.25.3911・Phase B-1)。dodgeDir/punish と同じ流儀:
// 標本なし=前回値を保つ / 初回=標本そのまま / **null のノブは前回値を壊さない**。
// ---------------------------------------------------------------------------------------------
const prof = (o: Partial<MeleeSpacingProfile>): MeleeSpacingProfile => ({
  v: MELEE_SPACING_V, n: 10, swingLagMs: 300, reentryPerMin: 4, backStepPx: 20, holdBackStepPx: 10,
  swingsPerEpisode: 1, preSwingRate: 0.2, swingLeaveRate: 0.3, holdRate: 0.1,
  counterAimRate: 0.5, counterAimOffsetMs: -60, ...o,
});

describe('プロファイルへの混合(blendMeleeSpacing)', () => {
  it('前回値が無ければ標本そのまま(初回)', () => {
    expect(blendMeleeSpacing(undefined, prof({}), 0.3)).toEqual(prof({}));
  });

  it('標本が無い/n=0 なら前回値をそのまま返す(欠損で上書きしない)', () => {
    const prev = prof({});
    expect(blendMeleeSpacing(prev, null, 0.3)).toBe(prev);
    expect(blendMeleeSpacing(prev, prof({ n: 0 }), 0.3)).toBe(prev);
  });

  it('★標本側が null のノブは前回値を保つ(「測れなかった」で癖を消さない)', () => {
    const prev = prof({ swingLagMs: 300, counterAimRate: 0.5 });
    const next = blendMeleeSpacing(prev, prof({ swingLagMs: null, counterAimRate: null }), 0.5);
    expect(next?.swingLagMs).toBe(300);
    expect(next?.counterAimRate).toBe(0.5);
  });

  it('前回値が null で標本にあれば標本を採る(初めて測れた)', () => {
    const next = blendMeleeSpacing(prof({ swingLagMs: null }), prof({ swingLagMs: 400 }), 0.5);
    expect(next?.swingLagMs).toBe(400);
  });

  it('★v2: 版の無い(旧)記録とは混ぜずに標本そのまま・標本が無ければ旧記録は捨てる', () => {
    const old = prof({ v: undefined, holdRate: 0.9 });
    expect(blendMeleeSpacing(old, prof({ holdRate: 0.1 }), 0.3)?.holdRate).toBe(0.1);
    expect(blendMeleeSpacing(old, null, 0.3)).toBeUndefined();
  });

  it('率・平均はEMA / n は累計', () => {
    const next = blendMeleeSpacing(prof({ holdRate: 0, n: 10 }), prof({ holdRate: 1, n: 6 }), 0.5);
    expect(next?.holdRate).toBeCloseTo(0.5);
    expect(next?.n).toBe(16);
  });
});
