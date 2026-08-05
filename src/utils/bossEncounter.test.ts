// 遭遇記録のテスト。BOSS_MAKER.md §20-5。
// jsdom を使わず、このユニットが触る localStorage だけを最小スタブで噛ませる(既存テストと同じ作法)。
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

const {
  markBossesEncountered, hasEncounteredBoss, loadEncounteredBosses,
  resetBossEncounterCache, clearBossEncounters,
} = await import('./bossEncounter');

beforeEach(() => { store.clear(); resetBossEncounterCache(); });

describe('ボスの遭遇記録', () => {
  it('交戦したスロットキーが残り、次回も読み出せる', () => {
    markBossesEncountered(new Set(['mimir', 'giantbat@stage-3']));
    resetBossEncounterCache(); // 端末を開き直した想定
    expect(hasEncounteredBoss('mimir')).toBe(true);
    expect(hasEncounteredBoss('giantbat@stage-3')).toBe(true);
    expect(hasEncounteredBoss('thor')).toBe(false);
  });

  // ★毎tick呼ばれる関数なので、既知キーだけの時に localStorage を叩かないこと。
  it('既に持っているキーだけなら書き込まない(毎tick呼ばれる前提)', () => {
    markBossesEncountered(new Set(['mimir']));
    let writes = 0;
    const real = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (k: string, v: string) => { writes++; real(k, v); };
    markBossesEncountered(new Set(['mimir']));
    markBossesEncountered(new Set(['mimir']));
    expect(writes).toBe(0);
    markBossesEncountered(new Set(['mimir', 'thor'])); // 新顔が混ざった時だけ書く
    expect(writes).toBe(1);
    localStorage.setItem = real;
  });

  it('空集合では何もしない', () => {
    markBossesEncountered(new Set());
    expect(loadEncounteredBosses().size).toBe(0);
  });

  it('進行リセットで消える', () => {
    markBossesEncountered(new Set(['skadi']));
    clearBossEncounters();
    resetBossEncounterCache();
    expect(hasEncounteredBoss('skadi')).toBe(false);
  });

  it('壊れた保存値でも落ちない(空集合として扱う)', () => {
    store.set('boss.encountered.v1', '{ not json');
    resetBossEncounterCache();
    expect(loadEncounteredBosses().size).toBe(0);
  });
});
