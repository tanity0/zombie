import { describe, it, expect } from 'vitest';
import { playerHurtTier, playerHurtReactionOf, PLAYER_HURT_TIERS, isHurtGunLocked , isHurtMoveLocked } from './playerHurt';

describe('playerHurtTier — 被弾の重さで段が変わる', () => {
  it('素の敵の攻撃力(最大HP120)が狙いどおりの段に落ちる', () => {
    expect(playerHurtTier(6, 120)).toBe(0);   // コウモリ=かすり
    expect(playerHurtTier(8, 120)).toBe(0);   // 骸骨
    expect(playerHurtTier(10, 120)).toBe(1);  // ゾンビ=まともに食らった
    expect(playerHurtTier(16, 120)).toBe(1);  // パンプキン
    expect(playerHurtTier(24, 120)).toBe(2);  // 深部/色つき=保たない一撃
    expect(playerHurtTier(141, 120)).toBe(2); // 最大級
  });
  it('境目はその値を含む(以上で上の段)', () => {
    expect(playerHurtTier(120 * 0.08, 120)).toBe(1);
    expect(playerHurtTier(120 * 0.08 - 0.01, 120)).toBe(0);
    expect(playerHurtTier(120 * 0.2, 120)).toBe(2);
    expect(playerHurtTier(120 * 0.2 - 0.01, 120)).toBe(1);
  });
  it('割合なので、最大HPが伸びると同じ被弾でも軽くなる', () => {
    expect(playerHurtTier(24, 120)).toBe(2);
    expect(playerHurtTier(24, 400)).toBe(0);
  });
  it('壊れた入力で落ちない(最大HP0/負のダメージ)', () => {
    expect(() => playerHurtTier(10, 0)).not.toThrow();
    expect(playerHurtTier(10, 0)).toBe(2);   // hp=1 扱い=必ず重
    expect(playerHurtTier(-5, 120)).toBe(0);
  });
});

describe('playerHurtReactionOf — 段が上がるほど長く止まる', () => {
  it('段の順に単調に増える(軽 < 中 < 重)', () => {
    const [a, b, c] = PLAYER_HURT_TIERS;
    expect(a.crouchMs).toBeLessThan(b.crouchMs);
    expect(b.crouchMs).toBeLessThan(c.crouchMs);
    expect(a.stopMs).toBeLessThan(b.stopMs);
    expect(b.stopMs).toBeLessThan(c.stopMs);
  });
  it('未定義・範囲外の段は軽へ丸める', () => {
    expect(playerHurtReactionOf(undefined)).toBe(PLAYER_HURT_TIERS[0]);
    expect(playerHurtReactionOf(9)).toBe(PLAYER_HURT_TIERS[0]);
    expect(playerHurtReactionOf(2)).toBe(PLAYER_HURT_TIERS[2]);
  });
});

describe('isHurtGunLocked — 被弾の復帰ディレイ(銃だけ止まる)', () => {
  it('段ごとの長さだけ true(軽300 / 中520 / 重800・社長指示2026-09-17で重くした)', () => {
    const t = 10000;
    expect(isHurtGunLocked({ lastHurtAt: t, lastHurtTier: 0 }, t + 299)).toBe(true);
    expect(isHurtGunLocked({ lastHurtAt: t, lastHurtTier: 0 }, t + 300)).toBe(false);
    expect(isHurtGunLocked({ lastHurtAt: t, lastHurtTier: 1 }, t + 519)).toBe(true);
    expect(isHurtGunLocked({ lastHurtAt: t, lastHurtTier: 1 }, t + 520)).toBe(false);
    expect(isHurtGunLocked({ lastHurtAt: t, lastHurtTier: 2 }, t + 799)).toBe(true);
    expect(isHurtGunLocked({ lastHurtAt: t, lastHurtTier: 2 }, t + 800)).toBe(false);
  });

  // ★社長指示2026-09-17「食らった重さがほしい。エルデンリングをまねて」。
  it('★移動ロックは「のけぞりより短い」(前半は動けない・後半は動けるが撃てない)', () => {
    for (const r of PLAYER_HURT_TIERS) {
      expect(r.moveLockMs).toBeGreaterThan(0);
      expect(r.moveLockMs).toBeLessThan(r.gunLockMs); // 全部止めると「操作を奪われた」=理不尽になる
    }
  });

  it('★移動ロックは段ごとの長さだけ true(軽120 / 中220 / 重380)', () => {
    const t = 10000;
    expect(isHurtMoveLocked({ lastHurtAt: t, lastHurtTier: 0 }, t + 119)).toBe(true);
    expect(isHurtMoveLocked({ lastHurtAt: t, lastHurtTier: 0 }, t + 120)).toBe(false);
    expect(isHurtMoveLocked({ lastHurtAt: t, lastHurtTier: 1 }, t + 219)).toBe(true);
    expect(isHurtMoveLocked({ lastHurtAt: t, lastHurtTier: 2 }, t + 379)).toBe(true);
    expect(isHurtMoveLocked({ lastHurtAt: t, lastHurtTier: 2 }, t + 380)).toBe(false);
  });

  it('★しゃがみの絵と同じ長さ(絵と実態を一致させるのが仕様)', () => {
    for (const r of PLAYER_HURT_TIERS) expect(r.gunLockMs).toBe(r.crouchMs);
  });

  it('まだ一度も食らっていなければ止めない', () => {
    expect(isHurtGunLocked({}, 10000)).toBe(false);
  });

  it('打刻が未来(時計のズレ)でも止めない', () => {
    expect(isHurtGunLocked({ lastHurtAt: 10000, lastHurtTier: 1 }, 9000)).toBe(false);
  });
});
