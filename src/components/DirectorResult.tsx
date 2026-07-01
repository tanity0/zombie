import React, { useMemo } from 'react';
import { getDirectorSamples } from '../utils/aiDirectorDebug';
import { summarizeRun, type DirectorMacro } from '../utils/aiDirector';

// リザルト画面のAIディレクター振り返り(?director=1 の時だけ表示)。
// プレイ中は数字を見ずに遊び、死亡/クリア後にここで「緊張曲線＋難易度スコア」を確認する(社長指示)。
// ゲームループとは独立=すでに記録済みのサンプルを読むだけ。静的表示なので負荷はほぼ無し。
const MACRO_BG: Record<DirectorMacro, string> = { buildup: '#38bdf8', peak: '#f87171', relax: '#4ade80' };

const W = 440, H = 78, PAD = 2;

const DirectorResult: React.FC = () => {
  const samples = getDirectorSamples();
  const summary = useMemo(() => summarizeRun(samples), [samples]);

  const chart = useMemo(() => {
    if (samples.length < 2) return null;
    const t0 = samples[0].t, t1 = samples[samples.length - 1].t;
    const span = Math.max(0.001, t1 - t0);
    const x = (t: number) => PAD + ((t - t0) / span) * (W - PAD * 2);
    const y = (v: number) => PAD + (1 - Math.max(0, Math.min(1, v))) * (H - PAD * 2);

    // マクロ帯: 連続同種をまとめて1つの矩形に(DOMノードを増やさない)。
    const bands: { x0: number; x1: number; macro: DirectorMacro }[] = [];
    let runStart = 0;
    for (let i = 1; i <= samples.length; i++) {
      if (i === samples.length || samples[i].macro !== samples[runStart].macro) {
        bands.push({ x0: x(samples[runStart].t), x1: x(samples[i - 1].t), macro: samples[runStart].macro });
        runStart = i;
      }
    }
    const intensityPts = samples.map(s => `${x(s.t).toFixed(1)},${y(s.intensity).toFixed(1)}`).join(' ');
    const perfPts = samples.map(s => `${x(s.t).toFixed(1)},${y(s.performance).toFixed(1)}`).join(' ');
    const areaPath = `M ${x(t0).toFixed(1)},${(H - PAD).toFixed(1)} L ${intensityPts.replace(/ /g, ' L ')} L ${x(t1).toFixed(1)},${(H - PAD).toFixed(1)} Z`;
    return { bands, intensityPts, perfPts, areaPath };
  }, [samples]);

  return (
    <div className="mb-3 rounded-none bg-black/25 px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-widest text-white/45">AI DIRECTOR</span>
        <div className="flex items-baseline gap-1">
          <span className="text-[9px] text-white/45">難易度</span>
          <span className="text-xl font-bold text-orange-300 tabular-nums leading-none">{summary.score}</span>
        </div>
      </div>

      {chart ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: 'auto' }} preserveAspectRatio="none">
          {/* マクロ帯(背景・薄く) */}
          {chart.bands.map((b, i) => (
            <rect key={i} x={b.x0} y={0} width={Math.max(0.5, b.x1 - b.x0)} height={H} fill={MACRO_BG[b.macro]} opacity={0.12} />
          ))}
          {/* 中線(0.5) */}
          <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#ffffff" strokeOpacity={0.08} strokeWidth={1} />
          {/* Intensity 面＋線(オレンジ) */}
          <path d={chart.areaPath} fill="#fb923c" opacity={0.22} />
          <polyline points={chart.intensityPts} fill="none" stroke="#fb923c" strokeWidth={1.5} strokeOpacity={0.95} />
          {/* Performance 線(紫) */}
          <polyline points={chart.perfPts} fill="none" stroke="#a78bfa" strokeWidth={1.2} strokeOpacity={0.85} strokeDasharray="3 2" />
        </svg>
      ) : (
        <div className="text-[11px] text-white/50 py-2">記録なし（?director=1 で計測されます）</div>
      )}

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/60 tabular-nums">
        <span><span className="text-orange-300/80">Intns</span> 平均{summary.avgIntensity.toFixed(2)} 最大{summary.maxIntensity.toFixed(2)}</span>
        <span><span className="text-violet-300/80">Perf</span> 平均{summary.avgPerformance.toFixed(2)}</span>
        <span><span className="text-rose-300/80">PEAK</span> {summary.peakCount}回 {summary.peakSeconds.toFixed(0)}s</span>
      </div>
    </div>
  );
};

export default DirectorResult;
