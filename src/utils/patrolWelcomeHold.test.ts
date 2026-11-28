import { describe, expect, it } from 'vitest';
import { patrolSpawnHeldByWelcome } from './patrolWelcomeHold';

describe('patrolSpawnHeldByWelcome(徘徊の枠はウェルカム中は出ない)', () => {
  it('輪が開いている間は待つ', () => {
    expect(patrolSpawnHeldByWelcome({ activeEventKind: 'welcome', welcomeRunning: true })).toBe(true);
    expect(patrolSpawnHeldByWelcome({ activeEventKind: 'welcome', welcomeRunning: false })).toBe(true);
  });
  it('段と段の間(輪が閉じていても台本が終わっていない)も待つ', () => {
    expect(patrolSpawnHeldByWelcome({ activeEventKind: null, welcomeRunning: true })).toBe(true);
  });
  it('ウェルカムが終わったら待たない', () => {
    expect(patrolSpawnHeldByWelcome({ activeEventKind: null, welcomeRunning: false })).toBe(false);
    expect(patrolSpawnHeldByWelcome({ activeEventKind: undefined, welcomeRunning: false })).toBe(false);
  });
  it('ウェルカム以外の出来事は徘徊を待たせない', () => {
    for (const k of ['horde', 'boss', 'rescue'] as const) {
      expect(patrolSpawnHeldByWelcome({ activeEventKind: k, welcomeRunning: false })).toBe(false);
    }
  });
});
