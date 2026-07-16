// the ONE ストーリー分岐の純関数(統合正本8〜10章 / 一括制作指示書9章)。
// 判定ロジックはここに集約してユニットテスト対象にする(実装精度の規律4: 配線ロジックの純関数化)。
// 永続の読み書きは data/progress.ts(StoryFlags)と data/storyArchive.ts が担い、ここは判定のみ。

import { getEventQuestMeta, type StoryFlags } from '../data/progress';

// 任意サブ3本のステージ割当(統合正本「任意サブ1〜3」= ステージ1/3/4。ステージ5は遭遇のみで対象外)。
export const SUB_QUEST_STAGE_IDS = ['stage-1', 'stage-3', 'stage-4'] as const;

// 任意サブ3本すべて納品済みか(subDone = ステージID→サブ納品済みフラグの読取関数)。
export const subsAllCompleted = (subDone: (stageId: string) => boolean): boolean =>
  SUB_QUEST_STAGE_IDS.every(id => subDone(id));

// 実接続用: 永続の二人組クエストメタ(eventQuestMeta)から3本完了を判定。
export const subsAllCompletedFromMeta = (): boolean =>
  subsAllCompleted(id => getEventQuestMeta(id).sub);

// 洋館［SUB］再訪カードの表示状態(統合正本9.2/9.4・指示書7.1)。
//   hidden    = 出さない(条件未成立)
//   available = 受注可能(通常ED完了+サブ3本完了+薬所持+未使用)
//   cleared   = クリア済み(CLEAR表示・非活性)
export type RevisitCardState = 'hidden' | 'available' | 'cleared';

export const revisitCardState = (flags: StoryFlags, subsDone: boolean): RevisitCardState => {
  if (flags.revisitCleared || flags.medicineUsed) return 'cleared';
  if (flags.endingSeen && subsDone && flags.medicineOwned) return 'available';
  return 'hidden';
};

// EXノード(異常変異体調査)の出現条件(統合正本10.1・指示書8.1): 再訪で薬を使用後。
// 待ち時間なしで解放してよい(表示上の時間経過は「数日後／未明」で示す)。
export const canShowEx = (flags: StoryFlags): boolean => flags.medicineUsed;

// エンディング(聴取記録)終了後の後続(統合正本8章・指示書6章):
//   medicine = サブ3本完了 → グレンの薬を付与+資料「グレンの薬」解放(→資料追加ポップアップ)
//   hint     = サブ未完了(初回のみ) → ヒントポップアップ
//   none     = どちらも出さない(薬は付与済み / ヒントは表示済み)
export type EndingFollowup = 'medicine' | 'hint' | 'none';

export const endingFollowup = (flags: StoryFlags, subsDone: boolean): EndingFollowup => {
  if (subsDone) return flags.medicineOwned ? 'none' : 'medicine';
  return flags.hintShown ? 'none' : 'hint';
};
