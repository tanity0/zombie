// サブクエストの**結合**テスト(research/SUBQUESTS.md)。純関数側は utils/subquests.test.ts。
//
// ★ここで見るのは「配線」だけ。v2監査の致命1(キル確定点は damageEnemy と
// grantMeleeKillRewards の**2本**ある)を機械化するのが主目的で、
// **近接キルで進捗が入る**が落ちたら近接キルが丸ごと数えられていない、ということ。
//
// localStorage は node 環境に無いので、gameStore を読む**前に**スタブを差す
// (practiceGuard.test.ts と同じ流儀)。
import { describe, it, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => { mem.clear(); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;
(globalThis as unknown as { localStorage: Storage }).localStorage = storage;

const { useGameStore } = await import('./gameStore');
const { setSelectedStageId } = await import('../data/progress');
const { spawnEnemyAt } = await import('../utils/enemyUtils');
const { SUBQUEST_SAVE_KEY, flushSubquestSaveForTest, resetSubquestSaveCacheForTest } = await import('../utils/subquests');

// stage-1 の先頭2枠 = ①通常25体 ②青5体。
const startRun = (benchmark = false) => {
  mem.clear();
  resetSubquestSaveCacheForTest(); // ★v0.25.3649: 保存はモジュール内キャッシュ化されたため、ストレージを消したら必ず対で呼ぶ
  setSelectedStageId('stage-1');
  useGameStore.getState().resetGame('warrior');
  useGameStore.getState().setBenchmarkRun(benchmark);
  useGameStore.getState().refillSubquests();
};

const progressOf = (id: string): number | undefined =>
  useGameStore.getState().subquests.find(r => r.id === id)?.progress;

/** プレイヤーの目の前に敵を置く(近接が当たる距離)。 */
const spawnInFront = (type: Parameters<typeof spawnEnemyAt>[0], patch: Record<string, unknown> = {}) => {
  const p = useGameStore.getState().player;
  const e = spawnEnemyAt(type, p.x + p.width / 2 + 4, p.y + p.height / 2, useGameStore.getState().gameTime);
  Object.assign(e, { health: 1, ...patch });
  useGameStore.setState({ enemies: [e] });
  return e;
};

beforeEach(() => { startRun(); });

describe('出撃時の補充(startGame経路)', () => {
  it('stage-1 の先頭2件が右上に載る', () => {
    expect(useGameStore.getState().subquests.map(r => r.id)).toEqual(['sq-1-1', 'sq-1-2']);
    expect(useGameStore.getState().subquests[0].label).toContain('25');
  });

  it('resetGame は表示を空に戻す(補充は startGame が reset の後に呼ぶ)', () => {
    useGameStore.getState().resetGame('warrior');
    expect(useGameStore.getState().subquests).toEqual([]);
  });

  it('台帳の無いステージ(stage-7)では何も出ない', () => {
    setSelectedStageId('stage-7');
    useGameStore.getState().resetGame('warrior');
    useGameStore.getState().refillSubquests();
    expect(useGameStore.getState().subquests).toEqual([]);
    setSelectedStageId('stage-1');
  });
});

describe('キル確定点は2本(v2監査・致命1)', () => {
  it('銃/接触/爆発キル(damageEnemy)で進捗が入る', () => {
    const e = spawnInFront('zombie');
    expect(useGameStore.getState().damageEnemy(e.id, 9999)).toBe(true);
    expect(progressOf('sq-1-1')).toBe(1);
  });

  it('★近接キル(triggerCounter → grantMeleeKillRewards)でも進捗が入る', () => {
    spawnInFront('zombie');
    useGameStore.setState(s => ({ player: { ...s.player, counterCooldownEnd: 0 } }));
    useGameStore.getState().triggerCounter();
    expect(useGameStore.getState().enemies.filter(en => en.health > 0).length).toBe(0); // 倒せている
    expect(progressOf('sq-1-1')).toBe(1);
  });

  it('色付きは kill-normal に入らず、色クエストだけを進める', () => {
    const e = spawnInFront('zombie', { colorTier: 'blue' });
    useGameStore.getState().damageEnemy(e.id, 9999);
    expect(progressOf('sq-1-1')).toBe(0);
    expect(progressOf('sq-1-2')).toBe(1);
  });
});

describe('達成(報酬は1回きり)', () => {
  const killBlues = (n: number) => {
    for (let i = 0; i < n; i++) {
      const e = spawnInFront('zombie', { colorTier: 'blue' });
      useGameStore.getState().damageEnemy(e.id, 9999);
    }
  };

  it('目標到達でゴールドが1回だけ入り、行はチェック表示で残る', () => {
    const before = useGameStore.getState().goldBalance;
    const seq = useGameStore.getState().subquestClearSeq;
    killBlues(5); // sq-1-2 = 青5体(60G・ゴールドラッシュ未所持=×1)
    const row = useGameStore.getState().subquests.find(r => r.id === 'sq-1-2');
    expect(row?.done).toBe(true);
    expect(useGameStore.getState().subquestGoldEarned).toBe(60);
    expect(useGameStore.getState().goldBalance).toBe(before + 60);
    expect(useGameStore.getState().subquestClearSeq).toBe(seq + 1); // 達成SEの合図は1回だけ
    // ★もう1体倒しても二重に払われない(達成済みは判定対象から外れている)
    killBlues(1);
    expect(useGameStore.getState().subquestGoldEarned).toBe(60);
    expect(useGameStore.getState().goldBalance).toBe(before + 60);
    expect(useGameStore.getState().subquestClearSeq).toBe(seq + 1);
  });

  it('達成は保存され、次の出撃では次のorderが補充される', () => {
    killBlues(5);
    flushSubquestSaveForTest(); // ★v0.25.3649: 書き込みは同一フレーム合流(microtask)なので直読みの前にフラッシュ
    const saved = JSON.parse(localStorage.getItem(SUBQUEST_SAVE_KEY) ?? '{}');
    expect(saved['stage-1'].cleared).toContain('sq-1-2');
    useGameStore.getState().resetGame('warrior');
    useGameStore.getState().refillSubquests();
    expect(useGameStore.getState().subquests.map(r => r.id)).toEqual(['sq-1-1', 'sq-1-3']);
  });
});

describe('★決定の固定(v0.25.3649・監査小5): NPC/召喚起因のキルも数える', () => {
  it('hateSource=ghost・damageChannel=null のキルでも進捗が入る(recordKillと同じ「全部数える」)', () => {
    const e = spawnInFront('zombie');
    const before = progressOf('sq-1-1') ?? 0;
    useGameStore.getState().damageEnemy(e.id, 9999, false, false, false, null, 'ghost');
    expect(progressOf('sq-1-1')).toBe(before + 1);
  });
});

describe('除外(ベンチ)', () => {
  it('ベンチランでは表示も進捗もゴールドも一切出ない', () => {
    startRun(true);
    expect(useGameStore.getState().subquests).toEqual([]);
    const before = useGameStore.getState().goldBalance;
    const e = spawnInFront('zombie');
    useGameStore.getState().damageEnemy(e.id, 9999);
    expect(useGameStore.getState().subquests).toEqual([]);
    expect(useGameStore.getState().goldBalance).toBe(before);
    expect(localStorage.getItem(SUBQUEST_SAVE_KEY)).toBeNull();
  });
});

describe('ハンター追跡(hunter-survive)の鏡映', () => {
  it('chase打刻からの連続秒が進捗になり、追跡が切れると0へ戻る', () => {
    // stage-4 の③がハンター(先頭2枠を消化済みにして枠へ出す)
    mem.clear();
    setSelectedStageId('stage-4');
    localStorage.setItem(SUBQUEST_SAVE_KEY, JSON.stringify({
      'stage-4': { cleared: ['sq-4-1', 'sq-4-2'], active: [] },
    }));
    resetSubquestSaveCacheForTest(); // ★ストレージを直接書いたのでキャッシュを捨てて読み直させる
    useGameStore.getState().resetGame('warrior');
    useGameStore.getState().setBenchmarkRun(false);
    useGameStore.getState().refillSubquests();
    expect(useGameStore.getState().subquests.map(r => r.id)).toEqual(['sq-4-3', 'sq-4-4']);

    useGameStore.getState().setHunterChaseSince(1000); // gameTime=1000msで追跡開始
    useGameStore.getState().applySubquestHunterSurvive(6000);
    expect(progressOf('sq-4-3')).toBe(5);
    useGameStore.getState().setHunterChaseSince(null); // 追跡が切れた
    expect(progressOf('sq-4-3')).toBe(0);
    setSelectedStageId('stage-1');
  });
});
