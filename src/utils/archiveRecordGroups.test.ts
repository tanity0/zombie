import { describe, expect, it } from 'vitest';
import { archiveRecordGroups } from './archiveRecordGroups';
import { ARCHIVE_RECORDS, ENDING_RECORD_IDS, type ArchiveRecord } from '../data/storyArchive';
import { STAGES } from '../data/campaign';

const bySort = (a: ArchiveRecord, b: ArchiveRecord) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999);
const sorted = [...ARCHIVE_RECORDS].sort(bySort);

describe('archiveRecordGroups', () => {
  const groups = archiveRecordGroups(sorted);
  const keys = groups.map(g => g.key);

  it('全記録がちょうど1つのグループに入り、その他は出ない', () => {
    const ids = groups.flatMap(g => g.records.map(r => r.id));
    expect(ids.length).toBe(ARCHIVE_RECORDS.length);
    expect(new Set(ids).size).toBe(ARCHIVE_RECORDS.length);
    expect(keys).not.toContain('other');
  });

  it('初期資料が先頭、ステージは物語順、聴取記録の後は M7 の後・EX の前', () => {
    expect(keys[0]).toBe('start');
    const stageIdx = (id: string) => STAGES.findIndex(s => s.id === id);
    const stageKeys = keys.filter(k => k.startsWith('stage:')).map(k => k.slice('stage:'.length));
    const idxs = stageKeys.map(stageIdx);
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
    const ending = keys.indexOf('after-ending');
    expect(ending).toBeGreaterThan(0);
    const m7 = stageIdx('stage-7');
    keys.forEach((k, i) => {
      if (!k.startsWith('stage:')) return;
      const si = stageIdx(k.slice('stage:'.length));
      if (i < ending) expect(si).toBeLessThanOrEqual(m7);
      else expect(si).toBeGreaterThan(m7);
    });
    expect(ending).toBeLessThan(keys.indexOf('stage:stage-ex1'));
  });

  it('ステージの解放リストどおりに入り、ラベルは日時と場所', () => {
    const m2 = groups.find(g => g.key === 'stage:stage-2')!;
    expect(m2.label).toBe('DAY 28　PHILL再生医療研究所');
    expect(m2.records.map(r => r.id)).toContain('mission-remote-lab-comm-log');
    expect(groups.find(g => g.key === 'stage:stage-6')!.label).toBe('某日／未明　旧市街地・洋館');
  });

  it('真相資料とグレンの薬は聴取記録の後', () => {
    const ids = groups.find(g => g.key === 'after-ending')!.records.map(r => r.id);
    for (const id of ENDING_RECORD_IDS) expect(ids).toContain(id);
    expect(ids).toContain('mission-glen-medicine');
  });

  it('グループ内は入力(sortOrder)順を保つ', () => {
    for (const g of groups) {
      const orders = g.records.map(r => r.sortOrder ?? 9999);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    }
  });

  it('解放リストに無ければ unlockStageId に落ちる', () => {
    const rec: ArchiveRecord = { id: 'x-test', category: 'mission', title: 't', body: [], unlockStageId: 'stage-4' };
    expect(archiveRecordGroups([rec])[0].key).toBe('stage:stage-4');
    expect(archiveRecordGroups([{ ...rec, unlockStageId: undefined }])[0].key).toBe('other');
  });
});
