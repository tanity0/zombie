import React, { useMemo } from 'react';
import { getDirectorSamples, DIRECTOR_EVENT_BIT, type DirectorPhaseKind } from '../utils/aiDirectorDebug';
import { summarizeRun, type DirectorMacro } from '../utils/aiDirector';

// リザルト画面のAIディレクター振り返り(?director=1 の時だけ表示)。
// プレイ中は数字を見ずに遊び、死亡/クリア後にここで「緊張曲線＋難易度スコア」を確認する(社長指示)。
// ゲームループとは独立=すでに記録済みのサンプルを読むだけ。静的表示なので負荷はほぼ無し。
const MACRO_BG: Record<DirectorMacro, string> = { buildup: '#38bdf8', peak: '#f87171', relax: '#4ade80' };
// バッチ2.5(診断計測): 関所帯の色。buildupは帯を出さない(背景のまま)。
const GATE_BAND_COLOR: Partial<Record<DirectorPhaseKind, string>> = { gate: '#fbbf24', boss: '#ef4444' };
// イベント発火帯の色(凡例と共通)。社長向け実機フィードバックの「固定タイマー起因の詰まり」を
// リザルト単体で追えるようにする(実機確認①の再分析に使った突き合わせを画面に出す)。
const EVENT_META: { bit: number; label: string; color: string }[] = [
  { bit: DIRECTOR_EVENT_BIT.arena, label: '囲い', color: '#fbbf24' },
  { bit: DIRECTOR_EVENT_BIT.hunter, label: 'ハンター', color: '#f472b6' },
  { bit: DIRECTOR_EVENT_BIT.redNight, label: '紅き月', color: '#ef4444' },
  { bit: DIRECTOR_EVENT_BIT.screamer, label: '叫喚', color: '#facc15' },
  { bit: DIRECTOR_EVENT_BIT.reaper, label: 'リーパー', color: '#c084fc' },
  { bit: DIRECTOR_EVENT_BIT.castleBoss, label: '城ボス', color: '#22d3ee' },
];

const W = 440, PAD = 2;
const BAND_H = 6;           // 関所帯・イベント帯、それぞれの高さ
const BAND_GAP = 1;
const CHART_TOP = (BAND_H + BAND_GAP) * 2 + 2; // 2帯ぶん本体グラフを下にずらす
const CHART_H = 78;
const H = CHART_TOP + CHART_H;

const DirectorResult: React.FC = () => {
  const samples = getDirectorSamples();
  const summary = useMemo(() => summarizeRun(samples), [samples]);

  const chart = useMemo(() => {
    if (samples.length < 2) return null;
    const t0 = samples[0].t, t1 = samples[samples.length - 1].t;
    const span = Math.max(0.001, t1 - t0);
    const x = (t: number) => PAD + ((t - t0) / span) * (W - PAD * 2);
    const y = (v: number) => CHART_TOP + PAD + (1 - Math.max(0, Math.min(1, v))) * (CHART_H - PAD * 2);

    // マクロ帯: 連続同種をまとめて1つの矩形に(DOMノードを増やさない)。
    const bands: { x0: number; x1: number; macro: DirectorMacro }[] = [];
    let runStart = 0;
    for (let i = 1; i <= samples.length; i++) {
      if (i === samples.length || samples[i].macro !== samples[runStart].macro) {
        bands.push({ x0: x(samples[runStart].t), x1: x(samples[i - 1].t), macro: samples[runStart].macro });
        runStart = i;
      }
    }
    // バッチ2.5: 関所(gate/boss)帯。buildupは帯を出さない=連続同種のrunだけ矩形化。
    const gateBands: { x0: number; x1: number; color: string }[] = [];
    runStart = 0;
    for (let i = 1; i <= samples.length; i++) {
      if (i === samples.length || samples[i].phaseKind !== samples[runStart].phaseKind) {
        const color = GATE_BAND_COLOR[samples[runStart].phaseKind];
        if (color) gateBands.push({ x0: x(samples[runStart].t), x1: x(samples[i - 1].t), color });
        runStart = i;
      }
    }
    // バッチ2.5: イベント発火帯。ビットごとに連続runを矩形化(同フレーム複数ビットは重ね塗り)。
    const eventBands: { x0: number; x1: number; color: string }[] = [];
    for (const meta of EVENT_META) {
      runStart = 0;
      for (let i = 1; i <= samples.length; i++) {
        const on = (s: typeof samples[number]) => (s.events & meta.bit) !== 0;
        if (i === samples.length || on(samples[i]) !== on(samples[runStart])) {
          if (on(samples[runStart])) eventBands.push({ x0: x(samples[runStart].t), x1: x(samples[i - 1].t), color: meta.color });
          runStart = i;
        }
      }
    }
    // バッチ2.5: エリア移動(縦線+ゾーン番号)。areaIdxが変化した瞬間だけ。
    const areaLines: { x: number; areaIdx: number }[] = [];
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].areaIdx !== samples[i - 1].areaIdx) areaLines.push({ x: x(samples[i].t), areaIdx: samples[i].areaIdx });
    }
    const intensityPts = samples.map(s => `${x(s.t).toFixed(1)},${y(s.intensity).toFixed(1)}`).join(' ');
    const perfPts = samples.map(s => `${x(s.t).toFixed(1)},${y(s.performance).toFixed(1)}`).join(' ');
    const areaPath = `M ${x(t0).toFixed(1)},${(H - PAD).toFixed(1)} L ${intensityPts.replace(/ /g, ' L ')} L ${x(t1).toFixed(1)},${(H - PAD).toFixed(1)} Z`;
    // バッチ2.5: gatePressure線(緩フェーズはnullなので関所区間ごとに線が途切れる=意味のある切れ方)。
    const pressureSegs: string[] = [];
    let seg: string[] = [];
    for (const s of samples) {
      if (s.pressure == null) {
        if (seg.length > 1) pressureSegs.push(seg.join(' '));
        seg = [];
      } else {
        seg.push(`${x(s.t).toFixed(1)},${y(s.pressure).toFixed(1)}`);
      }
    }
    if (seg.length > 1) pressureSegs.push(seg.join(' '));
    return { bands, gateBands, eventBands, areaLines, intensityPts, perfPts, areaPath, pressureSegs };
  }, [samples]);

  const pct = (sec: number): number => (summary.durationSec > 0 ? Math.round((100 * sec) / summary.durationSec) : 0);

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
          {/* マクロ帯(背景・薄く、本体グラフの高さぶんだけ) */}
          {chart.bands.map((b, i) => (
            <rect key={i} x={b.x0} y={CHART_TOP} width={Math.max(0.5, b.x1 - b.x0)} height={CHART_H} fill={MACRO_BG[b.macro]} opacity={0.12} />
          ))}
          {/* バッチ2.5: 関所(gate/boss)帯(上端の細帯) */}
          {chart.gateBands.map((b, i) => (
            <rect key={i} x={b.x0} y={0} width={Math.max(0.5, b.x1 - b.x0)} height={BAND_H} fill={b.color} opacity={0.85} />
          ))}
          {/* バッチ2.5: イベント発火帯(関所帯のすぐ下) */}
          {chart.eventBands.map((b, i) => (
            <rect key={i} x={b.x0} y={BAND_H + BAND_GAP} width={Math.max(0.5, b.x1 - b.x0)} height={BAND_H} fill={b.color} opacity={0.75} />
          ))}
          {/* 中線(0.5) */}
          <line x1={0} y1={CHART_TOP + CHART_H / 2} x2={W} y2={CHART_TOP + CHART_H / 2} stroke="#ffffff" strokeOpacity={0.08} strokeWidth={1} />
          {/* Intensity 面＋線(オレンジ) */}
          <path d={chart.areaPath} fill="#fb923c" opacity={0.22} />
          <polyline points={chart.intensityPts} fill="none" stroke="#fb923c" strokeWidth={1.5} strokeOpacity={0.95} />
          {/* Performance 線(紫) */}
          <polyline points={chart.perfPts} fill="none" stroke="#a78bfa" strokeWidth={1.2} strokeOpacity={0.85} strokeDasharray="3 2" />
          {/* バッチ2.5: gatePressure線(黄緑・関所区間だけ途切れながら描画) */}
          {chart.pressureSegs.map((pts, i) => (
            <polyline key={i} points={pts} fill="none" stroke="#a3e635" strokeWidth={1.2} strokeOpacity={0.9} />
          ))}
          {/* バッチ2.5: エリア移動(縦線+ゾーン番号) */}
          {chart.areaLines.map((a, i) => (
            <g key={i}>
              <line x1={a.x} y1={CHART_TOP} x2={a.x} y2={H - PAD} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={0.75} strokeDasharray="2 2" />
              <text x={a.x + 1.5} y={CHART_TOP + 7} fontSize={6} fill="#ffffff" opacity={0.6}>Z{a.areaIdx}</text>
            </g>
          ))}
        </svg>
      ) : (
        <div className="text-[11px] text-white/50 py-2">記録なし（?director=1 で計測されます）</div>
      )}
      {chart && (
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-white/50">
          {EVENT_META.map(m => (
            <span key={m.label} className="inline-flex items-center gap-0.5">
              <span className="inline-block w-1.5 h-1.5 rounded-none" style={{ backgroundColor: m.color }} />
              {m.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-0.5">
            <span className="inline-block w-2 h-0.5" style={{ backgroundColor: '#a3e635' }} />
            gatePressure
          </span>
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/60 tabular-nums">
        <span><span className="text-orange-300/80">Intns</span> 平均{summary.avgIntensity.toFixed(2)} 最大{summary.maxIntensity.toFixed(2)}</span>
        <span><span className="text-violet-300/80">Perf</span> 平均{summary.avgPerformance.toFixed(2)}</span>
      </div>
      {/* BUILD_UP/PEAK/RELAX の内訳(社長指示: 「RELAXが少ない」を体感でなく数字で見られるように)。 */}
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/60 tabular-nums">
        <span><span className="text-sky-300/80">BUILD</span> {summary.buildupSeconds.toFixed(0)}s ({pct(summary.buildupSeconds)}%)</span>
        <span><span className="text-rose-300/80">PEAK</span> {summary.peakCount}回 {summary.peakSeconds.toFixed(0)}s ({pct(summary.peakSeconds)}%)</span>
        <span><span className="text-emerald-300/80">RELAX</span> {summary.relaxCount}回 {summary.relaxSeconds.toFixed(0)}s ({pct(summary.relaxSeconds)}%)</span>
      </div>
    </div>
  );
};

export default DirectorResult;
