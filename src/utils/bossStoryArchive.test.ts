import { describe, expect, it, beforeEach } from 'vitest';

// localStorage は最小スタブ(bossDefeated.test と同じ作法)。
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

const { BOSS_STORIES } = await import('../data/bossStories');
const { PRACTICE_SLOTS, PRACTICE_CATEGORY_ORDER } = await import('./bossPractice');
const { enemyDeathLabel } = await import('../store/gameStore');
const {
  BOSS_STORY_GROUP_ORDER, BOSS_STORY_EXCLUDED_KEYS, bossStoryFace, buildBossStoryGroups,
  splitBossStoryName, loadReadBossStories, markBossStoryRead,
} = await import('./bossStoryArchive');

beforeEach(() => { store.clear(); });

// 社長指示2026-11-16「ボス全種にバックストーリー」: 資料室「特殊変異体」の棚。
describe('bossStoryArchive', () => {
  it('対策室の全ての枠(除外リストを除く)に台帳の行がある・重複なし・除外は載らない', () => {
    const keys = BOSS_STORIES.map(e => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of PRACTICE_SLOTS) {
      if (BOSS_STORY_EXCLUDED_KEYS.includes(s.encounterSlotKey)) expect(keys).not.toContain(s.encounterSlotKey);
      else expect(keys).toContain(s.encounterSlotKey);
    }
    // 台帳にしか無いキー(倒しても記録されない)が無い
    const known = new Set(PRACTICE_SLOTS.map(s => s.encounterSlotKey));
    for (const k of keys) expect(known.has(k)).toBe(true);
    expect(keys).not.toContain('guardian-phantom');
  });

  it('名前はゲームの表示名と同じ(対策室の一覧と同じ出どころ)', () => {
    for (const s of PRACTICE_SLOTS) {
      const e = BOSS_STORIES.find(x => x.key === s.encounterSlotKey);
      if (!e) continue;
      expect(e.name).toBe(s.label ?? enemyDeathLabel(s.bossType));
    }
  });

  it('小見出しの順は対策室の棚の順に沿い、台帳の並びと一致する', () => {
    expect(BOSS_STORY_GROUP_ORDER.length).toBe(PRACTICE_CATEGORY_ORDER.length - 2); // 決闘(汎用の幻影)と練習(案山子)を外した分
    const groups = buildBossStoryGroups(new Set());
    expect(groups.map(g => g.group)).toEqual([...BOSS_STORY_GROUP_ORDER]);
    const flat = groups.flatMap(g => g.cells.map(c => c.entry.key));
    expect(flat).toEqual(BOSS_STORIES.map(e => e.key));
  });

  it('倒した記録のある枠だけ開く・全開ツマミは全部開く', () => {
    const cells = buildBossStoryGroups(new Set(['miguel', 'giantbat@stage-1'])).flatMap(g => g.cells);
    expect(cells.filter(c => c.unlocked).map(c => c.entry.key).sort()).toEqual(['giantbat@stage-1', 'miguel']);
    expect(buildBossStoryGroups(new Set(), true).flatMap(g => g.cells).every(c => c.unlocked)).toBe(true);
  });

  it('未読: 倒していて開いていない枠だけ。未討伐は未読にならない', () => {
    const cells = buildBossStoryGroups(new Set(['miguel', 'thor']), false, new Set(['thor', 'mimir'])).flatMap(g => g.cells);
    expect(cells.filter(c => c.unread).map(c => c.entry.key)).toEqual(['miguel']);
  });

  it('既読の記録: 開いたら残る・二重に書かない・壊れた値は空扱い', () => {
    expect(loadReadBossStories().size).toBe(0);
    markBossStoryRead('miguel');
    markBossStoryRead('miguel');
    expect([...loadReadBossStories()]).toEqual(['miguel']);
    store.set('boss.storyRead.v1', '{broken');
    expect(loadReadBossStories().size).toBe(0);
  });

  it('名前の括弧書きを分ける(棚の表示用・文字列そのものは変えない)', () => {
    expect(splitBossStoryName('衛生兵(変異体)')).toEqual({ main: '衛生兵', suffix: '(変異体)' });
    expect(splitBossStoryName('搬送体')).toEqual({ main: '搬送体', suffix: '' });
    for (const e of BOSS_STORIES) {
      const { main, suffix } = splitBossStoryName(e.name);
      expect(main + suffix).toBe(e.name);
    }
  });

  it('顔: 切り抜きの表にある絵だけ出す(拳鬼は待機の絵)', () => {
    expect(bossStoryFace('phantom-brawler')?.sprite).toBe('kenki-idle');
    expect(bossStoryFace('giantbat@stage-1')?.sprite).toBe('atlas-px2/giantbat');
    expect(bossStoryFace('mutant-hero')).toBeNull();
    expect(bossStoryFace('no-such-key')).toBeNull();
  });

  it('本文はまだ空(流し込みは後)', () => {
    for (const e of BOSS_STORIES) expect(Array.isArray(e.body)).toBe(true);
  });
});
