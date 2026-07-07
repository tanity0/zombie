// キャンペーン進行(クリア済みステージ / 直近に選んだステージ)の保存。
// ゲームロジックには触れず localStorage だけで完結させる(導線の解放制御用)。
// メインミッションをクリアすると次ステージが解放される。EX は前提ステージのクリアで解放。

import { STAGES, type Stage } from './campaign';

const CLEARED_KEY = 'zombie.progress.cleared';
const SELECTED_KEY = 'zombie.progress.selectedStage';
const FREE_KEY = 'zombie.progress.selectedFree'; // 直近の出撃がフリー(周回)か

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
  const set = readSet();
  if (set.has(stageId)) return;
  set.add(stageId);
  writeSet(set);
};

// 前提ステージ(unlockBy)がクリア済みなら解放。最初のステージ(unlockBy=null)は常に解放。
export const isStageUnlocked = (stage: Stage, cleared: Set<string> = readSet()): boolean =>
  stage.unlockBy === null || cleared.has(stage.unlockBy);

export const getSelectedStageId = (): string => {
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

const isValidGateMeta = (v: unknown): v is GateMeta => {
  if (!v || typeof v !== 'object') return false;
  const m = v as Partial<GateMeta>;
  return typeof m.gate1Cleared === 'boolean' && typeof m.gate2Cleared === 'boolean';
};

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

export const getGateMeta = (stageId: string, m: GateMetaMap = loadGateMetaMap()): GateMeta => {
  const v = m[stageId];
  return isValidGateMeta(v) ? { ...v } : emptyGateMeta();
};

export const setGateMeta = (stageId: string, meta: GateMeta): void => {
  if (!stageId) return;
  const m = loadGateMetaMap();
  m[stageId] = meta;
  saveGateMetaMap(m);
};

// 開発用: 全ステージ解放 / 進行リセット。
export const unlockAllStages = (): void => writeSet(new Set(STAGES.map(s => s.id)));
export const resetProgress = (): void => {
  writeSet(new Set());
  setSelectedStageId('');
  writeScores({});
  saveBaseGrowth({}); // 拠点Lv/EXPも進行リセットで消す(開発用)
  saveWallMetaMap({}); // M14の壁メタも進行リセットで消す(開発用)
  saveGateMetaMap({}); // M20のゲート解除メタも進行リセットで消す(開発用)
};
