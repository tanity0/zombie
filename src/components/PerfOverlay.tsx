import React, { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';

// FPS/負荷デバッグ表示。fps と各カウントは毎フレーム変化するため、メインのGameHUDから分離して
// この小さなコンポーネントだけ毎フレーム再描画させる(HUD全体の毎フレーム再描画を防ぐ)。
const PERF_THRESHOLDS = {
  fps: 45,
  effects: 180,
  projectiles: 45,
  pickups: 130,
  enemies: 12,
};

const PerfOverlay: React.FC<{ fps: number }> = ({ fps }) => {
  const effectsCount = useGameStore(s => s.effects.length);
  const projectilesCount = useGameStore(s => s.projectiles.length);
  const pickupsCount = useGameStore(s => s.pickups.length);
  const enemyCount = useGameStore(s => s.enemies.length);

  const perfIssues = useMemo(() => {
    const issues: string[] = [];
    if (fps > 0 && fps < PERF_THRESHOLDS.fps) issues.push(`fps<${PERF_THRESHOLDS.fps}`);
    if (effectsCount > PERF_THRESHOLDS.effects) issues.push(`fx>${PERF_THRESHOLDS.effects}`);
    if (projectilesCount > PERF_THRESHOLDS.projectiles) issues.push(`p>${PERF_THRESHOLDS.projectiles}`);
    if (pickupsCount > PERF_THRESHOLDS.pickups) issues.push(`item>${PERF_THRESHOLDS.pickups}`);
    if (enemyCount > PERF_THRESHOLDS.enemies) issues.push(`enemy>${PERF_THRESHOLDS.enemies}`);
    return issues;
  }, [fps, effectsCount, projectilesCount, pickupsCount, enemyCount]);
  const perfWarning = perfIssues.length > 0;
  const lines = [
    `FPS ${fps}`,
    `fx ${effectsCount} p ${projectilesCount}`,
    `item ${pickupsCount} enemy ${enemyCount}`,
    ...(perfWarning ? [`WARN ${perfIssues.join(',')}`] : []),
  ];

  return (
    <div
      className={`fixed px-2 py-1 rounded-lg text-[10px] tabular-nums leading-tight shadow-lg ${
        perfWarning
          ? 'text-red-50 ring-1 ring-red-300/90 bg-red-950/90'
          : 'text-white/90 ring-1 ring-white/15 bg-black/75'
      }`}
      style={{
        right: 'max(env(safe-area-inset-right), 12px)',
        top: 'calc(max(env(safe-area-inset-top), 8px) + 212px)',
        zIndex: 90,
        textShadow: '0 1px 2px rgba(0,0,0,0.95)',
      }}
    >
      {lines.map(line => <div key={line}>{line}</div>)}
    </div>
  );
};

export default PerfOverlay;
