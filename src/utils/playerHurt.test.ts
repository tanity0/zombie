import { describe, it, expect } from 'vitest';
import { playerHurtTier, playerHurtReactionOf, PLAYER_HURT_TIERS, isHurtGunLocked , isHurtMoveLocked, isHurtCancelled, knockbackUntilAfterStop, blastKnockbackOf, blastPushDir } from './playerHurt';

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

describe('被弾ノックバックはヒットストップが明けてから(社長指摘2026-10-08「ジャンプ攻撃食らっても押し出されなくなってる」)', () => {
  it('ストップ中なら明けた時刻から押し出しの長さを数える。ストップが無ければ今から', () => {
    expect(knockbackUntilAfterStop(1000, 1190, 260)).toBe(1450);
    expect(knockbackUntilAfterStop(1000, 0, 260)).toBe(1260);
    expect(knockbackUntilAfterStop(1000, 900, 440)).toBe(1440); // もう明けているストップは関係ない
  });
});

describe('hurtCancelledAt — 被弾反撃で硬直を打ち切る(research/HIT_RETALIATION.md §4)', () => {
  const hurt = { lastHurtAt: 1000, lastHurtTier: 2 as const };
  it('打ち切りが無ければ従来どおり(重段=1000ms動けない・撃てない)', () => {
    expect(isHurtMoveLocked(hurt, 1500)).toBe(true);
    expect(isHurtGunLocked(hurt, 1500)).toBe(true);
    expect(isHurtCancelled(hurt, 1500)).toBe(false);
  });
  it('打ち切った時刻から、移動停止も銃の停止も終わる(それより前は従来どおり)', () => {
    const p = { ...hurt, hurtCancelledAt: 1200 };
    expect(isHurtMoveLocked(p, 1199)).toBe(true);
    expect(isHurtMoveLocked(p, 1200)).toBe(false);
    expect(isHurtGunLocked(p, 1199)).toBe(true);
    expect(isHurtGunLocked(p, 1200)).toBe(false);
    expect(isHurtCancelled(p, 1200)).toBe(true);
  });
  it('次の被弾(lastHurtAt が打ち切りより新しい)では打ち切りは効かない=また普通に固まる', () => {
    const p = { lastHurtAt: 2000, lastHurtTier: 1 as const, hurtCancelledAt: 1200 };
    expect(isHurtCancelled(p, 2100)).toBe(false);
    expect(isHurtMoveLocked(p, 2100)).toBe(true);
    expect(isHurtGunLocked(p, 2100)).toBe(true);
  });
  it('被弾の記録が無ければ(lastHurtAt 未設定)打ち切りも何も起きない', () => {
    expect(isHurtCancelled({ hurtCancelledAt: 500 }, 600)).toBe(false);
    expect(isHurtMoveLocked({ hurtCancelledAt: 500 }, 600)).toBe(false);
  });
});

describe('爆風で食らった時の押し出しは被弾の段に従う(社長指摘2026-10-09「ジャンプ攻撃食らった時、まだ吹っ飛んでない」)', () => {
  it('技の指定が無ければ、接触で食らった時と同じ段の押し出し(重いほど速く長い)', () => {
    for (const tier of [0, 1, 2] as const) {
      const r = PLAYER_HURT_TIERS[tier];
      expect(blastKnockbackOf(460, tier)).toEqual({ speed: 460 * r.kbSpeedMult, ms: r.kbMs });
    }
    const light = blastKnockbackOf(460, 0), heavy = blastKnockbackOf(460, 2);
    expect(heavy.speed * heavy.ms).toBeGreaterThan(light.speed * light.ms * 3);
  });
  it('段が付かなかった時(実ダメージ無し)は軽の段=旧と同じ', () => {
    expect(blastKnockbackOf(460, undefined)).toEqual({ speed: 460, ms: PLAYER_HURT_TIERS[0].kbMs });
  });
  it('技ごとの押し量が指定されていれば段より優先(英雄・偶像・賞金首の技)', () => {
    expect(blastKnockbackOf(460, 2, 900, 200)).toEqual({ speed: 900, ms: 200 });
    expect(blastKnockbackOf(460, 2, 900)).toEqual({ speed: 900, ms: PLAYER_HURT_TIERS[2].kbMs });
  });
});

describe('爆風の弾き出す向き(社長指摘2026-10-10「ど真ん中から動かずに食らうと吹き飛ばない」)', () => {
  it('爆心からずれていれば、爆心から離れる向き(長さ1)', () => {
    expect(blastPushDir(30, 40, 1, 0)).toEqual({ x: 0.6, y: 0.8 });
  });
  it('爆心の真上なら、向いている方の逆へ(長さ1・0にならない)', () => {
    const b = blastPushDir(0, 0, 1, 0);
    expect(b.x).toBe(-1); expect(b.y).toBeCloseTo(0);
    const d = blastPushDir(0, 0, 3, 4);
    expect(d.x).toBeCloseTo(-0.6); expect(d.y).toBeCloseTo(-0.8);
  });
  it('向きも無ければ画面の奥へ', () => {
    expect(blastPushDir(0, 0, 0, 0)).toEqual({ x: 0, y: -1 });
  });
});
