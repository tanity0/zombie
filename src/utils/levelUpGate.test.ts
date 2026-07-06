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
