// 一時停止のボス一覧に出す「この出撃で出現したボス」の記録(社長指示2026-11-09「ステージスタート時のボス表示について、
// ここには出さない。プレイ中の一時停止画面に出す。そのプレイ中に出現してるボスのみ。(一度も出会ってなければ ?表示)」)。
//
// 「出現した」=この出撃中に盤上に居たことがある(休眠で置かれた物も含む)。端末の遭遇記録(utils/bossEncounter.ts =
// 戦い始めて初めて入る)とは別物で、あちらの意味は変えない。一覧の札が「?」か名前かは遭遇記録で決める。
// 作法は utils/mapSightings.ts と同じ: 記録はこのモジュールの中だけ(store へは書かない=毎ティック呼んでも購読者を起こさない)、
// 出撃ごとに resetBossAppearances で空にする(gameStore.resetGame)。
// キーは遭遇記録・sortieBossRoster の encounterKey と同じ形式(城ボスは giantbat@stage-3、それ以外は型名、変異体は mutant-*)。
import type { Enemy } from '../types/game';
import { isEngageableBoss } from './bossEngagement';
import { bossStyleSlotKey } from './ghostSlot';
import type { SortieBoss } from './sortieBossRoster';

const appeared = new Set<string>();

export const resetBossAppearances = (): void => { appeared.clear(); };

/** この出撃で出現済みの遭遇キー(テスト・確認用のコピー)。 */
export const appearedBossKeys = (): Set<string> => new Set(appeared);

/** 変異体など、出現の瞬間に個別に記録する物(遭遇記録 markBossesEncountered と同じ場所から呼ぶ)。 */
export const markBossAppeared = (encounterKey: string): void => { appeared.add(encounterKey); };

/** 盤上のボスを「出現した」として記録する(毎ティック)。新しく足したキーの数を返す。 */
export const recordBossAppearances = (enemies: readonly Pick<Enemy, 'type'>[], stageId: string): number => {
  let added = 0;
  for (const e of enemies) {
    if (!isEngageableBoss(e.type)) continue;
    const k = bossStyleSlotKey(e.type, stageId);
    if (appeared.has(k)) continue;
    appeared.add(k);
    added++;
  }
  return added;
};

/** ステージの出会い得るボスの並びのうち、この出撃で出現した物だけ(並びは元のまま)。 */
export const appearedOnly = (roster: readonly SortieBoss[], keys: ReadonlySet<string> = appeared): SortieBoss[] =>
  roster.filter(b => keys.has(b.encounterKey));
