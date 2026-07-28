import { describe, it, expect } from 'vitest';
import {
  skadiMoveEligible, skadiPhaseForHealth, pickSkadiMove, pickSkadiCombo, skadiComboChance,
  SKADI_RANGE, type SkadiMove,
} from './skadiScript';

const allReady = (): Record<SkadiMove, boolean> => ({ ice: true, blade: true, dash: true, burst: true, radial: true, cage: true });

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

describe('skadiMoveEligible — 受け入れ条件①: 各帯に必ず1つ以上の技がある(ice/bladeが全帯を常時カバー)', () => {
  const ALL_MOVES: SkadiMove[] = ['ice', 'blade', 'dash', 'burst', 'radial', 'cage'];
  const bandSamples = [80, 260, 470, 800];

  it('全フェーズ・全帯でice/bladeが適格(ハメ間合いが無い)', () => {
    for (const phase of [1, 2, 3] as const) {
      for (const d of bandSamples) {
        expect(skadiMoveEligible('ice', d, phase)).toBe(true);
        expect(skadiMoveEligible('blade', d, phase)).toBe(true);
        expect(ALL_MOVES.some(m => skadiMoveEligible(m, d, phase))).toBe(true);
      }
    }
  });

  it('cageはphase3のみ・全帯', () => {
    expect(skadiMoveEligible('cage', 50, 1)).toBe(false);
    expect(skadiMoveEligible('cage', 50, 2)).toBe(false);
    expect(skadiMoveEligible('cage', 50, 3)).toBe(true);
    expect(skadiMoveEligible('cage', 900, 3)).toBe(true);
  });

  it('burst/radialは中帯(320〜620)のみ・dashは遠帯(>420)のみ', () => {
    expect(skadiMoveEligible('burst', 470, 1)).toBe(true);
    expect(skadiMoveEligible('burst', 800, 1)).toBe(false);
    expect(skadiMoveEligible('dash', 800, 1)).toBe(true);
    expect(skadiMoveEligible('dash', 300, 1)).toBe(false);
  });

  it('FAR_MAXの外はdash/burst/radialが不適格(ice/blade/cageは影響を受けない)', () => {
    expect(skadiMoveEligible('dash', SKADI_RANGE.FAR_MAX + 500, 1)).toBe(false);
    expect(skadiMoveEligible('ice', SKADI_RANGE.FAR_MAX + 500, 1)).toBe(true);
  });
});

describe('pickSkadiMove', () => {
  it('phase3でcageがreadyなら最優先で選ばれる', () => {
    expect(pickSkadiMove(300, 3, allReady(), () => 0.99)).toBe('cage');
  });

  it('cageがreadyでなければ氷攻撃ロールへフォールする', () => {
    const ready = allReady(); ready.cage = false;
    // rand: 1回目=氷判定ロール(0<0.5=当たり)、2回目=ice/blade選択(0<0.5=ice)
    expect(pickSkadiMove(300, 3, ready, () => 0)).toBe('ice');
  });

  it('氷攻撃ロールを外すと帯ゲートされたdash/burst/radialプールへ', () => {
    const ready = allReady();
    const seq = [0.9, 0.1]; // 1回目=氷判定(外れ)、2回目=pickEligibleMoveの選択
    let i = 0;
    const pick = pickSkadiMove(800, 1, ready, () => seq[i++]);
    expect(pick).toBe('dash'); // 800は遠帯: dashのみ適格
  });

  it('iceかbladeどちらかがreadyでなければ氷判定ロールを行わない', () => {
    const ready = allReady(); ready.ice = false;
    const pick = pickSkadiMove(800, 1, ready, () => 0); // 氷判定を通っても選ばれない設計
    expect(pick).toBe('dash');
  });
});

describe('skadiComboChance — Phase2=50% / Phase3=60%', () => {
  it('phase2は0.5', () => { expect(skadiComboChance(2)).toBeCloseTo(0.5); });
  it('phase3は0.6', () => { expect(skadiComboChance(3)).toBeCloseTo(0.6); });
});

describe('pickSkadiCombo — 受け入れ条件: Phase2以降のみ・組は氷塊→氷刃/突進→氷塊のみ', () => {
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
