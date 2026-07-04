import React, { useEffect, useRef, useState } from 'react';
import { getDirectorDebug } from '../utils/aiDirectorDebug';
import { getDirectorRankDebug } from '../utils/directorRankState';
import { getPityLevel } from '../utils/pityState';
import { getPhaseKillDebug, getCurrentStyle } from '../utils/killTelemetryState';
import { getGatePressureDebug } from '../utils/gatePressureState';
import { getReliefProgramDebug } from '../utils/reliefProgramState';
import { getGateProgramDebug } from '../utils/gateProgramState';
import { getPuzzleDebug } from '../utils/puzzleState';
import type { DirectorMacro } from '../utils/aiDirector';

const PROBLEM_CHILD_INITIAL: Record<string, string> = { plant: 'P', werewolf: 'W', pumpkin: 'K', screamer: 'S', ghost: 'G' };

// AIディレクター(ステップA)のオンスクリーン可視化(?director=1)。ゲームループとは独立に自前 raf で読むだけ。
// ストア購読なし=HUD本体の再描画に影響しない。まだゲーム挙動には一切影響していない“読むだけ”の表示。
const MACRO_COLOR: Record<DirectorMacro, string> = {
  buildup: '#38bdf8', // build up = シアン
  peak: '#f87171',    // peak = 赤
  relax: '#4ade80',   // relax = 緑
};
const MACRO_LABEL: Record<DirectorMacro, string> = { buildup: 'BUILD_UP', peak: 'PEAK', relax: 'RELAX' };

const Bar: React.FC<{ label: string; v: number; color: string }> = ({ label, v, color }) => (
  <div className="flex items-center gap-1.5">
    <span className="w-[42px] text-white/70">{label}</span>
    <div className="relative h-2 w-[120px] rounded-sm bg-white/10 overflow-hidden">
      <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${Math.round(v * 100)}%`, background: color }} />
    </div>
    <span className="w-[30px] text-right tabular-nums text-white/90">{v.toFixed(2)}</span>
  </div>
);

const DirectorOverlay: React.FC = () => {
  const [, setTick] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      setTick(t => (t + 1) % 1_000_000);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { running = false; if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  const d = getDirectorDebug();
  const rankDebug = getDirectorRankDebug();
  const phaseKillDebug = getPhaseKillDebug();
  const pressureDebug = getGatePressureDebug();
  const programDebug = getReliefProgramDebug();
  const gateProgramDebug = getGateProgramDebug();
  const puzzleDebug = getPuzzleDebug();
  // ステップB/C(?directorApply=relax|buildup|all)が有効かどうかの表示だけ(判定自体は useGameLoop 側)。
  const applyParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('directorApply') : null;
  const applyRelax = applyParam === 'relax' || applyParam === 'all';
  const applyBuildup = applyParam === 'buildup' || applyParam === 'all';
  const applyLabel = [applyRelax && 'RELAX', applyBuildup && 'BUILDUP'].filter(Boolean).join('+');
  return (
    <div
      className="fixed px-2 py-1.5 rounded-lg text-[10px] leading-tight shadow-lg ring-1 ring-white/15 bg-black/75"
      style={{
        left: 'max(env(safe-area-inset-left), 12px)',
        top: 'calc(max(env(safe-area-inset-top), 8px) + 96px)',
        zIndex: 90,
        textShadow: '0 1px 2px rgba(0,0,0,0.95)',
      }}
    >
      <div className="mb-1 font-bold text-white/80">
        AI Director <span className="text-white/40">{applyLabel ? `(${applyLabel} applied)` : '(read-only)'}</span>
      </div>
      {d ? (
        <div className="flex flex-col gap-1">
          <Bar label="Intns" v={d.intensity} color="#fb923c" />
          <Bar label="Perf" v={d.performance} color="#a78bfa" />
          <div className="flex items-center gap-1.5">
            <span className="w-[42px] text-white/70">State</span>
            <span className="font-bold tabular-nums" style={{ color: MACRO_COLOR[d.macro] }}>{MACRO_LABEL[d.macro]}</span>
            <span className="text-white/40">{(d.macroMs / 1000).toFixed(1)}s</span>
          </div>
          <div className="text-white/40 tabular-nums">
            near {d.nearEnemies} · danger {d.dangerBias.toFixed(1)} · dmgSince {(d.sinceDamageMs / 1000).toFixed(0)}s · kill/s {d.killRateEma.toFixed(2)}
          </div>
        </div>
      ) : (
        <div className="text-white/50">waiting…</div>
      )}
      {rankDebug && (
        <div className="mt-1.5 border-t border-white/15 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="w-[42px] text-white/70">Rank</span>
            <span className="font-bold tabular-nums text-amber-300">{rankDebug.enabled ? rankDebug.rank : '-'}</span>
            <span className="text-white/40">{rankDebug.harvestActive ? 'HARVEST' : rankDebug.phaseKey}</span>
          </div>
          <div className="text-white/40 tabular-nums">
            esc+{rankDebug.escBoost.toFixed(2)} · cap+{rankDebug.countCapBonus} · xp×{rankDebug.rewardMult.toFixed(2)} · pity {getPityLevel().toFixed(2)} · up+{rankDebug.upswingBonus}
          </div>
        </div>
      )}
      {/* バッチ2(計測): スタイル推定+直前フェーズの種別キル内訳(記録と表示のみ・挙動には影響しない)。 */}
      <div className="mt-1.5 border-t border-white/15 pt-1 text-white/40 tabular-nums">
        style {getCurrentStyle()}
        {phaseKillDebug && (
          <>
            {' '}· prev[{phaseKillDebug.phaseKey}] pk{phaseKillDebug.killsByBucket.pumpkin}
            wf{phaseKillDebug.killsByBucket.werewolf} pl{phaseKillDebug.killsByBucket.plant}
            gh{phaseKillDebug.killsByBucket.ghost} sc{phaseKillDebug.killsByBucket.screamer}
            ch{phaseKillDebug.killsByBucket.chaff}
          </>
        )}
      </div>
      {/* バッチ3(最小版): 関所中の連続圧力(gatePressure)。緩フェーズ/?ladder=0中はnullで非表示。 */}
      {pressureDebug && (
        <div className="mt-1.5 border-t border-white/15 pt-1 text-white/40 tabular-nums">
          P{pressureDebug.pressure.toFixed(2)}/{pressureDebug.ceiling.toFixed(2)}
          {' '}· allow[{pressureDebug.allowed.map(t => PROBLEM_CHILD_INITIAL[t] ?? t).join('')}]
        </div>
      )}
      {/* バッチ4: 選定済みの演目(緩フェーズの中身)。講習は投入済みフラグも併記。 */}
      {programDebug && (
        <div className="mt-1.5 border-t border-white/15 pt-1 text-white/40 tabular-nums">
          program {programDebug.id}{programDebug.lessonSpawned ? ' (spawned)' : ''}
        </div>
      )}
      {/* バッチ5: 選定済みの台本(山フェーズの中身)+その台本自身のmaxRung(pressure天井の元)。 */}
      {gateProgramDebug && (
        <div className="mt-1.5 border-t border-white/15 pt-1 text-white/40 tabular-nums">
          gate {gateProgramDebug.id} maxRung{gateProgramDebug.maxRung}
        </div>
      )}
      {/* PACING_PUZZLE.md バッチM2/M6: 本方式(?puzzle=0以外)ON時のランク/盤面目標。締め中=+、緩め中=-表示。 */}
      {puzzleDebug && (
        <div className="mt-1.5 border-t border-white/15 pt-1 text-white/40 tabular-nums">
          R{puzzleDebug.rank}{puzzleDebug.tightened ? '+' : ''}{puzzleDebug.softened ? '-' : ''}/T{puzzleDebug.boardTarget} cap{puzzleDebug.cap}
          {' '}· {puzzleDebug.komaKind}
        </div>
      )}
    </div>
  );
};

export default DirectorOverlay;
