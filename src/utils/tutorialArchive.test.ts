// 「一度見たチュートリアル」の端末記憶(社長指示v0.25.2252)。資料室の一覧はここを引く。
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSeenTutorials, hasSeenTutorial, markTutorialSeen } from './tutorialArchive';

// jsdom を使わずに済むよう、最小の localStorage スタブを噛ませる(このユニットが触るのはこれだけ)。
const installStorage = () => {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
  return map;
};

describe('tutorialArchive', () => {
  let store: Map<string, string>;
  beforeEach(() => { store = installStorage(); });

  it('初期状態は空', () => {
    expect(loadSeenTutorials().size).toBe(0);
    expect(hasSeenTutorial('phill')).toBe(false);
  });

  it('記録すると既読になり、次に読んでも残っている', () => {
    markTutorialSeen('phill');
    expect(hasSeenTutorial('phill')).toBe(true);
    expect(hasSeenTutorial('scout')).toBe(false);
    expect([...loadSeenTutorials()]).toEqual(['phill']);
  });

  it('複数記録しても重複しない', () => {
    markTutorialSeen('move');
    markTutorialSeen('phill');
    markTutorialSeen('move');
    expect(loadSeenTutorials().size).toBe(2);
  });

  // v0.25.2251 で先に入れた話題別キーで既に見ている人の記録を落とさない。
  it('旧キー(zombie:tut:lab-*)を取り込む', () => {
    store.set('zombie:tut:lab-phill', '1');
    store.set('zombie:tut:lab-scout', '1');
    const seen = loadSeenTutorials();
    expect(seen.has('phill')).toBe(true);
    expect(seen.has('scout')).toBe(true);
  });

  it('壊れた保存値でも落ちない(空として扱う)', () => {
    store.set('zombie:tutorialsSeen', '{壊れたJSON');
    expect(loadSeenTutorials().size).toBe(0);
    markTutorialSeen('scout'); // 上書きして復旧できる
    expect(hasSeenTutorial('scout')).toBe(true);
  });
});
