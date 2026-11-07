// 死神を近接で倒した時も、銃で倒した時と同じ報い(スキル「死神」習得+年表「死神を討伐」)が付く
// (社長指示2026-10-14「死神の近接で倒した記録が年表に残らない件 → 直して」)。
// 旧: 報いは damageEnemy(銃・接触・爆発など)にだけ書かれていて、近接の経路(grantMeleeKillRewards)には無かった。
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
import { loadChronicle, setSelectedStageId } from '../data/progress';

const reaperChaser = () => {
  const e = spawnEnemyAt('reaper', 100, 100, useGameStore.getState().gameTime);
  e.reaperChaser = true; // 倒せる死神(深層で追ってくる個体)
  e.health = 0;
  return e;
};

describe('死神を近接で倒した時の報い', () => {
  beforeEach(() => {
    for (const k of Object.keys(backing)) delete backing[k];
    setSelectedStageId('stage-1');
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState({ ownedSkills: useGameStore.getState().ownedSkills.filter(s => s !== 'reaper') });
  });

  it('★近接で倒すと、スキル「死神」を習得し、年表に「死神を討伐」が刻まれる', () => {
    const s = useGameStore.getState();
    expect(s.ownedSkills.includes('reaper')).toBe(false);
    grantMeleeKillRewards(useGameStore.getState, [{ enemy: reaperChaser(), finisher: true }], s.player, undefined);
    expect(useGameStore.getState().ownedSkills.includes('reaper')).toBe(true);
    expect(loadChronicle().some(e => e.kind === 'reaper' && e.stageId === 'stage-1')).toBe(true);
  });

  it('銃などの経路(damageEnemy)と同じ結果になる', () => {
    const e = reaperChaser();
    e.health = 1;
    useGameStore.setState({ enemies: [e] });
    useGameStore.getState().damageEnemy(e.id, 999);
    expect(useGameStore.getState().ownedSkills.includes('reaper')).toBe(true);
    expect(loadChronicle().some(c => c.kind === 'reaper' && c.stageId === 'stage-1')).toBe(true);
  });
});
