import { describe, it, expect } from 'vitest';
import { createDirectorState, stepDirector, summarizeRun, relaxSpawnAdjust, buildupSpawnAdjust, applyRelaxSpawnCadence, RELAX_ESC_MULT, RELAX_INTERVAL_MULT, RELAX_CAP_MULT, type DirectorInputs, type DirectorState, type RunSampleLite } from './aiDirector';

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

  it('RELAXは最低滞在(8s)未満は危険が戻ってもPEAKへ戻らない(回復の余白を保証)', () => {
    const hi: DirectorInputs = { hpFrac: 0.2, damageTakenFrac: 0, nearEnemies: 10, killDelta: 0, dangerBias: 0 };
    let s = run(createDirectorState(), hi, 3);
    for (let i = 0; i < 60 * 6 && s.macro !== 'relax'; i++) s = stepDirector(s, hi, 1 / 60);
    expect(s.macro).toBe('relax'); // ここでmacroMs≈0
    s = run(s, hi, 6); // 最低滞在(8s)未満のうちに危険入力を与える
    expect(s.macro).toBe('relax'); // まだ戻らない
  });

  it('RELAXは最低滞在(8s)を過ぎたらIntensity再上昇でPEAKへ戻れる(社長報告の実データで判明したバグ修正)', () => {
    // 修正前は「RELAXから抜ける経路がIntensity低下による BUILD_UP 復帰しか無い」ため、危険が戻っても
    // RELAXという名札のまま長時間居座っていた(実プレイでRELAX 57%・その間もIntensityが何度も1.0まで
    // 再上昇していたのに反応しない、というデータで発覚)。
    const hi: DirectorInputs = { hpFrac: 0.2, damageTakenFrac: 0, nearEnemies: 10, killDelta: 0, dangerBias: 0 };
    let s = run(createDirectorState(), hi, 3);
    for (let i = 0; i < 60 * 6 && s.macro !== 'relax'; i++) s = stepDirector(s, hi, 1 / 60);
    expect(s.macro).toBe('relax');
    s = run(s, hi, 10); // 最低滞在(8s)を超えて危険入力を与え続ける
    expect(s.macro).toBe('peak');
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

  it('BUILD_UP/RELAX の滞在時間・回数も内訳として出す(「RELAXが少ない」を数字で見るため)', () => {
    const samples: RunSampleLite[] = [
      { t: 0, intensity: 0.2, performance: 0.5, macro: 'buildup' },
      { t: 1, intensity: 0.2, performance: 0.5, macro: 'buildup' },
      { t: 2, intensity: 0.8, performance: 0.4, macro: 'peak' },
      { t: 3, intensity: 0.3, performance: 0.5, macro: 'relax' },
      { t: 4, intensity: 0.2, performance: 0.5, macro: 'relax' }, // 連続=同じ谷
      { t: 5, intensity: 0.2, performance: 0.6, macro: 'buildup' },
      { t: 6, intensity: 0.2, performance: 0.6, macro: 'relax' }, // 別の谷
    ];
    const s = summarizeRun(samples);
    // 区間[t(i-1),t(i))は「到着側(t(i))のmacro」に帰属する(既存のPEAK集計と同じ規約)。
    expect(s.relaxCount).toBe(2);
    expect(s.relaxSeconds).toBeCloseTo(3, 5); // (3-2)+(4-3)+(6-5)
    expect(s.buildupSeconds).toBeCloseTo(2, 5); // (1-0)+(5-4)
    expect(s.peakSeconds).toBeCloseTo(1, 5); // (2-1)
  });

  // §5.8(M6追補3): パズルON時は komaKind でコマ基準集計。macro は約15秒でパタパタするので、
  // komaKind があればそちらを優先し、リザルトの BUILD/PEAK/RELAX がコマの実周期に一致する。
  it('komaKind があればコマ種別で数える(macroは無視・relax/harvest→RELAX / normal→BUILD / peak→PEAK)', () => {
    // macro を全部 buildup にしても、komaKind 側で正しく分類されることを確かめる。
    const samples: RunSampleLite[] = [
      { t: 0, intensity: 0.2, performance: 0.5, macro: 'buildup', komaKind: 'relax' },
      { t: 1, intensity: 0.2, performance: 0.5, macro: 'buildup', komaKind: 'harvest' }, // relaxと同じ谷(連続)
      { t: 2, intensity: 0.2, performance: 0.5, macro: 'buildup', komaKind: 'normal' },  // BUILD
      { t: 3, intensity: 0.2, performance: 0.5, macro: 'buildup', komaKind: 'peak' },    // PEAK
      { t: 4, intensity: 0.2, performance: 0.5, macro: 'buildup', komaKind: 'relax' },   // 別の谷
    ];
    const s = summarizeRun(samples);
    expect(s.relaxCount).toBe(2);               // relax/harvest塊 と 最後のrelax
    expect(s.relaxSeconds).toBeCloseTo(2, 5);   // (1-0)+(4-3)
    expect(s.buildupSeconds).toBeCloseTo(1, 5); // (2-1) normal
    expect(s.peakCount).toBe(1);
    expect(s.peakSeconds).toBeCloseTo(1, 5);    // (3-2)
  });

  it('ボス中(phaseKind==boss)は komaKind に関わらず PEAK 扱い(§5.8叩き台)', () => {
    const samples: RunSampleLite[] = [
      { t: 0, intensity: 0.5, performance: 0.5, macro: 'buildup', komaKind: 'normal', phaseKind: 'buildup' },
      { t: 1, intensity: 0.5, performance: 0.5, macro: 'buildup', komaKind: 'normal', phaseKind: 'boss' }, // ボス→PEAK
      { t: 2, intensity: 0.5, performance: 0.5, macro: 'buildup', komaKind: 'relax', phaseKind: 'boss' },  // ボス→PEAK(連続)
    ];
    const s = summarizeRun(samples);
    expect(s.peakCount).toBe(1);
    expect(s.peakSeconds).toBeCloseTo(2, 5); // (1-0)は到着側t1=boss / (2-1)も boss
  });

  it('komaKind が無い旧経路(?puzzle=0)は従来どおり macro で数える(挙動不変)', () => {
    const samples: RunSampleLite[] = [
      { t: 0, intensity: 0.2, performance: 0.5, macro: 'buildup' },
      { t: 1, intensity: 0.8, performance: 0.4, macro: 'peak' },
      { t: 2, intensity: 0.3, performance: 0.5, macro: 'relax' },
    ];
    const s = summarizeRun(samples);
    expect(s.peakCount).toBe(1);
    expect(s.peakSeconds).toBeCloseTo(1, 5);
    expect(s.relaxSeconds).toBeCloseTo(1, 5);
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

// ★v0.25.3495(社長指示「リラックスさせて」)。RELAXの湧きレバー2本(間隔/上限)は、
// 長らく旧spawner(!puzzleActiveNow)しか読んでおらず通常プレイで死んでいた。本方式の
// スポーナーへ効かせるための適用式をここに固定する(恒等・向き・床の3点)。
describe('applyRelaxSpawnCadence(RELAXの湧きレバーを本方式へ効かせる)', () => {
  it('倍率1は恒等(未適用時に挙動が1ミリも変わらないこと)', () => {
    expect(applyRelaxSpawnCadence(20, 1800, { intervalMult: 1, capMult: 1 })).toEqual({ cap: 20, cdMs: 1800 });
  });
  it('RELAX中は上限が下がり、湧き間隔が伸びる(向きを取り違えたら落ちる)', () => {
    const r = applyRelaxSpawnCadence(20, 1800, relaxSpawnAdjust('relax'));
    expect(r.cap).toBeLessThan(20);
    expect(r.cdMs).toBeGreaterThan(1800);
    expect(r.cap).toBe(Math.round(20 * RELAX_CAP_MULT));
    expect(r.cdMs).toBeCloseTo(1800 * RELAX_INTERVAL_MULT, 6);
  });
  it('BUILD_UP/PEAK中は素通し(RELAX以外で緩めない)', () => {
    for (const m of ['buildup', 'peak'] as const) {
      expect(applyRelaxSpawnCadence(14, 1200, relaxSpawnAdjust(m))).toEqual({ cap: 14, cdMs: 1200 });
    }
  });
  it('上限の床は1(倍率をいくら下げても「1体も湧かない」にはしない=ドロップ経路を枯らさない)', () => {
    expect(applyRelaxSpawnCadence(1, 1000, { intervalMult: 1, capMult: 0 }).cap).toBe(1);
    expect(applyRelaxSpawnCadence(3, 1000, { intervalMult: 1, capMult: 0.01 }).cap).toBe(1);
  });
});

describe('★収穫コマではRELAXを効かせない(社長裁定v0.25.3548)', () => {
  it('収穫(harvest)コマではRELAX中でも湧きレバーが中立(全て1)', () => {
    // 収穫は満量・CD×0.5・ランプ2秒で「意図的に盛る」コマ。ディレクターが緩めると打ち消し合う。
    expect(relaxSpawnAdjust('relax', 'harvest')).toEqual({ escMult: 1, intervalMult: 1, capMult: 1 });
  });

  it('★【不変条件】収穫以外のコマではRELAXが従来どおり効く', () => {
    for (const kind of ['relax', 'normal', 'peak'] as const) {
      expect(relaxSpawnAdjust('relax', kind), kind).toEqual({
        escMult: RELAX_ESC_MULT, intervalMult: RELAX_INTERVAL_MULT, capMult: RELAX_CAP_MULT,
      });
    }
  });

  it('★【不変条件】コマ未指定なら従来どおり(既存の呼び出しは挙動不変)', () => {
    expect(relaxSpawnAdjust('relax')).toEqual({
      escMult: RELAX_ESC_MULT, intervalMult: RELAX_INTERVAL_MULT, capMult: RELAX_CAP_MULT,
    });
  });

  it('★【不変条件】RELAX以外のmacroでは、コマに関係なく中立', () => {
    for (const macro of ['buildup', 'peak'] as const) {
      for (const kind of ['relax', 'harvest', 'normal', 'peak'] as const) {
        expect(relaxSpawnAdjust(macro, kind)).toEqual({ escMult: 1, intervalMult: 1, capMult: 1 });
      }
    }
  });
});
