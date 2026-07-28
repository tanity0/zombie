// リザルトの「到達譜」= 地表から下へ掘り下げる**1枚の地質断面図**(社長指示v0.25.2332/2333)。
//
// 見せ方の意図:
// - 距離は「上から下へ掘る」。0m が地表、下へ行くほど深い。地層は**実距離スケール**で積む
//   (等分割にすると 1500m の軍備配置区域と 2500m の未確認汚染エリアが同じ厚みに見えてしまう)。
// - **過去ランの竪坑を横に並べ、横スクロールで過去を遡れる**(社長指示v0.25.2333)。
//   時間は左→右。いちばん右が今回。壁(地層)は全ランで共通なので、断面は1枚のまま横に伸びる。
// - ランクは深さと**独立した軸**なので断面には入れない(深度軸に並べると「R7=9000m」と読めてしまう)。
//   7段すべてを別の帯として常に並べる(社長指示「七つの大罪は7つ並べる」)。
//
// この層は**表示計算の純関数だけ**(React/PixiJS非依存)。閾値・ランク名は enemyUtils /
// wallProgress / rankAssessor の正本をそのまま引く。ここで新しい仕様値は作らない。
import { AREA_THRESHOLDS, AREA_ZONE_NAMES } from './enemyUtils';
import { WALL_RANK_NAMES, WALL_RANK_NAMES_EN, RANK_COUNT, metersToNextWall } from './wallProgress';
import { clampRank, type PuzzleRank } from './rankAssessor';
import type { RunCore } from '../data/progress';

/** 最深段(底なし)の見た目の伸び代。「まだ底が見えない」ぶんとして扱う表示専用の値。 */
export const ABYSS_SPAN = 2500;
/** 断面図が描く深さの全体(0m 〜 ここまで)。裏ボスの巣(9000m)が収まる高さでもある。 */
export const CUTAWAY_MAX = AREA_THRESHOLDS[AREA_THRESHOLDS.length - 1] + ABYSS_SPAN; // = 10000

/** 距離 → 断面図の縦位置(0=地表, 1=最深)。範囲外はクランプ。 */
export const depthFrac = (dist: number): number =>
  Math.max(0, Math.min(1, Math.max(0, dist) / CUTAWAY_MAX));

/** 地層の1枚。厚みは**実距離に比例**する(topFrac/heightFrac は断面図の高さに対する比)。 */
export interface Stratum {
  idx: number;
  name: string;
  from: number;
  to: number | null;   // 最深段は null(底なし)
  topFrac: number;     // 0..1
  heightFrac: number;  // 0..1
}

/** 地層の一覧(上=浅い → 下=深い)。閾値は AREA_THRESHOLDS そのもの。 */
export const strata = (): Stratum[] =>
  AREA_ZONE_NAMES.map((name, idx) => {
    const from = idx === 0 ? 0 : AREA_THRESHOLDS[idx - 1];
    const to = idx < AREA_THRESHOLDS.length ? AREA_THRESHOLDS[idx] : null;
    const bottom = to ?? CUTAWAY_MAX;
    return { idx, name, from, to, topFrac: depthFrac(from), heightFrac: depthFrac(bottom) - depthFrac(from) };
  });

/** 距離が属する地層のindex。 */
export const zoneIdxOf = (dist: number): number => {
  for (let i = AREA_THRESHOLDS.length - 1; i >= 0; i--) if (dist >= AREA_THRESHOLDS[i]) return i + 1;
  return 0;
};

// ---------------------------------------------------------------------------
// 竪坑(掘削記録)= 断面図に横並びで刺さる1本1本

/** 断面図に描く竪坑1本。左から順に古い→新しい、最後が今回。 */
export interface Core {
  /** React の key。時刻+indexで一意。 */
  key: string;
  dist: number;
  rank: PuzzleRank;
  end: RunCore['end'];
  /** 掘った深さ(0..1)。そのまま坑の高さに使う。 */
  frac: number;
  /** 今回のランか(=右端・強調して描く)。 */
  isCurrent: boolean;
  /** 表示中の全ランの中で最も深い坑か(=自己最深の主)。 */
  isDeepest: boolean;
  /** 「今回」「−1」「−2」…。過去は何ラン前か。 */
  label: string;
  /** 終了時刻(epoch ms)。0=不明(今回のぶんは呼び出し側が渡す)。 */
  at: number;
}

/**
 * 過去の掘削記録(古い順)+ 今回 → 断面図に並べる竪坑の列。
 * **今回は必ず末尾(右端)**。時間が左→右に流れるので、横スクロールで左へ行くと過去へ遡れる。
 */
export const buildCores = (
  history: RunCore[],
  current: { dist: number; rank: number; end: RunCore['end']; at: number },
): Core[] => {
  const past = history.map((h, i) => ({ ...h, i }));
  const rows: Core[] = past.map(h => ({
    key: `p${h.at}-${h.i}`,
    dist: Math.max(0, h.dist),
    rank: clampRank(h.rank),
    end: h.end,
    frac: depthFrac(h.dist),
    isCurrent: false,
    isDeepest: false,
    label: `−${past.length - h.i}`,
    at: h.at,
  }));
  rows.push({
    key: 'current',
    dist: Math.max(0, current.dist),
    rank: clampRank(current.rank),
    end: current.end,
    frac: depthFrac(current.dist),
    isCurrent: true,
    isDeepest: false,
    label: '今回',
    at: current.at,
  });
  // 最深の1本だけに旗を立てる(同値なら**新しい方**=直近の自分を称える)。
  let bestIdx = -1;
  for (let i = 0; i < rows.length; i++) if (bestIdx < 0 || rows[i].dist >= rows[bestIdx].dist) bestIdx = i;
  if (bestIdx >= 0 && rows[bestIdx].dist > 0) rows[bestIdx].isDeepest = true;
  return rows;
};

// ---------------------------------------------------------------------------
// ランク(七つの大罪)= 断面の外に置く別軸

export interface RankRung {
  rank: PuzzleRank;
  name: string;
  en: string;
  reached: boolean;
  isCurrent: boolean;
  isBest: boolean;
}

/** 常に7段すべて返す(社長指示「7つ並べる」)。 */
export const rankRungs = (rank: number, bestRank: number): RankRung[] => {
  const cur = clampRank(rank);
  const best = clampRank(bestRank);
  return Array.from({ length: RANK_COUNT }, (_, i) => {
    const r = (i + 1) as PuzzleRank;
    return { rank: r, name: WALL_RANK_NAMES[r], en: WALL_RANK_NAMES_EN[r], reached: r <= cur, isCurrent: r === cur, isBest: r === best };
  });
};

// ---------------------------------------------------------------------------
// 「次がやりたくなる」1行

export interface NextGoal {
  meters: number | null;
  zoneName: string | null;
  rankName: string | null;
  maxedOut: boolean;
}

export const nextGoal = (dist: number, rank: number): NextGoal => {
  const meters = metersToNextWall(Math.max(0, dist));
  const cur = clampRank(rank);
  const zoneName = meters === null ? null : (AREA_ZONE_NAMES[zoneIdxOf(Math.max(0, dist)) + 1] ?? null);
  const rankName = cur < RANK_COUNT ? WALL_RANK_NAMES[(cur + 1) as PuzzleRank] : null;
  return { meters, zoneName, rankName, maxedOut: meters === null && rankName === null };
};

/**
 * 掘削の「総進捗」0..1。深さとランクの両輪をひとつの数にして、見出しの光量に使う(表示専用)。
 * ゲームの評価には一切使わない。
 */
export const digProgress = (dist: number, rank: number): number => {
  const dp = depthFrac(dist);
  const rp = (clampRank(rank) - 1) / (RANK_COUNT - 1);
  return Math.max(0, Math.min(1, dp * 0.5 + rp * 0.5));
};
