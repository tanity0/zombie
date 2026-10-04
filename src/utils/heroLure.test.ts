// research/MUTANT_HERO.md §3-2: 雑魚は近くの英雄を追う(ボスは見ない)。resolveEnemyTarget の英雄引数のテスト。
import { describe, it, expect } from 'vitest';
import { resolveEnemyTarget, spawnEnemyAt } from './enemyUtils';
import type { Player } from '../types/game';

const player = { x: 0, y: 0, width: 40, height: 56 } as unknown as Player;
const hero = { id: 'hero-1', x: 0, y: 0, width: 110, height: 60 };

describe('雑魚が英雄を狙う', () => {
  it('英雄の方が近く、範囲内なら英雄を追う', () => {
    const z = spawnEnemyAt('zombie', 300, 0, 0);
    const h = { ...hero, x: 380, y: 0 };
    const t = resolveEnemyTarget(z, player, [], 380, false, 0, h);
    expect(t.x).toBeCloseTo(h.x + h.width / 2);
  });
  it('プレイヤーの方が近ければプレイヤー', () => {
    const z = spawnEnemyAt('zombie', 60, 0, 0);
    const t = resolveEnemyTarget(z, player, [], 380, false, 0, { ...hero, x: 300, y: 0 });
    expect(t.x).toBeCloseTo(20);
  });
  it('英雄が渡されなければ従来どおり(1bit同じ)', () => {
    const z = spawnEnemyAt('zombie', 300, 0, 0);
    const a = resolveEnemyTarget(z, player, [], 380, false, 0);
    const b = resolveEnemyTarget(z, player, [], 380, false, 0, null);
    expect(a).toEqual(b);
  });
  it('ボスは英雄を見ない(狙いは今のまま)', () => {
    const b = spawnEnemyAt('bounty-melee', 300, 0, 0);
    const t = resolveEnemyTarget(b, player, [], 380, false, 0, { ...hero, x: 360, y: 0 });
    expect(t.x).toBeCloseTo(20);
  });
});

describe('ボス級の名指しの既定(ボス戦の判定の外でも付けるもの)', () => {
  it('体勢値(紫)は付き、最大は賞金首と同じ90 / 画面外の矢印も出す', async () => {
    const { usesPostureSystem, bossPostureMax } = await import('./bossPosture');
    const { isMarkedBoss } = await import('./bossMarker');
    const { isEngageableBoss } = await import('./bossEngagement');
    const h = spawnEnemyAt('mutant-hero', 0, 0, 0);
    expect(isEngageableBoss(h.type)).toBe(false); // ボス戦にはしない(社長裁定 #1)
    expect(usesPostureSystem(h)).toBe(true);
    expect(bossPostureMax(h)).toBe(90);
    expect(isMarkedBoss(h)).toBe(true);
  });
});

describe('英雄の体の壁(社長報告2026-10-04「重なって延々とダメージ」)', () => {
  it('壁は英雄の当たり判定そのもの', async () => {
    const { heroBodyWallRect } = await import('./heroScript');
    expect(heroBodyWallRect({ x: 10, y: 20, width: 110, height: 60 })).toEqual({ x: 10, y: 20, width: 110, height: 60 });
  });
});

describe('本編で周回する英雄の画面外マーク(交戦中だけ)', () => {
  it('出会う前は出さず、プレイヤー/守護霊を狙っている間と直近に殴られた間だけ出す。対策室の英雄は常に出す', async () => {
    const { isMarkedBossVisible, BOSS_ENGAGE_GRACE_MS } = await import('./bossMarker');
    const base = { type: 'mutant-hero' as const, bossState: 'chase' as const, lastHit: 0, x: 0, y: 0, width: 110, height: 60 };
    const now = 1_000_000;
    expect(isMarkedBossVisible({ ...base, heroPatrolR: 6000 }, now, 0, 0)).toBe(false);
    expect(isMarkedBossVisible({ ...base, heroPatrolR: 6000, heroTargetId: 'some-zombie' }, now, 0, 0)).toBe(false);
    expect(isMarkedBossVisible({ ...base, heroPatrolR: 6000, heroTargetId: 'player' }, now, 0, 0)).toBe(true);
    expect(isMarkedBossVisible({ ...base, heroPatrolR: 6000, heroTargetId: 'ghost' }, now, 0, 0)).toBe(true);
    expect(isMarkedBossVisible({ ...base, heroPatrolR: 6000, lastHit: now - BOSS_ENGAGE_GRACE_MS + 10 }, now, 0, 0)).toBe(true);
    expect(isMarkedBossVisible(base, now, 0, 0)).toBe(true);
  });
});
