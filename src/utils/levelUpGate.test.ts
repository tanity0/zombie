import { describe, it, expect } from 'vitest';
import { isPlayerInAttackTelegraph, type TelegraphEnemy } from './levelUpGate';

const RADIUS = 54;
const player = { x: 0, y: 0, width: 20, height: 20 }; // center (10,10), pr=10

const mk = (over: Partial<TelegraphEnemy>): TelegraphEnemy => ({
  type: 'pumpkin', x: 0, y: 0, width: 20, height: 20, ...over,
});

describe('isPlayerInAttackTelegraph', () => {
  it('無関係の敵(aiPhase無し)はfalse', () => {
    expect(isPlayerInAttackTelegraph(player, [mk({})], RADIUS)).toBe(false);
  });

  it('ジャンプ着地圏内(距離<=半径+双方の当たり半径)はtrue', () => {
    const enemies = [mk({ aiPhase: 'jump', aiTargetX: 0, aiTargetY: 0 })]; // target center = (10,10) = playerと同座標
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(true);
  });

  it('ジャンプ着地圏外(半径より十分遠い)はfalse', () => {
    const enemies = [mk({ aiPhase: 'jump', aiTargetX: 500, aiTargetY: 500 })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(false);
  });

  it('ジャンプでも対象外の型(werewolf)はfalse', () => {
    const enemies = [mk({ type: 'werewolf', aiPhase: 'jump', aiTargetX: 0, aiTargetY: 0 })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(false);
  });

  it('ダッシュ経路上(windup中の線分の近く)はtrue', () => {
    // 敵center(100,10)→target(-100,10) の水平線がプレイヤー(10,10)のすぐそばを通る。
    const enemies = [mk({ type: 'werewolf', x: 90, y: 0, aiPhase: 'windup', aiTargetX: -100, aiTargetY: 10 })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(true);
  });

  it('ダッシュ経路から大きく外れていればfalse', () => {
    // 経路は y=1000 の水平線、プレイヤーはy=10なので遠い。
    const enemies = [mk({ type: 'werewolf', x: 90, y: 990, aiPhase: 'windup', aiTargetX: -100, aiTargetY: 1000 })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(false);
  });

  it('windup中でもaiTargetX/Y未指定ならfalse(狙い点未確定)', () => {
    const enemies = [mk({ type: 'werewolf', x: 5, y: 5, aiPhase: 'windup' })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(false);
  });

  it('複数の敵のうち1体でも当たり判定内ならtrue', () => {
    const enemies = [
      mk({ aiPhase: 'jump', aiTargetX: 900, aiTargetY: 900 }), // 遠い
      mk({ aiPhase: 'jump', aiTargetX: 0, aiTargetY: 0 }),     // 近い
    ];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(true);
  });
});

// M51: ジャイアント新スクリプト(?giantscript=0で旧'jump'/'windup'に戻るので、上の既存分岐はここでは
// 一切変更していない=このdescribeで新規追加した分岐のみを検証する)。
describe('isPlayerInAttackTelegraph — M51ジャイアント新テレグラフ', () => {
  const STOMP_R = 92, SWEEP_HW = 40;

  it('踏み鳴らし(g-stomp-windup)は自身の位置中心の円=giantStompRadius省略時は無視', () => {
    const enemies = [mk({ type: 'giantbat', x: 0, y: 0, aiPhase: 'g-stomp-windup' })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(false); // 省略時は判定しない
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS, STOMP_R, SWEEP_HW)).toBe(true); // 自身center=(10,10)=プレイヤーと同座標
  });

  it('踏み鳴らしの円外なら false', () => {
    const enemies = [mk({ type: 'giantbat', x: 900, y: 900, aiPhase: 'g-stomp-windup' })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS, STOMP_R, SWEEP_HW)).toBe(false);
  });

  it('薙ぎ払い(g-sweep-windup/active)はaiFrom→aiTargetのカプセル', () => {
    const enemies = [mk({ type: 'giantbat', x: 900, y: 900, aiPhase: 'g-sweep-windup', aiFromX: 100, aiFromY: 10, aiTargetX: -100, aiTargetY: 10 })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS, STOMP_R, SWEEP_HW)).toBe(true);
    const enemiesActive = [mk({ type: 'giantbat', x: 900, y: 900, aiPhase: 'g-sweep-active', aiFromX: 100, aiFromY: 10, aiTargetX: -100, aiTargetY: 10 })];
    expect(isPlayerInAttackTelegraph(player, enemiesActive, RADIUS, STOMP_R, SWEEP_HW)).toBe(true);
  });

  it('飛び掛かり(g-jump-windup/g-jump-air)はジャンプ着地円と同じ判定', () => {
    const windup = [mk({ type: 'giantbat', aiPhase: 'g-jump-windup', aiTargetX: 0, aiTargetY: 0 })];
    expect(isPlayerInAttackTelegraph(player, windup, RADIUS)).toBe(true);
    const air = [mk({ type: 'giantbat', aiPhase: 'g-jump-air', aiTargetX: 0, aiTargetY: 0 })];
    expect(isPlayerInAttackTelegraph(player, air, RADIUS)).toBe(true);
  });

  it('突進(g-dash-windup)は経路上の線分判定', () => {
    const enemies = [mk({ type: 'giantbat', x: 90, y: 0, aiPhase: 'g-dash-windup', aiTargetX: -100, aiTargetY: 10 })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(true);
  });

  it('咆哮弾(g-bolt-windup)は図形が無いのでどのパラメータでもfalse', () => {
    const enemies = [mk({ type: 'giantbat', x: 0, y: 0, aiPhase: 'g-bolt-windup' })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS, STOMP_R, SWEEP_HW)).toBe(false);
  });
});

// PACING_PUZZLE.md §6.38 v6 C-3: 賞金首(bossState系コントローラ)の技もレベルアップ保留の対象に
// 拾えること。B2a=バス停の突進/レーザー、B2b=鋏の跳躍/薙ぎ払い・舞妓の薙ぎ/毬回し/水鳥。
describe('isPlayerInAttackTelegraph — 賞金首(bossState系・§6.38 B2a/B2b)', () => {
  it('馬乗り(bounty-melee)の突進(bm-charge-windup)は経路上の線分判定', () => {
    const enemies = [mk({ type: 'bounty-melee', x: 90, y: 0, bossState: 'bm-charge-windup', aiTargetX: -100, aiTargetY: 10 })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(true);
  });
  it('突進でも対象外の型(bounty-ranged)はfalse(型ゲート)', () => {
    const enemies = [mk({ type: 'bounty-ranged', x: 90, y: 0, bossState: 'bm-charge-windup', aiTargetX: -100, aiTargetY: 10 })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(false);
  });
  it('バス停(bounty-ranged)のレーザー(laser-windup)は経路上の線分判定(半太さ=MIMIR_LASER_HALF_WIDTH)', () => {
    const enemies = [mk({ type: 'bounty-ranged', x: 90, y: 0, bossState: 'laser-windup', aiTargetX: -100, aiTargetY: 10 })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(true);
  });
  it('鋏(bounty-balance)の跳びかかり(leap-windup)は着地点(aiTargetX/Y)中心の円', () => {
    const enemies = [mk({ type: 'bounty-balance', bossState: 'leap-windup', aiTargetX: 0, aiTargetY: 0 })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(true);
    const far = [mk({ type: 'bounty-balance', bossState: 'leap-windup', aiTargetX: 900, aiTargetY: 900 })];
    expect(isPlayerInAttackTelegraph(player, far, RADIUS)).toBe(false);
  });
  it('鋏の薙ぎ払い(bb-sweep-windup)は経路上の帯判定', () => {
    const enemies = [mk({ type: 'bounty-balance', x: 90, y: 0, bossState: 'bb-sweep-windup', aiTargetX: -100, aiTargetY: 10 })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(true);
  });
  it('舞妓(bounty-maiko)の毬の薙ぎ(単発/2連いずれも)は経路上の帯判定', () => {
    for (const bossState of ['mk-naginata-windup', 'mk-naginata1-windup', 'mk-naginata2-windup'] as const) {
      const enemies = [mk({ type: 'bounty-maiko', x: 90, y: 0, bossState, aiTargetX: -100, aiTargetY: 10 })];
      expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(true);
    }
  });
  it('舞妓の毬回し(mk-spin-windup)は自分中心円(敵の現在位置が中心・aiTargetXは不要)', () => {
    const enemies = [mk({ type: 'bounty-maiko', x: 0, y: 0, bossState: 'mk-spin-windup' })];
    expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(true);
    const far = [mk({ type: 'bounty-maiko', x: 900, y: 900, bossState: 'mk-spin-windup' })];
    expect(isPlayerInAttackTelegraph(player, far, RADIUS)).toBe(false);
  });
  it('舞妓の水鳥乱舞(mk-suiu-hop1/2/3)は着地点(aiTargetX/Y)中心の円', () => {
    for (const bossState of ['mk-suiu-hop1', 'mk-suiu-hop2', 'mk-suiu-hop3'] as const) {
      const enemies = [mk({ type: 'bounty-maiko', bossState, aiTargetX: 0, aiTargetY: 0 })];
      expect(isPlayerInAttackTelegraph(player, enemies, RADIUS)).toBe(true);
    }
  });
});
