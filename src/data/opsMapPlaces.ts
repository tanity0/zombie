// ★作戦室の地図(架空列島の原画 art-masters/maps/operations-map-parallel-archipelago-v1.png)の上の、各ステージの場所。
// research/THEONE_ROUND2.md §2-5・社長 2026-10-17「地図の位置は固定。ストーリーによって軌跡が増えていく」「この地図使って」。
// 座標は原画に対する割合(0..1・左上原点)。原画の地形の分け方(南西=荒廃地 / 中央=軍事圏 / 東=研究地域 / 北=寒冷地)に合わせた**仮置き**。
// 社長が実機で見て動かしてよい(ここの数字を直すだけで地図の印・軌跡が付いて来る)。
// 配信用の縮小版は public/backgrounds/ops-map-archipelago.webp(原画から作る=原画は上書きしない)。
import type { Stage } from './campaign';

export const OPS_MAP_IMAGE = 'backgrounds/ops-map-archipelago.webp';
export const OPS_MAP_W = 1816;
export const OPS_MAP_H = 866;

/** 場所の位置(原画に対する割合)。EX の洋館跡地は旧市街地・洋館と同じ所。 */
export const OPS_MAP_PLACES: Readonly<Record<string, readonly [number, number]>> = {
  'stage-tutorial': [0.15, 0.62], // 洞窟地帯(南西の荒廃地の山)
  'stage-1': [0.24, 0.52],        // 避難回廊
  'stage-2': [0.34, 0.42],        // PHILL再生医療研究所
  'stage-3': [0.68, 0.6],         // 東部医療科学センター(東の研究地域)
  'stage-4': [0.78, 0.2],         // 北部封鎖区域(北の寒冷地)
  'stage-5': [0.5, 0.5],          // 対変異体防衛本部(中央の軍事圏)
  'stage-6': [0.43, 0.62],        // 旧市街地・洋館
  'stage-7': [0.86, 0.12],        // 指定座標地点(北の果て)
  'stage-ex1': [0.43, 0.62],      // 旧市街地・洋館跡地
  'stage-ex2': [0.43, 0.62],
};

export interface StoryTrail {
  /** クリアした場所(話の順・同じ位置が続く所は1つにまとめる)。 */
  visited: { id: string; at: readonly [number, number] }[];
  /** 今いる所=最後にクリアした場所(無ければ null)。 */
  current: { id: string; at: readonly [number, number] } | null;
  /** 次の出撃先(地図に場所が無ければ null)。 */
  next: { id: string; at: readonly [number, number] } | null;
}

/** 話の順(本編→EX の並び順)にクリア済みを拾い、軌跡・今いる所・次の目標を返す。 */
export const storyTrail = (stages: readonly Pick<Stage, 'id' | 'kind'>[], cleared: ReadonlySet<string>, nextId: string | null): StoryTrail => {
  const order = [...stages.filter(s => s.kind === 'main'), ...stages.filter(s => s.kind === 'ex')];
  const visited: StoryTrail['visited'] = [];
  for (const s of order) {
    const at = OPS_MAP_PLACES[s.id];
    if (!at || !cleared.has(s.id)) continue;
    const prev = visited[visited.length - 1];
    if (prev && prev.at[0] === at[0] && prev.at[1] === at[1]) { visited[visited.length - 1] = { id: s.id, at }; continue; }
    visited.push({ id: s.id, at });
  }
  const current = visited.length ? visited[visited.length - 1] : null;
  const nextAt = nextId ? OPS_MAP_PLACES[nextId] : undefined;
  return { visited, current, next: nextId && nextAt ? { id: nextId, at: nextAt } : null };
};
