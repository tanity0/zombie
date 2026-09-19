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
  it('段ごとの長さだけ true(軽420 / 中700 / 重1000・社長指示2026-09-17で二度重くした)', () => {
    const t = 10000;
    expect(isHurtGunLocked({ lastHurtAt: t, lastHurtTier: 0 }, t + 419)).toBe(true);
    expect(isHurtGunLocked({ lastHurtAt: t, lastHurtTier: 0 }, t + 420)).toBe(false);
    expect(isHurtGunLocked({ lastHurtAt: t, lastHurtTier: 1 }, t + 699)).toBe(true);
    expect(isHurtGunLocked({ lastHurtAt: t, lastHurtTier: 1 }, t + 700)).toBe(false);
    expect(isHurtGunLocked({ lastHurtAt: t, lastHurtTier: 2 }, t + 999)).toBe(true);
    expect(isHurtGunLocked({ lastHurtAt: t, lastHurtTier: 2 }, t + 1000)).toBe(false);
  });

  // ★社長指示2026-09-17「食らった重さがほしい。エルデンリングをまねて」。
  it('★移動ロックはしゃがみと同じ長さ(しゃがんだまま動けない・社長指示2026-09-17)', () => {
    for (const r of PLAYER_HURT_TIERS) {
      expect(r.moveLockMs).toBeGreaterThan(0);
      expect(r.moveLockMs).toBe(r.crouchMs); // しゃがんでいる間はずっと動けない
    }
  });

  it('★移動ロックは段ごとの長さだけ true(軽420 / 中700 / 重1000)', () => {
    const t = 10000;
    expect(isHurtMoveLocked({ lastHurtAt: t, lastHurtTier: 0 }, t + 419)).toBe(true);
    expect(isHurtMoveLocked({ lastHurtAt: t, lastHurtTier: 0 }, t + 420)).toBe(false);
    expect(isHurtMoveLocked({ lastHurtAt: t, lastHurtTier: 1 }, t + 699)).toBe(true);
    expect(isHurtMoveLocked({ lastHurtAt: t, lastHurtTier: 2 }, t + 999)).toBe(true);
    expect(isHurtMoveLocked({ lastHurtAt: t, lastHurtTier: 2 }, t + 1000)).toBe(false);
  });

  it('★しゃがみの絵と同じ長さ(絵と実態を一致させるのが仕様)', () => {
    for (const r of PLAYER_HURT_TIERS) expect(r.gunLockMs).toBe(r.crouchMs);
  });

  // ★社長指示2026-09-17(2回目)「慣性で吹き飛ぶ感じ」。
  // ★社長指摘2026-09-17(4回目)「吹き飛ばなくなった?」= 軽段を0.7倍にして旧より弱くしていた。
  it('★どの段も旧の飛距離(約60px)を下回らない', () => {
    const OLD_PX = 460 * 0.260 / 2; // 旧: 全段一律 460px/s・260ms・線形減衰 = 約60px
    for (const r of PLAYER_HURT_TIERS) {
      const px = 460 * r.kbSpeedMult * (r.kbMs / 1000) / 2;
      expect(px).toBeGreaterThanOrEqual(OLD_PX - 0.5);
    }
  });

  it('★吹き飛びは段が重いほど速く・長く(全段一律だったのを段ごとに)', () => {
    const [lo, mid, hi] = PLAYER_HURT_TIERS;
    expect(lo.kbSpeedMult).toBeLessThan(mid.kbSpeedMult);
    expect(mid.kbSpeedMult).toBeLessThan(hi.kbSpeedMult);
    expect(lo.kbMs).toBeLessThan(mid.kbMs);
    expect(mid.kbMs).toBeLessThan(hi.kbMs);
  });

  it('★「飛ぶ → 動けない → 撃てない」の順序が保たれている', () => {
    for (const r of PLAYER_HURT_TIERS) {
      expect(r.kbMs).toBeLessThan(r.moveLockMs);  // 飛び終わってもまだ動けない
      // ★社長指示2026-09-17(3回目)「ちゃんとしゃがんだまま動けなくして」。
      // 動けない時間 = しゃがみの絵 = 銃ロック。**絵と実態が完全に一致する。**
      expect(r.moveLockMs).toBe(r.crouchMs);
      expect(r.gunLockMs).toBe(r.crouchMs);
    }
  });

  it('まだ一度も食らっていなければ止めない', () => {
    expect(isHurtGunLocked({}, 10000)).toBe(false);
  });

  it('打刻が未来(時計のズレ)でも止めない', () => {
    expect(isHurtGunLocked({ lastHurtAt: 10000, lastHurtTier: 1 }, 9000)).toBe(false);
  });
});
