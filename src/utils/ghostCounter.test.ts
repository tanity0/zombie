// v0.25.2480(DEVELOPMENT_LOG v0.25.2479★未決1解消): 守護霊カウンターの「成立→効果」変換のうち
// 純関数部分(請求レジストリの寿命/一回性・確定クリダメージ式)の検証。
// ★判定時置換ミラー(社長裁定2026-08-27「守護霊もプレイヤーの動きに揃える」・GHOST_PARITY_LEDGER.md
// ★仕様v2)で請求の意味が変わった: atMs=**振り始め**・窓=[振り始め, +COUNTER_ACCEPT_MS(300)]・
// 窓の生死の正本=ghostCounterWindowEnd(被弾で閉じる)・位置ゲートは城ボス接触経路(contactGate)のみ。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setGhostCounterClaim, peekGhostCounterClaim, consumeGhostCounterClaim, clearGhostCounterClaim,
  ghostCounterDamage, GHOST_COUNTER_CLAIM_MAX_AGE_MS, type GhostCounterClaim,
} from './ghostCounter';
import { BOSS_CRIT_DAMAGE_MULT, COUNTER_ACCEPT_MS, useGameStore } from '../store/gameStore';
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

describe('カウンター請求レジストリ: 1請求=最大1成立・窓=振り始め+COUNTER_ACCEPT_MS・対象ボス限定', () => {
  beforeEach(() => {
    clearGhostCounterClaim();
    useGameStore.setState({ summons: [] }); // 霊不在=窓(ghostCounterWindowEnd)チェックは寛容側で素通し
  });

  it('窓の長さはプレイヤーの受付(COUNTER_ACCEPT_MS)と同じ定数を参照する(手写し禁止の機械検査)', () => {
    expect(GHOST_COUNTER_CLAIM_MAX_AGE_MS).toBe(COUNTER_ACCEPT_MS);
  });

  it('積んだ請求は期限内なら覗け、対象ボスが消費できる(消費後は消える)', () => {
    setGhostCounterClaim(claimAt(1000));
    expect(peekGhostCounterClaim(1000 + GHOST_COUNTER_CLAIM_MAX_AGE_MS)?.bossId).toBe('boss-1');
    expect(consumeGhostCounterClaim('boss-1', 1050)?.dmg).toBe(60);
    expect(consumeGhostCounterClaim('boss-1', 1051)).toBeNull(); // 二重成立しない
    expect(peekGhostCounterClaim(1051)).toBeNull();
  });

  it('対象違いのボスは消費できず、請求は残る(正しい担当が後から消費できる)', () => {
    setGhostCounterClaim(claimAt(1000));
    expect(consumeGhostCounterClaim('boss-2', 1010)).toBeNull();
    expect(consumeGhostCounterClaim('boss-1', 1020)).not.toBeNull();
  });

  it('窓(振り始め+300ms)を過ぎた請求は流れる+直後の通常スイングで窓が開き直しても延命しない', () => {
    setGhostCounterClaim(claimAt(1000));
    expect(consumeGhostCounterClaim('boss-1', 1000 + GHOST_COUNTER_CLAIM_MAX_AGE_MS + 1)).toBeNull();
    expect(peekGhostCounterClaim(1000 + GHOST_COUNTER_CLAIM_MAX_AGE_MS + 1)).toBeNull();
  });

  it('新しい請求は古い請求を上書きする(常に最新1件)', () => {
    setGhostCounterClaim(claimAt(1000, 'boss-1'));
    setGhostCounterClaim(claimAt(1100, 'boss-9'));
    expect(consumeGhostCounterClaim('boss-1', 1110)).toBeNull();
    expect(consumeGhostCounterClaim('boss-9', 1110)?.atMs).toBe(1100);
  });
});

// ★判定時置換ミラー: 窓の生死の正本=ghostCounterWindowEnd(振り始めに+300で開き・被弾で0に閉じる=
// gameStore.damageSummon)。請求の有効判定はこの窓を読む(被弾クローズがプレイヤーの
// 「被弾で窓が閉じる」と同じ規則で効く)。
describe('窓の正本=ghostCounterWindowEnd(被弾クローズ)', () => {
  const mkGhost = (nowMs: number, windowEnd: number): Summon => ({
    id: 'ghost-test', x: 100, y: 200, width: 20, height: 20, speed: 200,
    health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
    createdAt: nowMs, lastHit: 0, ghostBossId: 'boss-1', ghostCounterWindowEnd: windowEnd,
  });
  beforeEach(() => clearGhostCounterClaim());

  it('窓が開いている(now <= windowEnd)間は成立する', () => {
    const now = 5000;
    useGameStore.setState({ summons: [mkGhost(now, now + 100)] });
    setGhostCounterClaim(claimAt(now));
    expect(peekGhostCounterClaim(now + 50)?.bossId).toBe('boss-1');
  });

  it('被弾で窓が閉じた(windowEnd=0)請求は成立しない(プレイヤーの被弾クローズと同じ規則)', () => {
    const now = 5000;
    useGameStore.setState({ summons: [mkGhost(now, 0)] });
    setGhostCounterClaim(claimAt(now));
    expect(peekGhostCounterClaim(now + 50)).toBeNull();
    expect(consumeGhostCounterClaim('boss-1', now + 50)).toBeNull();
  });
});

// ★判定時置換ミラー(監査R1): 位置ゲート(矩形重なり)は**城ボスの接触パリィ経路(contactGate:true)
// だけ**に残す——他経路は成立の瞬間に「攻撃の成立域×守護霊の体」を呼び出し側が再評価するため。
// contactGate を外すと giantbat のジャンプ攻撃がどんな距離からでも成立する(v2594/2597の再発)=
// このテストが落ちる。
describe('位置ゲート: contactGate(城ボス接触)だけ間合い必須・他経路(既定)は請求側では見ない', () => {
  const BOSS_ID = 'boss-far';
  /** ボスから遠く離れた位置にゴーストを置いた盤面を作り、その時刻の請求を積む(窓は開けておく)。 */
  const setupFarGhost = (nowMs: number) => {
    useGameStore.getState().resetGame('warrior');
    const boss = spawnEnemyAt('giantbat', 0, 0, useGameStore.getState().gameTime);
    boss.id = BOSS_ID;
    const ghost: Summon = {
      id: 'ghost-test', x: 4000, y: 4000, width: 32, height: 32, speed: 200, // 間合いの遥か外
      health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
      createdAt: nowMs, lastHit: 0, ghostBossId: BOSS_ID, ghostCounterWindowEnd: nowMs + COUNTER_ACCEPT_MS,
    };
    useGameStore.setState({ enemies: [boss], summons: [ghost] });
    setGhostCounterClaim({ bossId: BOSS_ID, ghostX: 4000, ghostY: 4000, dmg: 60, atMs: nowMs });
  };

  beforeEach(() => clearGhostCounterClaim());

  it('contactGate は間合いの外なら成立しない(ジャンプ攻撃の遠距離カウンター封じ=v2597固定)', () => {
    const now = Date.now();
    setupFarGhost(now);
    expect(peekGhostCounterClaim(now, { contactGate: true })).toBeNull();
    expect(consumeGhostCounterClaim(BOSS_ID, now, { contactGate: true })).toBeNull();
  });

  it('既定(opts無し)は請求側では位置を見ない(成立域の再評価は消費側の各経路が行う)', () => {
    const now = Date.now();
    setupFarGhost(now);
    expect(peekGhostCounterClaim(now)?.bossId).toBe(BOSS_ID);
    expect(consumeGhostCounterClaim(BOSS_ID, now)?.dmg).toBe(60);
  });

  it('contactGate は矩形が重なっていれば成立する(プレイヤーと同じ幾何=playerHitbox×enemyContactBox)', () => {
    const now = Date.now();
    useGameStore.getState().resetGame('warrior');
    const boss = spawnEnemyAt('thor', 0, 0, useGameStore.getState().gameTime);
    boss.id = BOSS_ID;
    boss.x = 0; boss.y = 0; boss.width = 40; boss.height = 40;
    const ghost: Summon = {
      id: 'ghost-test', x: 20, y: 20, width: 20, height: 20, speed: 200, // 大きく重なる
      health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
      createdAt: now, lastHit: 0, ghostBossId: BOSS_ID, ghostCounterWindowEnd: now + COUNTER_ACCEPT_MS,
    };
    useGameStore.setState({ enemies: [boss], summons: [ghost] });
    setGhostCounterClaim({ bossId: BOSS_ID, ghostX: 30, ghostY: 30, dmg: 60, atMs: now });
    expect(peekGhostCounterClaim(now, { contactGate: true })?.bossId).toBe(BOSS_ID);
    expect(consumeGhostCounterClaim(BOSS_ID, now, { contactGate: true })?.dmg).toBe(60);
  });
});
