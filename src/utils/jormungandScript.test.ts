import { describe, it, expect } from 'vitest';
import {
  jormungandMoveEligible, jormungandMoveWeight, pickJormungandMove, pickJormungandCombo,
  jormRadialSpinAngle, jormungandPhaseForHealth, JORM_MOVE_WEIGHTS, type JormungandMove,
} from './jormungandScript';
import { BOSS_RANGE } from './bossScript';

const ALL_MOVES: JormungandMove[] = ['radial', 'burst', 'dash', 'coil'];
const allReady = (): Record<JormungandMove, boolean> => ({ radial: true, burst: true, dash: true, coil: true });
const BAND_SAMPLES = [60, 200, 450, 900]; // 密着/近/中/遠

describe('jormungandPhaseForHealth — 2相(60%)', () => {
  it('phase1 above 60%', () => {
    expect(jormungandPhaseForHealth(1)).toBe(1);
    expect(jormungandPhaseForHealth(0.61)).toBe(1);
  });
  it('phase2 at or below 60%', () => {
    expect(jormungandPhaseForHealth(0.6)).toBe(2);
    expect(jormungandPhaseForHealth(0)).toBe(2);
  });
});

// ==== v0.25.2609: 死に技の再発防止 ==========================================================
// 旧実装は「密着帯 coil 100%・coilがCD(7秒)中は候補ゼロ=無行動」だった。
describe('JORM_MOVE_WEIGHTS — 死に技を作らない不変条件', () => {
  it('どのゾーンにも生きている技が3本以上ある', () => {
    for (const d of BAND_SAMPLES) {
      const live = ALL_MOVES.filter(m => jormungandMoveEligible(m, d));
      expect(live.length, `distance=${d} の生存技=${live.join(',')}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('すべての技が最低1つのゾーンで重み>0', () => {
    for (const m of ALL_MOVES) expect(Math.max(...Object.values(JORM_MOVE_WEIGHTS[m])), m).toBeGreaterThan(0);
  });

  it('遠ゾーンに上限が無い(旧FAR_MAX=1000の頭打ちを撤廃)', () => {
    expect(ALL_MOVES.some(m => jormungandMoveEligible(m, 5000))).toBe(true);
  });

  it('重みは非負', () => {
    for (const m of ALL_MOVES) for (const w of Object.values(JORM_MOVE_WEIGHTS[m])) expect(w).toBeGreaterThanOrEqual(0);
  });
});

describe('jormungandMoveWeight — 役割の維持', () => {
  it('coil は密着が最重(近接帯のハメを塞ぐ担い手・§6.28-7)', () => {
    expect(Math.max(...ALL_MOVES.map(m => jormungandMoveWeight(m, 60)))).toBe(jormungandMoveWeight('coil', 60));
  });
  it('dash は遠が最重・密着では出ない(追いつき技)', () => {
    expect(jormungandMoveWeight('dash', BOSS_RANGE.MELEE_MAX)).toBe(0);
    expect(Math.max(...ALL_MOVES.map(m => jormungandMoveWeight(m, 900)))).toBe(jormungandMoveWeight('dash', 900));
  });
  it('radial(螺旋)は全ゾーンで出る=蛇の主砲', () => {
    for (const d of BAND_SAMPLES) expect(jormungandMoveWeight('radial', d)).toBeGreaterThan(0);
  });
  it('【設計裁定・§6.28-7 #4】coilはPhase1から使える(帯はフェーズ非依存)', () => {
    expect(jormungandMoveEligible('coil', 100, 1)).toBe(true);
    expect(jormungandMoveEligible('coil', 100, 2)).toBe(true);
  });
});

describe('pickJormungandMove', () => {
  it('coilがCD中でも密着で他の技が出る(無行動バグの再発防止)', () => {
    const ready = allReady(); ready.coil = false;
    for (let i = 0; i < 50; i++) expect(pickJormungandMove(60, 1, ready)).not.toBeNull();
  });

  it('CD明けの技が1つも無ければnull', () => {
    const ready: Record<JormungandMove, boolean> = { radial: false, burst: false, dash: false, coil: false };
    expect(pickJormungandMove(60, 1, ready)).toBeNull();
  });

  it('密着帯で3技すべてが顔を出す(dashは追いつき技なので密着では出ない=設計どおり)', () => {
    const seen = new Set<JormungandMove>();
    for (let i = 0; i < 600; i++) {
      const m = pickJormungandMove(60, 1, allReady());
      if (m) seen.add(m);
    }
    expect([...seen].sort()).toEqual(['burst', 'coil', 'radial']);
  });

  it('フェーズで抽選結果の分布が変わらない(差が出るのは連携だけ=§6.28-7)', () => {
    const seq = [0.1, 0.35, 0.6, 0.85];
    for (const r of seq) {
      for (const d of BAND_SAMPLES) {
        expect(pickJormungandMove(d, 2, allReady(), () => r)).toBe(pickJormungandMove(d, 1, allReady(), () => r));
      }
    }
  });
});

describe('pickJormungandCombo — Phase2の最大4段連携', () => {
  it('phase1では連携しない', () => {
    expect(pickJormungandCombo('dash', 1, 100, () => 0)).toBeNull();
  });

  it('dash→coil→burst→radialだけを許す', () => {
    expect(pickJormungandCombo('radial', 2, 400, () => 0)).toBeNull();
    expect(pickJormungandCombo('coil', 2, 100, () => 0)).toBe('burst');
  });

  it('追撃技のゾーン重みが0ならnull', () => {
    expect(pickJormungandCombo('dash', 2, 900, () => 0)).toBeNull(); // coilは中/遠で重み0
  });

  it('60%未満で発火・以上でnull', () => {
    expect(pickJormungandCombo('dash', 2, 100, () => 0.59)).toBe('coil');
    expect(pickJormungandCombo('dash', 2, 100, () => 0.61)).toBeNull();
  });
});

describe('jormRadialSpinAngle — §6.28-7「螺旋の回転方向を常に時計回りで固定」(不変条件)', () => {
  it('正の定数を渡した時は単調増加(時計回り)', () => {
    expect(jormRadialSpinAngle(0, Math.PI / 16)).toBe(0);
    expect(jormRadialSpinAngle(3, Math.PI / 16)).toBeCloseTo(3 * (Math.PI / 16));
  });

  it('定数の符号が誤って負になっていても、実際の回転方向は反転しない(構造的に固定)', () => {
    const withNegativeConst = jormRadialSpinAngle(5, -Math.PI / 16);
    expect(withNegativeConst).toBeGreaterThan(0);
    expect(withNegativeConst).toBeCloseTo(5 * (Math.PI / 16));
  });
});
