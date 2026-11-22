// CD_REWORK.md 確定2: counter-master v2(成立時のみCDリファンド)の検証。
import { describe, it, expect } from 'vitest';
import { refundCounterCooldown, COUNTER_MASTER_REFUND_FRAC_BY_LEVEL } from './counterMaster';
import { counterMasterRefund, shortenRemaining, refundSubWeaponCooldownMap, refundChargeReadyAts, refundRemainingMs, refundChargeStart, refundHitCount, refundAlchemyChannel, type CounterMasterRefundInput } from './counterMaster';
import type { SubWeaponKey } from '../types/game';

describe('counter-master v2: 成立時リファンド(Lv1 40% / Lv2 70% / Lv3 100%)', () => {
  it('残りCDをLv別割合ぶん前倒しする', () => {
    // now=1000, end=2000 → 残り1000ms
    expect(refundCounterCooldown(2000, 1000, 1)).toBeCloseTo(1600, 10); // 40%返還=残り600
    expect(refundCounterCooldown(2000, 1000, 2)).toBeCloseTo(1300, 10); // 70%返還=残り300
    expect(refundCounterCooldown(2000, 1000, 3)).toBe(1000);            // 100%=即座に次の構え可
  });

  it('未所持(Lv0)は完全に無変換=スキル無しの挙動に影響ゼロ', () => {
    expect(refundCounterCooldown(2000, 1000, 0)).toBe(2000);
  });

  it('残りCDが無い(既に明けている)時は何もしない', () => {
    expect(refundCounterCooldown(1000, 1000, 3)).toBe(1000);
    expect(refundCounterCooldown(500, 1000, 3)).toBe(500); // 過去のendはそのまま(巻き"戻さ"ない)
  });

  it('範囲外Lvはclampされる(負→Lv0扱い/4以上→Lv3扱い)', () => {
    expect(refundCounterCooldown(2000, 1000, -1)).toBe(2000);
    expect(refundCounterCooldown(2000, 1000, 9)).toBe(1000);
  });

  it('定数表はLv0=0(未所持に効果なし)から単調増加でLv3=1(全額)', () => {
    expect(COUNTER_MASTER_REFUND_FRAC_BY_LEVEL[0]).toBe(0);
    expect(COUNTER_MASTER_REFUND_FRAC_BY_LEVEL[3]).toBe(1);
    for (let i = 1; i < COUNTER_MASTER_REFUND_FRAC_BY_LEVEL.length; i++) {
      expect(COUNTER_MASTER_REFUND_FRAC_BY_LEVEL[i]).toBeGreaterThan(COUNTER_MASTER_REFUND_FRAC_BY_LEVEL[i - 1]);
    }
  });
});

// 社長指示2026-11-22「近接(カウンター)、サブウェポン、リロード 全てを短縮」: 成立時の前倒しを全部まとめた純関数。

const base = (over: Partial<CounterMasterRefundInput['player']> = {}, lv = 1, extra: Partial<CounterMasterRefundInput> = {}): CounterMasterRefundInput => ({
  counterMasterLv: lv, nowMs: 1000, gameTime: 500,
  player: {
    counterCooldownEnd: 2000,
    subWeapons: ['decoy', 'turret'] as SubWeaponKey[],
    subWeaponCooldowns: { decoy: 1500, turret: 400 },
    reloadEndsAt: 2000, reloadingWeaponId: 'g1',
    katanaDashCooldownEnd: 0, katanaDashUntil: 0,
    huntingChargeStartedAt: 0, huntingCharged: false,
    whipHitCount: 0, whipCharged: false,
    alchemyChannelStartedAt: 0, alchemyRhythm: undefined,
    ...over,
  },
  sensorMineCharges: [], supportSniperCdMs: 0,
  huntingChargeMs: 2000, whipChargeHits: 40, alchemyChannelMs: 5000,
  ...extra,
});

describe('カウンターマスター: 近接・サブウェポン・リロードの前倒し(counterMasterRefund)', () => {
  it('共通の前倒し: Lv別割合・残り無しは不変・割合1で即', () => {
    expect(shortenRemaining(2000, 1000, 0.4)).toBeCloseTo(1600, 10);
    expect(shortenRemaining(2000, 1000, 1)).toBe(1000);
    expect(shortenRemaining(900, 1000, 1)).toBe(900);
    expect(shortenRemaining(2000, 1000, 0)).toBe(2000);
  });

  it('Lv0 は何も変えない(空の結果)', () => {
    expect(counterMasterRefund(base({}, 0))).toEqual({ player: {} });
  });

  it('Lv1(40%): 近接CD・残りのあるサブウェポン・リロードを前倒し、明けているサブは触らない', () => {
    const r = counterMasterRefund(base({}, 1));
    expect(r.player.counterCooldownEnd).toBeCloseTo(1600, 10);
    expect(r.player.subWeaponCooldowns!.decoy).toBeCloseTo(1500 - 1000 * 0.4, 10);
    expect(r.player.subWeaponCooldowns!.turret).toBe(400); // 既に明けている
    expect(r.player.reloadEndsAt).toBeCloseTo(1600, 10);
  });

  it('Lv2(70%)', () => {
    const r = counterMasterRefund(base({}, 2));
    expect(r.player.counterCooldownEnd).toBeCloseTo(1300, 10);
    expect(r.player.subWeaponCooldowns!.decoy).toBeCloseTo(800, 10);
    expect(r.player.reloadEndsAt).toBeCloseTo(1300, 10);
  });

  it('Lv3(100%): 全部その場で使える', () => {
    const r = counterMasterRefund(base({}, 3));
    expect(r.player.counterCooldownEnd).toBe(1000);
    expect(r.player.subWeaponCooldowns!.decoy).toBe(500);
    expect(r.player.reloadEndsAt).toBe(1000);
  });

  it('リロード中でなければリロードは触らない・装備していないサブの帳簿も触らない', () => {
    const r = counterMasterRefund(base({ reloadingWeaponId: '', subWeapons: ['turret'] }, 3));
    expect(r.player.reloadEndsAt).toBeUndefined();
    expect(r.player.subWeaponCooldowns).toBeUndefined();
  });

  it('残りが何も無ければ何も返さない', () => {
    const r = counterMasterRefund(base({ counterCooldownEnd: 900, subWeaponCooldowns: {}, reloadingWeaponId: '' }, 3));
    expect(r).toEqual({ player: {} });
  });

  it('センサー地雷のチャージ・援護射撃の残りms(装備中だけ)', () => {
    const r = counterMasterRefund(base({ subWeapons: ['sensor-mine', 'support-sniper'] }, 2, { sensorMineCharges: [1500, 300], supportSniperCdMs: 3000 }));
    expect(r.sensorMineCharges![0]).toBeCloseTo(800, 10);
    expect(r.sensorMineCharges![1]).toBe(300);
    expect(r.supportSniperCdMs).toBeCloseTo(900, 10);
    const none = counterMasterRefund(base({ subWeapons: [] }, 2, { sensorMineCharges: [1500], supportSniperCdMs: 3000 }));
    expect(none.sensorMineCharges).toBeUndefined();
    expect(none.supportSniperCdMs).toBeUndefined();
  });

  it('刀の一閃のCD: 走りの最中は着地より前へは縮めない', () => {
    const r = counterMasterRefund(base({ subWeapons: ['katana'], katanaDashUntil: 1200, katanaDashCooldownEnd: 3200 }, 3));
    expect(r.player.katanaDashCooldownEnd).toBe(1200);
  });

  it('狩猟(溜め型)・鞭(回数型)・錬金術(溜め)', () => {
    // 狩猟: 開始1300・長さ2000 → 終わり3300、gameTime 1500 で残り1800。50% → 900縮む=開始400
    const h = refundChargeStart(1300, false, 1500, 2000, 0.5); // 終わり3300・残り1800 → 900縮む
    expect(h.startedAt).toBeCloseTo(400, 10);
    expect(refundChargeStart(1300, false, 1500, 2000, 1)).toEqual({ startedAt: 1300, charged: true });
    expect(refundChargeStart(0, false, 1500, 2000, 1)).toEqual({ startedAt: 0, charged: false }); // 溜めていない
    // 鞭: 40ヒット中10 → 残り30、40%=12
    expect(refundHitCount(10, false, 40, 0.4)).toEqual({ count: 22, charged: false });
    expect(refundHitCount(10, false, 40, 1)).toEqual({ count: 40, charged: true });
    expect(refundHitCount(40, true, 40, 1)).toEqual({ count: 40, charged: true });
    // 錬金術: 開始0・長さ5000・cut 500 → 終わり4500。gameTime 1500 → 残り3000、70% → cut +2100
    const rh = { startedAt: 0, cutMs: 500, hits: 1, rings: [] };
    expect(refundAlchemyChannel(rh, 5000, 1500, 0.7)!.cutMs).toBeCloseTo(2600, 10);
    expect(refundAlchemyChannel(undefined, 5000, 1500, 0.7)).toBeUndefined();
  });

  it('補助関数は変化が無ければ同じ参照を返す', () => {
    const m = { decoy: 100 };
    expect(refundSubWeaponCooldownMap(m, ['decoy'], 500, 1)).toBe(m);
    const c = [100];
    expect(refundChargeReadyAts(c, 500, 1)).toBe(c);
    expect(refundRemainingMs(0, 1)).toBe(0);
  });
});

describe('カウンターマスター: 成立箇所の漏れ止め', () => {
  it('lastCounterSuccessTime を打刻する箇所の数 = applyCounterMasterRefund の呼び出し数(ファイルごと)', () => {
    const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '!../**/*.test.tsx'], {
      eager: true, import: 'default', query: '?raw',
    }) as Record<string, string>;
    let stamps = 0;
    for (const [f, src] of Object.entries(sources)) {
      const s = (src.match(/lastCounterSuccessTime: (?!0\b|number\b)[A-Za-z_]\w*(?![\w.])/g) ?? []).length;
      const c = (src.match(/applyCounterMasterRefund\(\w/g) ?? []).length;
      expect({ file: f, calls: c }).toEqual({ file: f, calls: s });
      stamps += s;
    }
    expect(stamps).toBeGreaterThanOrEqual(8);
  });
});
