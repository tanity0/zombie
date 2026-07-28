import { describe, it, expect } from 'vitest';
import {
  jormungandMoveEligible, pickJormungandMove, pickJormungandCombo, jormRadialSpinAngle, jormungandPhaseForHealth,
  JORM_RANGE, type JormungandMove,
} from './jormungandScript';

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

const allReady = (): Record<JormungandMove, boolean> => ({ radial: true, burst: true, dash: true, coil: true });

describe('jormungandMoveEligible — 受け入れ条件①(Phase2到達後): 各帯に必ず1つ以上の技がある', () => {
  const ALL_MOVES: JormungandMove[] = ['radial', 'burst', 'dash', 'coil'];
  const bandSamples = [80, 260, 470, 800]; // 密着/近/中/遠の代表距離

  it('phase2では全帯に技がある(coilが密着/近を埋める)', () => {
    for (const d of bandSamples) {
      expect(ALL_MOVES.some(m => jormungandMoveEligible(m, d, 2))).toBe(true);
    }
  });

  it('【設計裁定で解消】phase1でも近帯(0〜320)にcoilがある=ハメ間合いが無い。'
    + 'うねりは密着帯のハメを塞ぐために足された技なのでPhase1から使える(§6.28-7 #4の自己矛盾を解消)。',
  () => {
    expect(jormungandMoveEligible('coil', 100, 1)).toBe(true);
    expect(ALL_MOVES.some(m => jormungandMoveEligible(m, 100, 1))).toBe(true);
  });

  it('phase1でも全帯に技がある(密着/近/中/遠)', () => {
    for (const d of bandSamples) {
      expect(ALL_MOVES.some(m => jormungandMoveEligible(m, d, 1))).toBe(true);
    }
  });

  it('中帯(320〜620)はphase1から扇/螺旋が届く', () => {
    expect(jormungandMoveEligible('burst', 470, 1)).toBe(true);
    expect(jormungandMoveEligible('radial', 470, 1)).toBe(true);
  });

  it('coilはフェーズを問わず近帯のみ(Phase2限定ではない)', () => {
    expect(jormungandMoveEligible('coil', 320, 2)).toBe(true);
    expect(jormungandMoveEligible('coil', 321, 2)).toBe(false);
    expect(jormungandMoveEligible('coil', 100, 1)).toBe(true);
    expect(jormungandMoveEligible('coil', 321, 1)).toBe(false);
  });

  it('FAR_MAXの外は誰も適格でない', () => {
    const ALL_MOVES: JormungandMove[] = ['radial', 'burst', 'dash', 'coil'];
    expect(ALL_MOVES.some(m => jormungandMoveEligible(m, JORM_RANGE.FAR_MAX + 500, 2))).toBe(false);
  });
});

describe('pickJormungandMove', () => {
  it('近帯・phase1ではcoilが選ばれる(readyな限り)', () => {
    expect(pickJormungandMove(100, 1, allReady())).toBe('coil');
  });

  it('遠帯ではdash/radialから等確率で選ばれる(readyな限り)', () => {
    const pick = pickJormungandMove(800, 2, allReady(), () => 0);
    expect(['dash', 'radial']).toContain(pick);
  });

  it('readyでない技は選ばれない', () => {
    const ready = allReady(); ready.coil = false;
    expect(pickJormungandMove(100, 2, ready)).toBeNull();
  });
});

describe('pickJormungandCombo — 受け入れ条件: Phase2のみ・確率50%・2組のみ', () => {
  it('phase1では連携しない', () => {
    expect(pickJormungandCombo('dash', 1, 100, () => 0)).toBeNull();
  });

  it('許す組み合わせはdash→coil / burst→radialのみ', () => {
    expect(pickJormungandCombo('radial', 2, 400, () => 0)).toBeNull();
    expect(pickJormungandCombo('coil', 2, 100, () => 0)).toBeNull();
  });

  it('追撃技の間合いに居なければnull', () => {
    expect(pickJormungandCombo('dash', 2, 800, () => 0)).toBeNull(); // coilは近帯(<=320)のみ
    expect(pickJormungandCombo('burst', 2, 100, () => 0)).toBeNull(); // radialは近帯超(>320)のみ
  });

  it('50%未満で発火・以上でnull', () => {
    expect(pickJormungandCombo('dash', 2, 100, () => 0.49)).toBe('coil');
    expect(pickJormungandCombo('dash', 2, 100, () => 0.51)).toBeNull();
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

  it('回数が増えるほど単調に増える(逆回転が混ざらない)', () => {
    const angles = [0, 1, 2, 3, 4].map(i => jormRadialSpinAngle(i, Math.PI / 16));
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i]).toBeGreaterThan(angles[i - 1]);
    }
  });
});
