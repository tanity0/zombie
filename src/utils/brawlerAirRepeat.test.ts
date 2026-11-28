// ★1回の空中で同じ技は1回まで(社長指示2026-11-27「格闘の空中では、一度の空中で同じ技は1回までにして(一度着地した後ならok)」)。門の純関数。
import { describe, it, expect } from 'vitest';
import {
  initialBrawlerState, brawlerAirRepeatBlocked, brawlerAirUsedOnStart, brawlerTechStartNode, brawlerAirPressNode, brawlerStartTech, brawlerRouteNodeOf,
  brawlerCarryAir, BRAWLER_KICK_MAX, type BrawlerState,
} from './brawler';
import type { BrawlerTechKind } from './brawlerTypes';

const inAir = (used: BrawlerState['airUsed']): BrawlerState => ({ ...initialBrawlerState(), airFall: { fromPx: 60, v0: 0, at: 1000 }, airUsed: used });

describe('brawlerAirRepeatBlocked', () => {
  it('空中で既に出した技だけ止める・別の技は通す', () => {
    const s = inAir(['kick1', 'kick2']);
    expect(brawlerAirRepeatBlocked(s, 1000, 'kick1')).toBe(true);
    expect(brawlerAirRepeatBlocked(s, 1000, 'kick2')).toBe(true);
    expect(brawlerAirRepeatBlocked(s, 1000, 'kick3')).toBe(false);
    expect(brawlerAirRepeatBlocked(s, 1000, 'heel')).toBe(false);
    expect(brawlerAirRepeatBlocked(s, 1000, 's1')).toBe(false);
  });
  it('地上(着地後)なら印が残っていても止めない', () => {
    const s: BrawlerState = { ...initialBrawlerState(), airUsed: ['kick1'] };
    expect(brawlerAirRepeatBlocked(s, 1000, 'kick1')).toBe(false);
    expect(brawlerAirRepeatBlocked(undefined, 1000, 'kick1')).toBe(false);
  });
});

describe('brawlerAirUsedOnStart / brawlerCarryAir', () => {
  it('地上で始めた行動=その技から数え直す / 空中=足す / 数えない行動(秘奥義)=空中なら持ち越し', () => {
    expect(brawlerAirUsedOnStart(['kick1', 's1'], false, 'kick1')).toEqual(['kick1']);
    expect(brawlerAirUsedOnStart(['kick1'], true, 'kick2')).toEqual(['kick1', 'kick2']);
    expect(brawlerAirUsedOnStart(['kick1'], true, 'idle')).toEqual(['kick1']);
    expect(brawlerAirUsedOnStart(['kick1'], false, 'idle')).toBeUndefined();
  });
  it('地上で跳んだ1発目→空中の2発目で積み、落ちずに待機へ戻ったら消える', () => {
    const g = initialBrawlerState();
    const k1 = brawlerCarryAir(g, brawlerStartTech(g, 'kick', 100, 1), 100);
    expect(k1.airUsed).toEqual(['kick1']);
    const falling: BrawlerState = { ...k1, airFall: { fromPx: 60, v0: 0, at: 500 }, phase: 'idle', tech: null };
    const k2 = brawlerCarryAir(falling, brawlerStartTech(falling, 'kick', 500, 2), 500);
    expect(k2.airUsed).toEqual(['kick1', 'kick2']);
    const endedOnGround = brawlerCarryAir(k1, { ...k1, phase: 'idle', tech: null }, 100);
    expect(endedOnGround.airUsed, '地上で終わった').toBeUndefined();
  });
});

describe('brawlerTechStartNode は brawlerStartTech が始める技の節と同じ', () => {
  const kinds: BrawlerTechKind[] = ['kick', 'stomp', 'kiko', 'guard', 'gouge'];
  for (const kind of kinds) {
    for (let n = 1; n <= BRAWLER_KICK_MAX; n++) {
      for (const heel of [false, true]) {
        for (const up of [false, true]) {
          it(`${kind} n=${n} heel=${heel} up=${up}`, () => {
            const kickN = kind === 'kick' ? n : 0;
            const started = brawlerStartTech(initialBrawlerState(), kind, 100, kickN, false, heel, up);
            expect(brawlerTechStartNode(kind, kickN, heel, up)).toBe(brawlerRouteNodeOf(started));
          });
        }
      }
    }
  }
});

describe('brawlerAirPressNode(入力の瞬間の見積もり)', () => {
  it('蹴りの最中の蹴り=次の何発目・3発目の後=1発目・それ以外の技はその技', () => {
    const s0 = initialBrawlerState();
    const k1 = brawlerStartTech(s0, 'kick', 100, 1);
    expect(brawlerAirPressNode(k1, 150, 'kick')).toBe('kick2');
    const k2 = brawlerStartTech(k1, 'kick', 200, 2);
    expect(brawlerAirPressNode(k2, 250, 'kick')).toBe('kick3');
    expect(brawlerAirPressNode(k2, 250, 'kick', true)).toBe('heel');
    expect(brawlerAirPressNode(k2, 250, 'kick', false, true)).toBe('kickup');
    const k3 = brawlerStartTech(k2, 'kick', 300, 3);
    expect(brawlerAirPressNode(k3, 350, 'kick')).toBe('kick1');
    expect(brawlerAirPressNode(k1, 150, 'stomp')).toBe('stomp');
    expect(brawlerAirPressNode(s0, 150, 'kick')).toBe('kick1');
  });
});
