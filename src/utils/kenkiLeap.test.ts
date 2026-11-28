// research/BRAWLER_PHANTOM.md §15: 拳鬼の跳びかかり(ハンターの跳びの流用)の「使う場面」。
import { describe, expect, it } from 'vitest';
import {
  KENKI_LEAP_MIN_PX, KENKI_LEAP_MAX_PX, KENKI_LEAP_COOLDOWN_MIN_MS, KENKI_LEAP_COOLDOWN_MAX_MS, KENKI_LEAP_P, KENKI_LEAP_P_UNDER_FIRE,
  kenkiLeapEligible, kenkiLeapChance, kenkiLeapReadyAt, kenkiUnderFire, kenkiNoteHit, kenkiLeapCrouchMs, KENKI_LEAP_CROUCH_UNDER_FIRE_MULT,
} from './kenkiLeap';
import { BRAWLER_KICK_RANGE } from './brawler';
import { decidePhantomBrawler, createPhantomBrawlerMind, type PhantomBrawlerInput } from './phantomBrawlerAi';
import { initialBrawlerState } from './brawler';
import { brawlerTimeKeeperDiscount } from './brawlerSkills';

const T = 1_000_000;
const ok = { edgeDist: 500, t: T, readyAt: 0, idle: true, secret: false };

describe('使う場面', () => {
  it('飛び蹴りの届く距離より遠く・上限(900)以内', () => {
    expect(KENKI_LEAP_MIN_PX).toBe(BRAWLER_KICK_RANGE);
    expect(kenkiLeapEligible(ok)).toBe(true);
    expect(kenkiLeapEligible({ ...ok, edgeDist: BRAWLER_KICK_RANGE })).toBe(false);
    expect(kenkiLeapEligible({ ...ok, edgeDist: KENKI_LEAP_MAX_PX })).toBe(true);
    expect(kenkiLeapEligible({ ...ok, edgeDist: KENKI_LEAP_MAX_PX + 1 })).toBe(false);
  });
  it('クールダウン(6〜8秒)・技の最中・秘奥義の最中は使わない', () => {
    expect(kenkiLeapReadyAt(T, () => 0)).toBe(T + KENKI_LEAP_COOLDOWN_MIN_MS);
    expect(kenkiLeapReadyAt(T, () => 0.999999)).toBeCloseTo(T + KENKI_LEAP_COOLDOWN_MAX_MS, -1);
    expect(kenkiLeapEligible({ ...ok, readyAt: T + 1 })).toBe(false);
    expect(kenkiLeapEligible({ ...ok, idle: false })).toBe(false);
    expect(kenkiLeapEligible({ ...ok, secret: true })).toBe(false);
  });
  it('撃たれ続けている時は確率が上がる(2.5秒に2発)', () => {
    const h: number[] = [];
    expect(kenkiUnderFire(h, T)).toBe(false);
    kenkiNoteHit(h, T - 3000); kenkiNoteHit(h, T - 100);
    expect(kenkiUnderFire(h, T)).toBe(false);
    kenkiNoteHit(h, T - 50);
    expect(kenkiUnderFire(h, T)).toBe(true);
    expect(kenkiLeapChance(false)).toBe(KENKI_LEAP_P);
    expect(kenkiLeapChance(true)).toBe(KENKI_LEAP_P_UNDER_FIRE);
  });
  it('頭脳: 考える拍ごとに引く(毎回は跳ばない)', () => {
    const base = (rand: () => number, leap: PhantomBrawlerInput['leap']): PhantomBrawlerInput => ({
      s: initialBrawlerState(), t: T, edgeDist: 500, reach: 74, reachReady: true, playerReach: 74, kikoClear: false,
      discount: k => brawlerTimeKeeperDiscount(k, 3), counterChance: 0, meleeBias: 0.95, bullet: null, rand, leap,
    });
    expect(decidePhantomBrawler(base(() => 0, { eligible: true, underFire: false }), createPhantomBrawlerMind())).toEqual({ kind: 'leap' });
    expect(decidePhantomBrawler(base(() => 0.5, { eligible: true, underFire: false }), createPhantomBrawlerMind())).toBeNull();
    expect(decidePhantomBrawler(base(() => 0.5, { eligible: true, underFire: true }), createPhantomBrawlerMind())).toEqual({ kind: 'leap' });
    expect(decidePhantomBrawler(base(() => 0, { eligible: false, underFire: true }), createPhantomBrawlerMind())).toBeNull();
  });
});

// research/BRAWLER_PHANTOM.md §15-4(社長承認2026-11-11・A2)
describe('撃たれ続けている時は溜めを半分に', () => {
  it('撃たれ続けている時だけ短い・普段はハンターの値のまま', () => {
    expect(kenkiLeapCrouchMs(3000, false)).toBe(3000);
    expect(kenkiLeapCrouchMs(3000, true)).toBe(Math.round(3000 * KENKI_LEAP_CROUCH_UNDER_FIRE_MULT));
    expect(KENKI_LEAP_CROUCH_UNDER_FIRE_MULT).toBe(0.5);
  });
});
