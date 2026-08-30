// キャンペーン進行(クリア済みステージ / 直近に選んだステージ)の保存。
// ゲームロジックには触れず localStorage だけで完結させる(導線の解放制御用)。
// メインミッションをクリアすると次ステージが解放される。EX は前提ステージのクリアで解放。

import { STAGES, getStage, type Stage } from './campaign';
import { getEventQuestConfig } from '../utils/eventQuest';
import { clearBossEncounters, unlockAllBossEncounters } from '../utils/bossEncounter';
// ★練習ランの出撃先(下の「実行時上書き」)。import方向は progress→bossPractice の一方通行
// (bossPractice側はprogressを読まない)。逆向き(bossPractice→progress)にすると
// bossPractice→progress→bossEncounter→bossPractice の循環になるので注意。
import { practiceActiveSlot } from '../utils/bossPractice';

const CLEARED_KEY = 'zombie.progress.cleared';
const SELECTED_KEY = 'zombie.progress.selectedStage';
const FREE_KEY = 'zombie.progress.selectedFree'; // 直近の出撃がフリー(周回)か

// ---------------------------------------------------------------------------------------------
// ★練習ラン(ボスモード/ガントレット)の出撃先の実行時上書き(v0.25.3629)
//
// 社長実機観察「ステージボス枠がどれもずっと同じ(stage-1に見える)ボスと戦っている」の真因対応。
// 旧実装は出撃時に setSelectedStageId(slot.stageId) を localStorage へ書いていたが、その書き込みは
// beginPracticeRun の**後**に走るため、practiceGuard(練習中は localStorage 書き込みを全封鎖する関所)
// が**黙って飲んでいた**。結果、選択中のままのステージ(新規プロファイルでは ''=未指定)で全枠が走り、
// getSelectedStageId() 依存の全て——城ボスの固有技/大技・ボスHP・カットイン名・背景・
// storyBoss(グレン/EX1 はこれが立たないと**そもそも湧かない**)——がステージ不明のまま動いていた。
// ガントレットは一度も練習ランを抜けない設計なので「先に書いてから begin する」順序替えでは直らない。
// ⇒ 練習中の出撃先は localStorage ではなく**実行中の練習枠(practiceActiveSlot)そのもの**を正とする
//    (関所の「練習は何も書き残さない」思想とも一致)。枠は beginPracticeRun / endPracticeRun の
//    寿命と機械的に一致するので、復元漏れが構造上起きない。
// ---------------------------------------------------------------------------------------------

const readSet = (): Set<string> => {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(CLEARED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
};

const writeSet = (set: Set<string>): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CLEARED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore (quota / private mode) */
  }
};

export const getClearedStages = (): Set<string> => readSet();

export const markStageCleared = (stageId: string): void => {
  if (!stageId) return;
  // ステージ6は年表に「クリア」だけを載せる(社長指示v0.25.2150)。初回クリア時に1回だけ記録
  // (recordChronicleのdedupと下のreadSetガードで二重に冪等)。再訪(SUB)はmissionが'revisit'のため通らない。
  if (stageId === 'stage-6' && getSelectedMission() === 'main') {
    recordChronicle('stage-6', 'clear', 'clear', 'クリア');
  }
  const set = readSet();
  if (set.has(stageId)) return;
  set.add(stageId);
  writeSet(set);
  // PACING_PUZZLE.md §6.19 M42 / STORY_UI_SPEC.md追補1-5: 「MAINクリア時に両方へ記録」。
  // 現状は全ステージがMAINミッション1本のみ(SUBの選択導線は無い)ので、既存のステージクリア
  // (=MAIN初回クリア)と同じ瞬間にミッション単位クリア集合(missionId)も additive に記録する。
  markMissionCleared(missionIdForMain(stageId));
};

// ───────────────────────────────────────────────────────────────────────────
// PACING_PUZZLE.md §6.19 M42 / STORY_UI_SPEC.md追補1-4/5: ミッション単位のクリア集合。
// 既存のステージクリア保存(CLEARED_KEY)は変更せず、missionId(`${stageId}:main` 形式)ベースの
// 別集合を別キーで保存する(additive・移行不要)。MAINとSUBのクリア状態を混同しないための器
// (現状はMAINのみ配線。SUBの選択導線はまだ無い)。
const CLEARED_MISSIONS_KEY = 'zombie.progress.clearedMissions';

// メインミッションのmissionId(`${stageId}:main`)を返す純関数。将来SUBが増えても衝突しない命名。
export const missionIdForMain = (stageId: string): string => `${stageId}:main`;

const readMissionSet = (): Set<string> => {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(CLEARED_MISSIONS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
};

const writeMissionSet = (set: Set<string>): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CLEARED_MISSIONS_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore (quota / private mode) */
  }
};

export const getClearedMissions = (): Set<string> => readMissionSet();

export const markMissionCleared = (missionId: string): void => {
  if (!missionId) return;
  const set = readMissionSet();
  if (set.has(missionId)) return;
  set.add(missionId);
  writeMissionSet(set);
};

// 前提ステージ(unlockBy)がクリア済みなら解放。最初のステージ(unlockBy=null)は常に解放。
export const isStageUnlocked = (stage: Stage, cleared: Set<string> = readSet()): boolean =>
  stage.unlockBy === null || cleared.has(stage.unlockBy);

export const getSelectedStageId = (): string => {
  const slot = practiceActiveSlot();
  if (slot) return slot.stageId; // 練習ラン中は枠の出撃先が正(上の★)
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(SELECTED_KEY) ?? '';
  } catch {
    return '';
  }
};

export const setSelectedStageId = (stageId: string): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (stageId) localStorage.setItem(SELECTED_KEY, stageId);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    /* ignore */
  }
};

// フリー(周回)出撃フラグ。会話なし & クリア進行に影響させない出撃かどうか。
export const getSelectedFreeMode = (): boolean => {
  if (practiceActiveSlot()) return false; // 練習ラン中は常にフリーではない(上の★)
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(FREE_KEY) === '1';
  } catch {
    return false;
  }
};

export const setSelectedFreeMode = (free: boolean): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (free) localStorage.setItem(FREE_KEY, '1');
    else localStorage.removeItem(FREE_KEY);
  } catch {
    /* ignore */
  }
};

// ステージ別ハイスコア(stageId -> best totalScore)。localStorage に JSON で保存。
const HIGHSCORE_KEY = 'zombie.progress.highscores';
const readScores = (): Record<string, number> => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(HIGHSCORE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj as Record<string, number> : {};
  } catch {
    return {};
  }
};
const writeScores = (m: Record<string, number>): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};
export const getStageHighScore = (stageId: string): number => (stageId ? (readScores()[stageId] ?? 0) : 0);
// 記録更新なら true(=ハイスコア達成)。同点以下は false。
export const submitStageHighScore = (stageId: string, score: number): boolean => {
  if (!stageId || score <= 0) return false;
  const m = readScores();
  if ((m[stageId] ?? 0) >= score) return false;
  m[stageId] = score;
  writeScores(m);
  return true;
};

// ───────────────────────────────────────────────────────────────────────────
// 拠点の長期成長(Lv/EXP)。出撃中の一時状態(open/captured・HP・滞在・攻撃者・軍人・safeBaseId)とは
// 完全に別の「永続進捗」。死亡 / 帰還 / クリア / resetGame / アプリ再起動をまたいで残る(localStorageのみ)。
//   ・キー = `${stageId}::${baseId}` でステージ×拠点ごとに個別保持(ステージ1の東=ステージ2の東とは別)。
//   ・未登録の拠点は Lv1 / EXP0 とみなす。
// ※ Step2 は「保存構造の追加」まで。EXP加算/Lvアップ/補正は次Step(ここでは書き込み口=setBaseGrowth のみ用意)。
export interface BaseGrowth { level: number; exp: number; }
const BASE_GROWTH_KEY = 'zombie.progress.baseGrowth';
const baseGrowthKey = (stageId: string, baseId: string): string => `${stageId}::${baseId}`;
type BaseGrowthMap = Record<string, BaseGrowth>;

export const loadBaseGrowth = (): BaseGrowthMap => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BASE_GROWTH_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj as BaseGrowthMap : {};
  } catch {
    return {};
  }
};

export const saveBaseGrowth = (m: BaseGrowthMap): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(BASE_GROWTH_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};

// 未登録は Lv1/EXP0。読み出し専用(出撃中状態には触れない)。
export const getBaseGrowth = (stageId: string, baseId: string, m: BaseGrowthMap = loadBaseGrowth()): BaseGrowth => {
  const v = m[baseGrowthKey(stageId, baseId)];
  if (v && Number.isFinite(v.level) && Number.isFinite(v.exp)) {
    return { level: Math.max(1, Math.floor(v.level)), exp: Math.max(0, Math.floor(v.exp)) };
  }
  return { level: 1, exp: 0 };
};

// 書き込み(永続)。次Step の EXP加算/Lvアップから使う。Step2 では未配線(構造のみ)+デバッグ確認用。
export const setBaseGrowth = (stageId: string, baseId: string, growth: BaseGrowth): void => {
  if (!stageId || !baseId) return;
  const m = loadBaseGrowth();
  m[baseGrowthKey(stageId, baseId)] = { level: Math.max(1, Math.floor(growth.level)), exp: Math.max(0, Math.floor(growth.exp)) };
  saveBaseGrowth(m);
};

// デバッグ/UI表示用: 現ステージの全拠点(base-0..baseCount-1)の Lv/EXP(未登録=Lv1/EXP0)。
export const getBaseGrowthForStage = (stageId: string, baseCount = 4): { baseId: string; level: number; exp: number }[] => {
  const m = loadBaseGrowth();
  return Array.from({ length: baseCount }, (_, i) => {
    const baseId = `base-${i}`;
    const g = getBaseGrowth(stageId, baseId, m);
    return { baseId, level: g.level, exp: g.exp };
  });
};

// ───────────────────────────────────────────────────────────────────────────
// バッチM14(§5.17): 到達譜=二軸の壁(深さ×ランク)のステージ毎メタ。
// 踏破フラグ×4(区域境界)+ランク到達フラグ×7(七つの大罪)+自己最深(距離px)+自己最高ランク。
// ステージ毎に個別保持(baseGrowthと同じキー方針=stageIdでオブジェクトを分ける)。
export interface WallMeta {
  zoneReached: boolean[];      // 長さ4
  rankReached: boolean[];      // 長さ7
  selfDeepestDist: number;
  selfHighestRank: number;     // 1-7
}
const WALL_META_KEY = 'zombie.progress.wallMeta';
type WallMetaMap = Record<string, WallMeta>;

export const emptyWallMeta = (): WallMeta => ({
  zoneReached: [false, false, false, false],
  rankReached: [false, false, false, false, false, false, false],
  selfDeepestDist: 0,
  selfHighestRank: 1,
});

const isValidWallMeta = (v: unknown): v is WallMeta => {
  if (!v || typeof v !== 'object') return false;
  const m = v as Partial<WallMeta>;
  return Array.isArray(m.zoneReached) && m.zoneReached.length === 4
    && Array.isArray(m.rankReached) && m.rankReached.length === 7;
};

const loadWallMetaMap = (): WallMetaMap => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(WALL_META_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj as WallMetaMap : {};
  } catch {
    return {};
  }
};

const saveWallMetaMap = (m: WallMetaMap): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(WALL_META_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};

// 未登録(または壊れたデータ)は初期値。読み出し専用。
export const getWallMeta = (stageId: string, m: WallMetaMap = loadWallMetaMap()): WallMeta => {
  const v = m[stageId];
  if (isValidWallMeta(v)) {
    return {
      zoneReached: [...v.zoneReached],
      rankReached: [...v.rankReached],
      selfDeepestDist: Number.isFinite(v.selfDeepestDist) ? v.selfDeepestDist : 0,
      selfHighestRank: Number.isFinite(v.selfHighestRank) ? Math.max(1, Math.min(7, Math.round(v.selfHighestRank))) : 1,
    };
  }
  return emptyWallMeta();
};

export const setWallMeta = (stageId: string, meta: WallMeta): void => {
  if (!stageId) return;
  const m = loadWallMetaMap();
  m[stageId] = meta;
  saveWallMetaMap(m);
};

// ───────────────────────────────────────────────────────────────────────────
// ランク持ち越し=廃止(PACING_PUZZLE.md §7-11c(2)・決定済み仕様)。旧・startRankマップ
// (carryOverStartRank/getStartRank/setStartRankFromFinal)とステージ別開始最低ランク
// (stageMinStartRank/effectiveStartRank/stageInRunFloorRank)はここにあったが、「全ランR1固定
// スタート+時間経過で上がる床(rankFloor.ts)」へ置換されたため削除した。旧localStorageキー
// 'zombie.progress.startRank' は以後書き込まれない(読み出しも無し=残っていても無害な死蔵データ)。
// ───────────────────────────────────────────────────────────────────────────
// バッチM20(§5.21): 囲いゲート(1/2)の恒久解除メタ。ステージ毎に個別保持(WallMetaと同じ方針)。
// 社長決定v0.25.1518: クリアし、そのランを死亡以外(クリア/撤退)で終えると以後のランで出現しなくなる。
// ★簡略化(実装チャットの現時点の判断・後日精緻化の余地あり): 「死亡以外で終える」の正確な区別
// (クリア直後に死亡した場合は解除しない、等)はまだ配線しておらず、クリアした瞬間に即座に解除済みへ
// マークしている。死亡してもゲート解除が取り消されない、という点で社長決定より緩い(不利ではなく
// 有利側にずれた簡略化)。
export interface GateMeta {
  gate1Cleared: boolean;
  gate2Cleared: boolean;
}
const GATE_META_KEY = 'zombie.progress.gateMeta';
type GateMetaMap = Record<string, GateMeta>;

export const emptyGateMeta = (): GateMeta => ({ gate1Cleared: false, gate2Cleared: false });

const loadGateMetaMap = (): GateMetaMap => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(GATE_META_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj as GateMetaMap : {};
  } catch {
    return {};
  }
};

const saveGateMetaMap = (m: GateMetaMap): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(GATE_META_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};

export const setGateMeta = (stageId: string, meta: GateMeta): void => {
  if (!stageId) return;
  const m = loadGateMetaMap();
  m[stageId] = meta;
  saveGateMetaMap(m);
};

// ───────────────────────────────────────────────────────────────────────────
// 二人組(クエストNPC)の進捗メタ(EVENT_QUEST_DESIGN.md・社長裁定v0.25.1686)。ステージ毎に
// 「納品済み(delivered)」を永続保持(GateMeta と同じ方針)。
//   ・納品済み=二人は以後そのステージに出現しない。
//   ・完了は1度きり(受注のみで死亡した場合は次runで再受注可=run内状態は保存しない)。
// 旧v0.25.1684の 'zombie.progress.eventQuestDone'(stageIdのSet)は目標なし時代の完了フラグ
// なので読まずに廃棄する(resetProgressで掃除)。
// v2(EVENT_QUEST_DESIGN.md §2-10): 完了フラグは delivered(納品成立)の1本へ作り替えた。
// 旧 forced/sub は v1 の名残(acceptEventQuest/completeEventEncounterはv2では呼ばれない死に経路だが、
// ★未決#14「storyCanonテストの書き換え」の裁定が出るまでencounterOnlyごと撤去しない=型を壊さない
// ためoptionalで残す。v2で読み書きするのはdeliveredだけ)。
export interface EventQuestMeta { delivered: boolean; forced?: boolean; sub?: boolean; }
const EVENT_QUEST_META_KEY = 'zombie.progress.eventQuestMeta';
const LEGACY_EVENT_QUEST_DONE_KEY = 'zombie.progress.eventQuestDone';
type EventQuestMetaMap = Record<string, EventQuestMeta>;

export const emptyEventQuestMeta = (): EventQuestMeta => ({ delivered: false });

const isValidEventQuestMeta = (v: unknown): v is EventQuestMeta => {
  if (!v || typeof v !== 'object') return false;
  const m = v as Partial<EventQuestMeta>;
  if (typeof m.delivered !== 'boolean') return false;
  if (m.forced !== undefined && typeof m.forced !== 'boolean') return false;
  if (m.sub !== undefined && typeof m.sub !== 'boolean') return false;
  return true;
};

const loadEventQuestMetaMap = (): EventQuestMetaMap => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(EVENT_QUEST_META_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj as EventQuestMetaMap : {};
  } catch {
    return {};
  }
};

const saveEventQuestMetaMap = (m: EventQuestMetaMap): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(EVENT_QUEST_META_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};

export const getEventQuestMeta = (stageId: string, m: EventQuestMetaMap = loadEventQuestMetaMap()): EventQuestMeta => {
  const v = m[stageId];
  return isValidEventQuestMeta(v) ? { ...v } : emptyEventQuestMeta();
};

export const setEventQuestMeta = (stageId: string, meta: EventQuestMeta): void => {
  if (!stageId) return;
  const m = loadEventQuestMetaMap();
  m[stageId] = meta;
  saveEventQuestMetaMap(m);
};

// ───────────────────────────────────────────────────────────────────────────
// 城ボス(giantbat)クリアフラグ(ステージ毎・永続)。討伐の瞬間に立てる(年表と同じA方式=
// その後死亡しても取り消さない)。次ステージ解放の条件の片翼(下の syncQuestStageClear)。
const CASTLE_BOSS_KEY = 'zombie.progress.castleBoss';

const readCastleBossSet = (): Set<string> => {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(CASTLE_BOSS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
};

const writeCastleBossSet = (s: Set<string>): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(CASTLE_BOSS_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
};

export const getCastleBossCleared = (stageId: string): boolean =>
  !!stageId && readCastleBossSet().has(stageId);

export const markCastleBossCleared = (stageId: string): void => {
  if (!stageId) return;
  const s = readCastleBossSet();
  if (s.has(stageId)) return;
  s.add(stageId);
  writeCastleBossSet(s);
};

// 次ステージ解放の同期(社長裁定v0.25.1686 #4): クエスト設定のあるステージは
// 「城ボスクリアフラグ && 強制クリアフラグ」が揃った瞬間にクリア扱い(=次ステージ出現)。
// 強制を課さないステージ(cfg.forced=false: 3/4/5)は最初からクリア済み扱い=城ボスのみで解放。
// クエスト設定の無いステージはこの関数は何もしない(従来どおり勝利時 markStageCleared)。
// 城ボス討伐時と強制クエスト納品時の両方から呼ぶ(冪等)。
// v2(EVENT_QUEST_DESIGN.md §2-10): S1/S3/S4/S5は同じ1本のクエスト(レスキュー→城ボス→納品)を
// 回すので、ステージによって条件が変わる理由がもう無い。★`cfg.forced`は読まない
// (`!cfg.forced || …`を残すと forced:false の S3/S4/S5 は常に true=納品せずに解放される事故になる)。
export const syncQuestStageClear = (stageId: string): void => {
  if (!stageId) return;
  const cfg = getEventQuestConfig(stageId);
  if (!cfg) return;
  if (getEventQuestMeta(stageId).delivered && getCastleBossCleared(stageId)) markStageCleared(stageId);
};

// ───────────────────────────────────────────────────────────────────────────
// 小烏丸(murasame)解禁フラグ(永続・全ステージ共通)。裏ボス「トール」初回討伐の瞬間に立てる
// (年表と同じA方式=その後死亡しても取り消さない)。解禁後は刀Lv3(MAX)で武器商人に小烏丸が並ぶ
// (gameStore.maybeUnlockMurasame)。
const KOGARASU_KEY = 'zombie.progress.kogarasuUnlocked';

export const isKogarasuUnlocked = (): boolean => {
  if (typeof localStorage === 'undefined') return false;
  try { return localStorage.getItem(KOGARASU_KEY) === '1'; } catch { return false; }
};

// 立てた瞬間だけ true を返す(既に立っていれば false)。リザルトの解禁ポップアップを
// 初回討伐のランに限定するための戻り値。
export const markKogarasuUnlocked = (): boolean => {
  if (typeof localStorage === 'undefined') return false;
  if (isKogarasuUnlocked()) return false;
  try { localStorage.setItem(KOGARASU_KEY, '1'); } catch { /* ignore */ }
  return true;
};

// ───────────────────────────────────────────────────────────────────────────
// the ONE ストーリー分岐フラグ(統合正本8〜10章 / 一括制作指示書9章)。
// 旧セーブ移行: キー不在・フィールド欠損は全て false 扱い(安全な初期値・additive)。
//   endingSeen     = 通常エンディング(聴取記録)を最後まで見た
//   hintShown      = サブ未完了ヒント(8.2)を表示済み(初回のみ表示)
//   medicineOwned  = グレンの薬を所持(任意サブ3本完了でM7クリア→ED後に付与)
//   medicineUsed   = 洋館再訪で薬を使用済み(=EX解放条件)
//   revisitCleared = 洋館［SUB］再訪クリア
//   glenIntroSeen  = M7戦闘前会話を一度表示済み(以後は会話を省略)
export interface StoryFlags {
  endingSeen: boolean;
  hintShown: boolean;
  medicineOwned: boolean;
  medicineUsed: boolean;
  revisitCleared: boolean;
  glenIntroSeen: boolean;
}
const STORY_FLAGS_KEY = 'zombie.progress.storyFlags';

export const emptyStoryFlags = (): StoryFlags => ({
  endingSeen: false,
  hintShown: false,
  medicineOwned: false,
  medicineUsed: false,
  revisitCleared: false,
  glenIntroSeen: false,
});

export const getStoryFlags = (): StoryFlags => {
  const base = emptyStoryFlags();
  if (typeof localStorage === 'undefined') return base;
  try {
    const raw = localStorage.getItem(STORY_FLAGS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    if (obj && typeof obj === 'object') {
      for (const k of Object.keys(base) as (keyof StoryFlags)[]) {
        const v = (obj as Record<string, unknown>)[k];
        if (typeof v === 'boolean') base[k] = v;
      }
    }
    return base;
  } catch {
    return base;
  }
};

export const setStoryFlags = (flags: StoryFlags): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(STORY_FLAGS_KEY, JSON.stringify(flags)); } catch { /* ignore */ }
};

// 部分更新(読み→マージ→保存)。更新後のフラグを返す。
export const updateStoryFlags = (patch: Partial<StoryFlags>): StoryFlags => {
  const next = { ...getStoryFlags(), ...patch };
  setStoryFlags(next);
  return next;
};

// 出撃するミッションの選択('main'=各ステージのメイン / 'revisit'=洋館［SUB］再訪)。
// MissionSelect の出撃導線が設定し、App(会話/勝利処理)とリザルトが参照する。既定は 'main'。
export type SelectedMission = 'main' | 'revisit';
const SELECTED_MISSION_KEY = 'zombie.progress.selectedMission';

export const getSelectedMission = (): SelectedMission => {
  if (practiceActiveSlot()) return 'main'; // 練習ラン中は常に'main'(上の★・stage-6練習のrevisit化け防止)
  if (typeof localStorage === 'undefined') return 'main';
  try {
    return localStorage.getItem(SELECTED_MISSION_KEY) === 'revisit' ? 'revisit' : 'main';
  } catch {
    return 'main';
  }
};

export const setSelectedMission = (m: SelectedMission): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (m === 'revisit') localStorage.setItem(SELECTED_MISSION_KEY, 'revisit');
    else localStorage.removeItem(SELECTED_MISSION_KEY);
  } catch {
    /* ignore */
  }
};

// ───────────────────────────────────────────────────────────────────────────
// 歴史年表(chronicle): 各ステージの要所マイルストーンを「初回のみ」永続記録する読み取り専用の記録
// (社長決定v0.25.1628)。タイトル画面に縦の年表として時系列で並べる(各個人の軌跡)。
//   ・記録タイミング = マイルストーン達成の瞬間に即載せ(個別討伐と同じA方式=死亡/帰還/タスクキルに
//     依らず、達成した瞬間に localStorage へ)。ステージクリアは年表に含めない(社長のリスト対象外)。
//   ・dedup = 初回のみ(`${stageId}::${kind}::${detail}` が既にあれば無視・社長決定)。
//   ・種別: zone(区域到達) / rank(ランク到達) / boss(各種ボス討伐) / base(拠点解放) /
//     hunter(ハンター討伐) / reaper(死神討伐) / redNight(紅き夜を越えた) /
//     cave(洞窟発見=将来ステージに洞窟を置いた時用・型だけ予約し現状は未配線)。
// 'clear'=ステージクリア(現状ステージ6のみ・社長指示v0.25.2150「ステージ6はクリアしたか否かだけ」)。
// 'poi'=寄り道POI開放(警察署/武器庫/病院・社長裁定2026-07-31「初めて警察署を開放 ね」=種別ごと
//   ゲーム全体で初回のみ。detail=PoiKind('police'|'armory'|'hospital'))。
export type ChronicleKind = 'zone' | 'rank' | 'boss' | 'base' | 'hunter' | 'reaper' | 'redNight' | 'cave' | 'clear' | 'poi';

export interface ChronicleEntry {
  key: string;          // dedup キー = `${stageId}::${kind}::${detail}`
  stageId: string;
  kind: ChronicleKind;
  label: string;        // 表示文(ステージ見出しを含む完成形)
  at: number;           // 記録時刻(Date.now()。時系列の並べ替え用)
}
const CHRONICLE_KEY = 'zombie.progress.chronicle';

export const loadChronicle = (): ChronicleEntry[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CHRONICLE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((e): e is ChronicleEntry =>
      !!e && typeof e === 'object' &&
      typeof e.key === 'string' && typeof e.stageId === 'string' &&
      typeof e.kind === 'string' && typeof e.label === 'string' && typeof e.at === 'number')
      // ステージ6の道中記録(エリア/ランク/討伐等)は年表に載せない(社長指示v0.25.2150
      // 「クリアしたか否かだけ」)。既存セーブに記録済みの分も読み出しで非表示(データは残す=可逆)。
      .filter(e => !(e.stageId === 'stage-6' && e.kind !== 'clear'));
  } catch {
    return [];
  }
};

const saveChronicle = (list: ChronicleEntry[]): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(CHRONICLE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
};

// ステージ見出し(main=「ステージN」/ ex・free=地名)。年表ラベルの接頭に使う。
export const stageChronicleLabel = (stageId: string): string => {
  const st = getStage(stageId);
  if (!st) return '';
  return st.kind === 'main' ? `ステージ${st.index}` : st.name;
};

// 年表の「初ミッション」行の実日付(社長指示v0.25.1772)。初回参照時に永続化して以後固定
// (既存プレイヤーは最古エントリの日付で初期化=「実際に始めた日」に最も近い値)。
const CHRONICLE_START_KEY = 'zombie.progress.chronicleStart';
export const getChronicleStartAt = (): number => {
  const entries = loadChronicle();
  const fallback = entries.length ? Math.min(...entries.map(e => e.at)) : Date.now();
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(CHRONICLE_START_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
    localStorage.setItem(CHRONICLE_START_KEY, String(fallback));
    return fallback;
  } catch {
    return fallback;
  }
};

// マイルストーンを初回のみ記録する(既に同キーがあれば false=何もしない)。phrase=ステージ見出しを
// 除いた出来事の文(例「深層域に到達」)。ステージ見出しは内部で前置する。イベント発火時のみ呼ばれる
// (毎フレームではない)ので localStorage 読み書き1回で十分軽い(負荷1/10)。
export const recordChronicle = (
  stageId: string, kind: ChronicleKind, detail: string, phrase: string
): boolean => {
  if (!stageId) return false;
  // ステージ6(洋館通路)は道中の年表記録をしない(社長指示v0.25.2150「クリアしたか否かだけ。
  // あとは薬・特殊変異体の件」)。クリア(kind='clear')だけ通す。薬(再訪=SUB)・EX(特殊変異体)は
  // 別ミッション/別ステージIDなのでこのフィルタには掛からない。
  if (stageId === 'stage-6' && kind !== 'clear') return false;
  const key = `${stageId}::${kind}::${detail}`;
  const list = loadChronicle();
  if (list.some(e => e.key === key)) return false;
  const prefix = stageChronicleLabel(stageId);
  list.push({ key, stageId, kind, label: prefix ? `${prefix} ${phrase}` : phrase, at: Date.now() });
  saveChronicle(list);
  return true;
};

// 年表の「ゲーム全体で初回のみ」記録(社長裁定2026-07-31)。拠点は「初めて拠点を開放」の1件だけ、
// POIは「初めて警察署を開放」等**種別(detail)ごとに全体1件**だけを載せる(2件目以降はどのステージでも
// 載せない=年表が同種で埋まるのを防ぐ)。ガードは kind 単位(perDetail=false・拠点)か kind+detail
// 単位(perDetail=true・POI)。既存セーブに旧形式の同kindエントリ(方位付き拠点等)があればそれを
// 「初回」と数えて新たに載せない(過去の記録は消さない=可逆)。
export const recordChronicleGlobalFirst = (
  stageId: string, kind: ChronicleKind, detail: string, phrase: string, perDetail = false,
): boolean => {
  const list = loadChronicle();
  const dup = list.some(e =>
    e.kind === kind && (!perDetail || e.key.split('::').slice(2).join('::') === detail));
  if (dup) return false;
  return recordChronicle(stageId, kind, detail, phrase);
};

// 開発用: 全ステージ解放 / 進行リセット。
// 開発用の全開放。社長指示v0.25.2861「ボスモード全開放も、ステージ解放と一緒にしちゃっていい」
// ⇒ ボスラッシュ(練習モード)の解放もここに相乗りさせる。導線テストを1ボタンで整えるため。
export const unlockAllStages = (): void => {
  writeSet(new Set(STAGES.map(s => s.id)));
  unlockAllBossEncounters();
  // v0.25.3723(社長指示「EXステージ普通に全開放オプションで並ぶように配線して」):
  // EXノードの表示条件は canShowEx=medicineUsed(再訪で薬を使用・統合正本10.1)で、ステージ解放集合
  // とは別のストーリーフラグ。全開放にはこれも含める(revisitClearedも併せて立て、再訪カードの
  // 表示状態も「済」に揃える)。正規導線の初回演出(薬の付与ポップ等)には触れない=フラグのみ。
  updateStoryFlags({ medicineUsed: true, revisitCleared: true });
};
export const resetProgress = (): void => {
  writeSet(new Set());
  writeMissionSet(new Set()); // M42のミッション単位クリア集合も進行リセットで消す(開発用)
  setSelectedStageId('');
  writeScores({});
  saveBaseGrowth({}); // 拠点Lv/EXPも進行リセットで消す(開発用)
  saveWallMetaMap({}); // M14の壁メタも進行リセットで消す(開発用)
  saveGateMetaMap({}); // M20のゲート解除メタも進行リセットで消す(開発用)
  saveEventQuestMetaMap({}); // 二人組クエストの進捗メタも進行リセットで消す(開発用)
  writeCastleBossSet(new Set()); // 城ボスクリアフラグも進行リセットで消す(開発用)
  try { localStorage.removeItem(KOGARASU_KEY); } catch { /* ignore */ } // 小烏丸解禁も進行リセットで消す(開発用)
  try { localStorage.removeItem(LEGACY_EVENT_QUEST_DONE_KEY); } catch { /* ignore */ } // 旧v1684キーの掃除
  saveChronicle([]); // 歴史年表も進行リセットで消す(開発用)
  writeRunCores({}); // 掘削記録(リザルト断面の過去ラン)も進行リセットで消す(開発用)
  try { localStorage.removeItem(CHRONICLE_START_KEY); } catch { /* ignore */ } // 初ミッション日付も消す(開発用)
  setStoryFlags(emptyStoryFlags()); // the ONE ストーリー分岐フラグも進行リセットで消す(開発用)
  clearBossEncounters(); // ボスラッシュの遭遇記録も進行リセットで消す(開発用・BOSS_MAKER.md §20-5)
  setSelectedMission('main');
};

// ---------------------------------------------------------------------------
// 掘削記録(社長指示v0.25.2333「前回までの記録の地層が横にずらーっと並んで、横スクロールで
// 過去を遡れると吉」)。リザルトの断面図に過去ランの竪坑を並べるための、**表示専用**の履歴。
//
// 掟:
// - **ゲームの判定には一切使わない**(自己最深/最高ランクの正本は wallMeta のまま)。ここは絵のため。
// - ステージ別に**新しい順ではなく古い順**で持ち、上限 RUN_CORE_LIMIT 件を超えたら**古い方から捨てる**
//   (断面図は左=過去 → 右=最新 の時間軸で描くので、この順のまま流し込める)。
// - 1件が極小(数値4つ)なので localStorage を圧迫しない。
const RUN_CORE_KEY = 'zombie.progress.runCores';
/** 1ステージあたり保持する掘削記録の件数(表示に使う本数の上限)。 */
export const RUN_CORE_LIMIT = 12;

export interface RunCore {
  /** そのランの最深到達距離(px=m扱い)。 */
  dist: number;
  /** そのランの最高到達ランク(1-7)。 */
  rank: number;
  /** 終了時刻(epoch ms)。「3日前」等の相対表記に使う。 */
  at: number;
  /** 終わり方。断面図で坑の色を変える(達成=金/撤退=白/死亡=赤)。 */
  end: 'won' | 'withdraw' | 'death';
}
type RunCoreMap = Record<string, RunCore[]>;

const readRunCores = (): RunCoreMap => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(RUN_CORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed as RunCoreMap : {};
  } catch {
    return {};
  }
};
const writeRunCores = (m: RunCoreMap): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(RUN_CORE_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};

/** そのステージの掘削記録(**古い順**)。最新が配列の末尾。 */
export const getRunCores = (stageId: string): RunCore[] => {
  if (!stageId) return [];
  const list = readRunCores()[stageId];
  return Array.isArray(list) ? list : [];
};

/** 1ラン追記して保存し、保存後の一覧(古い順・上限適用済み)を返す。 */
export const pushRunCore = (stageId: string, core: RunCore): RunCore[] => {
  if (!stageId) return [];
  const map = readRunCores();
  const next = [...(Array.isArray(map[stageId]) ? map[stageId] : []), core].slice(-RUN_CORE_LIMIT);
  map[stageId] = next;
  writeRunCores(map);
  return next;
};
