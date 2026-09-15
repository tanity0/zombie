import { describe, it, expect } from 'vitest';
import {
  skadiMoveEligible, skadiMoveWeight, skadiPhaseForHealth, pickSkadiMove, pickSkadiCombo, skadiComboChance,
  SKADI_MOVE_WEIGHTS, type SkadiMove,
} from './skadiScript';
import { BOSS_RANGE } from './bossScript';

const ALL_MOVES: SkadiMove[] = ['ice', 'blade', 'dash', 'burst', 'radial', 'cage'];
const allReady = (): Record<SkadiMove, boolean> => ({ ice: true, blade: true, dash: true, burst: true, radial: true, cage: true });
const BAND_SAMPLES = [60, 200, 450, 900]; // 密着/近/中/遠

describe('skadiPhaseForHealth — 3相(70%/35%)', () => {
  it('phase1 above 70%', () => {
    expect(skadiPhaseForHealth(1)).toBe(1);
    expect(skadiPhaseForHealth(0.71)).toBe(1);
  });
  it('phase2 between 35% and 70%', () => {
    expect(skadiPhaseForHealth(0.7)).toBe(2);
    expect(skadiPhaseForHealth(0.36)).toBe(2);
  });
  it('phase3 at or below 35%', () => {
    expect(skadiPhaseForHealth(0.35)).toBe(3);
    expect(skadiPhaseForHealth(0)).toBe(3);
  });
});

// ==== v0.25.2609: 死に技の再発防止 ==========================================================
// 旧実装は密着帯で「候補なし50% / ice25% / blade25%」(dash/burst/radialが帯ゲートで完全に死亡)、
// かつ Phase3 は cage が無条件最優先で 100% になっていた。
describe('SKADI_MOVE_WEIGHTS — 死に技を作らない不変条件', () => {
  it('どのゾーンにも生きている技が3本以上ある(全フェーズ)', () => {
    for (const phase of [1, 2, 3] as const) {
      for (const d of BAND_SAMPLES) {
        const live = ALL_MOVES.filter(m => skadiMoveEligible(m, d, phase));
        expect(live.length, `phase=${phase} distance=${d} の生存技=${live.join(',')}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('すべての技が最低1つのゾーンで重み>0', () => {
    for (const m of ALL_MOVES) expect(Math.max(...Object.values(SKADI_MOVE_WEIGHTS[m])), m).toBeGreaterThan(0);
  });

  it('遠ゾーンに上限が無い(旧FAR_MAX=1000の頭打ちを撤廃)', () => {
    expect(ALL_MOVES.some(m => skadiMoveEligible(m, 5000, 1))).toBe(true);
  });

  it('重みは非負', () => {
    for (const m of ALL_MOVES) for (const w of Object.values(SKADI_MOVE_WEIGHTS[m])) expect(w).toBeGreaterThanOrEqual(0);
  });
});

describe('skadiMoveWeight — 役割の維持', () => {
  it('ice/bladeは全ゾーンで出る(§6.28-9「全帯」・不変)', () => {
    for (const phase of [1, 2, 3] as const) {
      for (const d of BAND_SAMPLES) {
        expect(skadiMoveWeight('ice', d, phase)).toBeGreaterThan(0);
        expect(skadiMoveWeight('blade', d, phase)).toBeGreaterThan(0);
      }
    }
  });
  it('ice/bladeは常に同じ重み(氷2技の対称性)', () => {
    for (const d of BAND_SAMPLES) expect(skadiMoveWeight('ice', d, 1)).toBe(skadiMoveWeight('blade', d, 1));
  });
  it('cageはPhase3のみ(§6.28-9)', () => {
    expect(skadiMoveWeight('cage', 50, 1)).toBe(0);
    expect(skadiMoveWeight('cage', 50, 2)).toBe(0);
    expect(skadiMoveWeight('cage', 50, 3)).toBeGreaterThan(0);
    expect(skadiMoveWeight('cage', 900, 3)).toBeGreaterThan(0);
  });
  it('cageはもはや最優先ではない(Phase3が cage 100% になる旧バグの再発防止)', () => {
    // Phase3・密着で600回引いて、cage以外も必ず顔を出すこと。
    const seen = new Set<SkadiMove>();
    for (let i = 0; i < 600; i++) {
      const m = pickSkadiMove(60, 3, allReady());
      if (m) seen.add(m);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
    expect(seen.has('cage')).toBe(true);
  });
  it('dash は遠が最重・密着では出ない(追いつき技)', () => {
    expect(skadiMoveWeight('dash', BOSS_RANGE.MELEE_MAX, 1)).toBe(0);
    expect(Math.max(...ALL_MOVES.map(m => skadiMoveWeight(m, 900, 1)))).toBe(skadiMoveWeight('dash', 900, 1));
  });
  it('burst/radialは密着でも薄く出る(旧: 中帯だけ=張り付きの安全地帯だった)', () => {
    expect(skadiMoveWeight('burst', 60, 1)).toBeGreaterThan(0);
    expect(skadiMoveWeight('radial', 60, 1)).toBeGreaterThan(0);
  });
});

describe('pickSkadiMove', () => {
  it('氷2技がCD中でも密着で他の技が出る(無行動の再発防止)', () => {
    const ready = allReady(); ready.ice = false; ready.blade = false;
    for (let i = 0; i < 50; i++) expect(pickSkadiMove(60, 1, ready)).not.toBeNull();
  });

  it('CD明けの技が1つも無ければnull', () => {
    const ready: Record<SkadiMove, boolean> = { ice: false, blade: false, dash: false, burst: false, radial: false, cage: false };
    expect(pickSkadiMove(60, 1, ready)).toBeNull();
  });

  it('readyでない技は絶対に選ばれない', () => {
    const ready = allReady(); ready.cage = false;
    for (let i = 0; i < 200; i++) expect(pickSkadiMove(60, 3, ready)).not.toBe('cage');
  });
});

describe('skadiComboChance — Phase2=50% / Phase3=60%(不変)', () => {
  it('phase2は0.5', () => { expect(skadiComboChance(2)).toBeCloseTo(0.5); });
  it('phase3は0.6', () => { expect(skadiComboChance(3)).toBeCloseTo(0.6); });
});

describe('pickSkadiCombo — 受け入れ条件: Phase2以降のみ・組は氷塊→氷刃/突進→氷塊のみ(不変)', () => {
  it('phase1では連携しない', () => {
    expect(pickSkadiCombo('ice', 1, 100, () => 0)).toBeNull();
  });

  it('許す組み合わせ以外はnull', () => {
    expect(pickSkadiCombo('blade', 2, 100, () => 0)).toBeNull();
    expect(pickSkadiCombo('burst', 2, 500, () => 0)).toBeNull();
  });

  it('phase2は50%閾値・phase3は60%閾値', () => {
    expect(pickSkadiCombo('ice', 2, 100, () => 0.49)).toBe('blade');
    expect(pickSkadiCombo('ice', 2, 100, () => 0.51)).toBeNull();
    expect(pickSkadiCombo('ice', 3, 100, () => 0.59)).toBe('blade');
    expect(pickSkadiCombo('ice', 3, 100, () => 0.61)).toBeNull();
  });
});
