import { describe, it, expect } from 'vitest';
import {
  mimirMoveEligible, mimirMoveWeight, mimirPhaseForHealth, pickMimirMove, pickMimirCombo,
  MIMIR_MOVE_WEIGHTS, MIMIR_LASER_PHASE2_WEIGHT_MULT, type MimirMove,
} from './mimirScript';
import { BOSS_RANGE } from './bossScript';

const ALL_MOVES: MimirMove[] = ['bite', 'radial', 'burst', 'laser', 'dash'];
const allReady = (): Record<MimirMove, boolean> => ({ bite: true, radial: true, burst: true, laser: true, dash: true });
// 密着/近/中/遠の代表距離(BOSS_RANGE 120/300/600 基準)。
const BAND_SAMPLES = [60, 200, 450, 900];

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

// ==== v0.25.2609: 死に技の再発防止(監査の教訓の機械化) ====================================
// 旧実装は「密着帯 bite 100%・biteがCD中は候補ゼロ=無行動」だった。同じ事故を二度と作らない不変条件。
describe('MIMIR_MOVE_WEIGHTS — 死に技を作らない不変条件', () => {
  it('どのゾーンにも「生きている技」が3本以上ある(1本だけ=CD中に無行動、を禁止)', () => {
    for (const d of BAND_SAMPLES) {
      const live = ALL_MOVES.filter(m => mimirMoveEligible(m, d));
      expect(live.length, `distance=${d} の生存技=${live.join(',')}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('すべての技が最低1つのゾーンで重み>0(実装したのに一度も出ない技を作らない)', () => {
    for (const m of ALL_MOVES) {
      const zones = Object.values(MIMIR_MOVE_WEIGHTS[m]);
      expect(Math.max(...zones), `${m} が全ゾーンで重み0`).toBeGreaterThan(0);
    }
  });

  it('遠ゾーンに上限が無い(引き撃ちで完全に安全な距離を作らない)', () => {
    // 旧FAR_MAX=1000の頭打ちを撤廃。どれだけ離れても必ず何かが飛んでくる。
    expect(ALL_MOVES.some(m => mimirMoveEligible(m, 5000))).toBe(true);
  });

  it('重みは非負(表の書き間違い検知)', () => {
    for (const m of ALL_MOVES) for (const w of Object.values(MIMIR_MOVE_WEIGHTS[m])) expect(w).toBeGreaterThanOrEqual(0);
  });
});

describe('mimirMoveWeight — 役割の維持', () => {
  it('bite は密着が最重(密着帯を塞ぐ担い手・§6.28-5)', () => {
    const melee = ALL_MOVES.map(m => mimirMoveWeight(m, 60, 1));
    expect(Math.max(...melee)).toBe(mimirMoveWeight('bite', 60, 1));
  });
  it('dash は遠が最重・密着では出ない(追いつき技=城ボス準拠)', () => {
    expect(mimirMoveWeight('dash', BOSS_RANGE.MELEE_MAX, 1)).toBe(0);
    const far = ALL_MOVES.map(m => mimirMoveWeight(m, 900, 1));
    expect(Math.max(...far)).toBe(mimirMoveWeight('dash', 900, 1));
  });
  it('laser は全ゾーンで出る(安全な間合いを作らせない)', () => {
    for (const d of BAND_SAMPLES) expect(mimirMoveWeight('laser', d, 1)).toBeGreaterThan(0);
  });
  it('Phase2でlaserの重みが1.5倍(旧: 抽選確率0.34→0.50の意味を重みで保存)', () => {
    for (const d of BAND_SAMPLES) {
      expect(mimirMoveWeight('laser', d, 2)).toBeCloseTo(mimirMoveWeight('laser', d, 1) * MIMIR_LASER_PHASE2_WEIGHT_MULT);
    }
  });
  it('laser以外はフェーズで重みが変わらない', () => {
    for (const m of ALL_MOVES.filter(x => x !== 'laser')) {
      for (const d of BAND_SAMPLES) expect(mimirMoveWeight(m, d, 2)).toBe(mimirMoveWeight(m, d, 1));
    }
  });
});

describe('pickMimirMove', () => {
  it('rand=0 は重み表の先頭候補(bite)を返す=重み比例ルーレットの順序が定義どおり', () => {
    expect(pickMimirMove(60, 1, allReady(), () => 0)).toBe('bite');
  });

  it('biteがCD中でも密着で他の技が出る(旧実装の「無行動」バグの再発防止)', () => {
    const ready = allReady(); ready.bite = false;
    for (let i = 0; i < 50; i++) expect(pickMimirMove(60, 1, ready)).not.toBeNull();
  });

  it('CD明けの技が1つも無ければnull', () => {
    const ready: Record<MimirMove, boolean> = { bite: false, radial: false, burst: false, laser: false, dash: false };
    expect(pickMimirMove(60, 1, ready)).toBeNull();
  });

  it('readyでない技は絶対に選ばれない', () => {
    const ready = allReady(); ready.laser = false;
    for (let i = 0; i < 200; i++) expect(pickMimirMove(450, 1, ready)).not.toBe('laser');
  });

  it('密着帯で4技すべてが顔を出す', () => {
    const seen = new Set<MimirMove>();
    for (let i = 0; i < 600; i++) {
      const m = pickMimirMove(60, 1, allReady());
      if (m) seen.add(m);
    }
    expect([...seen].sort()).toEqual(['bite', 'burst', 'laser', 'radial']);
  });
});

describe('pickMimirCombo — Phase2の最大3段連携', () => {
  it('phase1では連携しない', () => {
    expect(pickMimirCombo('dash', 1, 100, () => 0)).toBeNull();
    expect(pickMimirCombo('radial', 1, 400, () => 0)).toBeNull();
  });

  it('dash→bite→burst と radial→laser だけを許す', () => {
    expect(pickMimirCombo('bite', 2, 100, () => 0)).toBe('burst');
    expect(pickMimirCombo('burst', 2, 400, () => 0)).toBeNull();
    expect(pickMimirCombo('laser', 2, 800, () => 0)).toBeNull();
  });

  it('追撃技のゾーン重みが0ならnull(「まだその技の間合いに居るなら」の読み替え)', () => {
    expect(pickMimirCombo('dash', 2, 900, () => 0)).toBeNull(); // biteは中/遠で重み0
  });

  it('55%未満で発火・以上でnull', () => {
    expect(pickMimirCombo('dash', 2, 100, () => 0.54)).toBe('bite');
    expect(pickMimirCombo('dash', 2, 100, () => 0.56)).toBeNull();
    expect(pickMimirCombo('radial', 2, 400, () => 0.54)).toBe('laser');
  });
});
