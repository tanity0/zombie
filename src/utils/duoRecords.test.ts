// BOT_AND_GHOST.md §2.17(バッチGHOST-DUO-RECORDS): 同行撃破台帳(二枠のうちの同行枠)。
// 交戦時計(tick)→打刻(record)→台帳のベスト保持、とラン内ビューの組み立てを検証する。
// 挙動計測(playerTraits)には触れない=このテストも計測系のAPIを一切呼ばない。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadDuoAlbum, isBetterDuoClearTime, applyDuoClear,
  setDuoRunActive, recordDuoBossClear, duoClearsThisRun, resetDuoRunRecords,
  type DuoAlbum,
} from './duoRecords';
import { tickBossClocks, resetBossClocks } from './bossClock'; // v0.25.2577: 時計はボスごと共有時計へ移設
import { bossStyleSlotKey } from './playerTraits';
import type { GhostAllySnapshot } from './playerBuild';

// jsdom を使わずに済む最小 localStorage スタブ(playerTraits.test.ts / tutorialArchive.test.tsと同じ作法)。
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

const ally = (over: Partial<GhostAllySnapshot> = {}): GhostAllySnapshot => ({
  name: 'tanity', className: 'warrior', isOwn: true, ...over,
});

// 守護霊同行ラン中に、slotKeyのボスとの交戦をtで開始しdurationMsぶん時計を進める
// (v0.25.2577: 時計はボスごとの共有時計 bossClock.ts。粗いtickで十分)。
const engageFor = (slotKey: string, startGameTime: number, durationMs: number): void => {
  setDuoRunActive(true);
  tickBossClocks(new Set([slotKey]), startGameTime);
  tickBossClocks(new Set([slotKey]), startGameTime + durationMs);
};

beforeEach(() => {
  installStorage();
  resetDuoRunRecords();
  resetBossClocks();
});

describe('duoRecords: ベスト保持の純関数', () => {
  it('既存記録なし=採用 / 速い=採用 / 同値=採用(新しい方の写しが残る) / 遅い=不採用', () => {
    expect(isBetterDuoClearTime(undefined, 60_000)).toBe(true);
    expect(isBetterDuoClearTime(60_000, 50_000)).toBe(true);
    expect(isBetterDuoClearTime(60_000, 60_000)).toBe(true);
    expect(isBetterDuoClearTime(60_000, 61_000)).toBe(false);
  });

  it('applyDuoClearはadditive(他スロット不変・対象スロットのみ上書き)', () => {
    const a1 = applyDuoClear(null, 'thor', { clearTimeMs: 50_000, at: 1 });
    const a2 = applyDuoClear(a1, 'mimir', { clearTimeMs: 40_000, at: 2, ally: ally() });
    const a3 = applyDuoClear(a2, 'thor', { clearTimeMs: 30_000, at: 3 });
    expect(a3.v).toBe(1);
    expect(a3.slots.thor).toEqual({ clearTimeMs: 30_000, at: 3 });
    expect(a3.slots.mimir).toEqual({ clearTimeMs: 40_000, at: 2, ally: ally() });
  });
});

describe('duoRecords: 台帳の読み出し(localStorage耐性)', () => {
  it('未保存ならnull / 壊れたJSON・形式違いもnull(落ちない)', () => {
    expect(loadDuoAlbum()).toBeNull();
    localStorage.setItem('zombie-ghost-duo-album-v1', '{broken');
    expect(loadDuoAlbum()).toBeNull();
    localStorage.setItem('zombie-ghost-duo-album-v1', JSON.stringify({ v: 2, slots: {} }));
    expect(loadDuoAlbum()).toBeNull();
    localStorage.setItem('zombie-ghost-duo-album-v1', JSON.stringify({ v: 1, slots: { thor: { clearTimeMs: 'x', at: 1 } } }));
    expect(loadDuoAlbum()).toBeNull();
  });
});

describe('duoRecords: 交戦時計と打刻', () => {
  it('守護霊同行ラン中の撃破は「交戦開始→撃破」のタイムで台帳へ保存される', () => {
    engageFor('thor', 1_000, 45_000);
    recordDuoBossClear('thor', 'stage-3', ally());
    const album = loadDuoAlbum();
    expect(album?.slots.thor.clearTimeMs).toBe(45_000);
    expect(album?.slots.thor.ally?.name).toBe('tanity');
    const run = duoClearsThisRun();
    expect(run).toHaveLength(1);
    expect(run[0]).toMatchObject({ slotKey: 'thor', clearTimeMs: 45_000, bestBefore: null, isRecordUpdate: true });
  });

  it('スロットキーはソロ台帳と同じ規則(giantbatだけステージ別)', () => {
    engageFor('giantbat@stage-2', 0, 30_000);
    recordDuoBossClear('giantbat', 'stage-2', null);
    expect(loadDuoAlbum()?.slots[bossStyleSlotKey('giantbat', 'stage-2')]).toBeDefined();
    expect(loadDuoAlbum()?.slots['giantbat@stage-2']).toBeDefined();
  });

  it('ソロラン(ghostRunActive=false)では打刻されない(時計が開いていても)', () => {
    setDuoRunActive(false);
    tickBossClocks(new Set(['thor']), 0);
    tickBossClocks(new Set(['thor']), 40_000);
    recordDuoBossClear('thor', 'stage-3', ally());
    expect(loadDuoAlbum()).toBeNull();
    expect(duoClearsThisRun()).toHaveLength(0);
  });

  it('非交戦(時計が閉じた後)の打刻はno-op / 対象外typeもno-op', () => {
    engageFor('thor', 0, 30_000);
    tickBossClocks(new Set(), 31_000); // 交戦解除=時計が閉じる
    recordDuoBossClear('thor', 'stage-3', ally());
    expect(loadDuoAlbum()).toBeNull();

    engageFor('thor', 40_000, 10_000);
    recordDuoBossClear('zombie', 'stage-3', ally()); // isEngageableBossでない型は無視
    expect(loadDuoAlbum()).toBeNull();
  });

  // PACING_PUZZLE.md §6.38 v6 B-2(賞金首): isEngageableBossだがisGhostEligibleBossではないので無視。
  it('賞金首は同行台帳にも記録されない(isGhostEligibleBoss=false)', () => {
    engageFor('thor', 50_000, 10_000);
    recordDuoBossClear('bounty-ranged', 'stage-1', ally());
    expect(loadDuoAlbum()).toBeNull();
  });

  it('同一交戦区間内の同スロット二重打刻は1回だけ記録される(打刻で時計が閉じる)', () => {
    engageFor('thor', 0, 30_000);
    recordDuoBossClear('thor', 'stage-3', ally());
    recordDuoBossClear('thor', 'stage-3', ally());
    expect(duoClearsThisRun()).toHaveLength(1);
  });

  it('連戦: 交戦が途切れなくても2体目のタイムは2体目自身の交戦開始から数える(v0.25.2577)', () => {
    setDuoRunActive(true);
    tickBossClocks(new Set(['mimir']), 0);
    tickBossClocks(new Set(['mimir', 'thor']), 60_000); // 60秒後にthor乱入(交戦は途切れない)
    tickBossClocks(new Set(['mimir', 'thor']), 70_000);
    recordDuoBossClear('thor', 'stage-3', ally());
    expect(loadDuoAlbum()?.slots.thor.clearTimeMs).toBe(10_000); // 旧実装なら70_000だった
  });

  it('ベスト保持: 速い時だけ台帳が上書きされ、ラン内ビューには更新の有無つきで必ず積まれる', () => {
    // 1回目の交戦: 60秒で撃破=初記録
    engageFor('thor', 0, 60_000);
    recordDuoBossClear('thor', 'stage-3', ally({ name: 'first' }));
    // 2回目: 90秒(遅い)=台帳は不変・ビューには積まれる(打刻で時計が閉じるので再交戦から)
    engageFor('thor', 100_000, 90_000);
    recordDuoBossClear('thor', 'stage-3', ally({ name: 'second' }));
    expect(loadDuoAlbum()?.slots.thor.clearTimeMs).toBe(60_000);
    expect(loadDuoAlbum()?.slots.thor.ally?.name).toBe('first');
    // 3回目: 30秒(速い)=上書き
    engageFor('thor', 300_000, 30_000);
    recordDuoBossClear('thor', 'stage-3', ally({ name: 'third' }));
    expect(loadDuoAlbum()?.slots.thor.clearTimeMs).toBe(30_000);
    expect(loadDuoAlbum()?.slots.thor.ally?.name).toBe('third');

    const run = duoClearsThisRun();
    expect(run.map(r => r.isRecordUpdate)).toEqual([true, false, true]);
    expect(run.map(r => r.bestBefore)).toEqual([null, 60_000, 60_000]);
  });

  it('同行者不在(先に倒れていた等)の撃破はally未保存のまま記録される(§2.16 Aと同じ「不在なら未保存」)', () => {
    engageFor('mimir', 0, 30_000);
    recordDuoBossClear('mimir', 'stage-3', null);
    const slot = loadDuoAlbum()?.slots.mimir;
    expect(slot?.clearTimeMs).toBe(30_000);
    expect(slot?.ally).toBeUndefined();
    expect(duoClearsThisRun()[0].ally).toBeNull();
  });

  it('resetDuoRunRecordsはラン内ビューとフラグだけを捨て、台帳(localStorage)は保持する', () => {
    engageFor('thor', 0, 30_000);
    recordDuoBossClear('thor', 'stage-3', ally());
    resetDuoRunRecords();
    expect(duoClearsThisRun()).toHaveLength(0);
    expect(loadDuoAlbum()?.slots.thor.clearTimeMs).toBe(30_000);
    // リセット後はフラグが降りている=時計だけ開いていても打刻はno-op
    tickBossClocks(new Set(['mimir']), 40_000);
    recordDuoBossClear('mimir', 'stage-3', ally());
    expect(loadDuoAlbum()?.slots.mimir).toBeUndefined();
  });

  it('打刻は既存の他スロットを巻き添えにしない(additive)', () => {
    const pre: DuoAlbum = { v: 1, slots: { skadi: { clearTimeMs: 20_000, at: 5 } } };
    localStorage.setItem('zombie-ghost-duo-album-v1', JSON.stringify(pre));
    engageFor('thor', 0, 30_000);
    recordDuoBossClear('thor', 'stage-3', ally());
    const album = loadDuoAlbum();
    expect(album?.slots.skadi.clearTimeMs).toBe(20_000); // 既存スロットは不変
    expect(album?.slots.thor.clearTimeMs).toBe(30_000);
  });
});

// PACING_PUZZLE.md §10-12#4/§10-14#10(EXボス「フィル(変異体)」バッチ1): スロットキーも初回ロード時に
// 1度だけ 'giantbat@stage-ex1' → 'phillboss@stage-ex1' へ読み替える。
describe('同行台帳: 旧EXスロットキー移行', () => {
  it('旧キーの記録を新キーへ1度だけ移行し、旧キーは消える', () => {
    const pre: DuoAlbum = {
      v: 1,
      slots: { mimir: { clearTimeMs: 20_000, at: 5 }, 'giantbat@stage-ex1': { clearTimeMs: 40_000, at: 9 } },
    };
    localStorage.setItem('zombie-ghost-duo-album-v1', JSON.stringify(pre));
    const album = loadDuoAlbum();
    expect(album?.slots['phillboss@stage-ex1']).toEqual({ clearTimeMs: 40_000, at: 9 });
    expect(album?.slots['giantbat@stage-ex1']).toBeUndefined();
    expect(album?.slots.mimir).toEqual({ clearTimeMs: 20_000, at: 5 }); // 他のスロットは無傷
    // 書き戻し確認(次回ロードでも旧キーが復活しない=1度だけの移行)。
    const raw = JSON.parse(localStorage.getItem('zombie-ghost-duo-album-v1')!) as DuoAlbum;
    expect(raw.slots['giantbat@stage-ex1']).toBeUndefined();
    expect(raw.slots['phillboss@stage-ex1']).toEqual({ clearTimeMs: 40_000, at: 9 });
  });

  it('旧キーが無ければ何もしない(すでに移行済み/新規プレイヤー)', () => {
    engageFor('thor', 0, 30_000);
    recordDuoBossClear('thor', 'stage-3', ally());
    expect(loadDuoAlbum()?.slots.thor.clearTimeMs).toBe(30_000);
  });
});
