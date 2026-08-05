import { describe, it, expect } from 'vitest';
import {
  rafiMoveEligible, rafiMoveWeight, pickRafiMove, pickRafiCombo,
  RAFI_MOVE_WEIGHTS, type RafiMove,
} from './rafiScript';

const ALL_MOVES: RafiMove[] = ['bone', 'jump', 'sweep'];
const BAND_SAMPLES = [60, 200, 450, 900]; // 密着/近/中/遠

// ==== v0.25.2609: 実走180秒×3ペルソナで Phase1 は bone 100%(jumpは0回)だった ==============
// 原因: ラフィは接近するので距離が300pxを超えず、jump(>300)が実戦で一度も適格にならなかった。
describe('RAFI_MOVE_WEIGHTS — 死に技を作らない不変条件', () => {
  it('Phase1でもどのゾーンに2本以上、Phase2では3本の技が生きている', () => {
    // ラフィは技が3つしか無く sweep はPhase2解禁なので、Phase1の下限は2本。
    for (const d of BAND_SAMPLES) {
      expect(ALL_MOVES.filter(m => rafiMoveEligible(m, d, 1)).length, `P1 d=${d}`).toBeGreaterThanOrEqual(2);
    }
    for (const d of [60, 200, 450]) {
      expect(ALL_MOVES.filter(m => rafiMoveEligible(m, d, 2)).length, `P2 d=${d}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('【最重要・再発防止】jumpは密着でも発動しうる(§6.28-8「二正面」の主題の担い手)', () => {
    expect(rafiMoveEligible('jump', 0, 1)).toBe(true);
    expect(rafiMoveEligible('jump', 60, 1)).toBe(true);
    expect(rafiMoveEligible('jump', 200, 1)).toBe(true);
  });

  it('全3技がアリーナの実効間合い(0〜565px)のどこかで発動しうる', () => {
    const reachable = [0, 60, 120, 200, 300, 400, 500, 565];
    for (const m of ALL_MOVES) {
      expect(reachable.some(d => rafiMoveEligible(m, d, 2)), `${m} がアリーナ内で発動不能`).toBe(true);
    }
  });

  it('すべての技が最低1つのゾーンで重み>0', () => {
    for (const m of ALL_MOVES) expect(Math.max(...Object.values(RAFI_MOVE_WEIGHTS[m])), m).toBeGreaterThan(0);
  });

  it('重みは非負', () => {
    for (const m of ALL_MOVES) for (const w of Object.values(RAFI_MOVE_WEIGHTS[m])) expect(w).toBeGreaterThanOrEqual(0);
  });
});

describe('rafiMoveWeight — 役割とフェーズゲートの維持', () => {
  it('sweepはPhase2限定(§6.28-8 #4・不変)', () => {
    for (const d of BAND_SAMPLES) expect(rafiMoveWeight('sweep', d, 1)).toBe(0);
    expect(rafiMoveWeight('sweep', 60, 2)).toBeGreaterThan(0);
  });
  it('jumpは遠が最重(追いつき技としての役割は維持)', () => {
    expect(rafiMoveWeight('jump', 900, 1)).toBeGreaterThan(rafiMoveWeight('jump', 60, 1));
    expect(Math.max(...ALL_MOVES.map(m => rafiMoveWeight(m, 900, 2)))).toBe(rafiMoveWeight('jump', 900, 2));
  });
  it('boneは全ゾーンで出る(主砲)', () => {
    for (const d of BAND_SAMPLES) expect(rafiMoveWeight('bone', d, 1)).toBeGreaterThan(0);
  });
  it('sweepは密着が最重(密着の答え)・遠では出ない', () => {
    expect(rafiMoveWeight('sweep', 60, 2)).toBeGreaterThan(rafiMoveWeight('sweep', 450, 2));
    expect(rafiMoveWeight('sweep', 900, 2)).toBe(0);
  });
});

describe('pickRafiMove', () => {
  it('注入した乱数で決定的に選べる(重み比例ルーレットの先頭=bone)', () => {
    expect(pickRafiMove(900, 1, true, () => 0)).toBe('bone');
  });
  it('Phase1の密着で bone / jump の両方が顔を出す(旧: bone100%)', () => {
    const seen = new Set<RafiMove>();
    for (let i = 0; i < 600; i++) {
      const m = pickRafiMove(60, 1, true);
      if (m) seen.add(m);
    }
    expect([...seen].sort()).toEqual(['bone', 'jump']);
  });
  it('Phase2の密着で3技すべてが顔を出す', () => {
    const seen = new Set<RafiMove>();
    for (let i = 0; i < 600; i++) {
      const m = pickRafiMove(60, 2, true);
      if (m) seen.add(m);
    }
    expect([...seen].sort()).toEqual(['bone', 'jump', 'sweep']);
  });
  it('薙ぎ専用CDが明けていない間はsweepを選ばない', () => {
    for (let i = 0; i < 200; i++) expect(pickRafiMove(60, 2, false)).not.toBe('sweep');
  });
});

describe('pickRafiCombo — Phase2の骨刃→跳躍→薙ぎ', () => {
  it('only fires in Phase2', () => {
    expect(pickRafiCombo('bone', 1, () => 0)).toBeNull();
  });
  it('fires under the chance threshold regardless of post-bone distance', () => {
    expect(pickRafiCombo('bone', 2, () => 0.64)).toBe('jump');
    expect(pickRafiCombo('bone', 2, () => 0.66)).toBeNull();
  });
  it('jumpの後だけsweepへ伸び、sweepで必ず終わる', () => {
    expect(pickRafiCombo('jump', 2, () => 0)).toBe('sweep');
    expect(pickRafiCombo('sweep', 2, () => 0)).toBeNull();
  });
});
