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
} from './storyArchive';

beforeEach(() => { for (const k of Object.keys(backing)) delete backing[k]; });

describe('資料台帳(ARCHIVE_RECORDS)', () => {
  it('M2の任務記録4件が揃っている', () => {
    const m2Ids = ARCHIVE_RECORDS.filter(r => r.unlockStageId === 'stage-2').map(r => r.id);
    expect(m2Ids).toEqual([
      'mission-military-regen-plan',
      'mission-phill-plan-record',
      'mission-abnormal-growth-data',
      'mission-remote-lab-comm-log',
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
