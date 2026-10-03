// CD_REWORK.md 確定2: counter-master v2(成立時のみCDリファンド)の検証。
import { describe, it, expect } from 'vitest';
import { refundCounterCooldown, COUNTER_MASTER_REFUND_FRAC_BY_LEVEL } from './counterMaster';

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
