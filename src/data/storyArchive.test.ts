// 資料台帳(storyArchive)の純ロジック(解放の冪等性/既読管理/永続の型ガード)のユニット。
// node 既定環境には localStorage が無いので、progress.test.ts と同じ最小モックを差してから叩く。
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

import {
  ARCHIVE_RECORDS, getArchiveRecord, loadStoryArchive, saveStoryArchive, emptyStoryArchiveState,
  unlockRecordsForStage, markRecordRead, isRecordUnlocked, isRecordRead, consumeLatestUnlocked,
  unlockRecords, backfillStoryArchive, INITIAL_RECORD_IDS, ENDING_RECORD_IDS,
} from './storyArchive';

beforeEach(() => { for (const k of Object.keys(backing)) delete backing[k]; });

describe('資料台帳(ARCHIVE_RECORDS)', () => {
  it('M2の資料5件が揃っている(既存4件+共有パッケージ2026-07-23のPHILL再生医療計画)', () => {
    const m2Ids = ARCHIVE_RECORDS.filter(r => r.unlockStageId === 'stage-2').map(r => r.id);
    expect(m2Ids).toEqual([
      'mission-military-regen-plan',
      'mission-phill-plan-record',
      'mission-abnormal-growth-data',
      'mission-remote-lab-comm-log',
      'investigation_04_phill_public',
    ]);
  });

  it('getArchiveRecord: 存在するIDはレコードを返し、無いIDはundefined', () => {
    expect(getArchiveRecord('mission-military-regen-plan')?.title).toBe('軍再生医療計画');
    expect(getArchiveRecord('does-not-exist')).toBeUndefined();
  });
});

describe('loadStoryArchive / saveStoryArchive', () => {
  it('未保存時は空状態を返す', () => {
    expect(loadStoryArchive()).toEqual(emptyStoryArchiveState());
  });

  it('保存した状態がそのまま読み戻せる(ラウンドトリップ)', () => {
    const state = { clearedStageIds: ['stage-2'], unlockedRecordIds: ['a', 'b'], readRecordIds: ['a'], latestUnlockedRecordIds: ['b'] };
    saveStoryArchive(state);
    expect(loadStoryArchive()).toEqual(state);
  });

  it('壊れたJSON/型不一致は空状態にフォールバックする', () => {
    backing['zombie:storyArchive'] = '{not json';
    expect(loadStoryArchive()).toEqual(emptyStoryArchiveState());
    backing['zombie:storyArchive'] = JSON.stringify({ clearedStageIds: 'not-an-array' });
    expect(loadStoryArchive()).toEqual(emptyStoryArchiveState());
  });
});

describe('unlockRecordsForStage(冪等性=STORY_UI_SPEC.md 9章)', () => {
  const M2_RECORD_IDS = [
    'mission-military-regen-plan', 'mission-phill-plan-record',
    'mission-abnormal-growth-data', 'mission-remote-lab-comm-log',
  ];

  it('初回クリア: 渡した全IDが新規解放として返り、状態にも積まれる', () => {
    const newIds = unlockRecordsForStage('stage-2', M2_RECORD_IDS);
    expect(newIds).toEqual(M2_RECORD_IDS);
    const state = loadStoryArchive();
    expect(state.unlockedRecordIds).toEqual(M2_RECORD_IDS);
    expect(state.clearedStageIds).toEqual(['stage-2']);
    expect(state.latestUnlockedRecordIds).toEqual(M2_RECORD_IDS);
  });

  it('再クリア: 2回目は新規解放が0件で、unlockedRecordIdsも増えない(重複しない)', () => {
    unlockRecordsForStage('stage-2', M2_RECORD_IDS);
    const secondCall = unlockRecordsForStage('stage-2', M2_RECORD_IDS);
    expect(secondCall).toEqual([]);
    const state = loadStoryArchive();
    expect(state.unlockedRecordIds).toHaveLength(4);
    expect(state.unlockedRecordIds).toEqual(M2_RECORD_IDS);
  });

  it('stageId が空 / recordIds が空なら何もしない', () => {
    expect(unlockRecordsForStage('', M2_RECORD_IDS)).toEqual([]);
    expect(unlockRecordsForStage('stage-2', [])).toEqual([]);
    expect(loadStoryArchive()).toEqual(emptyStoryArchiveState());
  });

  it('別ステージの解放は既存の解放済みIDを保持したまま追加される', () => {
    unlockRecordsForStage('stage-2', M2_RECORD_IDS);
    const newIds = unlockRecordsForStage('stage-3', ['mission-remote-lab-responsible']);
    expect(newIds).toEqual(['mission-remote-lab-responsible']);
    const state = loadStoryArchive();
    expect(state.unlockedRecordIds).toHaveLength(5);
    expect(state.clearedStageIds).toEqual(['stage-2', 'stage-3']);
  });

  it('isRecordUnlocked: 解放済みはtrue、未解放はfalse', () => {
    unlockRecordsForStage('stage-2', M2_RECORD_IDS);
    expect(isRecordUnlocked('mission-military-regen-plan')).toBe(true);
    expect(isRecordUnlocked('mission-remote-lab-responsible')).toBe(false);
  });
});

describe('markRecordRead / isRecordRead', () => {
  it('開いたら既読になり、未開封はfalseのまま', () => {
    markRecordRead('mission-military-regen-plan');
    expect(isRecordRead('mission-military-regen-plan')).toBe(true);
    expect(isRecordRead('mission-phill-plan-record')).toBe(false);
  });

  it('同じIDを2回markしても readRecordIds は重複しない(冪等)', () => {
    markRecordRead('mission-military-regen-plan');
    markRecordRead('mission-military-regen-plan');
    expect(loadStoryArchive().readRecordIds).toEqual(['mission-military-regen-plan']);
  });

  it('空IDは無視する', () => {
    markRecordRead('');
    expect(loadStoryArchive().readRecordIds).toEqual([]);
  });
});

describe('backfillStoryArchive / unlockRecords(共有パッケージ2026-07-23: 遡及解放とED解放)', () => {
  const stageRecords = (id: string) =>
    id === 'stage-1' ? ['investigation_03_morphology'] : id === 'stage-2' ? ['mission-military-regen-plan'] : [];

  it('新規セーブ: 初期資料(調査記録01・02)だけが解放され、遡及はポップアップ通知に積まない', () => {
    const added = backfillStoryArchive(new Set(), () => [], { endingSeen: false, medicineOwned: false });
    expect([...added].sort()).toEqual([...INITIAL_RECORD_IDS].sort());
    const st = loadStoryArchive();
    expect([...st.unlockedRecordIds].sort()).toEqual([...INITIAL_RECORD_IDS].sort());
    expect(st.latestUnlockedRecordIds).toEqual([]);
  });

  it('クリア済み+EDフラグから不足分を遡及し、再実行では増えない(冪等)', () => {
    backfillStoryArchive(new Set(['stage-1']), stageRecords, { endingSeen: true, medicineOwned: true });
    const st = loadStoryArchive();
    expect(st.unlockedRecordIds).toContain('investigation_03_morphology');
    for (const id of ENDING_RECORD_IDS) expect(st.unlockedRecordIds).toContain(id);
    expect(st.unlockedRecordIds).toContain('mission-glen-medicine');
    const again = backfillStoryArchive(new Set(['stage-1']), stageRecords, { endingSeen: true, medicineOwned: true });
    expect(again).toEqual([]);
  });

  it('ED未視聴なら真相資料もグレンの薬も遡及しない(未達情報の先行解放なし)', () => {
    backfillStoryArchive(new Set(['stage-1']), stageRecords, { endingSeen: false, medicineOwned: false });
    const st = loadStoryArchive();
    for (const id of ENDING_RECORD_IDS) expect(st.unlockedRecordIds).not.toContain(id);
    expect(st.unlockedRecordIds).not.toContain('mission-glen-medicine');
  });

  it('既読状態は保持される(遡及/本文更新で未読へ戻さない)', () => {
    markRecordRead('investigation_01_outbreak');
    backfillStoryArchive(new Set(), () => [], { endingSeen: false, medicineOwned: false });
    expect(loadStoryArchive().readRecordIds).toEqual(['investigation_01_outbreak']);
  });

  it('unlockRecords: latestUnlockedへ追記マージ(直前のステージ解放通知を上書きしない)・冪等', () => {
    unlockRecordsForStage('stage-7', ['mission-glen-medicine']);
    unlockRecords(ENDING_RECORD_IDS);
    const st = loadStoryArchive();
    expect(st.latestUnlockedRecordIds).toContain('mission-glen-medicine');
    for (const id of ENDING_RECORD_IDS) expect(st.latestUnlockedRecordIds).toContain(id);
    expect(unlockRecords(ENDING_RECORD_IDS)).toEqual([]);
  });
});

describe('consumeLatestUnlocked(§6.18 M41「資料が追加されました」ポップアップの通知消費)', () => {
  const M2_RECORD_IDS = [
    'mission-military-regen-plan', 'mission-phill-plan-record',
    'mission-abnormal-growth-data', 'mission-remote-lab-comm-log',
  ];

  it('未解放(latestUnlockedRecordIds空)なら空配列を返し、状態も変えない', () => {
    expect(consumeLatestUnlocked()).toEqual([]);
    expect(loadStoryArchive()).toEqual(emptyStoryArchiveState());
  });

  it('直近解放分を返しつつ、latestUnlockedRecordIdsを空にして保存する(1回目)', () => {
    unlockRecordsForStage('stage-2', M2_RECORD_IDS);
    expect(loadStoryArchive().latestUnlockedRecordIds).toEqual(M2_RECORD_IDS);
    const consumed = consumeLatestUnlocked();
    expect(consumed).toEqual(M2_RECORD_IDS);
    const state = loadStoryArchive();
    expect(state.latestUnlockedRecordIds).toEqual([]);
    // unlockedRecordIds/readRecordIds など他フィールドは無変更(消費は通知だけを対象にする)。
    expect(state.unlockedRecordIds).toEqual(M2_RECORD_IDS);
  });

  it('2回目の呼び出しは空配列(通知は使い切り・再表示されない)', () => {
    unlockRecordsForStage('stage-2', M2_RECORD_IDS);
    consumeLatestUnlocked();
    expect(consumeLatestUnlocked()).toEqual([]);
  });

  it('既読状態には影響しない(通知の消費と既読化は別物)', () => {
    unlockRecordsForStage('stage-2', M2_RECORD_IDS);
    consumeLatestUnlocked();
    expect(loadStoryArchive().readRecordIds).toEqual([]);
  });
});
