import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from '../utils/enemyUtils';
import type { BreakableProp, EnemyType } from '../types/game';

const BENCHMARK_ATTEMPT_MS = 3600;
const BENCHMARK_ATTEMPT_WARMUP_MS = 1200;
const BENCHMARK_TICK_MS = 320;
const BENCHMARK_SAMPLE_MS = 500;
const BENCHMARK_ENEMY_HP = 999999;
const BENCHMARK_PASS_AVG_FPS = 40;
const BENCHMARK_PASS_MIN_FPS = 30;
const BENCHMARK_EARLY_FAIL_FPS = 24;
const BENCHMARK_EARLY_FAIL_AFTER_MS = 2200;
const BENCHMARK_NET_SAMPLE_COUNT = 12;
const BENCHMARK_NET_SAMPLE_GAP_MS = 650;
const BENCHMARK_MAIN_DELAY_SAMPLE_MS = 250;

const BENCHMARK_PROFILES = [
  { id: 'B1', category: 'BASE', label: 'BASE', enemyTarget: 10, glowCount: 1, ringCount: 1, particleCount: 4, torchCount: 2, yOscillation: 12, shadowJitter: 4 },
  { id: 'P1', category: 'PART', label: 'P20', enemyTarget: 12, glowCount: 1, ringCount: 1, particleCount: 20, torchCount: 2, yOscillation: 12, shadowJitter: 4 },
  { id: 'P2', category: 'PART', label: 'P50', enemyTarget: 12, glowCount: 1, ringCount: 1, particleCount: 50, torchCount: 2, yOscillation: 12, shadowJitter: 4 },
  { id: 'P3', category: 'PART', label: 'P90', enemyTarget: 12, glowCount: 1, ringCount: 1, particleCount: 90, torchCount: 2, yOscillation: 12, shadowJitter: 4 },
  { id: 'G1', category: 'GLOW', label: 'G4', enemyTarget: 12, glowCount: 4, ringCount: 1, particleCount: 4, torchCount: 2, yOscillation: 12, shadowJitter: 4 },
  { id: 'G2', category: 'GLOW', label: 'G8', enemyTarget: 12, glowCount: 8, ringCount: 1, particleCount: 4, torchCount: 2, yOscillation: 12, shadowJitter: 4 },
  { id: 'G3', category: 'GLOW', label: 'G12', enemyTarget: 12, glowCount: 12, ringCount: 1, particleCount: 4, torchCount: 2, yOscillation: 12, shadowJitter: 4 },
  { id: 'R1', category: 'RING', label: 'R4', enemyTarget: 12, glowCount: 1, ringCount: 4, particleCount: 4, torchCount: 2, yOscillation: 12, shadowJitter: 4 },
  { id: 'R2', category: 'RING', label: 'R8', enemyTarget: 12, glowCount: 1, ringCount: 8, particleCount: 4, torchCount: 2, yOscillation: 12, shadowJitter: 4 },
  { id: 'R3', category: 'RING', label: 'R12', enemyTarget: 12, glowCount: 1, ringCount: 12, particleCount: 4, torchCount: 2, yOscillation: 12, shadowJitter: 4 },
  { id: 'S1', category: 'SHDW', label: 'S20', enemyTarget: 20, glowCount: 1, ringCount: 1, particleCount: 4, torchCount: 2, yOscillation: 48, shadowJitter: 14 },
  { id: 'S2', category: 'SHDW', label: 'S28', enemyTarget: 28, glowCount: 1, ringCount: 1, particleCount: 4, torchCount: 2, yOscillation: 66, shadowJitter: 22 },
  { id: 'S3', category: 'SHDW', label: 'S36', enemyTarget: 36, glowCount: 1, ringCount: 1, particleCount: 4, torchCount: 2, yOscillation: 84, shadowJitter: 30 },
  { id: 'T1', category: 'TORCH', label: 'T4', enemyTarget: 12, glowCount: 1, ringCount: 1, particleCount: 4, torchCount: 4, yOscillation: 12, shadowJitter: 4 },
  { id: 'T2', category: 'TORCH', label: 'T8', enemyTarget: 12, glowCount: 1, ringCount: 1, particleCount: 4, torchCount: 8, yOscillation: 12, shadowJitter: 4 },
  { id: 'T3', category: 'TORCH', label: 'T12', enemyTarget: 12, glowCount: 1, ringCount: 1, particleCount: 4, torchCount: 12, yOscillation: 12, shadowJitter: 4 },
  { id: 'M1', category: 'MIX', label: 'M20', enemyTarget: 20, glowCount: 3, ringCount: 2, particleCount: 14, torchCount: 3, yOscillation: 24, shadowJitter: 8 },
  { id: 'M2', category: 'MIX', label: 'M28', enemyTarget: 28, glowCount: 4, ringCount: 3, particleCount: 24, torchCount: 4, yOscillation: 34, shadowJitter: 10 },
  { id: 'M3', category: 'MIX', label: 'M36', enemyTarget: 36, glowCount: 5, ringCount: 4, particleCount: 36, torchCount: 5, yOscillation: 42, shadowJitter: 12 },
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
  category: string;
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
  sampleCount: number;
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
  categorySummary: string[];
  bottleneck: string;
  diagnostics: BenchmarkDiagnostics;
};

export type BenchmarkDiagnostics = {
  netRttAvg: number;
  netRttMax: number;
  netSamples: number;
  netFailures: number;
  mainDelayAvg: number;
  mainDelayMax: number;
  mainSamples: number;
  verdict: string;
};

interface BenchmarkOverlayProps {
  fps: number;
  onComplete: (result: BenchmarkResult) => void;
}

const objectCount = (profile: BenchmarkProfile) =>
  profile.glowCount + profile.ringCount + profile.particleCount + profile.torchCount;

const stressLabel = (profile: BenchmarkProfile) =>
  `E${profile.enemyTarget} O${objectCount(profile)} G${profile.glowCount} R${profile.ringCount} P${profile.particleCount} T${profile.torchCount}`;

const nextProfileIndex = (currentIndex: number, currentGrade: BenchmarkGrade): number => {
  if (currentGrade === 'PASS') return currentIndex + 1;
  const currentCategory = BENCHMARK_PROFILES[currentIndex]?.category;
  const nextCategoryIndex = BENCHMARK_PROFILES.findIndex((profile, index) =>
    index > currentIndex && profile.category !== currentCategory
  );
  return nextCategoryIndex === -1 ? BENCHMARK_PROFILES.length : nextCategoryIndex;
};

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

const summarizeCategories = (attempts: BenchmarkStageResult[]) => {
  const categories = [...new Set(BENCHMARK_PROFILES.map(profile => profile.category))];
  const lines = categories.map(category => {
    const categoryAttempts = attempts.filter(attempt => attempt.category === category);
    if (categoryAttempts.length === 0) return `${category}: not run`;
    const lastPass = categoryAttempts.filter(attempt => attempt.grade === 'PASS').at(-1);
    const firstStop = categoryAttempts.find(attempt => attempt.grade !== 'PASS');
    const safe = lastPass ? lastPass.label : 'none';
    const stop = firstStop ? `${firstStop.label} ${firstStop.grade}` : 'max';
    return `${category}: safe ${safe} / stop ${stop}`;
  });
  const failed = attempts.filter(attempt => attempt.grade !== 'PASS');
  const weakest = failed.length
    ? [...failed].sort((a, b) => a.avgFps - b.avgFps || a.minFps - b.minFps)[0]
    : null;
  return {
    lines,
    bottleneck: weakest
      ? `${weakest.category} ${weakest.label} avg ${weakest.avgFps.toFixed(1)} min ${weakest.minFps}`
      : 'none',
  };
};

const summarizeDiagnostics = (
  netSamples: number[],
  netFailures: number,
  mainDelaySamples: number[]
): BenchmarkDiagnostics => {
  const avg = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const netRttAvg = avg(netSamples);
  const netRttMax = netSamples.length ? Math.max(...netSamples) : 0;
  const mainDelayAvg = avg(mainDelaySamples);
  const mainDelayMax = mainDelaySamples.length ? Math.max(...mainDelaySamples) : 0;
  const networkBad = netFailures >= 3 || netRttAvg >= 150 || netRttMax >= 450;
  const mainBad = mainDelayAvg >= 28 || mainDelayMax >= 140;
  const verdict = networkBad
    ? mainBad
      ? 'network + device unstable'
      : 'network unstable'
    : mainBad
      ? 'device hot / main-thread unstable'
      : 'network OK / device OK';

  return {
    netRttAvg,
    netRttMax,
    netSamples: netSamples.length,
    netFailures,
    mainDelayAvg,
    mainDelayMax,
    mainSamples: mainDelaySamples.length,
    verdict,
  };
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
  const lastSampleAtRef = useRef(0);
  const attemptSamplesRef = useRef<number[]>([]);
  const allSamplesRef = useRef<number[]>([]);
  const netRttSamplesRef = useRef<number[]>([]);
  const netFailuresRef = useRef(0);
  const mainDelaySamplesRef = useRef<number[]>([]);
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
  const attemptMaxCountsRef = useRef({
    enemies: 0,
    fx: 0,
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
      effects: [],
    }));
  }, [removeEnemy]);

  const buildAttemptResult = useCallback((profile: BenchmarkProfile, samples: number[]): BenchmarkStageResult => {
    const summary = summarizeSamples(samples);
    const grade = gradeBenchmark(summary.avgFps, summary.minFps);
    return {
      id: profile.id,
      category: profile.category,
      label: profile.label,
      grade,
      avgFps: summary.avgFps,
      minFps: summary.minFps,
      drops: summary.drops,
      enemyTarget: profile.enemyTarget,
      stress: stressLabel(profile),
      safeStress: grade === 'PASS' ? stressLabel(profile) : 'not found',
      adjusted: profile.id !== BENCHMARK_PROFILES[0].id,
      maxTorches: attemptMaxCountsRef.current.torches,
      maxEnemies: attemptMaxCountsRef.current.enemies,
      maxFx: attemptMaxCountsRef.current.fx,
      sampleCount: samples.length,
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
    const displaySummary = passAttempt ?? summary;
    const categorySummary = summarizeCategories(attempts);
    const diagnostics = summarizeDiagnostics(
      netRttSamplesRef.current,
      netFailuresRef.current,
      mainDelaySamplesRef.current
    );
    const maxCounts = maxCountsRef.current;
    const nextResult: BenchmarkResult = {
      grade: finalGrade,
      avgFps: displaySummary.avgFps,
      minFps: displaySummary.minFps,
      drops: displaySummary.drops,
      maxEnemies: maxCounts.enemies,
      maxFx: maxCounts.fx,
      maxProjectiles: maxCounts.projectiles,
      maxPickups: maxCounts.pickups,
      maxTorches: maxCounts.torches,
      stageCount: attempts.length,
      stages: attempts,
      categorySummary: categorySummary.lines,
      bottleneck: categorySummary.bottleneck,
      diagnostics,
    };
    setResult(nextResult);
    cleanupBenchmarkObjects();
    window.setTimeout(() => onComplete(nextResult), 450);
  }, [cleanupBenchmarkObjects, onComplete]);

  const completeAttempt = useCallback((profile: BenchmarkProfile) => {
    const attemptResult = buildAttemptResult(profile, attemptSamplesRef.current);
    const nextAttempt = nextProfileIndex(activeAttempt, attemptResult.grade);
    const isDone = nextAttempt >= BENCHMARK_PROFILES.length;
    if (isDone) {
      finishBenchmark(attemptResult);
      return;
    }

    completedAttemptsRef.current = [...completedAttemptsRef.current, attemptResult];
    attemptSamplesRef.current = [];
    attemptMaxCountsRef.current = { enemies: 0, fx: 0, torches: 0 };
    attemptStartedAtRef.current = performance.now();
    lastSampleAtRef.current = 0;
    cleanupBenchmarkObjects();
    setActiveAttempt(nextAttempt);
  }, [activeAttempt, buildAttemptResult, cleanupBenchmarkObjects, finishBenchmark]);

  useEffect(() => {
    let cancelled = false;

    const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
    const runNetworkSamples = async () => {
      const baseUrl = `${window.location.origin}${window.location.pathname}`;
      for (let i = 0; i < BENCHMARK_NET_SAMPLE_COUNT && !cancelled; i++) {
        const start = performance.now();
        try {
          await fetch(`${baseUrl}?bench-net=${Date.now()}-${i}`, {
            cache: 'no-store',
            credentials: 'same-origin',
          });
          if (!cancelled) netRttSamplesRef.current.push(performance.now() - start);
        } catch {
          if (!cancelled) netFailuresRef.current += 1;
        }
        await sleep(BENCHMARK_NET_SAMPLE_GAP_MS);
      }
    };

    void runNetworkSamples();

    let expected = performance.now() + BENCHMARK_MAIN_DELAY_SAMPLE_MS;
    const delayTimer = window.setInterval(() => {
      const now = performance.now();
      mainDelaySamplesRef.current.push(Math.max(0, now - expected));
      expected = now + BENCHMARK_MAIN_DELAY_SAMPLE_MS;
    }, BENCHMARK_MAIN_DELAY_SAMPLE_MS);

    return () => {
      cancelled = true;
      window.clearInterval(delayTimer);
    };
  }, []);

  useEffect(() => {
    if (result) return;
    const profile = BENCHMARK_PROFILES[activeAttempt] ?? BENCHMARK_PROFILES[BENCHMARK_PROFILES.length - 1];

    const runBenchmarkTick = () => {
      const elapsed = performance.now() - startedAt;
      const tickNow = performance.now();
      const attemptElapsed = tickNow - attemptStartedAtRef.current;
      if (
        attemptElapsed >= BENCHMARK_ATTEMPT_WARMUP_MS &&
        tickNow - lastSampleAtRef.current >= BENCHMARK_SAMPLE_MS &&
        fpsRef.current > 0
      ) {
        attemptSamplesRef.current.push(fpsRef.current);
        allSamplesRef.current.push(fpsRef.current);
        lastSampleAtRef.current = tickNow;
      }
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
      attemptMaxCountsRef.current = {
        enemies: Math.max(attemptMaxCountsRef.current.enemies, state.enemies.length),
        fx: Math.max(attemptMaxCountsRef.current.fx, state.effects.length),
        torches: Math.max(attemptMaxCountsRef.current.torches, benchTorchCount),
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
            <div>net {result.diagnostics.netRttAvg.toFixed(0)}ms main {result.diagnostics.mainDelayMax.toFixed(0)}ms</div>
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
