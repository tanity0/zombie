// ★赤カウンターの浮きの強制(社長指示2026-11-16「赤は強制的に浮かない状況でも浮かせる」)。
// damageEnemy のカウンターの道(postureImpact='counter'=全カウンター共通の中央)で、今まで浮かなかった場面でも浮かせる。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from './gameStore';
import type { Enemy, EnemyType } from '../types/game';
import { spawnEnemyAt } from '../utils/enemyUtils';
import { brawlerAirborne, brawlerJugglePush } from '../utils/brawlerCombo';
import { COUNTER_LIFT_MOVE } from '../utils/airLift';

let now = 9_000_000;
const mk = (type: EnemyType, id: string, extra: Partial<Enemy> = {}): Enemy => {
  const e = spawnEnemyAt(type, 0, 0, useGameStore.getState().gameTime);
  return { ...e, id, health: 99999, maxHealth: 99999, dormant: false, ...extra } as Enemy;
};
const en = (id: string) => useGameStore.getState().enemies.find(e => e.id === id);
const counter = (id: string, dmg = 10) => useGameStore.getState().damageEnemy(id, dmg, false, true, false, 'other', 'player', 'counter');

beforeEach(() => {
  now = 9_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  useGameStore.getState().resetGame('warrior');
});
afterEach(() => { vi.restoreAllMocks(); });

describe('赤カウンターの浮きの強制', () => {
  it('技の最中の雑魚: 技を取り消してから浮かせる', () => {
    const g = useGameStore.getState().gameTime;
    useGameStore.setState({ enemies: [mk('zombie', 'z', { aiPhase: 'windup', aiPhaseUntil: g + 99999 } as Partial<Enemy>)] });
    counter('z');
    const z = en('z')!;
    expect(z.aiPhase).toBeUndefined();
    expect(z.biteRecoverUntil).toBeUndefined();
    expect(z.brawlerLiftAt).toBe(now);
    expect(brawlerAirborne(z, now + 1)).toBe(true);
  });
  it('空中で予算切れ・ダウン中でも浮かせ直す', () => {
    const base = mk('zombie', 'a');
    const up = { ...base, ...brawlerJugglePush({}, 'mob', COUNTER_LIFT_MOVE, now - 60) } as Enemy;
    useGameStore.setState({ enemies: [{ ...up, id: 'a', brLiftBudget: 0 }, { ...up, id: 'd', brLiftBudget: 0, brLiftDown: true }] });
    counter('a');
    counter('d');
    for (const id of ['a', 'd']) {
      const e = en(id)!;
      expect(e.brLiftDown, id).toBe(false);
      expect(e.brawlerLiftAt, id).toBe(now);
      expect((e.brLiftPeak ?? 0) > 0, id).toBe(true);
    }
  });
  it('ボス級の止めの減衰が完全耐性でも浮かせる', () => {
    useGameStore.setState({ enemies: [mk('thor', 't', { bossStopDrImmuneUntil: now + 3000 } as Partial<Enemy>)] });
    counter('t');
    const t = en('t')!;
    expect(t.brawlerLiftAt).toBe(now);
    expect(brawlerAirborne(t, now + 1)).toBe(true);
  });
  it('浮かせないまま: 倒した一撃・終端の死神', () => {
    useGameStore.setState({ enemies: [mk('zombie', 'w', { health: 1, maxHealth: 1 }), mk('reaper', 'rp', { reaperChaser: true })] });
    counter('w');
    expect(en('w')?.brawlerLiftAt).toBeUndefined();
    counter('rp');
    expect(en('rp')?.brawlerLiftAt).toBeUndefined();
  });
});
