// the ONE 進行ルートの統合テスト(一括制作指示書12「進行」)。localStorage をシムして
// 「旧セーブロード / サブ未完了一周 / サブ3本完了一周+再訪+EX」のフラグ遷移を通しで機械化する。
// (実機の通し確認の代替ではなく、永続層+判定層の配線回帰。UI/ゲームループは対象外。)
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStoryFlags, updateStoryFlags, emptyStoryFlags,
  getSelectedMission, setSelectedMission,
  getEventQuestMeta, setEventQuestMeta,
  markStageCleared, getClearedStages, isStageUnlocked, getClearedMissions, markMissionCleared,
  resetProgress,
} from './progress';
import { getStage, REVISIT_MISSION_ID } from './campaign';
import { subsAllCompletedFromMeta, revisitCardState, canShowEx, endingFollowup } from '../utils/storyProgress';
import { loadStoryArchive, unlockRecordsForStage, consumeLatestUnlocked } from './storyArchive';

// localStorage シム(node環境用・テストごとに初期化)。
const makeStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  } as Storage;
};

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = makeStorage();
});

describe('旧セーブロード(移行)', () => {
  it('キー不在=全フラグfalse・selectedMission=main(安全な初期値)', () => {
    expect(getStoryFlags()).toEqual(emptyStoryFlags());
    expect(getSelectedMission()).toBe('main');
    expect(subsAllCompletedFromMeta()).toBe(false);
  });
  it('壊れたJSON/部分フィールドも安全に読める', () => {
    localStorage.setItem('zombie.progress.storyFlags', '{broken');
    expect(getStoryFlags()).toEqual(emptyStoryFlags());
    localStorage.setItem('zombie.progress.storyFlags', JSON.stringify({ endingSeen: true, unknown: 1 }));
    expect(getStoryFlags()).toEqual({ ...emptyStoryFlags(), endingSeen: true });
  });
  it('M7戦闘前会話の既読を端末へ保存し、旧セーブでは未読として扱う', () => {
    expect(getStoryFlags().glenIntroSeen).toBe(false);
    updateStoryFlags({ glenIntroSeen: true });
    expect(getStoryFlags().glenIntroSeen).toBe(true);
  });
});

describe('サブ未完了一周(通常ED→ヒント1回→本文は共通)', () => {
  it('M7クリア→ED後: hint を一度だけ出し、薬は付与しない。再訪/EXは出ない', () => {
    // M1..M7 メインを順にクリア(サブは未納品)。
    for (let i = 1; i <= 7; i++) markStageCleared(`stage-${i}`);
    // ED終了処理(App.finishEnding 相当)。
    let follow = endingFollowup(getStoryFlags(), subsAllCompletedFromMeta());
    expect(follow).toBe('hint');
    updateStoryFlags({ endingSeen: true });
    // メニュー(MissionSelect)がヒントを出して hintShown を立てる。
    updateStoryFlags({ hintShown: true });
    // 2周目のEDでは何も出ない。
    follow = endingFollowup(getStoryFlags(), subsAllCompletedFromMeta());
    expect(follow).toBe('none');
    // 薬なし=再訪もEXも出ない。
    expect(revisitCardState(getStoryFlags(), subsAllCompletedFromMeta())).toBe('hidden');
    expect(canShowEx(getStoryFlags())).toBe(false);
    expect(getStoryFlags().medicineOwned).toBe(false);
  });
});

describe('サブ3本完了一周+再訪+EX(正史ルート通し)', () => {
  it('サブ納品(1/3/4)→ED→薬+資料→再訪available→薬使用→EX解放→EXクリア', () => {
    // 1) メイン進行+サブ納品(ゲーム内 completeEventQuest 相当=v2はmeta.deliveredの1本・§2-10)。
    for (let i = 1; i <= 7; i++) markStageCleared(`stage-${i}`);
    for (const id of ['stage-1', 'stage-3', 'stage-4']) {
      setEventQuestMeta(id, { ...getEventQuestMeta(id), delivered: true });
    }
    // stage-5 の納品(v2ではS5も同じクエストを納品する。§2-11)は3本の判定に影響しない。
    setEventQuestMeta('stage-5', { ...getEventQuestMeta('stage-5'), delivered: true });
    expect(subsAllCompletedFromMeta()).toBe(true);

    // 2) ED終了(App.finishEnding 相当): medicine 経路=薬付与+資料「グレンの薬」解放。
    expect(endingFollowup(getStoryFlags(), true)).toBe('medicine');
    updateStoryFlags({ endingSeen: true, medicineOwned: true });
    const newIds = unlockRecordsForStage('stage-7', ['mission-glen-medicine']);
    expect(newIds).toEqual(['mission-glen-medicine']);
    // メニューのポップアップが今回分を消費(以後再表示しない)。
    expect(consumeLatestUnlocked()).toEqual(['mission-glen-medicine']);
    expect(consumeLatestUnlocked()).toEqual([]);
    // 再クリアでも重複解放しない(冪等)。
    expect(endingFollowup(getStoryFlags(), true)).toBe('none');
    expect(unlockRecordsForStage('stage-7', ['mission-glen-medicine'])).toEqual([]);
    expect(loadStoryArchive().unlockedRecordIds.filter(id => id === 'mission-glen-medicine')).toHaveLength(1);

    // 3) 再訪カード=available(薬所持・未使用)。出撃選択。
    expect(revisitCardState(getStoryFlags(), true)).toBe('available');
    setSelectedMission('revisit');
    expect(getSelectedMission()).toBe('revisit');

    // 4) 保存槽で薬使用(useGlenMedicine 相当の永続部分)。
    updateStoryFlags({ medicineUsed: true, revisitCleared: true });
    markMissionCleared(REVISIT_MISSION_ID);
    expect(getClearedMissions().has('stage-6:revisit')).toBe(true);
    // 再訪カードは cleared(CLEAR+非活性)へ。stage-6 のステージクリア状態は変えない(秘密任務)。
    expect(revisitCardState(getStoryFlags(), true)).toBe('cleared');
    expect(getClearedStages().has('stage-6')).toBe(true); // M6メインのクリアはそのまま

    // 5) EX解放(待ち時間なし)。stage-7クリア済み+薬使用=ノード出現条件成立。
    expect(canShowEx(getStoryFlags())).toBe(true);
    const ex = getStage('stage-ex1')!;
    expect(isStageUnlocked(ex, getClearedStages())).toBe(true);

    // 6) EXクリア(App.handleVictory 相当=markStageCleared)。
    setSelectedMission('main');
    markStageCleared('stage-ex1');
    expect(getClearedStages().has('stage-ex1')).toBe(true);
  });

  it('resetProgress(開発用)でストーリーフラグ/選択ミッションも消える', () => {
    updateStoryFlags({ endingSeen: true, medicineOwned: true, medicineUsed: true });
    setSelectedMission('revisit');
    resetProgress();
    expect(getStoryFlags()).toEqual(emptyStoryFlags());
    expect(getSelectedMission()).toBe('main');
  });
});
