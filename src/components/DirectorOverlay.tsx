import React, { useEffect, useRef, useState } from 'react';
import { getDirectorDebug } from '../utils/aiDirectorDebug';
import type { DirectorMacro } from '../utils/aiDirector';

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
      <div className="mb-1 font-bold text-white/80">AI Director <span className="text-white/40">(read-only)</span></div>
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
            near — · dmgSince {(d.sinceDamageMs / 1000).toFixed(0)}s · kill/s {d.killRateEma.toFixed(2)}
          </div>
        </div>
      ) : (
        <div className="text-white/50">waiting…</div>
      )}
    </div>
  );
};

export default DirectorOverlay;
