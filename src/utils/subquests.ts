// サブクエストの進捗・補充・保存(research/SUBQUESTS.md)。純関数+localStorage のみ。
// ★storeもPixiも一切importしない(葉モジュール)。store側は「イベントを1個渡す」だけ。
//
// 時計の契約(ENGINEERING_NOTES.md「時計の混在」):
//  ・hunter-survive の秒数は **gameTime(シミュ時刻・ms)** から呼び出し側が算出して渡す。
//    このモジュールは Date.now() も gameTime も読まない(引数の秒だけを見る)。
//
// 保存の形(裁定): `zombie.progress.subquests`
//   { [stageId]: { cleared: string[], active: [{ id, progress }] } }
//  ・cleared = **達成済み**(報酬付与済み)。判定対象から外れる=報酬は1回きり。
//  ・active  = 受注中の枠(最大 SUBQUEST_SLOTS)。progress は**ラン跨ぎの累計**。

import {
  SUBQUEST_SLOTS, subquestsForStage, subquestById, subquestLabel,
  type SubquestDef,
} from '../data/subquests';
import type { EnemyColorTier } from '../types/game';

export const SUBQUEST_SAVE_KEY = 'zombie.progress.subquests';

export interface SubquestActiveEntry { id: string; progress: number }
export interface SubquestStageState { cleared: string[]; active: SubquestActiveEntry[] }
export type SubquestSave = Record<string, SubquestStageState>;

/** HUD/リザルトが読む1行ぶんの表示データ(達成済みも `done` で残す=表示と判定を分ける)。 */
export interface SubquestRunEntry {
  id: string;
  label: string;      // 数値差し込み済み
  target: number;
  progress: number;
  done: boolean;
  rewardGold: number; // 掛ける前の額(表示は使わないが達成集計で使う)
}

// ───────────────────────────────────────────────────────────────────────────
// イベント(store側が組み立てて渡す)
// ───────────────────────────────────────────────────────────────────────────

export interface SubquestKillEvent {
  colorTier?: EnemyColorTier;
  isNamed?: boolean;
  /** 賞金首(isBountyType)か。 */
  isBounty?: boolean;
  /** ボス系(isBossType)か。kill-normal の除外に使う。 */
  isBoss?: boolean;
  /** 研究所敵のLv(lab-zombie-1/2/3)。それ以外は undefined。 */
  labLevel?: 1 | 2 | 3;
  /** 大量発生(horde囲い)の在中か。 */
  hordeActive?: boolean;
  /** 紅き夜(phase==='active')の在中か。 */
  redNightActive?: boolean;
}

export type SubquestEvent =
  | { type: 'kill'; kill: SubquestKillEvent }
  | { type: 'rescue' }
  /** ハンター追跡(chase)の**連続**秒数。0を渡す=追跡が切れたのでリセット。 */
  | { type: 'hunter-seconds'; seconds: number };

/**
 * 1イベントがそのクエストの進捗をどう動かすか。
 * 戻り値 = **新しい progress**(変化しないなら現在値をそのまま返す)。
 * 増分型(キル/救助)は加算、hunter-survive だけは**絶対値**(連続秒なのでリセットが要る)。
 */
export const subquestNextProgress = (
  def: SubquestDef, progress: number, ev: SubquestEvent
): number => {
  if (def.kind === 'hunter-survive') {
    return ev.type === 'hunter-seconds' ? Math.max(0, Math.min(def.target, Math.floor(ev.seconds))) : progress;
  }
  if (ev.type === 'rescue') return def.kind === 'rescue' ? progress + 1 : progress;
  if (ev.type !== 'kill') return progress;
  const k = ev.kill;
  switch (def.kind) {
    // 通常敵 = 色なし・非ボス・非賞金首・非宿敵(v2小14: kill-normal だけはこの絞り)。
    case 'kill-normal':
      return (!k.colorTier && !k.isBoss && !k.isBounty && !k.isNamed) ? progress + 1 : progress;
    case 'kill-tier':
      return k.colorTier === def.tier ? progress + 1 : progress;
    case 'kill-colored':
      return k.colorTier ? progress + 1 : progress;
    case 'kill-lab':
      return k.labLevel === def.labLevel ? progress + 1 : progress;
    case 'miniboss':
      return k.isBounty ? progress + 1 : progress;
    case 'wanted':
      return k.isNamed ? progress + 1 : progress;
    // 在中系: どの敵でもよい(囲い/紅き夜の最中のキルを数える)。
    case 'horde-kills':
      return k.hordeActive ? progress + 1 : progress;
    case 'rednight-kills':
      return k.redNightActive ? progress + 1 : progress;
    default:
      return progress;
  }
};

export interface SubquestApplyResult {
  changed: boolean;
  /** 更新後の active(**達成したものは除外済み**=以後の判定対象から外れる)。 */
  active: SubquestActiveEntry[];
  /** このイベントで達成した定義(報酬付与はこの分だけ・1回きり)。 */
  clearedNow: SubquestDef[];
}

/**
 * active な枠にイベントを1回適用する。達成した枠は active から外し `clearedNow` に出す
 * (=報酬の1回きり保証。表示側は別リストで残す)。
 */
export const applySubquestEvent = (
  active: readonly SubquestActiveEntry[], ev: SubquestEvent
): SubquestApplyResult => {
  let changed = false;
  const clearedNow: SubquestDef[] = [];
  const next: SubquestActiveEntry[] = [];
  for (const entry of active) {
    const def = subquestById(entry.id);
    if (!def) { changed = true; continue; } // 台帳から消えたidは黙って落とす
    const p = subquestNextProgress(def, entry.progress, ev);
    if (p !== entry.progress) changed = true;
    if (p >= def.target) {
      clearedNow.push(def);
      changed = true;
      continue; // active から外す(判定対象外へ)
    }
    next.push(p === entry.progress ? entry : { id: entry.id, progress: p });
  }
  return { changed, active: next, clearedNow };
};

// ───────────────────────────────────────────────────────────────────────────
// 補充(出撃時にだけ呼ぶ)
// ───────────────────────────────────────────────────────────────────────────

/**
 * そのステージの枠を2つまで埋める(純関数)。
 *  ・cleared 済み/台帳に無いidは active から除去。
 *  ・hunter-survive の progress は 0 に戻す(連続N秒=ラン跨ぎで持ち越さない)。
 *  ・不足分は **未クリアの次のorder** から補充(固定順・裁定3)。
 *  ・返す active は order 昇順。
 */
export const refillStageSubquests = (
  state: SubquestStageState, stageId: string, slots: number = SUBQUEST_SLOTS
): SubquestStageState => {
  const defs = subquestsForStage(stageId);
  const clearedSet = new Set(state.cleared);
  const kept: SubquestActiveEntry[] = [];
  for (const e of state.active) {
    const def = defs.find(d => d.id === e.id);
    if (!def || clearedSet.has(e.id)) continue;
    if (kept.some(k => k.id === e.id)) continue;
    kept.push({ id: e.id, progress: def.kind === 'hunter-survive' ? 0 : Math.max(0, Math.min(def.target - 1, e.progress)) });
  }
  for (const def of defs) {
    if (kept.length >= slots) break;
    if (clearedSet.has(def.id)) continue;
    if (kept.some(k => k.id === def.id)) continue;
    kept.push({ id: def.id, progress: 0 });
  }
  kept.sort((a, b) => (defs.findIndex(d => d.id === a.id)) - (defs.findIndex(d => d.id === b.id)));
  return { cleared: [...state.cleared], active: kept.slice(0, slots) };
};

/** 表示用の行に変換(HUD/リザルト。達成済みは done=true で残す)。 */
export const toRunEntries = (
  active: readonly SubquestActiveEntry[], done: readonly SubquestDef[] = []
): SubquestRunEntry[] => {
  const rows: SubquestRunEntry[] = [];
  for (const e of active) {
    const def = subquestById(e.id);
    if (!def) continue;
    rows.push({
      id: def.id, label: subquestLabel(def), target: def.target,
      progress: Math.min(e.progress, def.target), done: false, rewardGold: def.rewardGold,
    });
  }
  for (const def of done) {
    rows.push({
      id: def.id, label: subquestLabel(def), target: def.target,
      progress: def.target, done: true, rewardGold: def.rewardGold,
    });
  }
  return rows;
};

// ───────────────────────────────────────────────────────────────────────────
// 保存(localStorage)。練習ラン中は practiceGuard が書き込みごと飲む=呼んでも無害。
// ───────────────────────────────────────────────────────────────────────────

export const emptyStageState = (): SubquestStageState => ({ cleared: [], active: [] });

const sanitize = (raw: unknown): SubquestSave => {
  const out: SubquestSave = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [stageId, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as { cleared?: unknown; active?: unknown };
    const cleared = Array.isArray(o.cleared) ? o.cleared.filter((x): x is string => typeof x === 'string') : [];
    const active = Array.isArray(o.active)
      ? o.active.flatMap((x): SubquestActiveEntry[] => {
          if (!x || typeof x !== 'object') return [];
          const e = x as { id?: unknown; progress?: unknown };
          if (typeof e.id !== 'string') return [];
          const p = typeof e.progress === 'number' && Number.isFinite(e.progress) ? Math.max(0, Math.floor(e.progress)) : 0;
          return [{ id: e.id, progress: p }];
        })
      : [];
    out[stageId] = { cleared, active };
  }
  return out;
};

export const loadSubquestSave = (): SubquestSave => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SUBQUEST_SAVE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
};

export const writeSubquestSave = (save: SubquestSave): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SUBQUEST_SAVE_KEY, JSON.stringify(save));
  } catch {
    /* ignore (quota / private mode) */
  }
};

export const getStageSubquestState = (stageId: string): SubquestStageState =>
  loadSubquestSave()[stageId] ?? emptyStageState();

export const putStageSubquestState = (stageId: string, state: SubquestStageState): void => {
  const save = loadSubquestSave();
  save[stageId] = state;
  writeSubquestSave(save);
};
