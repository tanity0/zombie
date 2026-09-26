import { describe, it, expect } from 'vitest';
import { applyGhostBuildToPlayer } from './soloGhost';
import { buildPseudoPlayer } from './playerBuild';
import type { Player, PlayerBuildSnapshot } from '../types/game';

const live = (over: Partial<Player> = {}): Player => ({
  x: 10, y: 20, vx: 0, vy: 0, width: 24, height: 24,
  speed: 100, health: 40, maxHealth: 100, experience: 0, level: 1,
  experienceToNextLevel: 5, weapons: [], activeWeaponId: '',
  ...over,
} as Player);

describe('applyGhostBuildToPlayer — 守護霊の強さをコピーしてソロ出撃(開発用)', () => {
  it('計測がまだ無い端末は素通し(無言で弱いプレイヤーを作らない)', () => {
    const p = live();
    expect(applyGhostBuildToPlayer(p, undefined)).toBe(p);
  });

  it('★不変条件: 強さの被せ方は守護霊本体と同じ関数(buildPseudoPlayer)の結果に一致する', () => {
    // ここが割れると「守護霊ソロ」で測った強さが守護霊本体とズレ、テストの意味が無くなる。
    const snap = { maxHealth: 260, speed: 140, level: 9 } as PlayerBuildSnapshot;
    const got = applyGhostBuildToPlayer(live(), snap);
    const want = buildPseudoPlayer(snap, live());
    expect(got.maxHealth).toBe(want.maxHealth);
    expect(got.speed).toBe(want.speed);
    expect(got.level).toBe(want.level);
  });

  it('位置は実体のまま(ビルドだけ写す)/HPは満タンで出す', () => {
    const snap = { maxHealth: 260, speed: 140, level: 9 } as PlayerBuildSnapshot;
    const got = applyGhostBuildToPlayer(live({ x: 777, y: 888, health: 3 }), snap);
    expect(got.x).toBe(777);
    expect(got.y).toBe(888);
    expect(got.health).toBe(260); // 上限だけ上がって瀕死スタート、にならない
  });
});
