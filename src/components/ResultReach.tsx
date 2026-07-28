import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { strata, depthFrac, buildCores, rankRungs, nextGoal, digProgress, CUTAWAY_MAX } from '../utils/resultReach';
import { wallAchievementHeadline } from '../utils/wallProgress';
import { clampRank } from '../utils/rankAssessor';
import type { RunCore } from '../data/progress';

// リザルトの主役「到達譜」= 地表から掘り下げる**1枚の地質断面図**(社長指示v0.25.2332/2333)。
//
// 構成:
// - 左に**固定の深度計**。目盛と、世界の目印(廃病院/裏ボスの巣)のピンが刺さる。到達していない
//   深さにも刺さるので「巣はここ。まだ足りない」が一目で分かる。
// - 右が**横スクロールする壁**。地層は全ランで共通なので断面は1枚のまま横に伸び、そこに
//   **1ラン=1本の竪坑**が刺さる。時間は左→右で、いちばん右が今回。左へスクロールすると過去へ遡れる。
// - 七つの大罪は深さと独立した軸なので**断面の外**に7マスの帯として置く(全段を常に表示)。
//
// 静的画面のReact規律: props で受けた値だけを見る(store購読なし)。演出は初回1回のCSS transitionのみ。
// 負荷 1/10(静止DOM・毎フレーム再描画なし)。

interface PoiPin {
  /** 原点からの距離(px=m扱い)。 */
  dist: number;
  label: string;
  kind: 'boss' | 'cave' | 'hospital' | 'armory' | 'police'; // armory/police = PACING_PUZZLE.md §6.24 M48
}

interface ResultReachProps {
  dist: number;               // このランの最深到達距離
  rank: number;               // このランの最高到達ランク(1-7)
  bestRank: number;           // 自己最高ランク(1-7)
  zoneIdx: number;            // このランの最深到達区域index(見出し用)
  end: RunCore['end'];        // 終わり方(坑の色)
  at: number;                 // このランの終了時刻(epoch ms)
  history: RunCore[];         // 過去の掘削記録(古い順・今回を含まない)
  pois?: PoiPin[];            // 解放済みの世界の目印(深度計に刺す)
  namedFoe?: { name: string; defeated: boolean } | null;
}

const CUT_H = 244;      // 断面図の高さ(px)。縦持ち360pxで地層名が潰れない下限。
const GAUGE_W = 38;     // 左の深度計の幅(px)
const CORE_W = 62;      // 竪坑1本ぶんの列幅(px)
const HOLE_W = 22;      // 穴そのものの幅(px)

/** 地層の見た目(上から: 土＋瓦礫 / コンクリ / 赤錆 / 汚染 / 深層)。素材ではなくCSSの重ね塗り=軽い。 */
const STRATUM_STYLE: { bg: string; tex: string; fg: string }[] = [
  { bg: '#332A20', fg: 'rgba(255,255,255,.80)', tex: 'repeating-linear-gradient(94deg,rgba(0,0,0,.40) 0 2px,transparent 2px 6px),repeating-radial-gradient(circle at 18% 40%,rgba(255,255,255,.07) 0 1px,transparent 1px 9px)' },
  { bg: '#2A2A2C', fg: 'rgba(255,255,255,.78)', tex: 'repeating-linear-gradient(88deg,rgba(0,0,0,.34) 0 3px,transparent 3px 8px),repeating-linear-gradient(0deg,rgba(127,196,232,.06) 0 1px,transparent 1px 12px)' },
  { bg: '#2E1E1C', fg: 'rgba(255,255,255,.78)', tex: 'repeating-linear-gradient(99deg,rgba(0,0,0,.42) 0 2px,transparent 2px 5px),repeating-radial-gradient(circle at 72% 60%,rgba(255,90,71,.10) 0 2px,transparent 2px 14px)' },
  { bg: '#231928', fg: 'rgba(255,255,255,.92)', tex: 'repeating-linear-gradient(104deg,rgba(0,0,0,.40) 0 2px,transparent 2px 6px),repeating-linear-gradient(-58deg,rgba(160,107,216,.16) 0 1px,transparent 1px 11px)' },
  { bg: '#0A060E', fg: 'rgba(255,255,255,.26)', tex: 'repeating-linear-gradient(110deg,rgba(0,0,0,.60) 0 3px,transparent 3px 10px)' },
];

/** 終わり方ごとの坑の色(達成=金 / 撤退=白 / 死亡=赤)。 */
const END_COLOR: Record<RunCore['end'], string> = { won: '#FFD54A', withdraw: '#CBD5E1', death: '#FF6A55' };

const POI_MARK: Record<PoiPin['kind'], { icon: string; color: string }> = {
  hospital: { icon: '✚', color: '#7BE8A8' },
  boss: { icon: '☠', color: '#FF6A55' },
  cave: { icon: '◗', color: '#F59E0B' },
  armory: { icon: '▣', color: '#FBBF24' }, // §6.24 M48: 武器庫(スクラップ色)
  police: { icon: '★', color: '#60A5FA' }, // §6.24 M48: 警察署
};

const ResultReach: React.FC<ResultReachProps> = ({
  dist, rank, bestRank, zoneIdx, end, at, history, pois = [], namedFoe,
}) => {
  // マウント後に一度だけ「掘り下がる」(0→実値へCSS transition・1回きり)。
  const [dug, setDug] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setDug(true), 60);
    return () => window.clearTimeout(id);
  }, []);

  // 開いた瞬間は右端(=今回)を見せる。左へスクロールすると過去へ遡る。
  // 実際に横へはみ出している時だけ「◀ 過去へ」を出す(出せない操作を案内しない)。
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    setCanScroll(el.scrollWidth > el.clientWidth + 4);
  }, [history.length]);

  const cur = clampRank(rank);
  const bands = strata();
  const cores = buildCores(history, { dist, rank, end, at });
  const ranks = rankRungs(rank, bestRank);
  const goal = nextGoal(dist, rank);
  const glow = digProgress(dist, rank);
  const headline = wallAchievementHeadline(zoneIdx, cur);
  const deepest = cores.find(c => c.isDeepest);
  // 壁の幅。竪坑が少ないうちは**画面いっぱい(minWidth:100%)まで地層を伸ばし**、坑は右端から並べる。
  // 「初回は右寄りに立ち、増えるたび左へ押されていく」(社長指示v0.25.2335)= 左側は手つかずの岩のまま。
  const wallW = Math.max(cores.length * CORE_W, 1);
  // 目盛は2000mごと。断面が10000mなので6本(0/2k/4k/6k/8k/10k)。
  const ticks = Array.from({ length: Math.floor(CUTAWAY_MAX / 2000) + 1 }, (_, i) => i * 2000);

  return (
    <div className="mt-2.5">
      <p className="text-[15px] font-semibold tracking-tight" style={{ fontFamily: 'Georgia, "Hiragino Mincho ProN", serif' }}>
        <span className="text-white/95">{headline}</span>
      </p>
      <div
        className="mx-auto mt-1 h-[2px] w-28"
        style={{ background: `linear-gradient(90deg, transparent, rgba(255,215,0,${0.35 + glow * 0.65}), transparent)` }}
      />

      {/* ================= 地質断面図 ================= */}
      <div className="mt-3 flex text-left" style={{ height: CUT_H, background: '#050409' }}>
        {/* ---- 左: 固定の深度計(目盛 + 世界の目印) ---- */}
        <div className="relative shrink-0" style={{ width: GAUGE_W, background: '#08070D', borderRight: '1px solid rgba(255,255,255,.09)' }}>
          {ticks.map(t => (
            <div key={t}>
              <div className="absolute right-0 h-px w-3 bg-white/40" style={{ top: depthFrac(t) * CUT_H }} />
              <div
                className="absolute right-4 -translate-y-1/2 font-mono text-[8px] tabular-nums text-white/40"
                style={{ top: Math.min(CUT_H - 5, depthFrac(t) * CUT_H + (t === 0 ? 6 : 0)) }}
              >
                {t === 0 ? '0' : `${t / 1000}k`}
              </div>
            </div>
          ))}
          {/* 世界の目印: **到達していない深さにも刺さる**=次に潜る理由になる。 */}
          {pois.map(p => (
            <div
              key={p.label}
              className="absolute -right-px z-20 -translate-y-1/2 whitespace-nowrap px-1 text-[8px] leading-none"
              style={{ top: depthFrac(p.dist) * CUT_H, background: 'rgba(5,4,9,.85)', color: POI_MARK[p.kind].color }}
              title={`${p.label} ${Math.round(p.dist)}m`}
            >
              {POI_MARK[p.kind].icon}
            </div>
          ))}
        </div>

        {/* ---- 右: 横スクロールする壁(地層 + 竪坑) ---- */}
        <div
          ref={scrollerRef}
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x"
          style={{ scrollbarWidth: 'none' }}
        >
          <div className="relative h-full" style={{ width: wallW, minWidth: '100%' }}>
            {/* 地層(実距離スケール・壁の全幅に連続して敷く) */}
            {bands.map(b => {
              const st = STRATUM_STYLE[b.idx] ?? STRATUM_STYLE[STRATUM_STYLE.length - 1];
              return (
                <div
                  key={b.idx}
                  className="absolute inset-x-0"
                  style={{ top: b.topFrac * CUT_H, height: b.heightFrac * CUT_H, background: st.bg, borderTop: b.idx ? '1px solid rgba(0,0,0,.55)' : 'none' }}
                >
                  <div className="absolute inset-0 opacity-50" style={{ backgroundImage: st.tex }} />
                  {/* 区域名は**横スクロールしても左端に貼り付く**(sticky)。壁の左端に置くと過去へ
                      遡った時に名前が流れて消えてしまうため。 */}
                  <div className="pointer-events-none absolute inset-0 flex items-center">
                    <span
                      className="inline-block whitespace-nowrap px-1.5 text-[9.5px] tracking-wide"
                      style={{
                        position: 'sticky', left: 0, color: st.fg,
                        // 竪坑のラベルと重なっても区域名が勝つように、薄い暗幕を敷く。
                        background: 'linear-gradient(90deg, rgba(5,4,9,.86) 70%, rgba(5,4,9,0))',
                        textShadow: '0 1px 4px rgba(0,0,0,.95)',
                      }}
                    >
                      {b.name}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* 地表(0m) */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10"
              style={{ height: 5, background: 'linear-gradient(180deg, rgba(127,196,232,.30), rgba(127,196,232,0))', borderTop: '1px solid rgba(180,220,240,.55)' }}
            />

            {/* 竪坑: 1ラン=1本。左ほど古い、右端が今回。 */}
            {cores.map((c, i) => {
              const color = END_COLOR[c.end];
              // **右端から並べる**: 最新(今回)が右、古いほど左。坑が1本しか無い初回は右寄りに立ち、
              // ランを重ねるたびに左へ押し出されていく(社長指示v0.25.2335)。
              const right = (cores.length - 1 - i) * CORE_W + (CORE_W - HOLE_W) / 2;
              const h = (dug || !c.isCurrent ? c.frac : 0) * CUT_H;
              return (
                <div key={c.key} className="absolute top-0 z-20" style={{ right, width: HOLE_W, height: CUT_H }}>
                  {/* 掘った穴(地層から抜かれた空洞) */}
                  <div
                    className={`absolute inset-x-0 top-0 ${c.isCurrent ? 'transition-[height] duration-[900ms] ease-out' : ''}`}
                    style={{
                      height: h,
                      background: 'linear-gradient(180deg, rgba(0,0,0,.94), rgba(0,0,0,.99))',
                      boxShadow: `inset 2px 0 4px rgba(0,0,0,.9), inset -2px 0 4px rgba(0,0,0,.9), 0 0 0 1px ${color}${c.isCurrent ? '3d' : '1f'}`,
                      opacity: c.isCurrent ? 1 : 0.78,
                    }}
                  >
                    <div className="absolute inset-0 opacity-40" style={{ backgroundImage: `repeating-linear-gradient(180deg, ${color}22 0 1px, transparent 1px 9px)` }} />
                  </div>
                  {/* 掘削ヘッド(止まった深さ) */}
                  {c.frac > 0 && (
                    <div
                      className={`absolute z-30 ${c.isCurrent ? 'transition-[top] duration-[900ms] ease-out' : ''}`}
                      style={{
                        top: h - 1, left: c.isCurrent ? -5 : -2, right: c.isCurrent ? -5 : -2,
                        height: c.isCurrent ? 3 : 2, background: color,
                        boxShadow: c.isCurrent ? `0 0 10px 1px ${color}` : 'none',
                        opacity: c.isCurrent ? 1 : 0.7,
                      }}
                    />
                  )}
                  {/* ラベル: ヘッドの真下に「今回 / −1」と深さ */}
                  <div
                    className={`absolute z-30 whitespace-nowrap text-center font-mono text-[7.5px] leading-tight tabular-nums ${c.isCurrent ? 'transition-[top] duration-[900ms] ease-out' : ''}`}
                    style={{ top: Math.min(CUT_H - 20, h + 3), left: -((CORE_W - HOLE_W) / 2), width: CORE_W }}
                  >
                    <span style={{ color: c.isCurrent ? color : 'rgba(255,255,255,.42)', fontWeight: c.isCurrent ? 700 : 400 }}>
                      {c.isDeepest && <span style={{ color: '#FFD54A' }}>⚑</span>}{c.label}
                    </span>
                    <span className="block" style={{ color: c.isCurrent ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.3)' }}>
                      {Math.round(c.dist)}m
                    </span>
                  </div>
                </div>
              );
            })}

            {/* 自己最深の水準線: 壁の全幅に引く=「超えた/届かなかった」が一目 */}
            {deepest && deepest.frac > 0 && (
              <div
                className="pointer-events-none absolute inset-x-0 z-10"
                style={{ top: deepest.frac * CUT_H, borderTop: '1px dashed rgba(255,213,74,.5)' }}
              />
            )}
          </div>
        </div>
      </div>
      {cores.length > 1 && (
        <div className="mt-1 flex items-center justify-between font-mono text-[7.5px] tracking-widest text-white/30">
          <span>{canScroll ? '◀ 過去へ' : ''}</span>
          <span>掘削記録 {cores.length}本</span>
        </div>
      )}

      {/* ================= 七つの大罪(断面の外=深さとは別の軸) ================= */}
      <div className="mt-2 flex gap-[2px]">
        {ranks.map(r => (
          <div
            key={r.rank}
            className="flex-1 py-1.5 text-center text-[11px] leading-none"
            style={{
              color: r.isCurrent ? '#fff' : r.reached ? 'rgba(255,255,255,.74)' : 'rgba(255,255,255,.19)',
              fontWeight: r.isCurrent ? 700 : 400,
              background: r.isCurrent ? 'rgba(255,90,71,.36)' : r.reached ? 'rgba(255,90,71,.09)' : 'rgba(0,0,0,.5)',
              boxShadow: r.isCurrent ? 'inset 0 0 12px rgba(255,90,71,.55)' : 'inset 0 1px 2px rgba(0,0,0,.8)',
            }}
          >
            {r.name.charAt(0)}
            <span className="mt-0.5 block font-mono text-[6.5px] opacity-50">
              {r.isBest ? '⚑' : ''}R{r.rank}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[7.5px] tracking-widest text-white/30">
        <span>七つの大罪</span>
        <span>R{cur} {ranks[cur - 1]?.name}</span>
      </div>

      {/* ================= 次の一手 ================= */}
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
