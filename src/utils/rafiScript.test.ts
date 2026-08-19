import { describe, it, expect } from 'vitest';
import {
  rafiMoveEligible, rafiMoveWeight, pickRafiMove, pickRafiCombo,
  RAFI_MOVE_WEIGHTS, type RafiMove,
} from './rafiScript';

const ALL_MOVES: RafiMove[] = ['bone', 'jump', 'roll', 'sweep'];
const BAND_SAMPLES = [60, 200, 450, 900]; // 密着/近/中/遠

// ==== v0.25.3593(社長裁定「近距離はなぎ払いとロール台本で。中距離遠距離がとびかかり、骨刃」)====
// 間合いで技を完全分担する。※旧裁定(v0.25.2609「jumpは密着でも出す」「boneは全ゾーン主砲」)は
// この裁定で上書きされた(事実として併記。当時の理由=実走でPhase1がbone100%だった)。
describe('RAFI_MOVE_WEIGHTS — 間合い分担(v0.25.3593裁定)の不変条件', () => {
  it('どのゾーンでもPhase2は2本以上の技が生きている(死にゾーンを作らない)', () => {
    for (const d of BAND_SAMPLES) {
      expect(ALL_MOVES.filter(m => rafiMoveEligible(m, d, 2)).length, `P2 d=${d}`).toBeGreaterThanOrEqual(2);
    }
    // Phase1はsweepがPhase2解禁のため近距離が roll のみ=下限1本(裁定の帰結・事実)。
    for (const d of BAND_SAMPLES) {
      expect(ALL_MOVES.filter(m => rafiMoveEligible(m, d, 1)).length, `P1 d=${d}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('【裁定v0.25.3593】近距離(密着/近)は sweep/roll のみ・中遠は jump/bone のみ', () => {
    for (const d of [60, 200]) {
      expect(rafiMoveEligible('jump', d, 2), `jump d=${d}`).toBe(false);
      expect(rafiMoveEligible('bone', d, 2), `bone d=${d}`).toBe(false);
      expect(rafiMoveEligible('roll', d, 2), `roll d=${d}`).toBe(true);
      expect(rafiMoveEligible('sweep', d, 2), `sweep d=${d}`).toBe(true);
    }
    for (const d of [450, 900]) {
      expect(rafiMoveEligible('jump', d, 2), `jump d=${d}`).toBe(true);
      expect(rafiMoveEligible('bone', d, 2), `bone d=${d}`).toBe(true);
      expect(rafiMoveEligible('roll', d, 2), `roll d=${d}`).toBe(false);
      expect(rafiMoveEligible('sweep', d, 2), `sweep d=${d}`).toBe(false);
    }
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
  it('boneは中遠の主砲(v0.25.3593裁定=近距離では出ない)', () => {
    for (const d of [450, 900]) expect(rafiMoveWeight('bone', d, 1)).toBeGreaterThan(0);
    for (const d of [60, 200]) expect(rafiMoveWeight('bone', d, 1)).toBe(0);
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
  it('Phase1の密着はロール台本のみ(sweepはPhase2解禁のままという既存裁定の帰結)', () => {
    const seen = new Set<RafiMove>();
    for (let i = 0; i < 200; i++) {
      const m = pickRafiMove(60, 1, true);
      if (m) seen.add(m);
    }
    expect([...seen].sort()).toEqual(['roll']);
  });
  it('Phase2の密着は sweep / roll の2本立て(v0.25.3593裁定)', () => {
    const seen = new Set<RafiMove>();
    for (let i = 0; i < 600; i++) {
      const m = pickRafiMove(60, 2, true);
      if (m) seen.add(m);
    }
    expect([...seen].sort()).toEqual(['roll', 'sweep']);
  });
  it('中距離は jump / bone の2本立て(v0.25.3593裁定)', () => {
    const seen = new Set<RafiMove>();
    for (let i = 0; i < 600; i++) {
      const m = pickRafiMove(450, 2, true);
      if (m) seen.add(m);
    }
    expect([...seen].sort()).toEqual(['bone', 'jump']);
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
