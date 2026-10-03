import { describe, expect, it } from 'vitest';
import { GLEN_ROAR_LINE, isGlenBossSpawnReady } from './glenIntro';

describe('ステージ7の戦闘前会話', () => {
  it('初回は咆哮の表示が終わるまでボスを出さない', () => {
    expect(isGlenBossSpawnReady({
      introSkipped: false,
      roarQueued: true,
      roarShown: false,
      currentText: null,
      roarPending: true,
    })).toBe(false);

    expect(isGlenBossSpawnReady({
      introSkipped: false,
      roarQueued: true,
      roarShown: true,
      currentText: GLEN_ROAR_LINE,
      roarPending: false,
    })).toBe(false);

    expect(isGlenBossSpawnReady({
      introSkipped: false,
      roarQueued: true,
      roarShown: true,
      currentText: null,
      roarPending: false,
    })).toBe(true);
  });

  it('既読後は会話を省略してボスを出せる', () => {
    expect(isGlenBossSpawnReady({
      introSkipped: true,
      roarQueued: false,
      roarShown: false,
      currentText: null,
      roarPending: false,
    })).toBe(true);
  });
});
