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
  resetBossEncounterCache, clearBossEncounters, unlockAllBossEncounters,
} = await import('./bossEncounter');
const { PRACTICE_SLOTS } = await import('./bossPractice');

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

// PACING_PUZZLE.md §10-12#4/§10-14#10(EXボス「フィル(変異体)」バッチ1): 旧EXボス(giantbat流用)の
// 遭遇記録キーは初回ロード時に1度だけ読み替える。
describe('旧EXボスのスロットキー移行(giantbat@stage-ex1 → phillboss@stage-ex1)', () => {
  it('旧キーの記録を新キーへ1度だけ移行し、旧キーは消える', () => {
    store.set('boss.encountered.v1', JSON.stringify(['mimir', 'giantbat@stage-ex1']));
    resetBossEncounterCache();
    expect(hasEncounteredBoss('phillboss@stage-ex1')).toBe(true);
    expect(hasEncounteredBoss('giantbat@stage-ex1')).toBe(false);
    expect(hasEncounteredBoss('mimir')).toBe(true); // 他の記録は無傷
    // 移行後は保存側からも旧キーが消えている(恒久2キー併存を避ける)。
    resetBossEncounterCache();
    const raw = JSON.parse(store.get('boss.encountered.v1')!) as string[];
    expect(raw).not.toContain('giantbat@stage-ex1');
    expect(raw).toContain('phillboss@stage-ex1');
  });

  it('旧キーが無ければ何もしない(すでに移行済み/新規プレイヤー)', () => {
    markBossesEncountered(new Set(['phillboss@stage-ex1']));
    resetBossEncounterCache();
    expect(hasEncounteredBoss('phillboss@stage-ex1')).toBe(true);
  });
});

describe('全開放(開発用・オプションの「全ステージ+ボス解放」から)', () => {
  // 社長指示v0.25.2861「ステージ解放と一緒にしちゃっていい」。導線テスト用なので、
  // 本編でまだ置かれていない3体(BOSS_MAKER.md §20-10)も含めて**台帳の全部**を開ける。
  it('台帳の全ボスが遭遇済みになる', () => {
    unlockAllBossEncounters();
    resetBossEncounterCache();
    for (const slot of PRACTICE_SLOTS) {
      expect(hasEncounteredBoss(slot.slotKey), slot.slotKey).toBe(true);
    }
    expect(loadEncounteredBosses().size).toBe(PRACTICE_SLOTS.length);
  });
});
