import { describe, it, expect } from 'vitest';
import {
  brawlerCounterMasterReply, brawlerCounterMasterKikoDue, brawlerCounterKikoAfterShot, counterMasterSkipsRefundAndBlow,
  BRAWLER_CM_KIKO_GAP_MS, BRAWLER_CM_KIKO_SHOTS,
} from './brawlerCounterMaster';
import type { BrawlerGuardClass } from './brawlerGuard';

const base = { brawlerMode: true, counterMasterLv: 1, counter: true, throttled: false };
const reply = (classes: BrawlerGuardClass[], o: Partial<typeof base & { dot: boolean }> = {}) => brawlerCounterMasterReply({ ...base, ...o, classes });

describe('格闘のカウンターマスター: 自動の反撃の決め', () => {
  it('雑魚・強個体 → 土竜 / ボス級・終端 → 気功の二連発', () => {
    expect(reply(['mob'])).toBe('mogura');
    expect(reply(['strong'])).toBe('mogura');
    expect(reply(['boss'])).toBe('kiko2');
    expect(reply([null])).toBe('kiko2');
  });
  it('ボス級が1件でも混じればボスを優先(気功)・雑魚と不明なら土竜・相手が分からなければ気功', () => {
    expect(reply(['mob', 'boss'])).toBe('kiko2');
    expect(reply(['mob', undefined])).toBe('mogura');
    expect(reply([])).toBe('kiko2');
    expect(reply([undefined])).toBe('kiko2');
  });
  it('格闘でない・未所持・成立していない(弱い構え)・間引き・持続ダメージ → 出さない', () => {
    expect(reply(['mob'], { brawlerMode: false })).toBeNull();
    expect(reply(['mob'], { counterMasterLv: 0 })).toBeNull();
    expect(reply(['boss'], { counter: false })).toBeNull();
    expect(reply(['boss'], { throttled: true })).toBeNull();
    expect(reply(['boss'], { dot: true })).toBeNull();
  });
  it('格闘のときだけ前倒し・吹き飛ばしを付けない', () => {
    expect(counterMasterSkipsRefundAndBlow(true)).toBe(true);
    expect(counterMasterSkipsRefundAndBlow(false)).toBe(false);
  });
  it('二連発は構え1回に1度', () => {
    expect(brawlerCounterMasterKikoDue(100, undefined)).toBe(true);
    expect(brawlerCounterMasterKikoDue(100, 100)).toBe(false);
    expect(brawlerCounterMasterKikoDue(undefined, undefined)).toBe(false);
  });
  it('2発目の時刻 = 1発目 + 間(0.12〜0.2秒)・撃ち終えたら予約は消える・通常の反撃の気功は1発', () => {
    expect(BRAWLER_CM_KIKO_SHOTS).toBe(2);
    expect(BRAWLER_CM_KIKO_GAP_MS).toBeGreaterThanOrEqual(120);
    expect(BRAWLER_CM_KIKO_GAP_MS).toBeLessThanOrEqual(200);
    const r = { at: 1000, hitX: 0, hitY: 0, left: 2 };
    const r2 = brawlerCounterKikoAfterShot(r)!;
    expect(r2.at).toBe(1000 + BRAWLER_CM_KIKO_GAP_MS);
    expect(r2.left).toBe(1);
    expect(brawlerCounterKikoAfterShot(r2)).toBeUndefined();
    expect(brawlerCounterKikoAfterShot({ at: 1000, hitX: 0, hitY: 0 })).toBeUndefined();
  });
});

describe('格闘のカウンターマスター: 弾の受け', () => {
  it('弾を受けた時は自動の反撃を出さない(2026-11-13 の指示)', () => {
    expect(brawlerCounterMasterReply({ brawlerMode: true, counterMasterLv: 3, counter: true, throttled: false, projectile: true, classes: ['boss'] })).toBeNull();
    expect(brawlerCounterMasterReply({ brawlerMode: true, counterMasterLv: 3, counter: true, throttled: false, projectile: true, classes: ['mob'] })).toBeNull();
  });
});
