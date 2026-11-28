// 作戦室の地図で「作戦地域を選ぶ」判定(社長 2026-11-25「ボスアイコンで、ステージカテゴリが選択される。
// ボスアイコンはステージにぶら下がっているイメージ」)。何が選べるか・選んだ時の任務と札・未解放の条件・押した点に近い方。
// React/PixiJS 非依存の純関数(DsStoryMap と MissionSelect はここを読むだけ)。
import type { Stage } from '../data/campaign';
import { OPS_MAP_PLACES } from '../data/opsMapPlaces';
import type { SortieTarget } from './dsHome';
import { isUnlockAllOn } from './unlockAll'; // 開発用「すべて解放」

/**
 * 選んだステージの扱い。
 * next=次の任務(目標) / last=全部クリアした後の前回の任務 / revisit=クリア済み /
 * open=解放済みだがまだクリアしていない(NEXT 以外。通常の進行では任意のチュートリアル=洞窟だけ) / locked=未解放(NEXT の1つ先だけ地図に出る)。
 */
export type MapPickKind = 'next' | 'last' | 'revisit' | 'open' | 'locked';
export interface MapPick {
  stage: Stage;
  kind: MapPickKind;
  /** 未解放の時: 先にクリアするステージ(解放の判定 unlockBy の先)。 */
  after?: Stage;
}

/** 札の言葉(地図の下端の場所名の左・地図の目標の印の字)。和語に揃える(社長 2026-11-25「NEXT を目標に」)。 */
export const MAP_PICK_LABEL: Readonly<Record<MapPickKind, string>> = {
  next: '目標', last: '前回', revisit: '再訪', open: '未踏', locked: '未解放',
};
/** 未解放の場所の名(場所の名は出さない)。 */
export const LOCKED_PLACE_NAME = '未踏の地';
/** 未解放の時の出撃の帯の言葉(解放の判定=unlockBy の先の場所の名から作る)。 */
export const lockedSortieHint = (after: Pick<Stage, 'locationTitle'> | undefined): string =>
  after ? `${after.locationTitle}の後に開く` : '';

/**
 * 地図に薄い点線の四角で出す未解放のステージ=NEXT の1つ先だけ。
 * 次の任務(kind 'next')が本編の時、その任務をクリアすると解放される(unlockBy が NEXT)本編で、地図に場所があるもの。
 * 全部クリアした後(「前回」)・次が無い時・EX が次の時は出さない。
 */
export const lockedPreviewStage = (stages: readonly Stage[], target: SortieTarget | null): Stage | null => {
  if (isUnlockAllOn()) return null; // 開発用「すべて解放」: 未解放のステージが無いので予告も出さない
  if (!target || target.kind !== 'next' || target.stage.kind !== 'main') return null;
  const nextId = target.stage.id;
  return stages.find(s => s.kind === 'main' && !s.hidden && s.unlockBy === nextId && OPS_MAP_PLACES[s.id] !== undefined) ?? null;
};

/**
 * 地図に「まだ行っていないが出撃できる」場所として印を出すステージ(押せば選べる=札は「未踏」)。
 * 出撃できて(sortieableIds)・まだクリアしておらず・地図に場所があり・開いた時の出撃先(目標/前回)でも未解放の予告でもないもの。
 * 通常の進行では、目標の候補にしない任意のチュートリアル(洞窟)だけがここに入る(新しい端末=目標はステージ1)。
 */
export const openMapStages = (c: MapPickContext): Stage[] =>
  c.stages.filter(s => !s.hidden && c.sortieableIds.has(s.id) && !c.cleared.has(s.id) && OPS_MAP_PLACES[s.id] !== undefined
    && s.id !== c.target?.stage.id && s.id !== c.locked?.id);

export interface MapPickContext {
  stages: readonly Stage[];
  cleared: ReadonlySet<string>;
  /** 開いた時の出撃先(utils/dsHome.sortieTarget)。 */
  target: SortieTarget | null;
  /** 今の進行で出撃できるステージ(作戦地域の一覧と同じ条件)。 */
  sortieableIds: ReadonlySet<string>;
  /** 地図に出している未解放のステージ(lockedPreviewStage)。 */
  locked: Stage | null;
}

/** そのステージを地図で選んだ時の扱い。選べないなら null(地図に場所が無い・出撃できない・未解放の予告でもない)。 */
export const mapPickFor = (stageId: string, c: MapPickContext): MapPick | null => {
  if (OPS_MAP_PLACES[stageId] === undefined) return null;
  if (c.target && c.target.stage.id === stageId) return { stage: c.target.stage, kind: c.target.kind };
  if (c.locked && c.locked.id === stageId) {
    const after = c.locked.unlockBy ? c.stages.find(s => s.id === c.locked!.unlockBy) : undefined;
    return { stage: c.locked, kind: 'locked', ...(after ? { after } : {}) };
  }
  const st = c.stages.find(s => s.id === stageId);
  if (!st || st.hidden || !c.sortieableIds.has(stageId)) return null;
  return { stage: st, kind: c.cleared.has(stageId) ? 'revisit' : 'open' };
};

/** 選択中: 選んだステージ(まだ選べるなら)→ 無ければ開いた時の出撃先(NEXT / 前回)→ どちらも無ければ null。 */
export const currentMapPick = (pickedId: string | null, c: MapPickContext): MapPick | null =>
  (pickedId ? mapPickFor(pickedId, c) : null) ?? (c.target ? { stage: c.target.stage, kind: c.target.kind } : null);

/** 押せる物(ボスの顔・場所の印)の中心(地図の座標)と、押した時に選ばれるステージ。 */
export interface MapStageHit { stageId: string; x: number; y: number }

/**
 * 押した点で選ばれるステージ。各物は中心から ±half の四角を当たりに持ち、重なる所は押した点に近い方(中心までの距離)。
 * 同じ距離なら一覧の先の物。どれにも入らなければ null。
 */
export const pickMapStageHit = (hits: readonly MapStageHit[], px: number, py: number, half: number): string | null => {
  let best: string | null = null, bd = Infinity;
  for (const h of hits) {
    const dx = Math.abs(px - h.x), dy = Math.abs(py - h.y);
    if (dx > half || dy > half) continue;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = h.stageId; }
  }
  return best;
};
