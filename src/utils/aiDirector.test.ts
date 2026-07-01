import { describe, it, expect } from 'vitest';
import { createDirectorState, stepDirector, summarizeRun, relaxSpawnAdjust, buildupSpawnAdjust, type DirectorInputs, type DirectorState, type RunSampleLite } from './aiDirector';

const CALM: DirectorInputs = { hpFrac: 1, damageTakenFrac: 0, nearEnemies: 0, killDelta: 0, dangerBias: 0 };

// 固定入力で n 秒ぶん(dt刻み)回す。
const run = (s: DirectorState, input: DirectorInputs, seconds: number, dt = 1 / 60): DirectorState => {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) s = stepDirector(s, input, dt);
  return s;
};

describe('aiDirector: Intensity', () => {
  it('安全にしていれば低いまま', () => {
    const s = run(createDirectorState(), CALM, 5);
    expect(s.intensity).toBeLessThan(0.1);
  });

  it('近接敵が多い/低HPだと上がる', () => {
    const s = run(createDirectorState(), { hpFrac: 0.3, damageTakenFrac: 0, nearEnemies: 8, killDelta: 0, dangerBias: 0 }, 3);
    expect(s.intensity).toBeGreaterThan(0.5);
  });

  it('危険敵の存在(ハンター追跡)は無傷・近接ゼロでも Intensity を底上げする', () => {
    const hunter: DirectorInputs = { hpFrac: 1, damageTakenFrac: 0, nearEnemies: 0, killDelta: 0, dangerBias: 1 };
    const s = run(createDirectorState(), hunter, 3);
    expect(s.intensity).toBeGreaterThan(0.35); // 被弾も近接もないのに緊張が乗る
    expect(s.dangerBias).toBe(1);              // 表示用エコー
  });

  it('被弾スパイクで即上がり、その後は安全にすると遅く減衰する', () => {
    let s = createDirectorState();
    s = stepDirector(s, { hpFrac: 0.7, damageTakenFrac: 0.15, nearEnemies: 2, killDelta: 0, dangerBias: 0 }, 1 / 60);
    const spiked = s.intensity;
    expect(spiked).toBeGreaterThan(0.25); // スパイク
    const after1s = run(s, CALM, 1).intensity;
    expect(after1s).toBeLessThan(spiked);       // 減衰する
    expect(after1s).toBeGreaterThan(spiked * 0.4); // でも“遅い”(1秒では消えない)
  });
});

describe('aiDirector: Performance(Intensityと独立)', () => {
  it('無傷・撃破・高HPが続くと高い', () => {
    const s = run(createDirectorState(), { hpFrac: 1, damageTakenFrac: 0, nearEnemies: 1, killDelta: 1, dangerBias: 0 }, 25);
    expect(s.performance).toBeGreaterThan(0.7);
  });

  it('被弾はIntensityを上げるがPerformanceは上げない(混ぜない)', () => {
    const base = run(createDirectorState(), CALM, 20); // まず余裕を作る
    const hurt = run(base, { hpFrac: 0.4, damageTakenFrac: 0.1, nearEnemies: 5, killDelta: 0, dangerBias: 0 }, 3);
    expect(hurt.intensity).toBeGreaterThan(base.intensity); // 苦しさは上がる
    expect(hurt.performance).toBeLessThan(base.performance); // 余裕は下がる(=上がらない)
  });
});

describe('aiDirector: DirectorState(BUILD_UP/PEAK/RELAX)', () => {
  it('Intensityが上がると BUILD_UP→PEAK→RELAX と遷移し、RELAXでは緩む', () => {
    // 高圧入力で PEAK まで上げる。
    const hi: DirectorInputs = { hpFrac: 0.2, damageTakenFrac: 0, nearEnemies: 10, killDelta: 0, dangerBias: 0 };
    let s = run(createDirectorState(), hi, 3);
    expect(s.macro === 'peak' || s.macro === 'relax').toBe(true);
    // PEAK は必ず RELAX へ落ちる(高圧を維持しても PEAK_HOLD で抜ける)。
    s = run(s, hi, 6);
    // その後、安全にすれば RELAX を経て BUILD_UP へ戻る。
    s = run(s, CALM, 20);
    expect(s.macro).toBe('buildup');
    expect(s.intensity).toBeLessThan(0.25);
  });

  it('PEAK の直後は必ず RELAX', () => {
    const hi: DirectorInputs = { hpFrac: 0.2, damageTakenFrac: 0, nearEnemies: 10, killDelta: 0, dangerBias: 0 };
    let s = run(createDirectorState(), hi, 2.5);
    // peak に到達してから、時間経過で必ず relax へ。
    let sawRelaxAfterPeak = false;
    for (let i = 0; i < 60 * 8; i++) {
      const prevMacro = s.macro;
      s = stepDirector(s, hi, 1 / 60);
      if (prevMacro === 'peak' && s.macro !== 'peak') { expect(s.macro).toBe('relax'); sawRelaxAfterPeak = true; break; }
    }
    expect(sawRelaxAfterPeak).toBe(true);
  });
});

describe('aiDirector: summarizeRun(リザルト用)', () => {
  it('空なら全部0', () => {
    const s = summarizeRun([]);
    expect(s.score).toBe(0);
    expect(s.sampleCount).toBe(0);
  });

  it('緊張が高い/PEAKが多いランほどスコアが高い', () => {
    const calm: RunSampleLite[] = Array.from({ length: 20 }, (_, i) => ({ t: i * 0.5, intensity: 0.1, performance: 0.8, macro: 'relax' }));
    const hard: RunSampleLite[] = Array.from({ length: 20 }, (_, i) => ({ t: i * 0.5, intensity: 0.8, performance: 0.3, macro: i % 4 === 0 ? 'peak' : 'buildup' }));
    const cs = summarizeRun(calm), hs = summarizeRun(hard);
    expect(hs.score).toBeGreaterThan(cs.score);
    expect(hs.peakCount).toBeGreaterThan(0);
    expect(hs.avgIntensity).toBeGreaterThan(cs.avgIntensity);
  });

  it('PEAKの連続は1回として数える(山の数)', () => {
    const samples: RunSampleLite[] = [
      { t: 0, intensity: 0.2, performance: 0.5, macro: 'buildup' },
      { t: 0.5, intensity: 0.8, performance: 0.4, macro: 'peak' },
      { t: 1.0, intensity: 0.8, performance: 0.4, macro: 'peak' }, // 連続=同じ山
      { t: 1.5, intensity: 0.3, performance: 0.5, macro: 'relax' },
      { t: 2.0, intensity: 0.8, performance: 0.4, macro: 'peak' }, // 別の山
    ];
    expect(summarizeRun(samples).peakCount).toBe(2);
  });
});

describe('aiDirector: relaxSpawnAdjust(ステップB)', () => {
  it('RELAX以外は無補正(1倍)', () => {
    expect(relaxSpawnAdjust('buildup')).toEqual({ escMult: 1, intervalMult: 1, capMult: 1 });
    expect(relaxSpawnAdjust('peak')).toEqual({ escMult: 1, intervalMult: 1, capMult: 1 });
  });

  it('RELAX中は escalationゼロ・湧き間隔を伸ばす・湧き上限を下げる', () => {
    const adj = relaxSpawnAdjust('relax');
    expect(adj.escMult).toBe(0);
    expect(adj.intervalMult).toBeGreaterThan(1);
    expect(adj.capMult).toBeLessThan(1);
  });
});

describe('aiDirector: buildupSpawnAdjust(ステップC)', () => {
  it('BUILD_UP以外はPerformanceが高くても0(危険側だけの安全弁)', () => {
    expect(buildupSpawnAdjust('peak', 1).escBoost).toBe(0);
    expect(buildupSpawnAdjust('relax', 1).escBoost).toBe(0);
  });

  it('BUILD_UP中はPerformanceに比例して上乗せされ、上限を超えない', () => {
    expect(buildupSpawnAdjust('buildup', 0).escBoost).toBe(0);
    const half = buildupSpawnAdjust('buildup', 0.5).escBoost;
    const full = buildupSpawnAdjust('buildup', 1).escBoost;
    expect(half).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(half);
    expect(full).toBeLessThanOrEqual(0.25);
  });

  it('Performanceが1を超えてもクランプされる(壊れた入力を渡さない前提の防御)', () => {
    expect(buildupSpawnAdjust('buildup', 1.5).escBoost).toBe(buildupSpawnAdjust('buildup', 1).escBoost);
  });
});
