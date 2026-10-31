import { describe, it, expect } from 'vitest';
import {
  uriMoveEligible, uriMoveWeight, pickUriMove, pickUriCombo, uriSweepInnerRadius,
  URI_MOVE_WEIGHTS, type UriMove,
} from './uriScript';
import { BOSS_RANGE } from './bossScript';

const ALL_MOVES: UriMove[] = ['sweep', 'downslash', 'thrust', 'bolt'];
const BAND_SAMPLES = [60, 200, 450, 900]; // 密着/近/中/遠

// ==== v0.25.2609: ウリは監査で最も壊れていた(実走180秒×3ペルソナで bolt 100%・他3技0回) ====
// うち thrust は「620px超」という**アリーナ最大分離565pxを超える条件**で、理論上も発動不能だった。
describe('URI_MOVE_WEIGHTS — 死に技を作らない不変条件', () => {
  it('どのゾーンにも生きている技が3本以上ある(旧: 密着はboltの1本だけ)', () => {
    for (const d of BAND_SAMPLES) {
      const live = ALL_MOVES.filter(m => uriMoveEligible(m, d));
      expect(live.length, `distance=${d} の生存技=${live.join(',')}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('すべての技が最低1つのゾーンで重み>0', () => {
    for (const m of ALL_MOVES) expect(Math.max(...Object.values(URI_MOVE_WEIGHTS[m])), m).toBeGreaterThan(0);
  });

  it('【最重要・再発防止】thrustはゲート2アリーナの実効間合いで必ず発動しうる', () => {
    // ゲート2アリーナ: ボス maxR=265 / プレイヤー半径300 → 最大分離565px。
    // 旧実装は thrust の下限が620pxで、この範囲に**一度も入らなかった**。
    const ARENA_MAX_SEPARATION = 565;
    const reachable = [0, 100, 200, 300, 400, 500, ARENA_MAX_SEPARATION];
    expect(reachable.some(d => uriMoveEligible('thrust', d)), 'thrustがアリーナ内で発動不能').toBe(true);
  });

  it('全4技がアリーナの実効間合い(0〜565px)のどこかで発動しうる', () => {
    const reachable = [0, 60, 120, 200, 300, 400, 500, 565];
    for (const m of ALL_MOVES) {
      expect(reachable.some(d => uriMoveEligible(m, d)), `${m} がアリーナ内で発動不能`).toBe(true);
    }
  });

  it('重みは非負', () => {
    for (const m of ALL_MOVES) for (const w of Object.values(URI_MOVE_WEIGHTS[m])) expect(w).toBeGreaterThanOrEqual(0);
  });
});

describe('uriMoveWeight — 役割の維持(§6.28-17「懐が安全」の主題を壊さない)', () => {
  it('boltは全ゾーンで出る(ハメ間合いを作らない唯一の担い手・不変)', () => {
    for (const d of [0, 50, 200, 320, 500, 620, 900, 5000]) expect(uriMoveWeight('bolt', d)).toBeGreaterThan(0);
  });
  it('密着の主役は downslash(内径なし)であって sweep(内径あり)ではない', () => {
    // 大薙ぎには内径140/90pxがあり密着では構造的に当たらない。密着の答えは内径なしの振り下ろし。
    expect(uriMoveWeight('downslash', 60)).toBeGreaterThan(uriMoveWeight('sweep', 60));
  });
  it('sweepは密着にも薄く残る(内径で抜けられることを見せる学習装置)', () => {
    expect(uriMoveWeight('sweep', 60)).toBeGreaterThan(0);
  });
  it('thrustは追いつき技=遠が最重・密着では出ない', () => {
    expect(uriMoveWeight('thrust', BOSS_RANGE.MELEE_MAX)).toBe(0);
    expect(Math.max(...ALL_MOVES.map(m => uriMoveWeight(m, 900)))).toBe(uriMoveWeight('thrust', 900));
  });
});

describe('uriSweepInnerRadius (§6.28-17 Phase2: 140→90・不変)', () => {
  it('shrinks in phase 2, technique count unchanged', () => {
    expect(uriSweepInnerRadius(1)).toBe(140);
    expect(uriSweepInnerRadius(2)).toBe(90);
  });
});

describe('pickUriMove', () => {
  it('注入した乱数で決定的に選べる(重み比例ルーレットの先頭=sweep)', () => {
    expect(pickUriMove(200, () => 0)).toBe('sweep');
  });
  it('密着で3技すべてが顔を出す(旧: bolt100%)', () => {
    const seen = new Set<UriMove>();
    for (let i = 0; i < 600; i++) {
      const m = pickUriMove(60);
      if (m) seen.add(m);
    }
    expect([...seen].sort()).toEqual(['bolt', 'downslash', 'sweep']);
  });
  it('どの距離でもnullにならない(ウリは技ごとの個別CDを持たない)', () => {
    for (const d of [0, 60, 120, 300, 600, 900, 5000]) expect(pickUriMove(d)).not.toBeNull();
  });
});

describe('pickUriCombo — 大薙ぎ→振り下ろし→突き', () => {
  it('最大3段で終わり、各リンクは65%で発火する', () => {
    expect(pickUriCombo('sweep', 1, () => 0.64)).toBe('downslash');
    expect(pickUriCombo('sweep', 1, () => 0.66)).toBeNull();
    expect(pickUriCombo('downslash', 1, () => 0)).toBeNull();
    expect(pickUriCombo('downslash', 2, () => 0)).toBe('thrust');
    expect(pickUriCombo('thrust', 2, () => 0)).toBeNull();
  });
});
