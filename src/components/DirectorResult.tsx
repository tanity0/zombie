import React, { useMemo } from 'react';
import { getDirectorSamples, DIRECTOR_EVENT_BIT, DIRECTOR_MARGIN_DEADBAND, type DirectorPhaseKind } from '../utils/aiDirectorDebug';
import { summarizeRun, type DirectorMacro } from '../utils/aiDirector';
import { BORED_BONUS_MAX } from '../utils/boredomDirector';
import { useGameStore } from '../store/gameStore';

// リザルト画面のAIディレクター振り返り(v0.25.1374から常時表示。?director=0で記録ごと停止)。
// プレイ中は数字を見ずに遊び、死亡/クリア後にここで「緊張曲線＋難易度スコア」を確認する(社長指示)。
// ゲームループとは独立=すでに記録済みのサンプルを読むだけ。静的表示なので負荷はほぼ無し。
const MACRO_BG: Record<DirectorMacro, string> = { buildup: '#38bdf8', peak: '#f87171', relax: '#4ade80' };
// バッチ2.5(診断計測): 関所帯の色。buildupは帯を出さない(背景のまま)。
const GATE_BAND_COLOR: Partial<Record<DirectorPhaseKind, string>> = { gate: '#fbbf24', boss: '#ef4444' };
// イベント発火帯の色(凡例と共通)。
// v0.25.2332(社長指示「叫びとかあの辺細かすぎていらない」): 既定では**記憶に残る大物4つだけ**に絞る。
// 囲い/叫喚/リーパーは細かすぎるので既定から外した。診断で全部見たい時は **?directorfull=1**
// (この復帰フラグで旧・全項目+全ラインに戻る)。記録側(aiDirectorDebug)は従来どおり全ビット記録している
// ので、フラグを付ければ過去と同じ情報が読める=計測は一切減らしていない。
const EVENT_META_CORE: { bit: number; label: string; color: string }[] = [
  { bit: DIRECTOR_EVENT_BIT.hunter, label: 'ハンター', color: '#f472b6' },
  { bit: DIRECTOR_EVENT_BIT.redNight, label: '紅き月', color: '#ef4444' },
  { bit: DIRECTOR_EVENT_BIT.castleBoss, label: '城ボス', color: '#22d3ee' },
  { bit: DIRECTOR_EVENT_BIT.named, label: '宿敵', color: '#ffd700' }, // PACING_PUZZLE.md §5.14 M13
];
const EVENT_META_EXTRA: { bit: number; label: string; color: string }[] = [
  { bit: DIRECTOR_EVENT_BIT.arena, label: '囲い', color: '#fbbf24' },
  { bit: DIRECTOR_EVENT_BIT.screamer, label: '叫喚', color: '#facc15' },
  { bit: DIRECTOR_EVENT_BIT.reaper, label: 'リーパー', color: '#c084fc' },
];
// 診断用フル表示(旧レイアウト相当)。?directorfull=1 で全イベント帯+補助ライン4本が戻る。
const directorFull = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('directorfull') === '1';
const EVENT_META = directorFull ? [...EVENT_META_CORE, ...EVENT_META_EXTRA] : EVENT_META_CORE;

// バッチ3.5-B(盤面在庫): debtは0-1に収まらないスカラーなので、表示用にこの値で正規化する
// (目安=10体前後の在庫。CAST_DEBT_MAX=10/RISE_DEBT_MAX=10/EVENT_DEBT_MAX=12のしきい値帯が
// ちょうど画面の中〜上寄りに来る値)。実際のしきい値超えはイベント帯/関所帯の挙動で読める。
const DEBT_DISPLAY_MAX = 20;
const W = 440, PAD = 2;
const BAND_H = 6;           // 関所帯・イベント帯、それぞれの高さ
const BAND_GAP = 1;
const CHART_TOP = (BAND_H + BAND_GAP) * 2 + 2; // 2帯ぶん本体グラフを下にずらす
const CHART_H = 78;
const H = CHART_TOP + CHART_H;

const DirectorResult: React.FC = () => {
  const samples = getDirectorSamples();
  // ★v0.25.3555: 被弾の計器。**毎フレーム変わる gameStats 全体を購読しない**(React再レンダ規律)。
  // 必要なフィールドだけを個別に取る=リザルト表示中は値が動かないので再レンダも起きない。
  const hitsTaken = useGameStore(s => s.gameStats.hitsTaken);
  const damageTaken = useGameStore(s => s.gameStats.damageTaken);
  const minHpFrac = useGameStore(s => s.gameStats.minHpFrac);
  const minHpPct = Math.round(minHpFrac * 100);
  const summary = useMemo(() => summarizeRun(samples), [samples]);
  // 案0(v0.25.3530): 戦力マージンの要約。**サンプルに記録がある時だけ**表示する(旧ランは undefined)。
  const power = useMemo(() => {
    const ms = samples.map(s => s.ppMargin).filter((v): v is number => typeof v === 'number');
    if (ms.length === 0) return null;
    const sum = ms.reduce((a, b) => a + b, 0);
    const armed = ms.filter(v => v >= DIRECTOR_MARGIN_DEADBAND).length;
    return {
      avg: sum / ms.length,
      max: Math.max(...ms),
      armedPct: Math.round((armed / ms.length) * 100),
    };
  }, [samples]);

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
    // バッチ3.5-B: 盤面在庫(debt)線。DEBT_DISPLAY_MAXで正規化してintensity等と同じ0-1軸に重ねる。
    const debtPts = samples.map(s => `${x(s.t).toFixed(1)},${y(Math.min(1, s.debt / DEBT_DISPLAY_MAX)).toFixed(1)}`).join(' ');
    // バッチ6小物: up+N(退屈シグナルの上振れボーナス)線。BORED_BONUS_MAXで正規化(0-1軸)。挙動不変・記録済み値の表示のみ。
    const upswingPts = samples.map(s => `${x(s.t).toFixed(1)},${y(Math.min(1, s.upswing / BORED_BONUS_MAX)).toFixed(1)}`).join(' ');
    // PACING_PUZZLE.md バッチM2(§3-D): ランク階段線(1..7を0-1軸へ正規化)。本方式(?puzzle=0以外)の
    // ランのみpuzzleRankが記録されているので、旧経路(?puzzle=0)のランではnullが続き線が出ない
    // (gatePressure線と同じ「途切れる=対象外」の見せ方)。
    const rankSegs: string[] = [];
    let rankSeg: string[] = [];
    for (const s of samples) {
      if (s.puzzleRank == null) {
        if (rankSeg.length > 1) rankSegs.push(rankSeg.join(' '));
        rankSeg = [];
      } else {
        rankSeg.push(`${x(s.t).toFixed(1)},${y((s.puzzleRank - 1) / 6).toFixed(1)}`);
      }
    }
    if (rankSeg.length > 1) rankSegs.push(rankSeg.join(' '));
    return { bands, gateBands, eventBands, areaLines, intensityPts, perfPts, areaPath, pressureSegs, debtPts, upswingPts, rankSegs };
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
          {/* v0.25.2332: 補助ライン4本(Performance/gatePressure/盤面在庫/up+N)は既定で非表示。
              プレイヤーが読み取れず線が混み合うだけなので、診断時(?directorfull=1)にだけ出す。 */}
          {directorFull && (
            <>
              {/* Performance 線(紫) */}
              <polyline points={chart.perfPts} fill="none" stroke="#a78bfa" strokeWidth={1.2} strokeOpacity={0.85} strokeDasharray="3 2" />
              {/* バッチ2.5: gatePressure線(黄緑・関所区間だけ途切れながら描画) */}
              {chart.pressureSegs.map((pts, i) => (
                <polyline key={i} points={pts} fill="none" stroke="#a3e635" strokeWidth={1.2} strokeOpacity={0.9} />
              ))}
              {/* バッチ3.5-B: 盤面在庫(debt)線(第4の線・他の線/イベント色と被らないスレート色) */}
              <polyline points={chart.debtPts} fill="none" stroke="#94a3b8" strokeWidth={1} strokeOpacity={0.85} strokeDasharray="1 2" />
              {/* バッチ6小物: up+N(退屈シグナルの上振れボーナス)線(第5の線・城ボス凡例の水色と被らないティール) */}
              <polyline points={chart.upswingPts} fill="none" stroke="#2dd4bf" strokeWidth={1} strokeOpacity={0.85} strokeDasharray="1 3" />
            </>
          )}
          {/* PACING_PUZZLE.md バッチM2: ランク階段線(白・本方式ONのランだけ途切れず表示される) */}
          {chart.rankSegs.map((pts, i) => (
            <polyline key={i} points={pts} fill="none" stroke="#f1f5f9" strokeWidth={1.3} strokeOpacity={0.9} />
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
        <div className="text-[11px] text-white/50 py-2">記録なし（計測前に終了、または ?director=0 で計測停止中）</div>
      )}
      {chart && (
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-white/50">
          {EVENT_META.map(m => (
            <span key={m.label} className="inline-flex items-center gap-0.5">
              <span className="inline-block w-1.5 h-1.5 rounded-none" style={{ backgroundColor: m.color }} />
              {m.label}
            </span>
          ))}
          {directorFull && (
            <>
              <span className="inline-flex items-center gap-0.5">
                <span className="inline-block w-2 h-0.5" style={{ backgroundColor: '#a3e635' }} />
                gatePressure
              </span>
              <span className="inline-flex items-center gap-0.5">
                <span className="inline-block w-2 h-0.5" style={{ backgroundColor: '#94a3b8' }} />
                盤面在庫
              </span>
              <span className="inline-flex items-center gap-0.5">
                <span className="inline-block w-2 h-0.5" style={{ backgroundColor: '#2dd4bf' }} />
                up+N
              </span>
            </>
          )}
          <span className="inline-flex items-center gap-0.5">
            <span className="inline-block w-2 h-0.5" style={{ backgroundColor: '#f1f5f9' }} />
            ランク(R1-R7)
          </span>
        </div>
      )}

      {/* v0.25.2332: Intns/Perf の生の平均値は診断用なので ?directorfull=1 の時だけ。
          プレイヤーが読むのは下の BUILD/PEAK/RELAX の内訳(「どんなランだったか」)。 */}
      {directorFull && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/60 tabular-nums">
          <span><span className="text-orange-300/80">Intns</span> 平均{summary.avgIntensity.toFixed(2)} 最大{summary.maxIntensity.toFixed(2)}</span>
          <span><span className="text-violet-300/80">Perf</span> 平均{summary.avgPerformance.toFixed(2)}</span>
        </div>
      )}
      {/* ★案0(社長指示v0.25.3530): 難易度③「戦力連動」の計器。**1.10を超えて初めて働く**レバーなので、
          「このランで一度でも届いたか」だけ分かれば、較正するかどうかを実測で決められる。読むだけ。 */}
      {power && (
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/60 tabular-nums">
          <span>
            <span className="text-amber-300/80">戦力マージン</span>{' '}
            平均{power.avg.toFixed(2)} 最大{power.max.toFixed(2)}
            <span className="text-white/35"> / 作動{DIRECTOR_MARGIN_DEADBAND.toFixed(2)}</span>
          </span>
          <span className={power.armedPct > 0 ? 'text-amber-300/80' : 'text-white/35'}>
            作動していた時間 {power.armedPct}%
          </span>
        </div>
      )}
      {/* BUILD_UP/PEAK/RELAX の内訳(社長指示: 「RELAXが少ない」を体感でなく数字で見られるように)。 */}
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/60 tabular-nums">
        <span><span className="text-sky-300/80">BUILD</span> {summary.buildupSeconds.toFixed(0)}s ({pct(summary.buildupSeconds)}%)</span>
        <span><span className="text-rose-300/80">PEAK</span> {summary.peakCount}回 {summary.peakSeconds.toFixed(0)}s ({pct(summary.peakSeconds)}%)</span>
        <span><span className="text-emerald-300/80">RELAX</span> {summary.relaxCount}回 {summary.relaxSeconds.toFixed(0)}s ({pct(summary.relaxSeconds)}%)</span>
      </div>
      {/* ★v0.25.3555(社長GO・AI実機テストの計器): 「きつい場面が足りない」を体感でなく数字で見る。
          ヘッドレス計測(v0.25.3550)は被弾0.2回/分・HP最低93.7%・死亡0/30で、**そもそも苦しくなって
          いない**ことが分かった=ディレクターの数字を読む前にここを見る。
          被弾は「総量」ではなく**回数**も出す(1回大きく食らったのか、何度も削られたのかを分けるため)。 */}
      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums">
        <span className={hitsTaken === 0 ? 'text-amber-300/90' : 'text-white/60'}>
          被弾 {hitsTaken}回{hitsTaken === 0 && ' ★無傷'}
        </span>
        <span className={minHpPct >= 90 ? 'text-amber-300/90' : 'text-white/60'}>
          HP最低 {minHpPct}%
        </span>
        <span className="text-white/60">被ダメ計 {Math.round(damageTaken)}</span>
      </div>
    </div>
  );
};

export default DirectorResult;
