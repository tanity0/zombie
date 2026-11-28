import { describe, expect, it } from 'vitest';
import {
  KENKI_LEAVE_AFTER_MS, KENKI_LEAVE_CROUCH_MS, KENKI_LEAVE_TOTAL_MS, kenkiLeaveAfterMs, kenkiLeavePose, kenkiLeaveStep,
  genericPhantomMeetNow, phantomLeaveStep, phantomLeavePose, phantomLeaveTex, PHANTOM_LEAVE_AFTER_MS,
} from './kenkiLeave';

const base = { metAt: 1000, leaveAt: undefined as number | undefined, afterMs: KENKI_LEAVE_AFTER_MS, busy: false };

describe('kenkiLeaveStep(孫悟空の2分で帰る)', () => {
  it('名乗っていない(強制出現・まだ会っていない)は帰らない', () => {
    expect(kenkiLeaveStep({ ...base, metAt: undefined, now: 10_000_000 })).toBe('none');
  });
  it('名乗りから2分経つまでは帰らない', () => {
    expect(kenkiLeaveStep({ ...base, now: 1000 + KENKI_LEAVE_AFTER_MS - 1 })).toBe('none');
  });
  it('2分ちょうどで跳び始める', () => {
    expect(kenkiLeaveStep({ ...base, now: 1000 + KENKI_LEAVE_AFTER_MS })).toBe('start');
  });
  it('技の最中なら、技が終わるまで待つ(殴っている途中で消さない)', () => {
    expect(kenkiLeaveStep({ ...base, now: 1000 + KENKI_LEAVE_AFTER_MS + 5000, busy: true })).toBe('none');
    expect(kenkiLeaveStep({ ...base, now: 1000 + KENKI_LEAVE_AFTER_MS + 5000, busy: false })).toBe('start');
  });
  it('gameTime で数える=ポーズで gameTime が止まれば進まない(壁時計を読まない)', () => {
    // 同じ gameTime なら何度呼んでも同じ答え
    expect(kenkiLeaveStep({ ...base, now: 60_000 })).toBe('none');
    expect(kenkiLeaveStep({ ...base, now: 60_000 })).toBe('none');
  });
  it('跳び去りの最中は leaving、全体の長さを過ぎたら gone(技の最中でも途中で止めない)', () => {
    expect(kenkiLeaveStep({ ...base, leaveAt: 5000, now: 5000 + KENKI_LEAVE_TOTAL_MS - 1, busy: true })).toBe('leaving');
    expect(kenkiLeaveStep({ ...base, leaveAt: 5000, now: 5000 + KENKI_LEAVE_TOTAL_MS })).toBe('gone');
  });
  it('確認用の短縮(?kenkileave=<秒>)', () => {
    expect(kenkiLeaveAfterMs(5)).toBe(5000);
    expect(kenkiLeaveAfterMs(null)).toBe(KENKI_LEAVE_AFTER_MS);
    expect(kenkiLeaveAfterMs(-1)).toBe(KENKI_LEAVE_AFTER_MS);
    expect(kenkiLeaveAfterMs(Number.NaN)).toBe(KENKI_LEAVE_AFTER_MS);
  });
});

describe('kenkiLeavePose(跳び去りの絵の形)', () => {
  it('沈み込み→上昇→消えかけ の順で、最後は透明・拡大', () => {
    const c = kenkiLeavePose(KENKI_LEAVE_CROUCH_MS * 0.8);
    expect(c.phase).toBe('crouch');
    expect(c.liftPx).toBeLessThan(0); // 少し沈む
    const end = kenkiLeavePose(KENKI_LEAVE_TOTAL_MS);
    expect(end.phase).toBe('rise');
    expect(end.alpha).toBeCloseTo(0, 5);
    expect(end.zoom).toBeGreaterThan(1.5);
    expect(end.liftPx).toBeGreaterThan(200);
  });
  it('慣性: 高さは単調に上がり、上昇の後半ほど伸びが小さい(上空で減速)', () => {
    const at = (k: number) => kenkiLeavePose(KENKI_LEAVE_CROUCH_MS + (KENKI_LEAVE_TOTAL_MS - KENKI_LEAVE_CROUCH_MS) * k).liftPx;
    const early = at(0.2) - at(0.1), late = at(1) - at(0.9);
    expect(early).toBeGreaterThan(late);
    for (let k = 0.1; k <= 1; k += 0.1) expect(at(k)).toBeGreaterThanOrEqual(at(k - 0.1));
  });
  it('踏み切りの瞬間に高さが跳ばない(沈み込みの終わりと上昇の始まりが繋がる)', () => {
    const a = kenkiLeavePose(KENKI_LEAVE_CROUCH_MS - 0.001).liftPx, b = kenkiLeavePose(KENKI_LEAVE_CROUCH_MS).liftPx;
    expect(Math.abs(a - b)).toBeLessThan(0.1);
  });
});

describe('汎用の幻影の2分で帰る(社長指示2026-11-28「幻影も制限時間ある方がいいかも」)', () => {
  const m = { practice: false, metAt: undefined as number | undefined, leaveAt: undefined as number | undefined, attentionPending: false, onScreen: true };
  it('孫悟空と同じ仕組み(別名は同じ関数・同じ2分)', () => {
    expect(phantomLeaveStep).toBe(kenkiLeaveStep);
    expect(phantomLeavePose).toBe(kenkiLeavePose);
    expect(PHANTOM_LEAVE_AFTER_MS).toBe(120_000);
  });
  it('名乗りのアテンションが控えている間は数え始めない=アテンションが出てから', () => {
    expect(genericPhantomMeetNow({ ...m, attentionPending: true })).toBe(false);
    expect(genericPhantomMeetNow(m)).toBe(true);
  });
  it('アテンションが無い時は、姿が画面に入ってから', () => {
    expect(genericPhantomMeetNow({ ...m, onScreen: false })).toBe(false);
    expect(genericPhantomMeetNow({ ...m, onScreen: true })).toBe(true);
  });
  it('練習ラン(対策室)は数え始めない=帰らない', () => {
    expect(genericPhantomMeetNow({ ...m, practice: true })).toBe(false);
    expect(phantomLeaveStep({ metAt: undefined, leaveAt: undefined, now: 1e9, afterMs: KENKI_LEAVE_AFTER_MS, busy: false })).toBe('none');
  });
  it('もう数えている/跳び去り中は打ち直さない(数え始めは1回だけ)', () => {
    expect(genericPhantomMeetNow({ ...m, metAt: 500 })).toBe(false);
    expect(genericPhantomMeetNow({ ...m, leaveAt: 500 })).toBe(false);
  });
  it('跳び去りのコマ: 沈み込み=構え(-ready)/跳び上がり=振り上げ(-swing)', () => {
    expect(phantomLeaveTex(0)).toBe('ready');
    expect(phantomLeaveTex(KENKI_LEAVE_CROUCH_MS - 1)).toBe('ready');
    expect(phantomLeaveTex(KENKI_LEAVE_CROUCH_MS)).toBe('swing');
    expect(phantomLeaveTex(KENKI_LEAVE_TOTAL_MS)).toBe('swing');
  });
});
