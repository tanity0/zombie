import React, { useEffect, useState } from 'react';
import { depthRungs, rankRungs, nextGoal, digProgress } from '../utils/resultReach';
import { wallAchievementHeadline } from '../utils/wallProgress';
import { clampRank } from '../utils/rankAssessor';

// リザルトの主役「到達譜」= 上から下へ掘り下げる縦坑(社長指示v0.25.2332)。
//
// 見せ方の意図:
// - **距離もランクも上から下へ掘る**。浅い/軽い罪が上、深い/重い罪が下。左が「どこまで潜ったか」、
//   右が「七つの大罪のどこまで登りつめたか」。7段は常に全部並べる(社長指示)。
// - 掘れたところは光り、掘れていないところは岩のまま。**境目に掘削ヘッド(▶)が止まる**。
// - 自己最高は金の破線で残す=「前回の自分」を必ず画面に出す(成長が見える)。
// - 最後に「次の一手」を1行だけ。**次にやりたくなる理由**をここに集約する。
//
// 静的画面のReact規律: このコンポーネントは props で受けた値だけを見る(store購読なし)。
// 演出は CSS transition 1本(高さ)だけ=毎フレーム再描画しない。負荷 1/10。

interface ResultReachProps {
  /** このランの最深到達距離(px=m扱い)。 */
  dist: number;
  /** このランの最高到達ランク(1-7)。 */
  rank: number;
  /** 自己最深(px)。0=記録なし。 */
  bestDist: number;
  /** 自己最高ランク(1-7)。 */
  bestRank: number;
  /** このランの最深到達区域index(見出し用。stats.maxAreaReached)。 */
  zoneIdx: number;
  /** 自己最深を更新したランか。 */
  selfBestUpdated: boolean;
  /** 宿敵(ネームド)の結果。出なかったランは null。 */
  namedFoe?: { name: string; defeated: boolean } | null;
}

const COL_H = 182; // 縦坑の高さ(px)。縦持ち360pxで両列が収まり、7段でも文字が潰れない下限。

const ResultReach: React.FC<ResultReachProps> = ({
  dist, rank, bestDist, bestRank, zoneIdx, selfBestUpdated, namedFoe,
}) => {
  // マウント後に一度だけ「掘り下がる」。0→実値へCSS transitionで落とす(1回きり・派手にしない)。
  const [dug, setDug] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setDug(true), 60);
    return () => window.clearTimeout(id);
  }, []);

  const cur = clampRank(rank);
  const depth = depthRungs(dist, bestDist);
  const ranks = rankRungs(rank, bestRank);
  const goal = nextGoal(dist, rank);
  const glow = digProgress(dist, rank);
  const headline = wallAchievementHeadline(zoneIdx, cur);
  // 見出しの数字は**このランで掘った深さ**(自己最深は坑の中の金の⚑で別に見せる=混ぜない)。
  const shownDist = Math.round(Math.max(0, dist));

  // 段の高さ: 左(5段)と右(7段)で総高さを揃える=2本の坑が同じ深さに見える。
  const depthRowH = COL_H / depth.length;
  const rankRowH = COL_H / ranks.length;

  return (
    <div className="mt-2.5">
      {/* 見出し: 「◯◯の△△ に到達」。明朝+金の下線は既存リザルトのトーンを踏襲。 */}
      <p className="text-[15px] font-semibold tracking-tight" style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}>
        <span className="text-white/95">{headline}</span>
      </p>
      <div
        className="mx-auto mt-1 h-[2px] w-28"
        style={{ background: `linear-gradient(90deg, transparent, rgba(255,215,0,${0.35 + glow * 0.65}), transparent)` }}
      />

      <div className="mt-3 flex items-stretch gap-2 text-left">
        {/* ================= 左: 深さの縦坑 ================= */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">DEPTH</span>
            <span className="text-[10px] tabular-nums text-white/55">
              <span className="font-semibold" style={{ color: '#ffd700' }}>{shownDist}</span>m
              {selfBestUpdated && <span className="ml-1 text-amber-300" style={{ animation: 'wall-tantalize-flicker 1.6s ease-out 1' }}>⚑最深更新</span>}
            </span>
          </div>
          <div className="relative overflow-hidden bg-black/40" style={{ height: COL_H }}>
            {depth.map(r => (
              <div
                key={r.idx}
                className="relative border-b border-white/[0.07] last:border-b-0"
                style={{ height: depthRowH }}
              >
                {/* 掘れたぶん(左から右へは伸ばさず、段の上から下へ満ちる=掘り下げる向き) */}
                <div
                  className="absolute inset-x-0 top-0 transition-[height] duration-[900ms] ease-out"
                  style={{
                    height: `${(dug ? r.fill : 0) * 100}%`,
                    background: `linear-gradient(180deg, rgba(125,211,252,0.22), rgba(251,191,36,${0.10 + (r.idx / depth.length) * 0.22}))`,
                  }}
                />
                {/* 区域名 */}
                <div className="relative flex h-full items-center justify-between px-1.5">
                  <span className={`truncate text-[10px] leading-none ${r.reached ? 'text-white/85' : 'text-white/28'}`}>
                    {r.name}
                  </span>
                  {r.isBest && (
                    <span className="shrink-0 text-[9px] leading-none text-amber-300/80" title="自己最深">⚑</span>
                  )}
                </div>
                {/* 掘削ヘッド: 到達段の掘れた深さの位置に止まる */}
                {r.isCurrent && r.fill > 0 && (
                  <div
                    className="pointer-events-none absolute inset-x-0 transition-[top] duration-[900ms] ease-out"
                    style={{ top: `calc(${(dug ? r.fill : 0) * 100}% - 1px)` }}
                  >
                    <div className="h-[2px] w-full" style={{ background: '#fbbf24', boxShadow: '0 0 6px rgba(251,191,36,0.85)' }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ================= 右: 七つの大罪の縦坑 ================= */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40">RANK</span>
            <span className="text-[10px] tabular-nums text-white/55">
              R<span className="font-semibold" style={{ color: '#ff8a75' }}>{cur}</span>
              <span className="text-white/30"> / 7</span>
            </span>
          </div>
          <div className="relative overflow-hidden bg-black/40" style={{ height: COL_H }}>
            {ranks.map(r => (
              <div
                key={r.rank}
                className="relative flex items-center justify-between border-b border-white/[0.07] px-1.5 last:border-b-0"
                style={{
                  height: rankRowH,
                  background: r.reached
                    ? `linear-gradient(90deg, rgba(248,113,113,${0.06 + (r.rank / 7) * 0.20}), rgba(248,113,113,0.02))`
                    : 'transparent',
                  opacity: dug || !r.reached ? 1 : 0,
                  transition: `opacity 520ms ease-out ${r.rank * 70}ms`,
                }}
              >
                <span className={`truncate text-[10px] leading-none ${r.reached ? 'text-white/90' : 'text-white/25'}`}>
                  {r.name}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {r.isBest && <span className="text-[9px] leading-none text-amber-300/80" title="自己最高">⚑</span>}
                  <span className={`text-[8px] leading-none tracking-wider ${r.reached ? 'text-white/40' : 'text-white/15'}`}>
                    {r.en}
                  </span>
                </span>
                {/* 今回の到達段だけ、右端に赤いマーカー */}
                {r.isCurrent && (
                  <span
                    className="absolute inset-y-0 right-0 w-[3px]"
                    style={{ background: '#ff6a55', boxShadow: '0 0 6px rgba(255,106,85,0.9)' }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ================= 次の一手(わくわくの正体はここ) ================= */}
      <div className="mt-2.5 border-l-2 border-amber-300/60 bg-amber-400/[0.06] px-2.5 py-2 text-left">
        {goal.maxedOut ? (
          <p className="text-[12px] font-semibold text-amber-100">掘りきった —— この先はもう無い</p>
        ) : (
          <div className="space-y-0.5 text-[11px] leading-snug text-white/70">
            {goal.meters !== null && goal.zoneName && (
              <p>
                <span className="text-white/45">次の深さ</span>{' '}
                <span className="font-semibold text-sky-200">{goal.zoneName}</span>{' '}
                <span className="text-white/45">まで あと</span>{' '}
                <span className="font-semibold tabular-nums text-white/95" style={{ animation: 'wall-tantalize-flicker 1.6s ease-out 1' }}>
                  {goal.meters}
                </span>
                <span className="text-white/45">m</span>
              </p>
            )}
            {goal.rankName && (
              <p>
                <span className="text-white/45">次の罪</span>{' '}
                <span className="font-semibold text-rose-200">{goal.rankName}</span>{' '}
                <span className="text-white/45">まで あと1昇格</span>
              </p>
            )}
          </div>
        )}
        {namedFoe && (
          <p className="mt-1 border-t border-white/10 pt-1 text-[11px]">
            <span className="text-white/45">宿敵 {namedFoe.name}</span>{' '}
            <span className={`font-semibold ${namedFoe.defeated ? 'text-amber-300' : 'text-rose-300'}`}>
              {namedFoe.defeated ? '討伐' : '取り逃がし'}
            </span>
          </p>
        )}
      </div>
    </div>
  );
};

export default ResultReach;
