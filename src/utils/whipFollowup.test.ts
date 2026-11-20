// 鞭の追加攻撃(research/WHIP_FOLLOWUP.md)の純関数: 向きの帯・受付の窓・引き寄せの止まる位置・叩きつけの対象。
import { describe, it, expect } from 'vitest';
import {
  classifyWhipFlick, isWhipFollowupOpen, whipPullTarget, whipPullProgress, whipPullPosAt, whipSlamTargets, whipFollowupAction, isWhipFollowupLocked,
  WHIP_FOLLOWUP_WINDOW_MS, WHIP_PULL_GAP_PX,
} from './whipFollowup';
import { flickBand, isFlickFollowupOpen, FLICK_FOLLOWUP_WINDOW_MS } from './flickFollowup';

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
