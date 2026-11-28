// 倒した記録のテスト(research/SORTIE_MAP_BOSS_ICONS.md §4)。localStorage は最小スタブ(bossEncounter.test と同じ作法)。
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

const { bossDefeatSlotKey, noteBossDefeated, hasDefeatedBoss, loadDefeatedBosses, resetBossDefeatedCache, clearBossDefeated } = await import('./bossDefeated');

beforeEach(() => { store.clear(); resetBossDefeatedCache(); });

describe('倒した記録のキー', () => {
  it('城ボスはステージ別・フィルは固定キー・それ以外は型名(encounterSlotKey と同じ形)', () => {
    expect(bossDefeatSlotKey({ type: 'giantbat' }, 'stage-3')).toBe('giantbat@stage-3');
    expect(bossDefeatSlotKey({ type: 'phillboss' }, 'stage-ex1')).toBe('phillboss@stage-ex1');
    expect(bossDefeatSlotKey({ type: 'mimir' }, 'stage-1')).toBe('mimir');
    expect(bossDefeatSlotKey({ type: 'bounty-maiko' }, 'stage-5')).toBe('bounty-maiko');
    expect(bossDefeatSlotKey({ type: 'mutant-wraith' }, 'stage-4')).toBe('mutant-wraith');
  });
  it('拳鬼は guardian-phantom の brawler を phantom-brawler へ写す。汎用の幻影は書かない', () => {
    expect(bossDefeatSlotKey({ type: 'guardian-phantom', phantomUnique: 'brawler' }, 'stage-3')).toBe('phantom-brawler');
    expect(bossDefeatSlotKey({ type: 'guardian-phantom' }, 'stage-1')).toBeNull();
  });
  it('イベント産の城ボス・グレン第1形態は書かない(第2形態は書く)', () => {
    expect(bossDefeatSlotKey({ type: 'giantbat', fromEvent: true }, 'stage-3')).toBeNull();
    expect(bossDefeatSlotKey({ type: 'giantbat', glenForm: 1 }, 'stage-7')).toBeNull();
    expect(bossDefeatSlotKey({ type: 'giantbat', glenForm: 2 }, 'stage-7')).toBe('giantbat@stage-7');
  });
  it('雑魚は書かない(台帳に無い型)', () => {
    expect(bossDefeatSlotKey({ type: 'zombie' }, 'stage-1')).toBeNull();
  });
});

describe('倒した記録の保存', () => {
  it('倒したキーが残り、開き直しても読める', () => {
    noteBossDefeated({ type: 'giantbat' }, 'stage-4');
    noteBossDefeated({ type: 'zombie' }, 'stage-4');
    resetBossDefeatedCache();
    expect(hasDefeatedBoss('giantbat@stage-4')).toBe(true);
    expect([...loadDefeatedBosses()]).toEqual(['giantbat@stage-4']);
  });
  it('進行リセットで消える', () => {
    noteBossDefeated({ type: 'thor' }, 'stage-5');
    clearBossDefeated();
    resetBossDefeatedCache();
    expect(hasDefeatedBoss('thor')).toBe(false);
  });
});
