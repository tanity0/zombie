// ★受け入れ条件(BOSS_MAKER.md §20-8-b-4)の機械化:
// **練習ランは localStorage に1バイトも書かない**(プレイヤー設定の許可リストを除く)。
//
// これが要る理由(品質監査 v0.25.2856 の致命1): 練習で汚れる書き込みは少なくとも12箇所あり、
// その筆頭は**勝利画面を経由せず、城ボスが死んだ瞬間にステージ解放を確定させる**。
// 書き込み側に `if (練習) return;` を12個置く方式は、明日足された書き込みが漏れる。
// よって「出口で1回止める」形にし、それをこのテストで固定する。
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
const makeStorage = (): Storage => ({
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage);

// `?practice=1` のランに見せてからモジュールを読む(判定はモジュールロード時定数のため)。
const storage = makeStorage();
(globalThis as unknown as { window: unknown }).window = {
  location: { search: '?practice=1&practiceboss=thor&stage=stage-5' },
  localStorage: storage,
};
(globalThis as unknown as { localStorage: Storage }).localStorage = storage;

const { installPracticeGuard, PRACTICE_WRITE_ALLOWLIST } = await import('./practiceGuard');
const { isPracticeRun, practiceBossType } = await import('./bossPractice');

beforeEach(() => { store.clear(); });

describe('練習ランの関所', () => {
  it('?practice=1 と狙いのボスを読めている(直リンク経路)', () => {
    expect(isPracticeRun()).toBe(true);
    expect(practiceBossType()).toBe('thor');
  });

  it('関所を入れると、進行・記録の書き込みが1つも通らない', () => {
    installPracticeGuard();
    // 監査が挙げた実キー(進行・記録・守護霊・資料室)。1つでも通ったら落ちる。
    const blocked = [
      'zombie.progress.cleared', 'zombie.progress.castleBoss', 'zombie.progress.kogarasuUnlocked',
      'zombie.progress.highscores', 'zombie.progress.chronicle', 'zombie.progress.runCores',
      'zombie.progress.startRank', 'zombie.progress.wallMeta', 'zombie.progress.eventQuestMeta',
      'zombie.progress.storyFlags', 'zombie.progress.baseGrowth',
      'boss.encountered.v1', 'zombie.story.archive', 'zombie.ghost.profile',
    ];
    for (const k of blocked) localStorage.setItem(k, 'x');
    expect([...store.keys()]).toEqual([]);
  });

  it('プレイヤー設定だけは通す(練習中に音量やグラフィックを変えた分まで巻き添えにしない)', () => {
    installPracticeGuard();
    for (const k of PRACTICE_WRITE_ALLOWLIST) localStorage.setItem(k, '1');
    expect([...store.keys()].sort()).toEqual([...PRACTICE_WRITE_ALLOWLIST].sort());
  });

  it('削除と全消しも通さない', () => {
    store.set('zombie.progress.cleared', 'keep');
    installPracticeGuard();
    localStorage.removeItem('zombie.progress.cleared');
    localStorage.clear();
    expect(store.get('zombie.progress.cleared')).toBe('keep');
  });

  it('許可リストに進行キーを混ぜていない(将来ここへ足させないための固定)', () => {
    for (const k of PRACTICE_WRITE_ALLOWLIST) {
      expect(k.startsWith('zombie:'), `${k} は設定名前空間ではない`).toBe(true);
      expect(k.includes('progress')).toBe(false);
    }
  });
});
