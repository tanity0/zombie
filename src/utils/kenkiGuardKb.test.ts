// research/BRAWLER_PHANTOM.md §16-9: 拳鬼(孫悟空)の構えの受け。反撃の気功を撃つか(プレイヤーの構えと同じ規則)。
import { describe, it, expect } from 'vitest';
import { kenkiGuardCounterKikoDue } from './kenkiGuardKb';

describe('kenkiGuardCounterKikoDue(構えで近接を受けた時の反撃の気功)', () => {
  const base = { guardSince: 1000, guardUntil: 2000, firedFor: undefined as number | undefined, receivedAt: 1200, shukuchi: false };
  it('構えの内で近接を受けた=撃つ', () => {
    expect(kenkiGuardCounterKikoDue(base)).toBe(true);
  });
  it('同じ構え(guardSince)で撃った後は撃たない・延長(新しい guardSince)は数え直す', () => {
    expect(kenkiGuardCounterKikoDue({ ...base, firedFor: 1000 })).toBe(false);
    expect(kenkiGuardCounterKikoDue({ ...base, firedFor: 400 })).toBe(true);
  });
  it('構えが無い/受けた時刻が今の構えの外=撃たない', () => {
    expect(kenkiGuardCounterKikoDue({ ...base, guardSince: undefined })).toBe(false);
    expect(kenkiGuardCounterKikoDue({ ...base, receivedAt: 900 })).toBe(false);
    expect(kenkiGuardCounterKikoDue({ ...base, receivedAt: 2100 })).toBe(false);
  });
  it('縮地が出た受け(遠い所からの近接=下がらない受け)では撃たない', () => {
    expect(kenkiGuardCounterKikoDue({ ...base, shukuchi: true })).toBe(false);
  });
});
