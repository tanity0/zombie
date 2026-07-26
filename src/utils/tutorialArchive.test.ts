// 「一度見たチュートリアル」の端末記憶(社長指示v0.25.2252)。資料室の一覧はここを引く。
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSeenTutorials, hasSeenTutorial, markTutorialSeen, loadSeenForGate, TUTORIAL_ALWAYS_SHOW } from './tutorialArchive';

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

// v0.25.2253 の実バグ(GIF収録中に発覚)の再発防止。
// 症状: 「1度だけ」のはずのチュートリアルが、ページを開いて**最初の出撃**では毎回再表示された。
// 原因: 既読の読み込みを useGameLoop の「新ラン検出」(gameTimeの巻き戻し)ブロックだけに置いていたため、
//       初回ランではそのブロックが走らず localStorage を一度も読まなかった。
// 対策: 参照時に遅延で1回読む(seenTutorials())。ここでは「保存済みなら**いつ読んでも**既読が返る」
//       という、その対策が満たすべき性質を固定する。
describe('既読は保存直後から読める(初回ラン再表示バグの再発防止)', () => {
  beforeEach(() => { installStorage(); });

  it('保存した直後に新しく読み込んでも既読になっている', () => {
    markTutorialSeen('phill');
    // 「別のタイミングで初めて読む」= loadSeenTutorials を新規に呼ぶ状況を再現
    expect(loadSeenTutorials().has('phill')).toBe(true);
    expect(hasSeenTutorial('phill')).toBe(true);
  });

  it('前回の起動で保存された値(既に localStorage にある状態)を最初の読み込みで拾う', () => {
    localStorage.setItem('zombie:tutorialsSeen', JSON.stringify(['phill', 'scout']));
    const seen = loadSeenTutorials();
    expect(seen.has('phill')).toBe(true);
    expect(seen.has('scout')).toBe(true);
    expect(seen.has('move')).toBe(false);
  });
});

// 一時措置(社長指示v0.25.2256「一旦、チュートリアルは毎回見せて」)。
// 完成したら TUTORIAL_ALWAYS_SHOW を false に戻す。その時にこのテストが「戻し忘れ」を教える。
describe('TUTORIAL_ALWAYS_SHOW(毎回見せる一時措置)', () => {
  beforeEach(() => { installStorage(); });

  it('ONの間は、既読でもゲーム側の判定は「未読」になる=毎回出る', () => {
    markTutorialSeen('phill');
    markTutorialSeen('scout');
    if (TUTORIAL_ALWAYS_SHOW) {
      expect(loadSeenForGate().size).toBe(0);
    } else {
      expect(loadSeenForGate().has('phill')).toBe(true); // 戻した後はこちらが正
    }
  });

  it('ONでも**記録自体は消えない**=資料室の「操作記録」は埋まる', () => {
    markTutorialSeen('phill');
    expect(loadSeenTutorials().has('phill')).toBe(true); // 資料室が引くのはこちら
    expect(hasSeenTutorial('phill')).toBe(true);
  });
});
