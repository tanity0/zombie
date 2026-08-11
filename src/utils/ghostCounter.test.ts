// v0.25.2480(DEVELOPMENT_LOG v0.25.2479★未決1解消): 守護霊カウンターの「成立→効果」変換のうち
// 純関数部分(請求レジストリの寿命/一回性・確定クリダメージ式)の検証。
// per-bossハンドラへの合流(配線)はユニットテスト対象外の方針どおり静的検証(テスト方針=CLAUDE.md)。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setGhostCounterClaim, peekGhostCounterClaim, consumeGhostCounterClaim, clearGhostCounterClaim,
  ghostCounterDamage, GHOST_COUNTER_CLAIM_TTL_MS, type GhostCounterClaim,
} from './ghostCounter';
import { BOSS_CRIT_DAMAGE_MULT, useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import type { Summon } from '../types/game';

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

// v0.25.2597(社長報告「赤いサークルとかなり離れた位置でカウンターを取っていた」= giantbatのジャンプ攻撃):
// 位置ゲートは**ボスの型**ではなく**経路(その技のダメージがどこに置かれているか)**で切り替わる、の固定。
//  - 接触型(既定・dashParried相当): 成立の瞬間にボスの間合いに居ること。
//  - ゾーン型(inAttackZone=呼び出し側がゾーンの幾何で確認済み): 間合いは見ない。
// これを型分岐(旧: `boss.type !== 'giantbat'`)へ戻すと、giantbatは両方の技を持つため
// ジャンプ(接触型)がどんな距離からでも成立する=このテストが落ちる。
describe('位置ゲート: 接触型は間合い必須・ゾーン型は素通し(型では切り替えない)', () => {
  const BOSS_ID = 'boss-far';
  /** ボスから遠く離れた位置にゴーストを置いた盤面を作り、その時刻の請求を積む。 */
  const setupFarGhost = (nowMs: number) => {
    useGameStore.getState().resetGame('warrior');
    const boss = spawnEnemyAt('giantbat', 0, 0, useGameStore.getState().gameTime);
    boss.id = BOSS_ID;
    const ghost: Summon = {
      id: 'ghost-test', x: 4000, y: 4000, width: 32, height: 32, speed: 200, // 間合いの遥か外
      health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
      createdAt: nowMs, lastHit: 0, ghostBossId: BOSS_ID,
    };
    useGameStore.setState({ enemies: [boss], summons: [ghost] });
    setGhostCounterClaim({ bossId: BOSS_ID, ghostX: 4000, ghostY: 4000, dmg: 60, atMs: nowMs });
  };

  beforeEach(() => clearGhostCounterClaim());

  it('接触型(既定)は、間合いの外なら giantbat でも成立しない(ジャンプ攻撃の遠距離カウンター封じ)', () => {
    const now = Date.now();
    setupFarGhost(now);
    expect(peekGhostCounterClaim(now)).toBeNull();
    expect(consumeGhostCounterClaim(BOSS_ID, now)).toBeNull();
  });

  it('ゾーン型(inAttackZone)は、間合いの外でも成立する(衝撃波/帯はボスの体の距離と無関係)', () => {
    const now = Date.now();
    setupFarGhost(now);
    expect(peekGhostCounterClaim(now, { inAttackZone: true })?.bossId).toBe(BOSS_ID);
    expect(consumeGhostCounterClaim(BOSS_ID, now, { inAttackZone: true })?.dmg).toBe(60);
  });
});

// GHOST-COUNTER-PARITY(社長指示2「位置条件をプレイヤーと同じ『矩形が重なっている』へ。74pxの緩さを
// 無くす」): 接触型(既定=inAttackZoneなし)の位置ゲートが、旧GHOST_MELEE_RANGE=74px(距離)ではなく
// checkPlayerEnemyCollisionsと同じ矩形オーバーラップになったことの固定。
describe('位置条件: 接触型は矩形オーバーラップが必須(74pxの距離だけでは成立しない)', () => {
  const BOSS_ID = 'boss-thor';
  // isHiddenBossType(thor)はenemyContactBoxが生のAABB({x,y,width,height})をそのまま返すので、
  // 座標計算がシンプルになる(spawnEnemyAtのアセット依存な帯計算を避ける)。
  const setupThor = (ghostX: number, ghostY: number, nowMs: number) => {
    useGameStore.getState().resetGame('warrior');
    const boss = spawnEnemyAt('thor', 0, 0, useGameStore.getState().gameTime);
    boss.id = BOSS_ID;
    boss.x = 0; boss.y = 0; boss.width = 40; boss.height = 40; // 矩形: [0,40]x[0,40]
    const ghost: Summon = {
      id: 'ghost-test', x: ghostX, y: ghostY, width: 20, height: 20, speed: 200,
      health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
      createdAt: nowMs, lastHit: 0, ghostBossId: BOSS_ID,
    };
    useGameStore.setState({ enemies: [boss], summons: [ghost] });
    setGhostCounterClaim({ bossId: BOSS_ID, ghostX, ghostY, dmg: 60, atMs: nowMs });
  };

  beforeEach(() => clearGhostCounterClaim());

  it('旧基準(ボス縁から74px以内)を満たしても、矩形が重なっていなければ成立しない', () => {
    const now = Date.now();
    // ボス右端(x=40)から50px(<74px)離れた位置。旧GHOST_MELEE_RANGE基準なら成立していたはず。
    setupThor(90, 20, now);
    expect(peekGhostCounterClaim(now)).toBeNull();
    expect(consumeGhostCounterClaim(BOSS_ID, now)).toBeNull();
  });

  it('プレイヤーと同じ矩形(playerHitbox×enemyContactBox)が重なっていれば成立する', () => {
    const now = Date.now();
    // ゴースト[20,40]x[20,40]はボス[0,40]x[0,40]と大きく重なる。
    setupThor(20, 20, now);
    expect(peekGhostCounterClaim(now)?.bossId).toBe(BOSS_ID);
    expect(consumeGhostCounterClaim(BOSS_ID, now)?.dmg).toBe(60);
  });
});
