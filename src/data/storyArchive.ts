// ストーリー情報UI 第1弾(PACING_PUZZLE.md §6.17 バッチM40)の資料台帳+永続状態。
// 仕様の正 = STORY_UI_SPEC.md(7章のデータ型/6章の任務記録/9章の再プレイ挙動)。
// このファイルは「資料室UI本体(閲覧画面)」は持たない(M41でやる)。ここは:
//   1. ArchiveRecord の台帳(現状はM2の任務記録4件のみ。他ステージ/カテゴリは後続バッチで追加)
//   2. StoryArchiveState の localStorage 永続(load/save/unlockRecordsForStage/markRecordRead)
// を提供する純関数群。gameStore を経由しない(heartbeat/chronicleと同じ「必要時に1回読む」方針)。

export type ArchiveCategory = 'mutant' | 'weapon' | 'item' | 'term' | 'mission';

export interface ArchiveRecord {
  id: string;
  category: ArchiveCategory;
  title: string;
  body: string[]; // 2〜4短文程度のドラフト。差し替え前提。
  unlockStageId?: string;
}

// M2(研究所跡)の任務記録4件。タイトルは STORY_UI_SPEC.md 6章の例に準拠。本文は世界観に合わせた
// ドラフト(社長/ストーリー側の本文差し替え前提。CLAUDE.md「仕様変更のルール」によりタイトル/IDは
// 指示なく変更しない)。
export const ARCHIVE_RECORDS: ArchiveRecord[] = [
  {
    id: 'mission-military-regen-plan',
    category: 'mission',
    title: '軍再生医療計画',
    body: [
      '軍が主導していた再生医療研究の計画名。負傷兵の欠損治療を目的に発足したとされる。',
      'この研究所は計画の中枢拠点のひとつだったことが、回収データから確認された。',
    ],
    unlockStageId: 'stage-2',
  },
  {
    id: 'mission-phill-plan-record',
    category: 'mission',
    title: 'PHILL計画記録',
    body: [
      '支給装備「PHILLガン」の開発計画記録。感染発生より以前から、この研究所で運用されていた形跡がある。',
      '通常火器が通用しない個体への対抗手段として設計された可能性が高い。',
      '詳細な仕様・命名の由来は別の記録に分かれている(現時点では未回収)。',
    ],
    unlockStageId: 'stage-2',
  },
  {
    id: 'mission-abnormal-growth-data',
    category: 'mission',
    title: '異常増殖データ',
    body: [
      '壊滅直前まで記録され続けていた細胞増殖の観測データ。',
      '通常の治療で説明できる範囲を大きく超えた数値が、末尾に残されている。',
      '記録はそこで途切れている。',
    ],
    unlockStageId: 'stage-2',
  },
  {
    id: 'mission-remote-lab-comm-log',
    category: 'mission',
    // 正史M2(STORY_M0_M3.md・2026-07-17): 共同研究先の正式名称を「東部医療科学センター」に統一(旧: リモート共同研究所)。
    title: '東部医療科学センターとの通信履歴',
    body: [
      '東部医療科学センターとの定期通信ログ。',
      'データ共有と進捗報告が繰り返されており、共同研究の関係にあったことがうかがえる。',
      '直近の通信を最後に、記録は更新されていない。',
    ],
    unlockStageId: 'stage-2',
  },
  {
    // 統合正本8.3「グレンの薬」確定文面(一言一句変更しない・修正差分メモD-10で改稿)。
    // 解放=任意サブ3本完了で通常エンディング後(App側の endingFollowup 'medicine' 経路)。
    // ミッションクリアの unlockedRecordIds には載せない(条件付き解放のためステージ勝利では解放しない)。
    id: 'mission-glen-medicine',
    category: 'mission',
    title: 'グレンの薬',
    body: [
      'ミラから託された未登録薬剤。',
      '変異体を治療するためのものなのか。グレンが最後に調合したと思われるが、現状は効果不明。',
    ],
  },
];

export const getArchiveRecord = (id: string): ArchiveRecord | undefined =>
  ARCHIVE_RECORDS.find(r => r.id === id);

// STORY_UI_SPEC.md 7章の StoryArchiveState をそのまま実装。
export interface StoryArchiveState {
  clearedStageIds: string[];
  unlockedRecordIds: string[];
  readRecordIds: string[];
  latestUnlockedRecordIds: string[]; // 直近の unlockRecordsForStage 呼び出しで新規解放された分
}

export const emptyStoryArchiveState = (): StoryArchiveState => ({
  clearedStageIds: [],
  unlockedRecordIds: [],
  readRecordIds: [],
  latestUnlockedRecordIds: [],
});

const STORAGE_KEY = 'zombie:storyArchive';

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(x => typeof x === 'string');

const isValidState = (v: unknown): v is StoryArchiveState => {
  if (!v || typeof v !== 'object') return false;
  const s = v as Partial<StoryArchiveState>;
  return isStringArray(s.clearedStageIds) && isStringArray(s.unlockedRecordIds)
    && isStringArray(s.readRecordIds) && isStringArray(s.latestUnlockedRecordIds);
};

export const loadStoryArchive = (): StoryArchiveState => {
  if (typeof localStorage === 'undefined') return emptyStoryArchiveState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStoryArchiveState();
    const obj = JSON.parse(raw);
    if (!isValidState(obj)) return emptyStoryArchiveState();
    return {
      clearedStageIds: [...obj.clearedStageIds],
      unlockedRecordIds: [...obj.unlockedRecordIds],
      readRecordIds: [...obj.readRecordIds],
      latestUnlockedRecordIds: [...obj.latestUnlockedRecordIds],
    };
  } catch {
    return emptyStoryArchiveState();
  }
};

export const saveStoryArchive = (state: StoryArchiveState): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore (quota / private mode) */
  }
};

// ステージクリア確定時に呼ぶ: そのステージの recordIds(= StageMission.unlockedRecordIds)を解放する。
// 冪等(既に解放済みのIDは増えない=STORY_UI_SPEC.md 9章「同じ資料を重複解放しない」)。
// 戻り値は「今回新規に解放されたレコードID」(再クリア時は空配列)。呼び出し側(GameOverScreen)が
// 1回だけ呼ぶことの保証(refガード等)は呼び出し側の責務——ここでの冪等性は多重呼び出しの安全網。
export const unlockRecordsForStage = (stageId: string, recordIds: string[]): string[] => {
  if (!stageId || !recordIds.length) return [];
  const state = loadStoryArchive();
  const newIds = recordIds.filter(id => !state.unlockedRecordIds.includes(id));
  if (!state.clearedStageIds.includes(stageId)) state.clearedStageIds.push(stageId);
  if (newIds.length) state.unlockedRecordIds.push(...newIds);
  state.latestUnlockedRecordIds = newIds;
  saveStoryArchive(state);
  return newIds;
};

// 資料を開いた時点で既読化(冪等)。
export const markRecordRead = (id: string): void => {
  if (!id) return;
  const state = loadStoryArchive();
  if (state.readRecordIds.includes(id)) return;
  state.readRecordIds.push(id);
  saveStoryArchive(state);
};

export const isRecordUnlocked = (id: string, state: StoryArchiveState = loadStoryArchive()): boolean =>
  state.unlockedRecordIds.includes(id);

export const isRecordRead = (id: string, state: StoryArchiveState = loadStoryArchive()): boolean =>
  state.readRecordIds.includes(id);

// PACING_PUZZLE.md §6.18 バッチM41: 「資料が追加されました」ポップアップ(MissionSelectホーム)の通知消費。
// latestUnlockedRecordIds を読み出しつつ空にして保存する(呼んだら通知は消えて二度と出ない)。
// 呼び出し側はポップアップを閉じた時に1回だけ呼ぶ(未読バッジ=unlockedRecordIds−readRecordIds とは
// 別物なので、これを呼んでも未読マーク/ハブのNEWバッジは変化しない)。
export const consumeLatestUnlocked = (): string[] => {
  const state = loadStoryArchive();
  const ids = state.latestUnlockedRecordIds;
  if (!ids.length) return [];
  state.latestUnlockedRecordIds = [];
  saveStoryArchive(state);
  return ids;
};
