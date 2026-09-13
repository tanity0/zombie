import { describe, it, expect } from 'vitest';
import {
  coilConvergeMs, coilPelletAmplitudePx, coilLateralOffsetPx,
  COIL_CONVERGE_PX, COIL_AMPLITUDE_PX,
} from './coilShotgun';

describe('coilConvergeMs(収束時間Tを弾速から導く)', () => {
  it('弾速705px/s(=470×1.5)なら T≈198.6ms(140÷705×1000)', () => {
    expect(coilConvergeMs(705)).toBeCloseTo((COIL_CONVERGE_PX / 705) * 1000, 6);
    expect(coilConvergeMs(705)).toBeCloseTo(198.58, 1);
  });

  it('弾速を上げるとTは短くなる(収束"点"=140pxは動かない・弾速だけが変わる)', () => {
    expect(coilConvergeMs(1400)).toBeLessThan(coilConvergeMs(700));
  });

  it('弾速0以下はT=0(直進のみ)', () => {
    expect(coilConvergeMs(0)).toBe(0);
    expect(coilConvergeMs(-10)).toBe(0);
  });
});

describe('coilPelletAmplitudePx(振幅の等間隔割り振り)', () => {
  it('9発なら-44〜+44を等間隔(-44,-33,...,44)に割り振る', () => {
    const amps = Array.from({ length: 9 }, (_, i) => coilPelletAmplitudePx(i, 9));
    expect(amps[0]).toBeCloseTo(-44, 6);
    expect(amps[8]).toBeCloseTo(44, 6);
    expect(amps[4]).toBeCloseTo(0, 6); // 中心弾=振幅0
    expect(amps[1]).toBeCloseTo(-33, 6);
    expect(amps[7]).toBeCloseTo(33, 6);
  });

  it('count<=1は振幅0(広がりようがない)', () => {
    expect(coilPelletAmplitudePx(0, 1)).toBe(0);
    expect(coilPelletAmplitudePx(0, 0)).toBe(0);
  });

  it('COIL_AMPLITUDE_PX=44が最大振幅', () => {
    expect(COIL_AMPLITUDE_PX).toBe(44);
    const amps = Array.from({ length: 5 }, (_, i) => coilPelletAmplitudePx(i, 5));
    for (const a of amps) expect(Math.abs(a)).toBeLessThanOrEqual(44 + 1e-9);
  });
});

describe('coilLateralOffsetPx(横ズレ=lateral(t)=A×sin(π×min(t/T,1)))', () => {
  const A = 44;
  const T = 200;

  it('★受け入れ条件: t=0 で横ズレ0', () => {
    expect(coilLateralOffsetPx(A, 0, T)).toBe(0);
  });

  it('★受け入れ条件: t=T で全ペレットの横ズレが0になる', () => {
    expect(coilLateralOffsetPx(A, T, T)).toBeCloseTo(0, 6);
    expect(coilLateralOffsetPx(-A, T, T)).toBeCloseTo(0, 6);
    expect(coilLateralOffsetPx(0, T, T)).toBe(0);
  });

  it('t=T/2(中間)で最大振幅に達する(sinの山)', () => {
    expect(coilLateralOffsetPx(A, T / 2, T)).toBeCloseTo(A, 6);
  });

  it('t>T(収束後)は横ズレ0のまま(直進)', () => {
    expect(coilLateralOffsetPx(A, T + 50, T)).toBeCloseTo(0, 6);
    expect(coilLateralOffsetPx(A, T * 5, T)).toBeCloseTo(0, 6);
  });

  it('負の振幅(内側ペレット)は符号だけ反転して対称', () => {
    const pos = coilLateralOffsetPx(A, T / 4, T);
    const neg = coilLateralOffsetPx(-A, T / 4, T);
    expect(neg).toBeCloseTo(-pos, 10);
  });

  it('慣性(sin): 増分が一定ではない(等速でない=CLAUDE.md「動きの絶対ルール」)', () => {
    const a = coilLateralOffsetPx(A, 10, T) - coilLateralOffsetPx(A, 0, T);
    const b = coilLateralOffsetPx(A, T / 2 + 10, T) - coilLateralOffsetPx(A, T / 2, T);
    expect(a).not.toBeCloseTo(b, 3);
  });

  it('convergeMs<=0は常に0(収束時間が求まらない=直進)', () => {
    expect(coilLateralOffsetPx(A, 50, 0)).toBe(0);
    expect(coilLateralOffsetPx(A, 50, -10)).toBe(0);
  });
});
