import { describe, it, expect } from 'vitest';
import { pickThorCombo, pickThorMove, thorComboChance, thorPhaseForHealth, pickThorPool, THOR_COMBO_NEAR_MAX } from './thorScript';

describe('thorPhaseForHealth — 3相(60%/40%・40%は既存THOR_LOWHP_FRAC流用)', () => {
  it('phase1 above 60%', () => {
    expect(thorPhaseForHealth(1)).toBe(1);
    expect(thorPhaseForHealth(0.61)).toBe(1);
  });
  it('phase2 between 40% and 60%', () => {
    expect(thorPhaseForHealth(0.6)).toBe(2);
    expect(thorPhaseForHealth(0.41)).toBe(2);
  });
  it('phase3 at or below 40%', () => {
    expect(thorPhaseForHealth(0.4)).toBe(3);
    expect(thorPhaseForHealth(0)).toBe(3);
  });
});

describe('thorComboChance — Phase2=50% / Phase3=70%', () => {
  it('phase2は0.5・phase3は0.7', () => {
    expect(thorComboChance(2)).toBeCloseTo(0.5);
    expect(thorComboChance(3)).toBeCloseTo(0.7);
  });
});

describe('pickThorCombo — 受け入れ条件(§6.28-10「分岐する連携」): 立ち位置で分岐が決まる', () => {
  it('phase1では連携しない', () => {
    expect(pickThorCombo('harai', 1, 100, () => 0)).toBeNull();
    expect(pickThorCombo('issen', 1, 100, () => 0)).toBeNull();
  });

  it('tsuki起点・jump相当(未対応の技名)は連携しない', () => {
    expect(pickThorCombo('tsuki', 2, 100, () => 0)).toBeNull();
  });

  it('harai(近<=250) → harai', () => {
    expect(pickThorCombo('harai', 2, 250, () => 0)).toBe('harai');
    expect(pickThorCombo('harai', 2, 0, () => 0)).toBe('harai');
  });

  it('harai(遠>250) → tsuki', () => {
    expect(pickThorCombo('harai', 2, 251, () => 0)).toBe('tsuki');
    expect(pickThorCombo('harai', 2, 900, () => 0)).toBe('tsuki');
  });

  it('issen(近<=250) → harai', () => {
    expect(pickThorCombo('issen', 2, 200, () => 0)).toBe('harai');
  });

  it('issen(遠>250) → 連携しない', () => {
    expect(pickThorCombo('issen', 2, 900, () => 0)).toBeNull();
  });

  it('phase2は確率50%閾値で発火判定', () => {
    expect(pickThorCombo('harai', 2, 100, () => 0.49)).toBe('harai');
    expect(pickThorCombo('harai', 2, 100, () => 0.51)).toBeNull();
  });

  it('phase3は確率70%閾値で発火判定(頻度だけが上がる=リード/硬直/判定は変えない)', () => {
    expect(pickThorCombo('harai', 3, 100, () => 0.69)).toBe('harai');
    expect(pickThorCombo('harai', 3, 100, () => 0.71)).toBeNull();
  });

  it('境界値: distance===THOR_COMBO_NEAR_MAXは近扱い', () => {
    expect(pickThorCombo('harai', 2, THOR_COMBO_NEAR_MAX, () => 0)).toBe('harai');
  });
});

describe('pickThorMove — 距離で刀の役割を変える', () => {
  it('密着では払い、遠距離では一閃が候補になりやすい', () => {
    const melee = Array.from({ length: 100 }, (_, i) => pickThorMove(60, 1, () => i / 100));
    const far = Array.from({ length: 100 }, (_, i) => pickThorMove(900, 1, () => i / 100));
    expect(melee).toContain('harai');
    expect(far).not.toContain('harai');
    expect(far.filter(m => m === 'issen').length).toBeGreaterThan(far.filter(m => m === 'tsuki').length);
  });
});

describe('pickThorPool — 既存の技選択プール(値は不変・純関数化のみ)', () => {
  it('払いが不可な間合いではissen/tsukiのみ', () => {
    expect(pickThorPool(false)).toEqual(['issen', 'tsuki']);
  });
  it('払いが可能な間合いでは払いも候補に入る', () => {
    expect(pickThorPool(true)).toEqual(['issen', 'tsuki', 'harai']);
  });
});
