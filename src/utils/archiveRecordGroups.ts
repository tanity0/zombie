// 資料室: 各セクション内の記録を「入手時期(場所/DAY)」の小カテゴリーに分け、物語の時系列で並べる
// (社長指示2026-11-18「資料を入手時期(場所かDAYか)で小カテゴリー分けして時系列に並べて」)。
// 入手時期は既存データから導く(記録ごとに手書きしない):
//   INITIAL_RECORD_IDS → 初期資料 / STAGES の main.unlockedRecordIds(無ければ unlockStageId)→ そのステージ /
//   ENDING_RECORD_IDS とグレンの薬 → 聴取記録の後(M7の後・EXの前)/ どれにも当たらない → その他。
// 解放の時期そのものは変えない(表示の並べ方だけ)。
import { STAGES, type Stage } from '../data/campaign';
import { ENDING_RECORD_IDS, INITIAL_RECORD_IDS, type ArchiveRecord } from '../data/storyArchive';

export interface ArchiveRecordGroup {
  key: string;
  label: string;
  records: ArchiveRecord[];
}

// 通常エンディング(聴取記録)の後に手に入る記録。グレンの薬は別条件だが時期は同じ。
export const AFTER_ENDING_EXTRA_RECORD_IDS = ['mission-glen-medicine'] as const;
// 聴取記録の後は、このステージの直後・次のステージ(EX)の前に並ぶ。
const ENDING_AFTER_STAGE_ID = 'stage-7';

export const archiveStageGroupLabel = (stage: Pick<Stage, 'day' | 'timeLabel' | 'locationTitle'>): string =>
  `${stage.timeLabel ?? `DAY ${stage.day}`}\u3000${stage.locationTitle}`;

interface GroupSlot { key: string; label: string; rank: number }

const resolveSlot = (record: ArchiveRecord, stages: readonly Stage[]): GroupSlot => {
  if ((INITIAL_RECORD_IDS as readonly string[]).includes(record.id)) {
    return { key: 'start', label: '初期資料', rank: -1 };
  }
  const endingIndex = stages.findIndex(s => s.id === ENDING_AFTER_STAGE_ID);
  if ((ENDING_RECORD_IDS as readonly string[]).includes(record.id)
    || (AFTER_ENDING_EXTRA_RECORD_IDS as readonly string[]).includes(record.id)) {
    return { key: 'after-ending', label: '聴取記録の後', rank: endingIndex * 10 + 5 };
  }
  // ステージの解放リストを優先(実際に解放する側)。無ければ unlockStageId。
  let index = stages.findIndex(s => (s.main.unlockedRecordIds ?? []).includes(record.id));
  if (index < 0 && record.unlockStageId) index = stages.findIndex(s => s.id === record.unlockStageId);
  if (index >= 0) {
    const stage = stages[index];
    return { key: `stage:${stage.id}`, label: archiveStageGroupLabel(stage), rank: index * 10 };
  }
  return { key: 'other', label: 'その他', rank: Number.MAX_SAFE_INTEGER };
};

// records の並び(呼び出し側の sortOrder 順)をグループ内で保ったまま、グループを時系列に並べる。
export const archiveRecordGroups = (
  records: readonly ArchiveRecord[],
  stages: readonly Stage[] = STAGES,
): ArchiveRecordGroup[] => {
  const groups = new Map<string, ArchiveRecordGroup & { rank: number }>();
  for (const r of records) {
    const slot = resolveSlot(r, stages);
    let g = groups.get(slot.key);
    if (!g) {
      g = { key: slot.key, label: slot.label, rank: slot.rank, records: [] };
      groups.set(slot.key, g);
    }
    g.records.push(r);
  }
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank)
    .map(({ key, label, records: rs }) => ({ key, label, records: rs }));
};
