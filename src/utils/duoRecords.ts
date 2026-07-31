// BOT_AND_GHOST.md §2.17(社長裁定2026-07-31「年表は同行者の名前と、アイコンと共に別枠で載せる。
// つまりソロと同行で二枠。その上で、計測はしない」)= バッチGHOST-DUO-RECORDS の「同行枠」台帳。
//
// 守護霊同行ラン(ghostRunActive)は §2.7 制約1 で挙動計測(playerTraits)が丸ごと止まるため、
// ソロ台帳(PlayerProfile.bossStyles)には撃破が一切残らない。この台帳はその**同行ラン専用の別枠**で、
// 記録するのは**撃破タイム+同行者の写し(GhostAllySnapshot)のみ**(挙動ノブ・被弾/分・カウンター率は
// 計測由来なので存在しない=保存しない)。
//
// 掟:
// - **挙動計測(G4a/playerTraitsの計測パス)には一切触れない**(§2.7 制約1不変)。このモジュールは
//   playerTraitsから**キー関数(bossStyleSlotKey)だけ**を借りる(スロットキーのズレ防止)。
// - ソロ枠との排他は構造で成立する: 同行ランは playerTraits の session=null なので notifyBossClear が
//   no-op / ソロランは本モジュールの交戦時計が開かない(ghostRunActive=false)ので recordDuoBossClear が
//   no-op。**同じ撃破が両方の台帳に入ることは無い。**
// - 撃破タイムの定義はソロ枠と同じ**「交戦開始→撃破」**(交戦信号=directorTickが計算済みの
//   bossEngagedNowの結果を受け取るだけ。新しい交戦判定は発明しない)。時計はtickでlastGameTimeを
//   更新し、撃破の瞬間はその値を使う=ソロ(session.lastGameTime)と同tick精度。
// - 打刻は**撃破の瞬間に即保存**(ソロ枠の保留化=リザルトの採用チェックの都合であり、同行枠には
//   採用が無い(写し不可)ので保留する理由が無い)。
// - localStorage読み書きは tutorialArchive.ts と同じ作法(try/catchでプライベートモード耐性)。
// - store/React/PixiJS非依存(純関数+モジュールシングルトン=ヘッドレスでテスト可能)。
import type { EnemyType } from '../types/game';
import type { GhostAllySnapshot } from './playerBuild';
import { isEngageableBoss } from './bossEngagement';
import { bossStyleSlotKey } from './playerTraits';

// ---- 保存フォーマット -------------------------------------------------------------------------

/** 同行撃破1スロットぶんのベスト記録。ally=撃破の瞬間に同行していた守護霊の写し(不在なら未保存)。 */
export interface DuoClearSlot {
  /** 交戦開始→撃破の時間(ms)。ソロ枠のclearTimeMsと同じ定義。 */
  clearTimeMs: number;
  /** 記録時刻(Date.now()・討伐記録一覧の並び用)。 */
  at: number;
  /** 同行者の写し(ghostName/クラス/ビルド)。撃破の瞬間に守護霊が不在(先に倒れていた等)なら未保存。 */
  ally?: GhostAllySnapshot;
}

/** 同行撃破台帳。スロットキー=ソロ台帳と同じ bossStyleSlotKey(boss×stage)。 */
export interface DuoAlbum {
  v: 1;
  slots: Record<string, DuoClearSlot>;
}

const STORAGE_KEY = 'zombie-ghost-duo-album-v1';

const isValidAlbum = (v: unknown): v is DuoAlbum => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.v !== 1 || typeof o.slots !== 'object' || o.slots === null) return false;
  return Object.values(o.slots as Record<string, unknown>).every(s =>
    typeof s === 'object' && s !== null
    && typeof (s as Record<string, unknown>).clearTimeMs === 'number'
    && typeof (s as Record<string, unknown>).at === 'number');
};

/** 保存済みの同行撃破台帳。無ければ null(=まだ同行撃破が1件も無い)。 */
export const loadDuoAlbum = (): DuoAlbum | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidAlbum(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const saveDuoAlbum = (a: DuoAlbum): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    /* 保存できなくても打刻自体は成立する(このランの年表表示には残る) */
  }
};

// ---- 純関数(ベスト保持) ----------------------------------------------------------------------

/**
 * 純関数(ベスト保持判定): 既存記録が無ければ採用(true)。有れば撃破タイムが短い方を保持=
 * **新タイム ≤ 旧タイムなら上書き**(同値は新しい方=同行者の写しが新鮮。ソロ枠の
 * isBetterBossStyleSample と同じ流儀)。
 */
export const isBetterDuoClearTime = (
  prevClearTimeMs: number | undefined,
  newClearTimeMs: number,
): boolean => prevClearTimeMs === undefined || newClearTimeMs <= prevClearTimeMs;

/** 純関数: 台帳へ1スロット上書き(additive・他スロットは不変)。ベスト判定は呼び出し側が行う。 */
export const applyDuoClear = (
  prev: DuoAlbum | null,
  slotKey: string,
  slot: DuoClearSlot,
): DuoAlbum => ({ v: 1, slots: { ...(prev?.slots ?? {}), [slotKey]: slot } });

// ---- 交戦時計+ラン内の打刻(モジュールシングルトン) --------------------------------------------

// 交戦一区間(bossEngagedNowのon→off)ぶんの時計。clearedKeys=同一区間内の同スロット二重打刻防止
// (ソロ枠のsession.clearedSlotsと同じ流儀)。
interface DuoEngagement {
  startGameTime: number;
  lastGameTime: number;
  clearedKeys: Set<string>;
}

let engagement: DuoEngagement | null = null;

/** リザルト年表(同行枠)用: このランで打刻した撃破1件ぶんの読み取りビュー。 */
export interface DuoRunClearView {
  slotKey: string;
  clearTimeMs: number;
  at: number;
  ally: GhostAllySnapshot | null;
  /** 打刻**前**の保存ベストタイム(比較表示用)。初記録ならnull。 */
  bestBefore: number | null;
  /** この打刻で台帳が上書きされたか(=「記録更新」表示。打刻時点で確定済み)。 */
  isRecordUpdate: boolean;
}

let runClears: DuoRunClearView[] = [];

/**
 * 毎tick1回、directorTick(runGhostAndTraitsStep)から呼ぶ撃破タイム時計。
 * 交戦信号(inCombat)は同所が計算済みの bossEngagedNow の結果=**新しい交戦判定は発明しない**。
 * 守護霊同行ラン(ghostRunActive)以外では時計を開かない=ソロランの撃破はこの台帳に入らない。
 */
export const tickDuoClearClock = (input: {
  ghostRunActive: boolean;
  inCombat: boolean;
  gameTime: number;
}): void => {
  if (!input.ghostRunActive || !input.inCombat) {
    engagement = null;
    return;
  }
  if (!engagement) {
    engagement = { startGameTime: input.gameTime, lastGameTime: input.gameTime, clearedKeys: new Set() };
  }
  engagement.lastGameTime = input.gameTime;
};

/**
 * 同行撃破の打刻(§2.17 記録経路)。呼び出し箇所はソロ枠の notifyBossClear と同じボス撃破合流点
 * (gameStore.damageEnemyの死亡分岐+grantMeleeKillRewards)で、**計測セッションとは独立**に動く。
 * 交戦時計が開いていない(ソロラン/非交戦)・対象外type は no-op。ベスト更新時のみ台帳を即保存し、
 * ラン内ビュー(runClears)には更新の有無に関わらず積む(リザルトの同行枠年表用)。
 */
export const recordDuoBossClear = (
  bossType: EnemyType,
  stageId: string,
  ally: GhostAllySnapshot | null = null,
): void => {
  const e = engagement;
  if (!e || !isEngageableBoss(bossType)) return;
  const key = bossStyleSlotKey(bossType, stageId);
  if (e.clearedKeys.has(key)) return; // 同一交戦区間内の二重打刻防止(ソロ枠と同じ)
  e.clearedKeys.add(key);
  const clearTimeMs = e.lastGameTime - e.startGameTime;
  const at = Date.now();
  const prev = loadDuoAlbum();
  const prevBest = prev?.slots[key]?.clearTimeMs;
  const isRecordUpdate = isBetterDuoClearTime(prevBest, clearTimeMs);
  if (isRecordUpdate) {
    saveDuoAlbum(applyDuoClear(prev, key, { clearTimeMs, at, ...(ally ? { ally } : {}) }));
  }
  runClears.push({ slotKey: key, clearTimeMs, at, ally, bestBefore: prevBest ?? null, isRecordUpdate });
};

/** リザルト用の読み取りビュー(撃破順)。コピーを返す=UI側が触っても打刻記録は汚れない。 */
export const duoClearsThisRun = (): DuoRunClearView[] => runClears.map(r => ({ ...r }));

/**
 * ラン境界(gameStore.resetGame)で呼ぶ。前ランの時計とラン内ビューを持ち越さない
 * (台帳=localStorageは打刻時に確定済みなので触らない。テストのbeforeEachリセットにも使う)。
 */
export const resetDuoRunRecords = (): void => {
  engagement = null;
  runClears = [];
};
