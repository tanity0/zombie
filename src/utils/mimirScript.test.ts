import { describe, it, expect } from 'vitest';
import {
  mimirMoveEligible, mimirLaserChance, mimirPhaseForHealth, pickMimirMove, pickMimirCombo, MIMIR_RANGE, type MimirMove,
} from './mimirScript';

describe('mimirPhaseForHealth — 2相(60%)', () => {
  it('phase1 above 60%', () => {
    expect(mimirPhaseForHealth(1)).toBe(1);
    expect(mimirPhaseForHealth(0.61)).toBe(1);
  });
  it('phase2 at or below 60%', () => {
    expect(mimirPhaseForHealth(0.6)).toBe(2);
    expect(mimirPhaseForHealth(0)).toBe(2);
  });
});

const allReady = (): Record<MimirMove, boolean> => ({ bite: true, radial: true, burst: true, laser: true, dash: true });

describe('mimirMoveEligible — 受け入れ条件①: 各帯に必ず1つ以上の技がある(密着=噛みつきでハメを潰す)', () => {
  const bandSamples = [80, 260, 470, 800]; // 密着/近/中/遠の代表距離
  const ALL_MOVES: MimirMove[] = ['bite', 'radial', 'burst', 'laser', 'dash'];

  it('every band has at least one eligible move', () => {
    for (const d of bandSamples) {
      expect(ALL_MOVES.some(m => mimirMoveEligible(m, d))).toBe(true);
    }
  });

  it('密着帯(0〜200)はbite専用=ハメ間合いが存在しない', () => {
    expect(mimirMoveEligible('bite', 0)).toBe(true);
    expect(mimirMoveEligible('bite', 200)).toBe(true);
    expect(mimirMoveEligible('bite', 201)).toBe(false);
    // 密着帯では他の技は一切適格でない(=噛みつきが唯一の担い手)。
    expect(mimirMoveEligible('radial', 150)).toBe(false);
    expect(mimirMoveEligible('burst', 150)).toBe(false);
    expect(mimirMoveEligible('laser', 150)).toBe(false);
    expect(mimirMoveEligible('dash', 150)).toBe(false);
  });

  it('遠帯(>620)はlaser/dashのみ', () => {
    expect(mimirMoveEligible('laser', 800)).toBe(true);
    expect(mimirMoveEligible('dash', 800)).toBe(true);
    expect(mimirMoveEligible('radial', 800)).toBe(false);
    expect(mimirMoveEligible('burst', 800)).toBe(false);
  });

  it('FAR_MAXの外は誰も適格でない(既存の帯の慣例=頭打ち)', () => {
    const ALL: MimirMove[] = ['bite', 'radial', 'burst', 'laser', 'dash'];
    expect(ALL.some(m => mimirMoveEligible(m, MIMIR_RANGE.FAR_MAX + 500))).toBe(false);
  });
});

describe('mimirLaserChance — フェーズで0.34→0.50(§6.28-5フェーズ表)', () => {
  it('phase1=0.34 / phase2=0.50', () => {
    expect(mimirLaserChance(1)).toBeCloseTo(0.34);
    expect(mimirLaserChance(2)).toBeCloseTo(0.5);
  });
});

describe('pickMimirMove', () => {
  it('密着では常にbiteが選ばれる(readyな限り)', () => {
    expect(pickMimirMove(100, 1, allReady(), () => 0.99)).toBe('bite');
  });

  it('biteがreadyでなければ密着では何も選ばれない(CD明け待ち)', () => {
    const ready = allReady(); ready.bite = false;
    expect(pickMimirMove(100, 1, ready)).toBeNull();
  });

  it('遠帯でレーザーの確率ロールを外すとdashへフォールする', () => {
    // rand()の1回目=laserロール(外れ=0.9>=0.34)、2回目=pickEligibleMoveの選択(遠帯はdashのみ適格)。
    const seq = [0.9, 0.5];
    let i = 0;
    const rand = () => seq[i++];
    expect(pickMimirMove(800, 1, allReady(), rand)).toBe('dash');
  });

  it('レーザーの確率ロールに当たれば距離が適格な限りlaserを返す', () => {
    expect(pickMimirMove(500, 1, allReady(), () => 0)).toBe('laser');
  });

  it('laserがready=falseなら確率ロールを行わずプールへフォールする', () => {
    const ready = allReady(); ready.laser = false;
    // 350は中帯かつdash圏外(<=420): burst/radialが適格。laserは除外されるのでプールから選ばれる。
    const pick = pickMimirMove(350, 1, ready, () => 0);
    expect(pick === 'burst' || pick === 'radial').toBe(true);
  });

  it('何も適格/readyでなければnull', () => {
    const ready: Record<MimirMove, boolean> = { bite: false, radial: false, burst: false, laser: false, dash: false };
    expect(pickMimirMove(100, 1, ready)).toBeNull();
  });
});

describe('pickMimirCombo — 受け入れ条件(§6.28-5): Phase2のみ・確率40%・2組のみ', () => {
  it('phase1では連携しない', () => {
    expect(pickMimirCombo('dash', 1, 100, () => 0)).toBeNull();
    expect(pickMimirCombo('radial', 1, 400, () => 0)).toBeNull();
  });

  it('許す組み合わせは dash→bite / radial→laser の2組のみ', () => {
    expect(pickMimirCombo('bite', 2, 100, () => 0)).toBeNull();
    expect(pickMimirCombo('burst', 2, 400, () => 0)).toBeNull();
    expect(pickMimirCombo('laser', 2, 800, () => 0)).toBeNull();
  });

  it('追撃技の間合いにまだ居なければnull(giantと同じ「間合いに居るなら」の作法)', () => {
    // dash→biteはbite帯(<=200)必須。800は範囲外。
    expect(pickMimirCombo('dash', 2, 800, () => 0)).toBeNull();
    // radial→laserはlaser帯(>320)必須。100は範囲外。
    expect(pickMimirCombo('radial', 2, 100, () => 0)).toBeNull();
  });

  it('40%未満で発火・以上でnull', () => {
    expect(pickMimirCombo('dash', 2, 100, () => 0.39)).toBe('bite');
    expect(pickMimirCombo('dash', 2, 100, () => 0.41)).toBeNull();
    expect(pickMimirCombo('radial', 2, 400, () => 0.39)).toBe('laser');
  });
});
