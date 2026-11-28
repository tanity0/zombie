// 吸血(キル時の回復)は近接の撃破でも発動する(社長報告2026-10-15「倒しても吸収されない時がある」・v0.25.5051)。
// 旧: damageEnemy(銃/爆風/延焼)にだけ書かれていて、近接5経路(grantMeleeKillRewards)では一度も発動していなかった。
import { describe, it, expect, beforeEach } from 'vitest';

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => { backing[k] = v; },
  removeItem: (k: string) => { delete backing[k]; },
  clear: () => { for (const k of Object.keys(backing)) delete backing[k]; },
  key: () => null,
  get length() { return Object.keys(backing).length; },
} as Storage;

import { useGameStore, grantMeleeKillRewards } from './gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { setSelectedStageId } from '../data/progress';
import { VAMPIRE_HEAL_BY_LEVEL } from '../utils/skillEffectsB7';

const deadZombie = () => {
  const e = spawnEnemyAt('zombie', 100, 100, useGameStore.getState().gameTime);
  e.health = 0;
  return e;
};
const withVampire = (level: number) => {
  useGameStore.setState(s => ({ player: { ...s.player, skills: [...s.player.skills.filter(k => k !== 'vampire'), 'vampire'], skillLevels: { ...s.player.skillLevels, vampire: level }, health: 10, maxHealth: 100 } }));
};

describe('吸血: 近接の撃破でも回復する', () => {
  beforeEach(() => {
    for (const k of Object.keys(backing)) delete backing[k];
    setSelectedStageId('stage-1');
    useGameStore.getState().resetGame('warrior');
  });

  it('近接で倒すとLv別の回復量が入り、吸い込みの演出が出る', () => {
    withVampire(1);
    const s = useGameStore.getState();
    grantMeleeKillRewards(useGameStore.getState, [{ enemy: deadZombie(), finisher: false }], s.player, undefined);
    expect(useGameStore.getState().player.health).toBe(10 + VAMPIRE_HEAL_BY_LEVEL[1]);
    expect(useGameStore.getState().effects.some(e => e.kind === 'drain')).toBe(true);
  });

  it('2体同時に倒せば2回ぶん。吸血を持たなければ回復しない', () => {
    withVampire(3);
    const s = useGameStore.getState();
    grantMeleeKillRewards(useGameStore.getState, [{ enemy: deadZombie(), finisher: false }, { enemy: deadZombie(), finisher: true }], s.player, undefined);
    expect(useGameStore.getState().player.health).toBe(10 + VAMPIRE_HEAL_BY_LEVEL[3] * 2);
    useGameStore.setState(st => ({ player: { ...st.player, skills: st.player.skills.filter(k => k !== 'vampire'), health: 10 } }));
    grantMeleeKillRewards(useGameStore.getState, [{ enemy: deadZombie(), finisher: false }], useGameStore.getState().player, undefined);
    expect(useGameStore.getState().player.health).toBe(10);
  });

  it('銃の経路(damageEnemy)と同じ回復量', () => {
    withVampire(2);
    const e = deadZombie(); e.health = 1;
    useGameStore.setState({ enemies: [e] });
    useGameStore.getState().damageEnemy(e.id, 999);
    expect(useGameStore.getState().player.health).toBe(10 + VAMPIRE_HEAL_BY_LEVEL[2]);
  });
});
