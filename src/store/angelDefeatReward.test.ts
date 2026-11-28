// 天使(ゲート2の天使ボス)を倒した時の落とし物(社長指示2026-10-14「天使倒したら、回復と、赤経験値10本、トレジャー にして」)。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, grantMeleeKillRewards, ANGEL_DEFEAT_XP_COUNT } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import type { EnemyType } from '../types/game';

const angel = (type: EnemyType) => {
  const e = spawnEnemyAt(type, 400, 400, useGameStore.getState().gameTime);
  e.health = 1;
  return e;
};
const drops = (id: string) => {
  const ps = useGameStore.getState().pickups.filter(p => p.id.includes(id));
  return {
    heal: ps.filter(p => p.type === 'health').length,
    redXp: ps.filter(p => p.type === 'experience' && p.value >= 5).length,
    treasure: ps.filter(p => p.type === 'treasure').length,
  };
};

describe('天使を倒した時の落とし物', () => {
  beforeEach(() => { useGameStore.getState().resetGame('warrior'); useGameStore.setState({ pickups: [] }); });

  for (const type of ['miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel'] as EnemyType[]) {
    it(`${type}: 銃などで倒すと 回復1・赤経験値${ANGEL_DEFEAT_XP_COUNT}・トレジャー1`, () => {
      const e = angel(type);
      useGameStore.setState({ enemies: [e] });
      useGameStore.getState().damageEnemy(e.id, 999999);
      expect(drops(e.id)).toEqual({ heal: 1, redXp: ANGEL_DEFEAT_XP_COUNT, treasure: 1 });
    });
  }

  it('近接で倒しても同じ', () => {
    const e = angel('uri');
    e.health = 0;
    grantMeleeKillRewards(useGameStore.getState, [{ enemy: e, finisher: true }], useGameStore.getState().player, undefined);
    expect(drops(e.id)).toEqual({ heal: 1, redXp: ANGEL_DEFEAT_XP_COUNT, treasure: 1 });
  });

  it('フィル(EXの最後のボス)は天使ではない=落とさない', () => {
    const e = angel('phillboss');
    useGameStore.setState({ enemies: [e] });
    useGameStore.getState().damageEnemy(e.id, 99999999);
    expect(drops(e.id)).toEqual({ heal: 0, redXp: 0, treasure: 0 });
  });
});
