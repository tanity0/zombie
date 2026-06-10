import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import type { BreakableProp, EnemyType } from '../types/game';

const BENCHMARK_DURATION_MS = 24000;
const BENCHMARK_WARMUP_MS = 1600;
const BENCHMARK_TICK_MS = 320;
const BENCHMARK_ENEMY_HP = 999999;
const BENCHMARK_ENEMY_TARGET = 72;
const BENCHMARK_DANGER_FPS = 30;
const BENCHMARK_SAFE_FPS = 40;
const BENCHMARK_STAGES = [
  { id: 'S1', label: 'MAX', startMs: 0, glowCount: 1, ringCount: 1, burstCount: 0, torchCount: 0, yOscillation: 0, shadowJitter: 0 },
  { id: 'S2', label: 'Y-SHADOW', startMs: 4000, glowCount: 1, ringCount: 1, burstCount: 0, torchCount: 0, yOscillation: 58, shadowJitter: 18 },
  { id: 'S3', label: 'LIGHT', startMs: 8000, glowCount: 9, ringCount: 4, burstCount: 0, torchCount: 0, yOscillation: 58, shadowJitter: 18 },
  { id: 'S4', label: 'TORCH10', startMs: 12000, glowCount: 4, ringCount: 2, burstCount: 16, torchCount: 10, yOscillation: 48, shadowJitter: 14 },
  { id: 'S5', label: 'PARTICLE', startMs: 16000, glowCount: 2, ringCount: 6, burstCount: 96, torchCount: 0, yOscillation: 34, shadowJitter: 10 },
  { id: 'S6', label: 'ALL-IN', startMs: 20000, glowCount: 11, ringCount: 7, burstCount: 110, torchCount: 10, yOscillation: 78, shadowJitter: 24 },
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
  stress: string;
  safeStress: string;
  adjusted: boolean;
  maxTorches: number;
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
  maxTorches: number;
  stageCount: number;
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

type BenchmarkStressCaps = {
  enemyTarget: number;
  glowCount: number;
  ringCount: number;
  burstCount: number;
  torchCount: number;
  yOscillation: number;
  shadowJitter: number;
  adjusted: boolean;
};

const capsFromStage = (stage: typeof BENCHMARK_STAGES[number]): BenchmarkStressCaps => ({
  enemyTarget: BENCHMARK_ENEMY_TARGET,
  glowCount: stage.glowCount,
  ringCount: stage.ringCount,
  burstCount: stage.burstCount,
  torchCount: stage.torchCount,
  yOscillation: stage.yOscillation,
  shadowJitter: stage.shadowJitter,
  adjusted: false,
});

const stressLabel = (
  caps: Pick<BenchmarkStressCaps, 'enemyTarget' | 'glowCount' | 'ringCount' | 'burstCount' | 'torchCount' | 'yOscillation'>
) => `E${caps.enemyTarget} G${caps.glowCount} R${caps.ringCount} P${caps.burstCount} T${caps.torchCount} Y${caps.yOscillation}`;

const reduceStressCaps = (caps: BenchmarkStressCaps): BenchmarkStressCaps => {
  if (caps.burstCount > 24) return { ...caps, burstCount: Math.max(0, caps.burstCount - 24), adjusted: true };
  if (caps.glowCount > 4) return { ...caps, glowCount: Math.max(1, caps.glowCount - 3), adjusted: true };
  if (caps.ringCount > 3) return { ...caps, ringCount: Math.max(1, caps.ringCount - 2), adjusted: true };
  if (caps.torchCount > 4) return { ...caps, torchCount: Math.max(0, caps.torchCount - 3), adjusted: true };
  if (caps.yOscillation > 28) {
    return {
      ...caps,
      yOscillation: Math.max(0, caps.yOscillation - 20),
      shadowJitter: Math.max(0, caps.shadowJitter - 8),
      adjusted: true,
    };
  }
  if (caps.enemyTarget > 36) return { ...caps, enemyTarget: Math.max(24, caps.enemyTarget - 12), adjusted: true };
  if (caps.torchCount > 0) return { ...caps, torchCount: 0, adjusted: true };
  if (caps.glowCount > 1) return { ...caps, glowCount: 1, adjusted: true };
  return caps;
};

const recentAverage = (samples: number[], count = 8) => {
  const recent = samples.slice(-count).filter(v => v > 0);
  return recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : 60;
};

const createBenchmarkTorches = (px: number, py: number, count: number, elapsed: number): BreakableProp[] => {
  const torches: BreakableProp[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.sin(elapsed * 0.0008) * 0.12;
    const radius = 132 + (i % 5) * 34;
    const footX = px + Math.cos(angle) * radius;
    const footY = py + Math.sin(angle) * (radius * 0.72);
    const scale = 0.9 + (i % 3) * 0.07;
    const width = 20 * scale;
    const height = 16 * scale;
    torches.push({
      id: `bench-torch-${i}`,
      x: footX - width / 2,
      y: footY - height,
      width,
      height,
      footX,
      footY,
      scale,
      health: 999,
      maxHealth: 999,
      type: 'torch',
      lastHit: 0,
    });
  }
  return torches;
};

const BenchmarkOverlay: React.FC<BenchmarkOverlayProps> = ({ fps, onComplete }) => {
  const [startedAt] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const fpsRef = useRef(fps);
  const samplesRef = useRef<number[]>([]);
  const stageSamplesRef = useRef<Record<string, number[]>>({});
  const stageCountsRef = useRef<Record<string, { enemies: number; fx: number; torches: number }>>({});
  const stageCapsRef = useRef<Record<string, BenchmarkStressCaps>>({});
  const stageSafeCapsRef = useRef<Record<string, BenchmarkStressCaps>>({});
  const lastStageIdRef = useRef<string>(BENCHMARK_STAGES[0].id);
  const finalizedRef = useRef(false);
  const spawnedEnemyIdsRef = useRef(new Set<string>());
  const benchEnemyBaseRef = useRef<Record<string, { x: number; y: number; width: number; height: number; index: number }>>({});
  const maxCountsRef = useRef({
    enemies: 0,
    fx: 0,
    projectiles: 0,
    pickups: 0,
    torches: 0,
  });

  const addEnemy = useGameStore(state => state.addEnemy);
  const removeEnemy = useGameStore(state => state.removeEnemy);
  const spawnBurst = useGameStore(state => state.spawnBurst);
  const spawnRing = useGameStore(state => state.spawnRing);
  const spawnGlow = useGameStore(state => state.spawnGlow);

  useEffect(() => {
    fpsRef.current = fps;
  }, [fps]);

  const finishBenchmark = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    const { avgFps, minFps, drops } = summarizeSamples(samplesRef.current);
    const maxCounts = maxCountsRef.current;
    const stages = BENCHMARK_STAGES.map(stage => {
      const summary = summarizeSamples(stageSamplesRef.current[stage.id] ?? []);
      const stageGrade = gradeBenchmark(summary.avgFps, summary.minFps, summary.drops);
      const counts = stageCountsRef.current[stage.id] ?? { enemies: 0, fx: 0, torches: 0 };
      const caps = stageCapsRef.current[stage.id] ?? capsFromStage(stage);
      const safeCaps = stageSafeCapsRef.current[stage.id];
      return {
        id: stage.id,
        label: stage.label,
        grade: stageGrade,
        avgFps: summary.avgFps,
        minFps: summary.minFps,
        drops: summary.drops,
        enemyTarget: caps.enemyTarget,
        stress: stressLabel(capsFromStage(stage)),
        safeStress: safeCaps ? stressLabel(safeCaps) : 'not found',
        adjusted: caps.adjusted,
        maxTorches: counts.torches,
        maxEnemies: counts.enemies,
        maxFx: counts.fx,
      };
    });
    const totalGradeFromFps = gradeBenchmark(avgFps, minFps, drops);
    const worstStageGrade = stages.reduce<BenchmarkGrade>(
      (worst, stage) => gradeRank(stage.grade) > gradeRank(worst) ? stage.grade : worst,
      'PASS'
    );
    const totalGrade = gradeRank(worstStageGrade) > gradeRank(totalGradeFromFps)
      ? worstStageGrade
      : totalGradeFromFps;
    const nextResult = {
      grade: totalGrade,
      avgFps,
      minFps,
      drops,
      maxEnemies: maxCounts.enemies,
      maxFx: maxCounts.fx,
      maxProjectiles: maxCounts.projectiles,
      maxPickups: maxCounts.pickups,
      maxTorches: maxCounts.torches,
      stageCount: BENCHMARK_STAGES.length,
      stages,
    };
    setResult(nextResult);
    spawnedEnemyIdsRef.current.forEach(removeEnemy);
    spawnedEnemyIdsRef.current.clear();
    benchEnemyBaseRef.current = {};
    useGameStore.setState(state => ({
      breakableProps: state.breakableProps.filter(prop => !prop.id.startsWith('bench-torch-')),
    }));
    window.setTimeout(() => onComplete(nextResult), 450);
  }, [onComplete, removeEnemy]);

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
      const elapsed = performance.now() - startedAt;
      if (elapsed >= BENCHMARK_DURATION_MS) {
        finishBenchmark();
        return;
      }
      const stage = activeBenchmarkStage(elapsed);
      if (stage.id !== lastStageIdRef.current) {
        lastStageIdRef.current = stage.id;
        stageCapsRef.current[stage.id] = capsFromStage(stage);
      }
      const currentCaps = stageCapsRef.current[stage.id] ?? capsFromStage(stage);
      const stageSamples = stageSamplesRef.current[stage.id] ?? [];
      const recentFps = recentAverage(stageSamples);
      const shouldReduce = stageSamples.length >= 3 && (fpsRef.current <= BENCHMARK_DANGER_FPS || recentFps < 35);
      const caps = shouldReduce ? reduceStressCaps(currentCaps) : currentCaps;
      stageCapsRef.current[stage.id] = caps;
      if (stageSamples.length >= 3 && fpsRef.current >= BENCHMARK_SAFE_FPS && recentFps >= BENCHMARK_SAFE_FPS) {
        stageSafeCapsRef.current[stage.id] = caps;
      }
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
        enemies: state.enemies.map(enemy => {
          const isBench = spawnedEnemyIdsRef.current.has(enemy.id);
          const base = benchEnemyBaseRef.current[enemy.id];
          const wave = isBench && base
            ? Math.sin(elapsed * 0.011 + base.index * 0.61)
            : 0;
          const stretch = isBench && base && caps.shadowJitter > 0
            ? Math.sin(elapsed * 0.012 + base.index * 1.7) * caps.shadowJitter
            : 0;
          return {
            ...enemy,
            x: base ? base.x : enemy.x,
            y: base ? base.y + wave * caps.yOscillation : enemy.y,
            width: base ? Math.max(14, base.width + stretch) : enemy.width,
            height: base ? Math.max(16, base.height + stretch * 0.35) : enemy.height,
            speed: isBench ? 0 : Math.min(enemy.speed, 8),
            damage: 0,
            health: isBench ? BENCHMARK_ENEMY_HP : enemy.health,
            maxHealth: isBench ? BENCHMARK_ENEMY_HP : enemy.maxHealth,
            rootUntil: state.gameTime + BENCHMARK_DURATION_MS + 5000,
          };
        }),
        breakableProps: [
          ...state.breakableProps.filter(prop => !prop.id.startsWith('bench-torch-')),
          ...createBenchmarkTorches(
            state.player.x + state.player.width / 2,
            state.player.y + state.player.height / 2,
            caps.torchCount,
            elapsed
          ),
        ],
        pickups: state.pickups.filter(pickup => pickup.type !== 'experience'),
      }));

      const state = useGameStore.getState();
      const px = state.player.x + state.player.width / 2;
      const py = state.player.y + state.player.height / 2;
      const existingBenchEnemies = state.enemies.filter(e => spawnedEnemyIdsRef.current.has(e.id));
      const benchTorchCount = state.breakableProps.filter(prop => prop.id.startsWith('bench-torch-')).length;
      const missing = Math.max(0, caps.enemyTarget - existingBenchEnemies.length);
      if (existingBenchEnemies.length > caps.enemyTarget) {
        existingBenchEnemies
          .sort((a, b) => (benchEnemyBaseRef.current[b.id]?.index ?? 0) - (benchEnemyBaseRef.current[a.id]?.index ?? 0))
          .slice(0, existingBenchEnemies.length - caps.enemyTarget)
          .forEach(enemy => {
            removeEnemy(enemy.id);
            spawnedEnemyIdsRef.current.delete(enemy.id);
            delete benchEnemyBaseRef.current[enemy.id];
          });
      }
      maxCountsRef.current = {
        enemies: Math.max(maxCountsRef.current.enemies, state.enemies.length),
        fx: Math.max(maxCountsRef.current.fx, state.effects.length),
        projectiles: Math.max(maxCountsRef.current.projectiles, state.projectiles.length),
        pickups: Math.max(maxCountsRef.current.pickups, state.pickups.length),
        torches: Math.max(maxCountsRef.current.torches, benchTorchCount),
      };
      const prevStageCounts = stageCountsRef.current[stage.id] ?? { enemies: 0, fx: 0, torches: 0 };
      stageCountsRef.current[stage.id] = {
        enemies: Math.max(prevStageCounts.enemies, state.enemies.length),
        fx: Math.max(prevStageCounts.fx, state.effects.length),
        torches: Math.max(prevStageCounts.torches, benchTorchCount),
      };

      for (let i = 0; i < missing; i++) {
        const idx = existingBenchEnemies.length + i;
        const angle = (idx / Math.max(1, caps.enemyTarget)) * Math.PI * 2;
        const radius = 145 + (idx % 6) * 38;
        const type = BENCHMARK_ENEMY_TYPES[idx % BENCHMARK_ENEMY_TYPES.length];
        const jitter = caps.shadowJitter > 0 ? Math.sin(elapsed * 0.012 + idx * 1.7) * caps.shadowJitter : 0;
        const enemy = spawnEnemyAt(type, px + Math.cos(angle) * radius, py + Math.sin(angle) * radius, state.gameTime);
        const benchEnemy = {
          ...enemy,
          id: `bench-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          width: enemy.width + jitter,
          height: enemy.height + jitter * 0.35,
          speed: 0,
          damage: 0,
          health: BENCHMARK_ENEMY_HP,
          maxHealth: BENCHMARK_ENEMY_HP,
          rootUntil: state.gameTime + BENCHMARK_DURATION_MS + 5000,
        };
        spawnedEnemyIdsRef.current.add(benchEnemy.id);
        benchEnemyBaseRef.current[benchEnemy.id] = {
          x: enemy.x,
          y: enemy.y,
          width: enemy.width,
          height: enemy.height,
          index: idx,
        };
        addEnemy(benchEnemy);
      }

      const pulseAngle = elapsed * 0.002;
      for (let i = 0; i < caps.ringCount; i++) {
        const angle = pulseAngle + (i / caps.ringCount) * Math.PI * 2;
        const fxX = px + Math.cos(angle) * (96 + i * 28);
        const fxY = py + Math.sin(angle) * (64 + i * 18);
        spawnRing(fxX, fxY, 8, 84 + i * 12, 'rgba(96,165,250,0.72)', 3, 420);
      }
      for (let i = 0; i < caps.glowCount; i++) {
        const angle = pulseAngle * 1.35 + (i / caps.glowCount) * Math.PI * 2;
        const fxX = px + Math.cos(angle) * (86 + (i % 4) * 34);
        const fxY = py + Math.sin(angle) * (58 + (i % 3) * 24);
        spawnGlow(fxX, fxY, 58 + (i % 5) * 12, 'rgba(96,165,250,', 460);
      }
      if (caps.burstCount > 0) {
        const burstX = px + Math.cos(pulseAngle * 1.7) * 120;
        const burstY = py + Math.sin(pulseAngle * 1.3) * 84;
        spawnBurst(burstX, burstY, '#93c5fd', caps.burstCount);
      }
      setNow(performance.now());
    }, BENCHMARK_TICK_MS);

    return () => window.clearInterval(tick);
  }, [addEnemy, finishBenchmark, removeEnemy, result, spawnBurst, spawnGlow, spawnRing, startedAt]);

  useEffect(() => {
    if (result) return;
    const finish = window.setTimeout(finishBenchmark, BENCHMARK_DURATION_MS);

    return () => window.clearTimeout(finish);
  }, [finishBenchmark, result]);

  useEffect(() => () => {
    spawnedEnemyIdsRef.current.forEach(removeEnemy);
    spawnedEnemyIdsRef.current.clear();
    benchEnemyBaseRef.current = {};
    useGameStore.setState(state => ({
      breakableProps: state.breakableProps.filter(prop => !prop.id.startsWith('bench-torch-')),
    }));
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
            {(() => {
              const activeCaps = stageCapsRef.current[activeStage.id] ?? capsFromStage(activeStage);
              return (
                <>
                  <div>fps {fps}</div>
                  <div>{activeStage.id} {activeStage.label} enemy {activeCaps.enemyTarget}</div>
                  <div>{stressLabel(activeCaps)}</div>
                </>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
};

export default BenchmarkOverlay;
