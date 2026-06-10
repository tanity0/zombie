import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import type { EnemyType } from '../types/game';

const BENCHMARK_DURATION_MS = 12000;
const BENCHMARK_WARMUP_MS = 1600;
const BENCHMARK_TICK_MS = 320;
const BENCHMARK_ENEMY_HP = 999999;
const BENCHMARK_STAGES = [
  { id: 'S1', label: 'LIGHT', startMs: 0, enemyTarget: 12, pulseCount: 1 },
  { id: 'S2', label: 'MED', startMs: 4000, enemyTarget: 18, pulseCount: 2 },
  { id: 'S3', label: 'HEAVY', startMs: 8000, enemyTarget: 26, pulseCount: 4 },
] as const;
const BENCHMARK_ENEMY_TYPES: EnemyType[] = [
  'zombie',
  'skeleton',
  'werewolf',
  'pumpkin',
  'plant',
  'bat',
];

export type BenchmarkGrade = 'PASS' | 'CAUTION' | 'FAIL';

export type BenchmarkStageResult = {
  id: string;
  label: string;
  grade: BenchmarkGrade;
  avgFps: number;
  minFps: number;
  drops: number;
  enemyTarget: number;
  maxEnemies: number;
  maxFx: number;
};

export type BenchmarkResult = {
  grade: BenchmarkGrade;
  avgFps: number;
  minFps: number;
  drops: number;
  maxEnemies: number;
  maxFx: number;
  maxProjectiles: number;
  maxPickups: number;
  stages: BenchmarkStageResult[];
};

interface BenchmarkOverlayProps {
  fps: number;
  onComplete: (result: BenchmarkResult) => void;
}

const gradeBenchmark = (avgFps: number, minFps: number, drops: number): BenchmarkGrade => {
  if (avgFps >= 55 && minFps >= 45 && drops <= 2) return 'PASS';
  if (avgFps >= 45 && minFps >= 35) return 'CAUTION';
  return 'FAIL';
};

const activeBenchmarkStage = (elapsedMs: number) => {
  let active = BENCHMARK_STAGES[0];
  for (const stage of BENCHMARK_STAGES) {
    if (elapsedMs >= stage.startMs) active = stage;
  }
  return active;
};

const gradeRank = (grade: BenchmarkGrade) => grade === 'FAIL' ? 2 : grade === 'CAUTION' ? 1 : 0;

const summarizeSamples = (samples: number[]) => {
  const valid = samples.filter(v => v > 0);
  const avgFps = valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
  const minFps = valid.length ? Math.min(...valid) : 0;
  const drops = valid.filter(value => value < 45).length;
  return { avgFps, minFps, drops };
};

const BenchmarkOverlay: React.FC<BenchmarkOverlayProps> = ({ fps, onComplete }) => {
  const [startedAt] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const samplesRef = useRef<number[]>([]);
  const stageSamplesRef = useRef<Record<string, number[]>>({});
  const stageCountsRef = useRef<Record<string, { enemies: number; fx: number }>>({});
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
    const elapsed = performance.now() - startedAt;
    if (elapsed < BENCHMARK_WARMUP_MS) return;
    const stage = activeBenchmarkStage(elapsed);
    samplesRef.current.push(fps);
    stageSamplesRef.current[stage.id] = [...(stageSamplesRef.current[stage.id] ?? []), fps];
  }, [fps, result, startedAt]);

  useEffect(() => {
    if (result) return;

    const tick = window.setInterval(() => {
      useGameStore.setState(state => ({
        isPaused: false,
        showUpgradeMenu: false,
        upgradeOptions: [],
        player: {
          ...state.player,
          health: state.player.maxHealth,
          invulnerable: true,
          invulnerableTime: Date.now(),
          experience: 0,
        },
        enemies: state.enemies.map(enemy => ({
          ...enemy,
          speed: spawnedEnemyIdsRef.current.has(enemy.id) ? 0 : Math.min(enemy.speed, 8),
          damage: 0,
          health: spawnedEnemyIdsRef.current.has(enemy.id) ? BENCHMARK_ENEMY_HP : enemy.health,
          maxHealth: spawnedEnemyIdsRef.current.has(enemy.id) ? BENCHMARK_ENEMY_HP : enemy.maxHealth,
          rootUntil: state.gameTime + BENCHMARK_DURATION_MS + 5000,
        })),
        pickups: state.pickups.filter(pickup => pickup.type !== 'experience'),
      }));

      const state = useGameStore.getState();
      const elapsed = performance.now() - startedAt;
      const stage = activeBenchmarkStage(elapsed);
      const px = state.player.x + state.player.width / 2;
      const py = state.player.y + state.player.height / 2;
      const existingBenchEnemies = state.enemies.filter(e => spawnedEnemyIdsRef.current.has(e.id));
      const missing = Math.max(0, stage.enemyTarget - existingBenchEnemies.length);
      maxCountsRef.current = {
        enemies: Math.max(maxCountsRef.current.enemies, state.enemies.length),
        fx: Math.max(maxCountsRef.current.fx, state.effects.length),
        projectiles: Math.max(maxCountsRef.current.projectiles, state.projectiles.length),
        pickups: Math.max(maxCountsRef.current.pickups, state.pickups.length),
      };
      const prevStageCounts = stageCountsRef.current[stage.id] ?? { enemies: 0, fx: 0 };
      stageCountsRef.current[stage.id] = {
        enemies: Math.max(prevStageCounts.enemies, state.enemies.length),
        fx: Math.max(prevStageCounts.fx, state.effects.length),
      };

      for (let i = 0; i < missing; i++) {
        const idx = existingBenchEnemies.length + i;
        const angle = (idx / stage.enemyTarget) * Math.PI * 2 + elapsed * 0.00015;
        const radius = 210 + (idx % 3) * 34;
        const type = BENCHMARK_ENEMY_TYPES[idx % BENCHMARK_ENEMY_TYPES.length];
        const enemy = spawnEnemyAt(type, px + Math.cos(angle) * radius, py + Math.sin(angle) * radius, state.gameTime);
        const benchEnemy = {
          ...enemy,
          id: `bench-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          speed: 0,
          damage: 0,
          health: BENCHMARK_ENEMY_HP,
          maxHealth: BENCHMARK_ENEMY_HP,
          rootUntil: state.gameTime + BENCHMARK_DURATION_MS + 5000,
        };
        spawnedEnemyIdsRef.current.add(benchEnemy.id);
        addEnemy(benchEnemy);
      }

      const pulseAngle = elapsed * 0.002;
      for (let i = 0; i < stage.pulseCount; i++) {
        const angle = pulseAngle + (i / stage.pulseCount) * Math.PI * 2;
        const fxX = px + Math.cos(angle) * (96 + i * 28);
        const fxY = py + Math.sin(angle) * (64 + i * 18);
        spawnRing(fxX, fxY, 8, 84 + i * 12, 'rgba(96,165,250,0.72)', 3, 420);
        spawnGlow(fxX, fxY, 58 + i * 8, 'rgba(96,165,250,', 460);
      }
      setNow(performance.now());
    }, BENCHMARK_TICK_MS);

    return () => window.clearInterval(tick);
  }, [addEnemy, result, spawnGlow, spawnRing, startedAt]);

  useEffect(() => {
    if (result) return;
    const finish = window.setTimeout(() => {
      const { avgFps, minFps, drops } = summarizeSamples(samplesRef.current);
      const maxCounts = maxCountsRef.current;
      const stages = BENCHMARK_STAGES.map(stage => {
        const summary = summarizeSamples(stageSamplesRef.current[stage.id] ?? []);
        const stageGrade = gradeBenchmark(summary.avgFps, summary.minFps, summary.drops);
        const counts = stageCountsRef.current[stage.id] ?? { enemies: 0, fx: 0 };
        return {
          id: stage.id,
          label: stage.label,
          grade: stageGrade,
          avgFps: summary.avgFps,
          minFps: summary.minFps,
          drops: summary.drops,
          enemyTarget: stage.enemyTarget,
          maxEnemies: counts.enemies,
          maxFx: counts.fx,
        };
      });
      const worstStageGrade = stages.reduce<BenchmarkGrade>(
        (worst, stage) => gradeRank(stage.grade) > gradeRank(worst) ? stage.grade : worst,
        'PASS'
      );
      const totalGrade = gradeRank(worstStageGrade) > gradeRank(gradeBenchmark(avgFps, minFps, drops))
        ? worstStageGrade
        : gradeBenchmark(avgFps, minFps, drops);
      const nextResult = {
        grade: totalGrade,
        avgFps,
        minFps,
        drops,
        maxEnemies: maxCounts.enemies,
        maxFx: maxCounts.fx,
        maxProjectiles: maxCounts.projectiles,
        maxPickups: maxCounts.pickups,
        stages,
      };
      setResult(nextResult);
      spawnedEnemyIdsRef.current.forEach(removeEnemy);
      spawnedEnemyIdsRef.current.clear();
      window.setTimeout(() => onComplete(nextResult), 450);
    }, BENCHMARK_DURATION_MS);

    return () => window.clearTimeout(finish);
  }, [onComplete, removeEnemy, result]);

  useEffect(() => () => {
    spawnedEnemyIdsRef.current.forEach(removeEnemy);
    spawnedEnemyIdsRef.current.clear();
  }, [removeEnemy]);

  const elapsedMs = Math.min(BENCHMARK_DURATION_MS, now - startedAt);
  const activeStage = activeBenchmarkStage(elapsedMs);
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
            <div>enemy {result.maxEnemies} stages {result.stages.map(s => `${s.id}:${s.grade[0]}`).join(' ')}</div>
          </>
        ) : (
          <>
            <div>fps {fps}</div>
            <div>{activeStage.id} {activeStage.label} enemy {activeStage.enemyTarget}</div>
            <div>pulse x{activeStage.pulseCount}</div>
          </>
        )}
      </div>
    </div>
  );
};

export default BenchmarkOverlay;
