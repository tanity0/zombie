import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import type { EnemyType } from '../types/game';

const BENCHMARK_DURATION_MS = 20000;
const BENCHMARK_ENEMY_TARGET = 10;
const BENCHMARK_ENEMY_TYPES: EnemyType[] = [
  'zombie',
  'skeleton',
  'werewolf',
  'pumpkin',
  'plant',
  'bat',
];

type BenchmarkGrade = 'PASS' | 'CAUTION' | 'FAIL';

type BenchmarkResult = {
  grade: BenchmarkGrade;
  avgFps: number;
  minFps: number;
  drops: number;
  maxEnemies: number;
  maxFx: number;
  maxProjectiles: number;
  maxPickups: number;
};

interface BenchmarkOverlayProps {
  fps: number;
}

const gradeBenchmark = (avgFps: number, minFps: number, drops: number): BenchmarkGrade => {
  if (avgFps >= 55 && minFps >= 45 && drops <= 2) return 'PASS';
  if (avgFps >= 45 && minFps >= 35) return 'CAUTION';
  return 'FAIL';
};

const BenchmarkOverlay: React.FC<BenchmarkOverlayProps> = ({ fps }) => {
  const [startedAt] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const samplesRef = useRef<number[]>([]);
  const spawnedEnemyIdsRef = useRef(new Set<string>());
  const maxCountsRef = useRef({
    enemies: 0,
    fx: 0,
    projectiles: 0,
    pickups: 0,
  });

  const addEnemy = useGameStore(state => state.addEnemy);
  const removeEnemy = useGameStore(state => state.removeEnemy);
  const spawnRing = useGameStore(state => state.spawnRing);
  const spawnGlow = useGameStore(state => state.spawnGlow);

  useEffect(() => {
    if (result || fps <= 0) return;
    samplesRef.current.push(fps);
  }, [fps, result]);

  useEffect(() => {
    if (result) return;

    const tick = window.setInterval(() => {
      const state = useGameStore.getState();
      const elapsed = performance.now() - startedAt;
      const px = state.player.x + state.player.width / 2;
      const py = state.player.y + state.player.height / 2;
      const existingBenchEnemies = state.enemies.filter(e => spawnedEnemyIdsRef.current.has(e.id));
      const missing = Math.max(0, BENCHMARK_ENEMY_TARGET - existingBenchEnemies.length);
      maxCountsRef.current = {
        enemies: Math.max(maxCountsRef.current.enemies, state.enemies.length),
        fx: Math.max(maxCountsRef.current.fx, state.effects.length),
        projectiles: Math.max(maxCountsRef.current.projectiles, state.projectiles.length),
        pickups: Math.max(maxCountsRef.current.pickups, state.pickups.length),
      };

      for (let i = 0; i < missing; i++) {
        const idx = existingBenchEnemies.length + i;
        const angle = (idx / BENCHMARK_ENEMY_TARGET) * Math.PI * 2 + elapsed * 0.00015;
        const radius = 210 + (idx % 3) * 34;
        const type = BENCHMARK_ENEMY_TYPES[idx % BENCHMARK_ENEMY_TYPES.length];
        const enemy = spawnEnemyAt(type, px + Math.cos(angle) * radius, py + Math.sin(angle) * radius, state.gameTime);
        const benchEnemy = {
          ...enemy,
          id: `bench-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          speed: 0,
          damage: 0,
          rootUntil: state.gameTime + BENCHMARK_DURATION_MS + 5000,
        };
        spawnedEnemyIdsRef.current.add(benchEnemy.id);
        addEnemy(benchEnemy);
      }

      const pulseAngle = elapsed * 0.002;
      const fxX = px + Math.cos(pulseAngle) * 120;
      const fxY = py + Math.sin(pulseAngle) * 80;
      spawnRing(fxX, fxY, 8, 84, 'rgba(96,165,250,0.72)', 3, 420);
      spawnGlow(fxX, fxY, 58, 'rgba(96,165,250,', 460);
      setNow(performance.now());
    }, 850);

    return () => window.clearInterval(tick);
  }, [addEnemy, result, spawnGlow, spawnRing, startedAt]);

  useEffect(() => {
    if (result) return;
    const finish = window.setTimeout(() => {
      const samples = samplesRef.current.filter(v => v > 0);
      const avgFps = samples.length
        ? samples.reduce((sum, value) => sum + value, 0) / samples.length
        : 0;
      const minFps = samples.length ? Math.min(...samples) : 0;
      const drops = samples.filter(value => value < 45).length;
      const maxCounts = maxCountsRef.current;
      setResult({
        grade: gradeBenchmark(avgFps, minFps, drops),
        avgFps,
        minFps,
        drops,
        maxEnemies: maxCounts.enemies,
        maxFx: maxCounts.fx,
        maxProjectiles: maxCounts.projectiles,
        maxPickups: maxCounts.pickups,
      });
      spawnedEnemyIdsRef.current.forEach(removeEnemy);
      spawnedEnemyIdsRef.current.clear();
    }, BENCHMARK_DURATION_MS);

    return () => window.clearTimeout(finish);
  }, [removeEnemy, result]);

  useEffect(() => () => {
    spawnedEnemyIdsRef.current.forEach(removeEnemy);
    spawnedEnemyIdsRef.current.clear();
  }, [removeEnemy]);

  const elapsedMs = Math.min(BENCHMARK_DURATION_MS, now - startedAt);
  const progress = result ? 100 : Math.round((elapsedMs / BENCHMARK_DURATION_MS) * 100);
  const secondsLeft = Math.max(0, Math.ceil((BENCHMARK_DURATION_MS - elapsedMs) / 1000));
  const gradeStyle = useMemo(() => {
    switch (result?.grade) {
      case 'PASS':
        return 'border-emerald-300/50 bg-emerald-950/72 text-emerald-100';
      case 'CAUTION':
        return 'border-amber-300/50 bg-amber-950/72 text-amber-100';
      case 'FAIL':
        return 'border-rose-300/50 bg-rose-950/72 text-rose-100';
      default:
        return 'border-sky-300/35 bg-slate-950/72 text-sky-100';
    }
  }, [result?.grade]);

  return (
    <div
      className={`pointer-events-none absolute right-3 top-[calc(max(env(safe-area-inset-top),8px)+94px)] z-50 w-[184px] rounded-xl border px-3 py-2 shadow-xl backdrop-blur-md ${gradeStyle}`}
      style={{ fontFamily: 'monospace' }}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
        <span>BENCH</span>
        <span>{result ? result.grade : `${secondsLeft}s`}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-white/65 transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1.5 space-y-0.5 text-[10px] leading-tight text-white/80">
        {result ? (
          <>
            <div>avg {result.avgFps.toFixed(1)} / min {result.minFps}</div>
            <div>drops {result.drops} / fx {result.maxFx}</div>
            <div>enemy {result.maxEnemies} p {result.maxProjectiles} item {result.maxPickups}</div>
          </>
        ) : (
          <>
            <div>fps {fps}</div>
            <div>enemy target {BENCHMARK_ENEMY_TARGET}</div>
            <div>glow/ring stress</div>
          </>
        )}
      </div>
    </div>
  );
};

export default BenchmarkOverlay;
