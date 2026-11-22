// 鞭の追加攻撃(research/WHIP_FOLLOWUP.md)の純関数: 向きの帯・受付の窓・引き寄せの止まる位置・叩きつけの対象。
import { describe, it, expect } from 'vitest';
import {
  classifyWhipFlick, isWhipFollowupOpen, whipPullTarget, whipPullProgress, whipPullPosAt, whipSlamTargets, whipFollowupAction, isWhipFollowupLocked,
  WHIP_FOLLOWUP_WINDOW_MS, WHIP_PULL_GAP_PX,
  whipFollowupPhase, whipLiftApexAt, whipLiftHoverEndAt, whipLiftTopAt, whipZakoTopDelayMs, whipSlamOpenAt,
  whipSlamBlastPlan, whipSlamBlastFalloff,
} from './whipFollowup';
import { flickBand, isFlickFollowupOpen, FLICK_FOLLOWUP_WINDOW_MS } from './flickFollowup';
import { brawlerJugglePush, brawlerJuggleHeightRel } from './brawlerCombo';
import { COUNTER_LIFT_MOVE } from './airLift';

const deg = (d: number) => ({ x: Math.cos((d * Math.PI) / 180), y: Math.sin((d * Math.PI) / 180) });

describe('向きの帯(振りの向きとのなす角)', () => {
  it('60°以内=叩きつけ・120°以上=引き寄せ・その間=何も起きない', () => {
    const swing = { x: 1, y: 0 };
    expect(classifyWhipFlick(swing, deg(0))).toBe('slam');
    expect(classifyWhipFlick(swing, deg(59))).toBe('slam');
    expect(classifyWhipFlick(swing, deg(-60))).toBe('slam'); // 境目を含む
    expect(classifyWhipFlick(swing, deg(61))).toBeNull();
    expect(classifyWhipFlick(swing, deg(90))).toBeNull();
    expect(classifyWhipFlick(swing, deg(119))).toBeNull();
    expect(classifyWhipFlick(swing, deg(120))).toBe('pull'); // 境目を含む
    expect(classifyWhipFlick(swing, deg(180))).toBe('pull');
    expect(classifyWhipFlick(swing, deg(-150))).toBe('pull');
  });
  it('振りの向きが斜めでも、なす角で決まる(長さは関係ない)', () => {
    expect(classifyWhipFlick(deg(45), { x: -30, y: -30 })).toBe('pull');
    expect(classifyWhipFlick(deg(45), { x: 0, y: 5 })).toBe('slam'); // 45°
  });
  it('長さ0の向きは何も起きない', () => {
    expect(classifyWhipFlick({ x: 0, y: 0 }, deg(0))).toBeNull();
    expect(classifyWhipFlick(deg(0), { x: 0, y: 0 })).toBeNull();
  });
  it('共通部品の帯と同じ1本', () => {
    expect(flickBand(deg(0), deg(10))).toBe('forward');
    expect(flickBand(deg(0), deg(170))).toBe('back');
    expect(flickBand(deg(0), deg(90))).toBeNull();
  });
});

describe('受付の窓', () => {
  const w = { hitAt: 1000, dirX: 1, dirY: 0, hitIds: ['a'], used: false, stage: 'hit' as const };
  it('当たった瞬間から300msの間だけ開く', () => {
    expect(WHIP_FOLLOWUP_WINDOW_MS).toBe(FLICK_FOLLOWUP_WINDOW_MS);
    expect(isWhipFollowupOpen(w, 999)).toBe(false);
    expect(isWhipFollowupOpen(w, 1000)).toBe(true);
    expect(isWhipFollowupOpen(w, 1000 + WHIP_FOLLOWUP_WINDOW_MS)).toBe(true);
    expect(isWhipFollowupOpen(w, 1001 + WHIP_FOLLOWUP_WINDOW_MS)).toBe(false);
  });
  it('使った窓・当たりの無い窓・窓が無いは閉じている', () => {
    expect(isWhipFollowupOpen({ ...w, used: true }, 1100)).toBe(false);
    expect(isWhipFollowupOpen({ ...w, hitIds: [] }, 1100)).toBe(false);
    expect(isFlickFollowupOpen(null, 1100)).toBe(false);
  });
});

describe('引き寄せの止まる位置', () => {
  const player = { x: 0, y: 0, width: 20, height: 30 };
  it('横から: 敵の縁がプレイヤーの縁から40px手前', () => {
    const enemy = { x: 200, y: 5, width: 24, height: 20 }; // 中心(212,15)=プレイヤーの中心(10,15)の真右
    const t = whipPullTarget(player, enemy)!;
    expect(t.y).toBeCloseTo(5);
    expect(t.x - (player.x + player.width)).toBeCloseTo(WHIP_PULL_GAP_PX);
  });
  it('上から: 縦の寸法で測る', () => {
    const enemy = { x: -2, y: -300, width: 24, height: 20 };
    const t = whipPullTarget(player, enemy)!;
    expect(player.y - (t.y + enemy.height)).toBeCloseTo(WHIP_PULL_GAP_PX);
  });
  it('既に手前にいる敵は動かさない', () => {
    expect(whipPullTarget(player, { x: 50, y: 5, width: 24, height: 20 })).toBeNull();
    expect(whipPullTarget(player, { x: 0, y: 0, width: 20, height: 30 })).toBeNull();
  });
});

describe('引き寄せの動き(慣性)', () => {
  it('速く始まり、着く手前で減速して、ちょうど止まる', () => {
    const k0 = whipPullProgress(0, 100, 0), k1 = whipPullProgress(0, 100, 10), k9 = whipPullProgress(0, 100, 90), k10 = whipPullProgress(0, 100, 100);
    expect(k0).toBe(0);
    expect(k10).toBe(1);
    expect(k1 - k0).toBeGreaterThan(k10 - k9); // 出だしの進みの方が大きい
    expect(whipPullProgress(0, 100, 500)).toBe(1);
    const p = whipPullPosAt({ fromX: 100, fromY: 0, toX: 0, toY: 0, startAt: 0, endAt: 100 }, 100);
    expect(p.x).toBe(0);
  });
});

describe('段と向き(1段目=反対で浮かせつつ引き寄せ / 2段目=進行方向で叩き落とし)', () => {
  it('1段目は反対だけ・2段目は進行方向だけ。1段目の進行方向(引き寄せを飛ばした叩きつけ)と横は何も起きない', () => {
    expect(whipFollowupAction('hit', 'pull')).toBe('pull');
    expect(whipFollowupAction('hit', 'slam')).toBeNull();
    expect(whipFollowupAction('hit', null)).toBeNull();
    expect(whipFollowupAction('pulled', 'slam')).toBe('slam');
    expect(whipFollowupAction('pulled', 'pull')).toBeNull();
    expect(whipFollowupAction('pulled', null)).toBeNull();
  });
});

describe('叩き落としの対象', () => {
  const e = (id: string, o: Partial<{ alive: boolean; airborne: boolean; boss: boolean }> = {}) => ({ id, alive: true, airborne: true, boss: false, ...o });
  it('引き寄せた敵のうち、生きていてまだ浮いている敵。ボス級は浮きを問わない。受付に無い敵は外す', () => {
    const es = [e('a'), e('landed', { airborne: false }), e('dead', { alive: false }), e('boss', { airborne: false, boss: true }), e('other')];
    expect(whipSlamTargets(es, ['a', 'landed', 'dead', 'boss'])).toEqual(['a', 'boss']);
  });
  it('全員着地・倒れたら空(何も起きない)', () => {
    expect(whipSlamTargets([e('a', { airborne: false })], ['a'])).toEqual([]);
  });
});

describe('位置と向きの固定', () => {
  const w = { hitAt: 1000, dirX: 1, dirY: 0, hitIds: ['a'], used: false, stage: 'pulled' as const, lockUntil: 1300 };
  it('止める終わりの手前まで固定・過ぎたら外れる・止める終わりが無ければ固定しない', () => {
    expect(isWhipFollowupLocked(w, 1000)).toBe(true);
    expect(isWhipFollowupLocked(w, 1299)).toBe(true);
    expect(isWhipFollowupLocked(w, 1300)).toBe(false);
    expect(isWhipFollowupLocked({ ...w, lockUntil: undefined }, 1100)).toBe(false);
    expect(isWhipFollowupLocked(null, 1100)).toBe(false);
  });
});

describe('叩き落とし(3段目)の受付=開く前は早すぎ(社長「敵が浮いたのを見てから入力窓。(早すぎてもだめ)」「入力窓の長さは広げない。覚えもしない」)', () => {
  // 引き寄せた瞬間=1000・受付の開く時刻=1137 として開いた2段目の窓。
  const w = { hitAt: 1137, armAt: 1000, dirX: 1, dirY: 0, hitIds: ['a'], used: false, stage: 'pulled' as const, lockUntil: 1137 + WHIP_FOLLOWUP_WINDOW_MS };
  it('頂点より前=早すぎ(受付は開いていない・使ってもいない)/頂点〜+300ms=受付/過ぎたら閉じる', () => {
    expect(whipFollowupPhase(w, 999)).toBeNull();
    expect(whipFollowupPhase(w, 1000)).toBe('early');
    expect(whipFollowupPhase(w, 1136)).toBe('early');
    expect(isWhipFollowupOpen(w, 1136)).toBe(false); // 早すぎでは叩き落とせない
    expect(whipFollowupPhase(w, 1137)).toBe('open');
    expect(whipFollowupPhase(w, 1137 + WHIP_FOLLOWUP_WINDOW_MS)).toBe('open');
    expect(whipFollowupPhase(w, 1138 + WHIP_FOLLOWUP_WINDOW_MS)).toBeNull();
    expect(whipFollowupPhase({ ...w, used: true }, 1200)).toBeNull();
    expect(whipFollowupPhase({ ...w, hitIds: [] }, 1100)).toBeNull();
    expect(whipFollowupPhase(null, 1100)).toBeNull();
  });
  it('1段目(armAt なし)は当たった瞬間から(早すぎの間は無い)', () => {
    const w1 = { hitAt: 1000, dirX: 1, dirY: 0, hitIds: ['a'], used: false, stage: 'hit' as const };
    expect(whipFollowupPhase(w1, 999)).toBeNull();
    expect(whipFollowupPhase(w1, 1000)).toBe('open');
  });
  it('頂点の時刻は描いている弧の頂点(上りの終わり)と同じ: その手前は上り途中・そこが一番高い', () => {
    for (const cls of ['mob', 'strong'] as const) {
      const jp = brawlerJugglePush({}, cls, COUNTER_LIFT_MOVE, 5000, false, false, false)!;
      const apex = whipLiftApexAt(jp)!;
      expect(apex).toBeGreaterThan(5000);
      const top = brawlerJuggleHeightRel(jp, apex);
      expect(brawlerJuggleHeightRel(jp, apex - 20)).toBeLessThan(top);
      let max = 0;
      for (let t = 5000; t < (jp.brLiftUntil ?? 0); t++) max = Math.max(max, brawlerJuggleHeightRel(jp, t));
      expect(top).toBeGreaterThan(max - 1e-3);
      // 頂点+300ms はまだ浮いている(雑魚・強個体=浮きの短い方)。
      expect(apex + WHIP_FOLLOWUP_WINDOW_MS).toBeLessThan(jp.brLiftUntil ?? 0);
    }
  });
  it('押し上げ0(叩き落とし中)は始まりが頂点・浮いていなければ null', () => {
    expect(whipLiftApexAt({ brawlerLiftAt: 100, brLiftMs: 260, brLiftPeak: 0, brLiftFrom: 0.8 })).toBe(100);
    expect(whipLiftApexAt({})).toBeNull();
  });
  it('ボス級(浮かない)は雑魚と同じ間合い・全員の中で一番遅い頂点ちょうどに開く', () => {
    const zako = whipZakoTopDelayMs(COUNTER_LIFT_MOVE);
    const jp = brawlerJugglePush({}, 'mob', COUNTER_LIFT_MOVE, 0, false, false, false)!;
    expect(zako).toBe(whipLiftTopAt(jp));
    expect(whipSlamOpenAt(1000, [null], zako)).toBe(1000 + zako);
    expect(whipSlamOpenAt(1000, [], zako)).toBe(1000 + zako);
    expect(whipSlamOpenAt(1000, [1180, 1240], zako)).toBe(1240);
    expect(whipSlamOpenAt(1000, [1180, null], 50)).toBe(1180);
    expect(whipSlamOpenAt(1000, [900], zako)).toBe(1000); // 引き寄せより前には開かない
  });
});

describe('叩き落としの受付=頂点に浮いている間(社長「鞭の叩きつけ、敵が頂点に浮いてるくらいのタイミングの入力受けにしたい。まだ今だと早い。」)', () => {
  it('窓が開くのは頂点ちょうど・閉じるのは頂点の後(落ち始めてから)。窓の長さは300msのまま・閉じる時はまだ浮いている', () => {
    for (const cls of ['mob', 'strong'] as const) {
      const pullAt = 5000;
      const jp = brawlerJugglePush({}, cls, COUNTER_LIFT_MOVE, pullAt, false, false, false)!;
      const top = whipLiftTopAt(jp)!;
      // 頂点=上り切ってから落ち始めるまでの真ん中(上りの途中ではない)。
      expect(top).toBeGreaterThan(whipLiftApexAt(jp)!);
      expect(top).toBeLessThan(whipLiftHoverEndAt(jp)!);
      const open = whipSlamOpenAt(pullAt, [top], 0);
      const close = open + WHIP_FOLLOWUP_WINDOW_MS;
      expect(open).toBe(top);
      expect(close).toBeGreaterThan(top);
      expect(close).toBeGreaterThan(whipLiftHoverEndAt(jp)!); // 落ち始めてしばらくまで
      expect(close).toBeLessThan(jp.brLiftUntil ?? 0); // 閉じる時はまだ浮いている
      // 落ち始めは、それまでより低くなっていく(漂いの後=落下)。
      const he = whipLiftHoverEndAt(jp)!;
      expect(brawlerJuggleHeightRel(jp, he + 50)).toBeLessThan(brawlerJuggleHeightRel(jp, he));
    }
  });
  it('不変条件: どの区分でも、新しい開く時刻は変更前(上り切った瞬間)より遅い(社長「まだ今だと早い」)', () => {
    const pullAt = 5000;
    for (const cls of ['mob', 'strong'] as const) {
      // 地上から打ち上げた時・空中で拾い直した時(始まりの高さが0でない弧)の両方。
      const ground = brawlerJugglePush({}, cls, COUNTER_LIFT_MOVE, pullAt, false, false, false)!;
      const air = brawlerJugglePush(ground, cls, COUNTER_LIFT_MOVE, pullAt + 200, false, false, false);
      for (const jp of air ? [ground, air] : [ground]) {
        const oldOpen = Math.max(pullAt, whipLiftApexAt(jp)!); // 変更前=上り切った瞬間に開いていた
        const newOpen = whipSlamOpenAt(pullAt, [whipLiftTopAt(jp)], whipZakoTopDelayMs(COUNTER_LIFT_MOVE));
        expect(newOpen).toBeGreaterThan(oldOpen);
      }
    }
    // ボス級(浮かない)=雑魚の間合い。変更前は雑魚の上り切りまでの時間だった。
    const mob = brawlerJugglePush({}, 'mob', COUNTER_LIFT_MOVE, 0, false, false, false)!;
    const oldBoss = pullAt + whipLiftApexAt(mob)!;
    expect(whipSlamOpenAt(pullAt, [null], whipZakoTopDelayMs(COUNTER_LIFT_MOVE))).toBeGreaterThan(oldBoss);
  });
  it('浮きの尺を変えると窓が追従する(頂点の時刻を定数で持たない)', () => {
    const jp = brawlerJugglePush({}, 'mob', COUNTER_LIFT_MOVE, 0, false, false, false)!;
    const ms = jp.brLiftMs ?? 0;
    const longer = { ...jp, brLiftMs: ms * 2, brLiftUntil: ms * 2 };
    const t1 = whipLiftTopAt(jp)!, t2 = whipLiftTopAt(longer)!;
    expect(Math.abs(t2 - 2 * t1)).toBeLessThanOrEqual(2); // 尺を2倍=頂点の時刻も2倍
    expect(whipSlamOpenAt(0, [t2], 0) - whipSlamOpenAt(0, [t1], 0)).toBe(t2 - t1); // 窓も同じだけずれる
    // 落ちる部分を伸ばす(拾い直しの重さ)と配分が変わり、頂点の時刻も描いている弧に合わせて動く。
    const slowFall = { ...jp, brLiftFallK: 2 };
    expect(whipLiftHoverEndAt(slowFall)! - whipLiftApexAt(slowFall)!).toBeGreaterThan(0);
    expect(whipLiftTopAt(slowFall)).not.toBe(null);
  });
  it('押し上げ0(叩き落とし中)は始まりが頂点・浮いていなければ null', () => {
    expect(whipLiftTopAt({ brawlerLiftAt: 100, brLiftMs: 260, brLiftPeak: 0, brLiftFrom: 0.8 })).toBe(100);
    expect(whipLiftTopAt({})).toBeNull();
    expect(whipLiftHoverEndAt({})).toBeNull();
  });
});

describe('叩きつけの爆発(社長「爆発は叩きつけられた敵を中心にです」)', () => {
  const pt = (id: string, x: number, y: number) => ({ id, anchor: () => ({ x, y }) });
  it('減りは手榴弾と同じ(爆心1・縁0.55)', () => {
    expect(whipSlamBlastFalloff(0, 66)).toBe(1);
    expect(whipSlamBlastFalloff(66, 66)).toBeCloseTo(0.55);
    expect(whipSlamBlastFalloff(33, 66)).toBeCloseTo(0.775);
  });
  it('爆心の敵本体には入らない(鞭の打撃で当てる=二重にしない)・半径の外と壁越しは当たらない', () => {
    const plan = whipSlamBlastPlan([{ id: 'a', x: 0, y: 0 }],
      [pt('a', 0, 0), pt('near', 30, 0), pt('far', 100, 0), { ...pt('wall', 10, 0), blocked: () => true }], 66);
    expect(plan).toEqual([{ centerId: 'a', targetId: 'near', dist: 30, scale: whipSlamBlastFalloff(30, 66) }]);
  });
  it('叩きつけた敵が複数=1体ずつを中心に爆発。重なりは手榴弾の同時爆発と同じ=それぞれ独立に当たる', () => {
    const plan = whipSlamBlastPlan([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 40, y: 0 }],
      [pt('a', 0, 0), pt('b', 40, 0), pt('mid', 20, 0)], 66);
    expect(plan.filter(h => h.targetId === 'mid').map(h => h.centerId)).toEqual(['a', 'b']);
    // 叩きつけた a は自分の爆発は受けず、近くの b の爆発(減った分)だけ受ける。
    expect(plan.filter(h => h.targetId === 'a').map(h => [h.centerId, h.scale])).toEqual([['b', whipSlamBlastFalloff(40, 66)]]);
  });
});
