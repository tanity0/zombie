// PACING_PUZZLE.md §6.38 B1(賞金首)の純関数ユニットテスト。
// runBountyTick(store書き込みを伴う本体)はここではテストしない(掟: 描画/店舗結合はテスト対象外)。
// ここでは「1分退場・戦闘中リセット・抑止ゲート」の3本を機械化する(B1の受け入れ条件)。
import { describe, it, expect } from 'vitest';
import {
  bountyEngagedNow, bountyLingerExpired, bountySpawnBlocked, pickActiveBounty, bountyMaxHealth,
  BOUNTY_LINGER_MS, BOUNTY_HIT_ENGAGE_MS, BOUNTY_BASE_HP,
} from './bountyTick';
import type { Enemy, EnemyType } from '../types/game';

describe('bountyEngagedNow — 交戦の定義(§2「dormant=falseかつ(距離<リーシュ半径 or 直近3秒被弾)」)', () => {
  it('dormant中は距離・被弾に関わらず非交戦', () => {
    expect(bountyEngagedNow({ dormant: true, distance: 0, msSinceHit: 0 }, 700)).toBe(false);
  });
  it('リーシュ半径未満なら交戦', () => {
    expect(bountyEngagedNow({ dormant: false, distance: 699, msSinceHit: 999999 }, 700)).toBe(true);
    expect(bountyEngagedNow({ dormant: false, distance: 700, msSinceHit: 999999 }, 700)).toBe(false); // 境界=含まない(<)
  });
  it('リーシュ半径の外でも直近3秒以内の被弾があれば交戦(戦闘中リセットの土台)', () => {
    expect(bountyEngagedNow({ dormant: false, distance: 5000, msSinceHit: BOUNTY_HIT_ENGAGE_MS }, 700)).toBe(true);
    expect(bountyEngagedNow({ dormant: false, distance: 5000, msSinceHit: BOUNTY_HIT_ENGAGE_MS + 1 }, 700)).toBe(false);
  });
});

describe('bountyLingerExpired — 滞在1分(gameTime基準・§2)', () => {
  it('59秒999msでは満了しない・60秒ちょうどで満了する', () => {
    expect(bountyLingerExpired(BOUNTY_LINGER_MS - 1, 0, 0)).toBe(false);
    expect(bountyLingerExpired(BOUNTY_LINGER_MS, 0, 0)).toBe(true);
  });
  it('lastEngagedAt未設定ならspawnedAtを起点にする(一度も交戦しないまま1分で去る)', () => {
    expect(bountyLingerExpired(BOUNTY_LINGER_MS - 1, undefined, 1000)).toBe(false);
    expect(bountyLingerExpired(1000 + BOUNTY_LINGER_MS, undefined, 1000)).toBe(true);
  });
  it('★戦闘中リセット: lastEngagedAtがgameTimeへ更新され続ける限り満了しない(=毎フレーム交戦ならいつまでも残る)', () => {
    // 「戦闘中は毎フレームリセット」を模した検算: 各フレームでlastEngagedAt=現在時刻に更新される想定なら
    // 経過は常に0付近に保たれ、BOUNTY_LINGER_MSにはまず到達しない。
    let lastEngagedAt = 0;
    for (let t = 0; t <= BOUNTY_LINGER_MS * 3; t += 100) {
      expect(bountyLingerExpired(t, lastEngagedAt, 0), `t=${t}`).toBe(false);
      lastEngagedAt = t; // このフレームは交戦中=リセット
    }
  });
});

describe('bountySpawnBlocked — 抑止ゲート(B1では用意+テストのみ・配線はB4)', () => {
  const ok = (): Parameters<typeof bountySpawnBlocked>[0] => ({
    bossFightNow: false, activeEvent: false, hiddenBossAlive: false, redNightActive: false,
    area: 2, storyBossOnly: false, labTheme: false, corridorMode: false, tutorialStage: false,
  });
  it('全条件クリアならブロックしない', () => {
    expect(bountySpawnBlocked(ok())).toBe(false);
  });
  it('各条件が単独でブロックする', () => {
    expect(bountySpawnBlocked({ ...ok(), bossFightNow: true })).toBe(true);
    expect(bountySpawnBlocked({ ...ok(), activeEvent: true })).toBe(true);
    expect(bountySpawnBlocked({ ...ok(), hiddenBossAlive: true })).toBe(true);
    expect(bountySpawnBlocked({ ...ok(), redNightActive: true })).toBe(true);
    expect(bountySpawnBlocked({ ...ok(), area: 1 })).toBe(true); // 初心者ゾーン(憲法第4条・エリア0-1)
    expect(bountySpawnBlocked({ ...ok(), area: 0 })).toBe(true);
    expect(bountySpawnBlocked({ ...ok(), storyBossOnly: true })).toBe(true);
    expect(bountySpawnBlocked({ ...ok(), labTheme: true })).toBe(true); // v6 B-5
    expect(bountySpawnBlocked({ ...ok(), corridorMode: true })).toBe(true); // v6 B-5
    expect(bountySpawnBlocked({ ...ok(), tutorialStage: true })).toBe(true);
  });
  it('area>=2なら初心者ゾーン条件には掛からない', () => {
    expect(bountySpawnBlocked({ ...ok(), area: 2 })).toBe(false);
  });
});

describe('bountyMaxHealth — 基準2000×実効難易度倍率(§3)', () => {
  it('エリア0・時刻0では基準値そのまま(倍率1.0)', () => {
    expect(bountyMaxHealth(0, 0)).toBe(BOUNTY_BASE_HP);
  });
  it('エリアが深いほど・時間が経つほど増える(単調)', () => {
    const a0 = bountyMaxHealth(0, 0);
    const a4 = bountyMaxHealth(4, 0);
    const t8 = bountyMaxHealth(0, 8 * 60 * 1000); // 8:00=仮想エリア4相当
    expect(a4).toBeGreaterThan(a0);
    expect(t8).toBeGreaterThan(a0);
    expect(t8).toBeCloseTo(a4, -1);
  });
});

describe('pickActiveBounty — 起きている個体を最優先(pickActiveIdolと同じ作法)', () => {
  const mk = (id: string, type: EnemyType, dormant: boolean): Enemy =>
    ({ id, type, dormant, x: 0, y: 0, width: 10, height: 10, health: 10, maxHealth: 10, speed: 10, damage: 0, lastHit: 0 } as Enemy);
  it('賞金首以外は無視する', () => {
    expect(pickActiveBounty([mk('a', 'zombie', false)])).toBeUndefined();
  });
  it('起きている個体があれば最優先で返す', () => {
    const dormantOne = mk('d', 'bounty-ranged', true);
    const awake = mk('a', 'bounty-melee', false);
    expect(pickActiveBounty([dormantOne, awake])?.id).toBe('a');
  });
  it('休眠しかいなければ先頭の1体を返す', () => {
    const d1 = mk('d1', 'bounty-ranged', true);
    const d2 = mk('d2', 'bounty-melee', true);
    expect(pickActiveBounty([d1, d2])?.id).toBe('d1');
  });
});
