// PACING_PUZZLE.md §5.17 バッチM14: 到達譜=二軸の壁(深さ×ランク)。
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。
// このファイルは「壁の判定・優先順・表示計算」だけを扱う。実際の永続化(ステージ毎メタ)は
// src/data/progress.ts、配線(いつ呼ぶか)は gameStore.ts / directorTick.ts / useGameLoop.ts の責務。
import { AREA_THRESHOLDS, AREA_ZONE_NAMES } from './enemyUtils';
import type { PuzzleRank } from './rankAssessor';

export const WALL_COUNT = AREA_THRESHOLDS.length; // 4(境界4本)
export const RANK_COUNT = 7;

// ランクの壁=七つの大罪(社長確定v0.25.1492)。罪の重さの昇順。
export const WALL_RANK_NAMES: Record<PuzzleRank, string> = {
  1: '怠惰', 2: '暴食', 3: '色欲', 4: '強欲', 5: '嫉妬', 6: '憤怒', 7: '傲慢',
};
// 儀式バナーのサブ英字用(演出仕様v0.25.1499)。
export const WALL_RANK_NAMES_EN: Record<PuzzleRank, string> = {
  1: 'SLOTH', 2: 'GLUTTONY', 3: 'LUST', 4: 'GREED', 5: 'ENVY', 6: 'WRATH', 7: 'PRIDE',
};

/**
 * v0.25.2587(社長指示「ランクに数字入れてほしい ランク7 なんちゃら みたいに」): ランクの表示名。
 * 罪名だけだと何段目か分からないため、**表示は必ずこの関数を通す**(数字と名前の並びを1箇所で決める)。
 * 記録・判定・保存は従来どおり数値(PuzzleRank)のまま=表示だけの変更。
 */
export const rankLabel = (rank: PuzzleRank): string => `ランク${rank} ${WALL_RANK_NAMES[rank]}`;

// selfHighestRankはnumberで持つ(永続化(src/data/progress.ts)側の型と揃える。読み出し時は
// rankAssessor.clampRankでPuzzleRankへ絞ってから各関数(deepestReachedBadge等)へ渡す)。
export interface StageWallMeta {
  zoneReached: boolean[];   // 長さWALL_COUNT。index0=壁1(zone1進入)…index3=壁4(zone4進入)
  rankReached: boolean[];   // 長さRANK_COUNT。index0=R1…index6=R7
  selfDeepestDist: number;  // 自己最深(原点からの距離px)
  selfHighestRank: number;  // 自己最高到達ランク(1-7)
}

export const createDefaultWallMeta = (): StageWallMeta => ({
  zoneReached: new Array(WALL_COUNT).fill(false),
  rankReached: new Array(RANK_COUNT).fill(false),
  selfDeepestDist: 0,
  selfHighestRank: 1,
});

// 次の境界までの残り距離(px)。既に深層域(最終ゾーン)に居るならnull(その先の壁はない)。
export const distanceToNextWall = (dist: number): number | null => {
  for (const t of AREA_THRESHOLDS) if (dist < t) return t - dist;
  return null;
};

// 予告(契約)判定: 次の境界まで warnPx 以内か(まだ跨いでいない前提)。
export const isApproachingWall = (dist: number, warnPx: number): boolean => {
  const d = distanceToNextWall(dist);
  return d !== null && d <= warnPx;
};

// 踏破した壁番号(1..WALL_COUNT)を返す。ゾーンが「新しく」深くなった時だけ(浅くなる/同値はnull)。
export const detectWallBreach = (prevZoneIdx: number, zoneIdx: number): number | null =>
  (zoneIdx > prevZoneIdx && zoneIdx >= 1 && zoneIdx <= WALL_COUNT) ? zoneIdx : null;

export const isFirstWallBreach = (meta: StageWallMeta, wallIdx: number): boolean => !meta.zoneReached[wallIdx - 1];
export const isFirstRankReach = (meta: StageWallMeta, rank: PuzzleRank): boolean => !meta.rankReached[rank - 1];

// メタへ書き込んだ新しい StageWallMeta を返す(不変更新)。
export const markWallBreached = (meta: StageWallMeta, wallIdx: number): StageWallMeta => {
  const zoneReached = [...meta.zoneReached];
  zoneReached[wallIdx - 1] = true;
  return { ...meta, zoneReached };
};
export const markRankReached = (meta: StageWallMeta, rank: PuzzleRank): StageWallMeta => {
  const rankReached = [...meta.rankReached];
  rankReached[rank - 1] = true;
  return { ...meta, rankReached };
};
export const markSelfDeepest = (meta: StageWallMeta, dist: number): StageWallMeta =>
  dist > meta.selfDeepestDist ? { ...meta, selfDeepestDist: dist } : meta;
export const markSelfHighestRank = (meta: StageWallMeta, rank: PuzzleRank): StageWallMeta =>
  rank > meta.selfHighestRank ? { ...meta, selfHighestRank: rank } : meta;

// 死亡リザルトの「惜しさ」: 次の壁まであと約◯m(1px=1mとして扱う。既存の区域境界値自体が
// 1500/3000といったメートル感の値のため、専用の換算係数は導入しない)。深層域なら null。
export const metersToNextWall = (dist: number): number | null => {
  const d = distanceToNextWall(dist);
  return d === null ? null : Math.round(d);
};

// 【リザルト表示では使わない(社長指示v0.25.2342)】: R7未満なら常に真=同語反復で情報量が0のため、
// 「◯◯まであと1昇格」の表示は撤去した。関数は他用途/テストのために残置しているが、
// **リザルトに再び出さないこと**(過去に一度潰した表示をv0.25.2332で復活させた前例あり)。
// 「次のランクまであと1昇格だった」: R7未満なら常に該当(1つ上げれば次のランクに届く)。
export const isOneRankAwayFromNext = (rank: PuzzleRank): boolean => rank < 7;
export const nextRankName = (rank: PuzzleRank): string | null =>
  rank < 7 ? rankLabel((rank + 1) as PuzzleRank) : null;

// 到達譜の見出し: 「{そのラン最深の区域名}の{最高ランク名} に到達」(v0.25.2587: ランクは数字つき)。
export const wallAchievementHeadline = (deepestZoneIdx: number, highestRank: PuzzleRank): string =>
  `${AREA_ZONE_NAMES[deepestZoneIdx]}の${rankLabel(highestRank)} に到達`;

// タイトル画面バッジ: 「最深到達: {区域名}の{ランク名}」(自己最深の距離から区域名を逆引き)。
export const zoneIdxForDist = (dist: number): number => {
  for (let i = AREA_THRESHOLDS.length - 1; i >= 0; i--) if (dist >= AREA_THRESHOLDS[i]) return i + 1;
  return 0;
};
export const deepestReachedBadge = (selfDeepestDist: number, selfHighestRank: PuzzleRank): string =>
  `最深到達: ${AREA_ZONE_NAMES[zoneIdxForDist(selfDeepestDist)]}の${rankLabel(selfHighestRank)}`;

// ---- 演出キューの優先順(演出仕様v0.25.1499: 「両軸が同時に起きたら深さ優先」) --------------------
export type WallEventKind = 'depth' | 'rank' | 'revenge';
const WALL_EVENT_PRIORITY: Record<WallEventKind, number> = { depth: 0, rank: 1, revenge: 2 };
// 安定ソート(Array.prototype.sortはECMA2019以降安定)。同時発火した候補を優先順に並べ替える。
export const sortWallEventsByPriority = <T extends { kind: WallEventKind }>(events: T[]): T[] =>
  [...events].sort((a, b) => WALL_EVENT_PRIORITY[a.kind] - WALL_EVENT_PRIORITY[b.kind]);
