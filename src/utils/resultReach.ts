// リザルトの「到達譜」= 上から下へ掘り下げる図(社長指示v0.25.2332)。
//
// 見せ方の意図: 距離もランクも「上から下へ深く掘っていく」1本の縦坑として見せる。
// 浅い方が上・深い方が下。今回どこまで掘れたか / 自己最高はどこか / 次の段まであとどれだけか、の
// 3つだけを前面に出す(それ以外の数字は畳む)。
//
// この層は**表示計算の純関数だけ**(React/PixiJS非依存)。数値の意味(閾値・ランク名)は既存の
// enemyUtils / wallProgress / rankAssessor の正本をそのまま引く。ここで新しい仕様は作らない。
import { AREA_THRESHOLDS, AREA_ZONE_NAMES } from './enemyUtils';
import { WALL_RANK_NAMES, WALL_RANK_NAMES_EN, RANK_COUNT, metersToNextWall } from './wallProgress';
import { clampRank, type PuzzleRank } from './rankAssessor';

/** 縦坑の1段(距離)。上=浅い(idx0) → 下=深い(idx4)。 */
export interface DepthRung {
  idx: number;        // 0..AREA_ZONE_NAMES.length-1
  name: string;       // 区域名
  from: number;       // この段が始まる距離(px=m扱い。既存の閾値がそのままメートル感)
  to: number | null;  // この段が終わる距離。最深段は null(底なし=まだ先がある演出)
  reached: boolean;   // このランでこの段に入ったか
  fill: number;       // 0..1。この段をどこまで掘ったか(最深段は演出用に固定量で伸びる)
  isCurrent: boolean; // このランの到達段(＝掘削が止まった段)
  isBest: boolean;    // 自己最深がある段
}

/** 最深段(底なし)の見た目の伸び代。ここを「まだ底が見えない」ぶんとして扱う表示専用の値。 */
export const ABYSS_SPAN = 2500;

/** 距離 → 縦坑の段リスト。dist=このランの最深到達距離 / bestDist=自己最深。 */
export const depthRungs = (dist: number, bestDist: number): DepthRung[] => {
  const d = Math.max(0, dist);
  const best = Math.max(0, bestDist);
  const bestIdx = zoneIdxOf(best);
  const curIdx = zoneIdxOf(d);
  return AREA_ZONE_NAMES.map((name, idx) => {
    const from = idx === 0 ? 0 : AREA_THRESHOLDS[idx - 1];
    const to = idx < AREA_THRESHOLDS.length ? AREA_THRESHOLDS[idx] : null;
    const span = (to ?? from + ABYSS_SPAN) - from;
    const fill = span <= 0 ? 0 : Math.max(0, Math.min(1, (d - from) / span));
    return {
      idx, name, from, to,
      reached: d >= from && fill > 0,
      fill,
      isCurrent: idx === curIdx,
      isBest: best > 0 && idx === bestIdx,
    };
  });
};

/** 距離が属する段のindex(wallProgress.zoneIdxForDist と同じ定義。循環importを避けてここに置く)。 */
export const zoneIdxOf = (dist: number): number => {
  for (let i = AREA_THRESHOLDS.length - 1; i >= 0; i--) if (dist >= AREA_THRESHOLDS[i]) return i + 1;
  return 0;
};

/** 縦坑の1段(ランク)。上=軽い罪(R1怠惰) → 下=重い罪(R7傲慢)。 */
export interface RankRung {
  rank: PuzzleRank;
  name: string;       // 七つの大罪(和名)
  en: string;         // 英字(演出用のサブ)
  reached: boolean;   // このランで到達したか
  isCurrent: boolean; // このランの最高到達ランク
  isBest: boolean;    // 自己最高ランク
}

/** ランク → 7段リスト。**7段すべてを常に返す**(社長指示「七つの大罪は7つ並べる」)。 */
export const rankRungs = (rank: number, bestRank: number): RankRung[] => {
  const cur = clampRank(rank);
  const best = clampRank(bestRank);
  return Array.from({ length: RANK_COUNT }, (_, i) => {
    const r = (i + 1) as PuzzleRank;
    return {
      rank: r,
      name: WALL_RANK_NAMES[r],
      en: WALL_RANK_NAMES_EN[r],
      reached: r <= cur,
      isCurrent: r === cur,
      isBest: r === best,
    };
  });
};

/** 「次がやりたくなる」1行のための材料。届く見込みのある“あと少し”だけを返す。 */
export interface NextGoal {
  /** 次の区域まであと何m(最深段に居るなら null)。 */
  meters: number | null;
  /** 次の区域名(同上 null)。 */
  zoneName: string | null;
  /** 次のランク名(R7なら null)。 */
  rankName: string | null;
  /** 何も残っていない(最深段かつR7)= 到達しきった。 */
  maxedOut: boolean;
}

export const nextGoal = (dist: number, rank: number): NextGoal => {
  const meters = metersToNextWall(Math.max(0, dist));
  const cur = clampRank(rank);
  const zoneIdx = zoneIdxOf(Math.max(0, dist));
  const zoneName = meters === null ? null : (AREA_ZONE_NAMES[zoneIdx + 1] ?? null);
  const rankName = cur < RANK_COUNT ? WALL_RANK_NAMES[(cur + 1) as PuzzleRank] : null;
  return { meters, zoneName, rankName, maxedOut: meters === null && rankName === null };
};

/**
 * 掘削の「総進捗」0..1。深さとランクの両輪をひとつの数にして、坑道の光量に使う(表示専用)。
 * ゲームの評価には一切使わない(スコア/ランク判定はそれぞれの正本のまま)。
 */
export const digProgress = (dist: number, rank: number): number => {
  const deepest = AREA_THRESHOLDS[AREA_THRESHOLDS.length - 1] + ABYSS_SPAN;
  const dp = Math.max(0, Math.min(1, Math.max(0, dist) / deepest));
  const rp = (clampRank(rank) - 1) / (RANK_COUNT - 1);
  return Math.max(0, Math.min(1, dp * 0.5 + rp * 0.5));
};
