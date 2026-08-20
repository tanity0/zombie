// PACING_PUZZLE.md §10-15#7(isExStageRun)。node 既定環境には localStorage が無いので、
// stageDiffMults.test.ts と同じ作法で最小モックを差す(getSelectedStageId は
// `typeof localStorage === 'undefined'` で早期returnするため)。
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

import { isExStageRun, phillBossSpawnReady } from './exStage';

const SELECTED_KEY = 'zombie.progress.selectedStage';
const setStage = (id: string) => { backing[SELECTED_KEY] = id; };

beforeEach(() => { for (const k of Object.keys(backing)) delete backing[k]; });

describe('isExStageRun', () => {
  it('選択ステージがstage-ex1ならtrue', () => {
    setStage('stage-ex1');
    expect(isExStageRun()).toBe(true);
  });

  it('他ステージではfalse', () => {
    setStage('stage-7');
    expect(isExStageRun()).toBe(false);
  });

  it('未選択(空)ではfalse', () => {
    expect(isExStageRun()).toBe(false);
  });
});

describe('phillBossSpawnReady — §10-14#5: gate2Cleared=falseの間は湧かない', () => {
  it('gate2Cleared=falseなら深度に関わらずfalse', () => {
    expect(phillBossSpawnReady(false, 999999, 9000)).toBe(false);
  });
  it('gate2Cleared=trueでも深度未達ならfalse', () => {
    expect(phillBossSpawnReady(true, 8999, 9000)).toBe(false);
  });
  it('gate2Cleared=trueかつ深度到達でtrue(境界=以上)', () => {
    expect(phillBossSpawnReady(true, 9000, 9000)).toBe(true);
    expect(phillBossSpawnReady(true, 9500, 9000)).toBe(true);
  });
});

describe('phillBossSpawnReady — §10-14#1不変条件: 天使は同時に1体(v0.25.3721検収監査#2)', () => {
  it('別のゲート2天使がbossState保持中は、他条件が全て揃っても湧かせない', () => {
    expect(phillBossSpawnReady(true, 99999, 9000, true)).toBe(false);
  });
  it('天使不在(otherAngelActive=false・既定値)なら従来どおり', () => {
    expect(phillBossSpawnReady(true, 9000, 9000, false)).toBe(true);
    expect(phillBossSpawnReady(true, 9000, 9000)).toBe(true);
  });
});
