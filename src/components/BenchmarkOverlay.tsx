import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import type { BreakableProp, EnemyType } from '../types/game';

const BENCHMARK_ATTEMPT_MS = 5000;
const BENCHMARK_ATTEMPT_WARMUP_MS = 900;
const BENCHMARK_TICK_MS = 320;
const BENCHMARK_ENEMY_HP = 999999;
const BENCHMARK_PASS_AVG_FPS = 40;
const BENCHMARK_PASS_MIN_FPS = 30;
const BENCHMARK_EARLY_FAIL_FPS = 24;
const BENCHMARK_EARLY_FAIL_AFTER_MS = 2200;

const BENCHMARK_PROFILES = [
  { id: 'A1', label: 'MIN20', enemyTarget: 10, glowCount: 2, ringCount: 2, particleCount: 4, torchCount: 2, yOscillation: 16, shadowJitter: 6 },
  { id: 'A2', label: 'E20', enemyTarget: 20, glowCount: 3, ringCount: 2, particleCount: 14, torchCount: 3, yOscillation: 24, shadowJitter: 8 },
  { id: 'A3', label: 'E28', enemyTarget: 28, glowCount: 4, ringCount: 3, particleCount: 24, torchCount: 4, yOscillation: 34, shadowJitter: 10 },
  { id: 'A4', label: 'E36', enemyTarget: 36, glowCount: 5, ringCount: 4, particleCount: 36, torchCount: 5, yOscillation: 42, shadowJitter: 12 },
  { id: 'A5', label: 'E48', enemyTarget: 48, glowCount: 7, ringCount: 5, particleCount: 56, torchCount: 7, yOscillation: 54, shadowJitter: 16 },
  { id: 'A6', label: 'E60', enemyTarget: 60, glowCount: 9, ringCount: 6, particleCount: 80, torchCount: 8, yOscillation: 66, shadowJitter: 20 },
  { id: 'A7', label: 'MAX72', enemyTarget: 72, glowCount: 11, ringCount: 7, particleCount: 110, torchCount: 10, yOscillation: 78, shadowJitter: 24 },
] as const;

type BenchmarkProfile = typeof BENCHMARK_PROFILES[number];

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

const objectCount = (profile: BenchmarkProfile) =>
  profile.glowCount + profile.ringCount + profile.particleCount + profile.torchCount;

const stressLabel = (profile: BenchmarkProfile) =>
  `E${profile.enemyTarget} O${objectCount(profile)} G${profile.glowCount} R${profile.ringCount} P${profile.particleCount} T${profile.torchCount}`;

const gradeBenchmark = (avgFps: number, minFps: number): BenchmarkGrade => {
  if (avgFps >= BENCHMARK_PASS_AVG_FPS && minFps >= BENCHMARK_PASS_MIN_FPS) return 'PASS';
  if (avgFps >= 34 && minFps >= 24) return 'CAUTION';
  return 'FAIL';
};

const summarizeSamples = (samples: number[]) => {
  const valid = samples.filter(v => v > 0);
  const avgFps = valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
  const minFps = valid.length ? Math.min(...valid) : 0;
  const drops = valid.filter(value => value < BENCHMARK_PASS_AVG_FPS).length;
  return { avgFps, minFps, drops };
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
  const [activeAttempt, setActiveAttempt] = useState(0);
  const fpsRef = useRef(fps);
  const attemptStartedAtRef = useRef(performance.now());
  const attemptSamplesRef = useRef<number[]>([]);
  const allSamplesRef = useRef<number[]>([]);
  const completedAttemptsRef = useRef<BenchmarkStageResult[]>([]);
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

  const cleanupBenchmarkObjects = useCallback(() => {
    spawnedEnemyIdsRef.current.forEach(removeEnemy);
    spawnedEnemyIdsRef.current.clear();
    benchEnemyBaseRef.current = {};
    useGameStore.setState(state => ({
      breakableProps: state.breakableProps.filter(prop => !prop.id.startsWith('bench-torch-')),
    }));
  }, [removeEnemy]);

  const buildAttemptResult = useCallback((profile: BenchmarkProfile, samples: number[]): BenchmarkStageResult => {
    const summary = summarizeSamples(samples);
    const grade = gradeBenchmark(summary.avgFps, summary.minFps);
    return {
      id: profile.id,
      label: profile.label,
      grade,
      avgFps: summary.avgFps,
      minFps: summary.minFps,
      drops: summary.drops,
      enemyTarget: profile.enemyTarget,
      stress: stressLabel(profile),
      safeStress: grade === 'PASS' ? stressLabel(profile) : 'not found',
      adjusted: profile.id !== BENCHMARK_PROFILES[0].id,
      maxTorches: maxCountsRef.current.torches,
      maxEnemies: maxCountsRef.current.enemies,
      maxFx: maxCountsRef.current.fx,
    };
  }, []);

  const finishBenchmark = useCallback((finalAttempt?: BenchmarkStageResult) => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    const attempts = finalAttempt
      ? [...completedAttemptsRef.current, finalAttempt]
      : completedAttemptsRef.current;
    const summary = summarizeSamples(allSamplesRef.current);
    const passAttempt = attempts.filter(attempt => attempt.grade === 'PASS').at(-1);
    const finalGrade: BenchmarkGrade = passAttempt ? 'PASS' : 'FAIL';
    const maxCounts = maxCountsRef.current;
    const nextResult: BenchmarkResult = {
      grade: finalGrade,
      avgFps: summary.avgFps,
      minFps: summary.minFps,
      drops: summary.drops,
      maxEnemies: maxCounts.enemies,
      maxFx: maxCounts.fx,
      maxProjectiles: maxCounts.projectiles,
      maxPickups: maxCounts.pickups,
      maxTorches: maxCounts.torches,
      stageCount: attempts.length,
      stages: attempts,
    };
    setResult(nextResult);
    cleanupBenchmarkObjects();
    window.setTimeout(() => onComplete(nextResult), 450);
  }, [cleanupBenchmarkObjects, onComplete]);

  const completeAttempt = useCallback((profile: BenchmarkProfile) => {
    const attemptResult = buildAttemptResult(profile, attemptSamplesRef.current);
    const isLast = activeAttempt >= BENCHMARK_PROFILES.length - 1;
    if (attemptResult.grade !== 'PASS' || isLast) {
      finishBenchmark(attemptResult);
      return;
    }

    completedAttemptsRef.current = [...completedAttemptsRef.current, attemptResult];
    attemptSamplesRef.current = [];
    attemptStartedAtRef.current = performance.now();
    cleanupBenchmarkObjects();
    const nextAttempt = activeAttempt + 1;
    setActiveAttempt(nextAttempt);
  }, [activeAttempt, buildAttemptResult, cleanupBenchmarkObjects, finishBenchmark]);

  useEffect(() => {
    if (result || fps <= 0) return;
    const attemptElapsed = performance.now() - attemptStartedAtRef.current;
    if (attemptElapsed < BENCHMARK_ATTEMPT_WARMUP_MS) return;
    attemptSamplesRef.current.push(fps);
    allSamplesRef.current.push(fps);
  }, [fps, result]);

  useEffect(() => {
    if (result) return;
    const profile = BENCHMARK_PROFILES[activeAttempt] ?? BENCHMARK_PROFILES[BENCHMARK_PROFILES.length - 1];

    const runBenchmarkTick = () => {
      const elapsed = performance.now() - startedAt;
      const attemptElapsed = performance.now() - attemptStartedAtRef.current;
      if (attemptElapsed >= BENCHMARK_ATTEMPT_MS) {
        completeAttempt(profile);
        return;
      }

      const recentFps = recentAverage(attemptSamplesRef.current);
      if (
        attemptElapsed >= BENCHMARK_EARLY_FAIL_AFTER_MS &&
        attemptSamplesRef.current.length >= 3 &&
        recentFps <= BENCHMARK_EARLY_FAIL_FPS
      ) {
        completeAttempt(profile);
        return;
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
          const stretch = isBench && base && profile.shadowJitter > 0
            ? Math.sin(elapsed * 0.012 + base.index * 1.7) * profile.shadowJitter
            : 0;
          return {
            ...enemy,
            x: base ? base.x : enemy.x,
            y: base ? base.y + wave * profile.yOscillation : enemy.y,
            width: base ? Math.max(14, base.width + stretch) : enemy.width,
            height: base ? Math.max(16, base.height + stretch * 0.35) : enemy.height,
            speed: isBench ? 0 : Math.min(enemy.speed, 8),
            damage: 0,
            health: isBench ? BENCHMARK_ENEMY_HP : enemy.health,
            maxHealth: isBench ? BENCHMARK_ENEMY_HP : enemy.maxHealth,
            rootUntil: state.gameTime + BENCHMARK_ATTEMPT_MS + 5000,
          };
        }),
        breakableProps: [
          ...state.breakableProps.filter(prop => !prop.id.startsWith('bench-torch-')),
          ...createBenchmarkTorches(
            state.player.x + state.player.width / 2,
            state.player.y + state.player.height / 2,
            profile.torchCount,
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
      const missing = Math.max(0, profile.enemyTarget - existingBenchEnemies.length);

      if (existingBenchEnemies.length > profile.enemyTarget) {
        existingBenchEnemies
          .sort((a, b) => (benchEnemyBaseRef.current[b.id]?.index ?? 0) - (benchEnemyBaseRef.current[a.id]?.index ?? 0))
          .slice(0, existingBenchEnemies.length - profile.enemyTarget)
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

      for (let i = 0; i < missing; i++) {
        const idx = existingBenchEnemies.length + i;
        const angle = (idx / Math.max(1, profile.enemyTarget)) * Math.PI * 2;
        const radius = 145 + (idx % 6) * 38;
        const type = BENCHMARK_ENEMY_TYPES[idx % BENCHMARK_ENEMY_TYPES.length];
        const jitter = profile.shadowJitter > 0 ? Math.sin(elapsed * 0.012 + idx * 1.7) * profile.shadowJitter : 0;
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
          rootUntil: state.gameTime + BENCHMARK_ATTEMPT_MS + 5000,
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
      for (let i = 0; i < profile.ringCount; i++) {
        const angle = pulseAngle + (i / profile.ringCount) * Math.PI * 2;
        const fxX = px + Math.cos(angle) * (96 + i * 28);
        const fxY = py + Math.sin(angle) * (64 + i * 18);
        spawnRing(fxX, fxY, 8, 84 + i * 12, 'rgba(96,165,250,0.72)', 3, 420);
      }
      for (let i = 0; i < profile.glowCount; i++) {
        const angle = pulseAngle * 1.35 + (i / profile.glowCount) * Math.PI * 2;
        const fxX = px + Math.cos(angle) * (86 + (i % 4) * 34);
        const fxY = py + Math.sin(angle) * (58 + (i % 3) * 24);
        spawnGlow(fxX, fxY, 58 + (i % 5) * 12, 'rgba(96,165,250,', 460);
      }
      if (profile.particleCount > 0) {
        const burstX = px + Math.cos(pulseAngle * 1.7) * 120;
        const burstY = py + Math.sin(pulseAngle * 1.3) * 84;
        spawnBurst(burstX, burstY, '#93c5fd', profile.particleCount);
      }
      setNow(performance.now());
    };

    runBenchmarkTick();
    const tick = window.setInterval(runBenchmarkTick, BENCHMARK_TICK_MS);

    return () => window.clearInterval(tick);
  }, [
    activeAttempt,
    addEnemy,
    completeAttempt,
    removeEnemy,
    result,
    spawnBurst,
    spawnGlow,
    spawnRing,
    startedAt,
  ]);

  useEffect(() => () => {
    cleanupBenchmarkObjects();
  }, [cleanupBenchmarkObjects]);

  const profile = BENCHMARK_PROFILES[activeAttempt] ?? BENCHMARK_PROFILES[BENCHMARK_PROFILES.length - 1];
  const attemptElapsed = Math.min(BENCHMARK_ATTEMPT_MS, now - attemptStartedAtRef.current);
  const progress = result ? 100 : Math.round((attemptElapsed / BENCHMARK_ATTEMPT_MS) * 100);
  const secondsLeft = Math.max(0, Math.ceil((BENCHMARK_ATTEMPT_MS - attemptElapsed) / 1000));
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
            <div>safe {result.stages.filter(stage => stage.grade === 'PASS').at(-1)?.safeStress ?? 'not found'}</div>
          </>
        ) : (
          <>
            <div>try {activeAttempt + 1}/{BENCHMARK_PROFILES.length} fps {fps}</div>
            <div>{profile.id} {profile.label}</div>
            <div>{stressLabel(profile)}</div>
          </>
        )}
      </div>
    </div>
  );
};

export default BenchmarkOverlay;
