// v0.25.2480(DEVELOPMENT_LOG v0.25.2479★未決1解消): 守護霊カウンターの「成立→効果」変換のうち
// 純関数部分(請求レジストリの寿命/一回性・確定クリダメージ式)の検証。
// per-bossハンドラへの合流(配線)はユニットテスト対象外の方針どおり静的検証(テスト方針=CLAUDE.md)。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setGhostCounterClaim, peekGhostCounterClaim, consumeGhostCounterClaim, clearGhostCounterClaim,
  ghostCounterDamage, GHOST_COUNTER_CLAIM_TTL_MS, type GhostCounterClaim,
} from './ghostCounter';
import { BOSS_CRIT_DAMAGE_MULT } from '../store/gameStore';

const claimAt = (atMs: number, bossId = 'boss-1'): GhostCounterClaim =>
  ({ bossId, ghostX: 100, ghostY: 200, dmg: 60, atMs });

describe('ghostCounterDamage: プレイヤーのカウンター反撃と同式の借用装備版(スキル倍率なし)', () => {
  it('借用銃damage × ボスクリ倍率(BOSS_CRIT_DAMAGE_MULT)', () => {
    expect(ghostCounterDamage(40)).toBe(Math.round(40 * BOSS_CRIT_DAMAGE_MULT));
  });
  it('銃なし(undefined)はプレイヤーと同じフォールバック12を基準にする', () => {
    expect(ghostCounterDamage(undefined)).toBe(Math.round(12 * BOSS_CRIT_DAMAGE_MULT));
  });
  it('四捨五入+最低1の床(プレイヤー式のMath.max(1, Math.round(...))と同じ)', () => {
    expect(ghostCounterDamage(0)).toBe(1);
    expect(ghostCounterDamage(0.1)).toBe(1); // round(0.5)=0か1かに依らず床1
    expect(ghostCounterDamage(1.3)).toBe(Math.max(1, Math.round(1.3 * BOSS_CRIT_DAMAGE_MULT)));
  });
});

describe('カウンター請求レジストリ: 1請求=最大1成立・鮮度TTL・対象ボス限定', () => {
  beforeEach(() => clearGhostCounterClaim());

  it('積んだ請求は期限内なら覗け、対象ボスが消費できる(消費後は消える)', () => {
    setGhostCounterClaim(claimAt(1000));
    expect(peekGhostCounterClaim(1000 + GHOST_COUNTER_CLAIM_TTL_MS)?.bossId).toBe('boss-1');
    expect(consumeGhostCounterClaim('boss-1', 1050)?.dmg).toBe(60);
    expect(consumeGhostCounterClaim('boss-1', 1051)).toBeNull(); // 二重成立しない
    expect(peekGhostCounterClaim(1051)).toBeNull();
  });

  it('対象違いのボスは消費できず、請求は残る(正しい担当が後から消費できる)', () => {
    setGhostCounterClaim(claimAt(1000));
    expect(consumeGhostCounterClaim('boss-2', 1010)).toBeNull();
    expect(consumeGhostCounterClaim('boss-1', 1020)).not.toBeNull();
  });

  it('TTLを過ぎた請求は流れる(後出しパリィ防止)', () => {
    setGhostCounterClaim(claimAt(1000));
    expect(consumeGhostCounterClaim('boss-1', 1000 + GHOST_COUNTER_CLAIM_TTL_MS + 1)).toBeNull();
    expect(peekGhostCounterClaim(1000 + GHOST_COUNTER_CLAIM_TTL_MS + 1)).toBeNull();
  });

  it('新しい請求は古い請求を上書きする(常に最新1件)', () => {
    setGhostCounterClaim(claimAt(1000, 'boss-1'));
    setGhostCounterClaim(claimAt(1100, 'boss-9'));
    expect(consumeGhostCounterClaim('boss-1', 1110)).toBeNull();
    expect(consumeGhostCounterClaim('boss-9', 1110)?.atMs).toBe(1100);
  });
});
