import { describe, expect, it } from 'vitest';
import {
  loggerZoneFor, loggerCanSweep, loggerSweepBand,
  LOGGER_APPROACH_DIST, LOGGER_BACKOFF_DIST, LOGGER_SWEEP_RANGE,
} from './loggerAi';

// PACING_PUZZLE.md §14-2③(伐採人の間合い=槍より少し近い。叩き台110〜150px)。
describe('loggerZoneFor (§14-2③ 間合い3分岐)', () => {
  it('approaches when farther than 150px', () => {
    expect(loggerZoneFor(151)).toBe('approach');
    expect(loggerZoneFor(500)).toBe('approach');
  });

  it('backs off when closer than 110px', () => {
    expect(loggerZoneFor(109)).toBe('backoff');
    expect(loggerZoneFor(0)).toBe('backoff');
  });

  it('holds inside the 110-150px band (inclusive)', () => {
    expect(loggerZoneFor(LOGGER_BACKOFF_DIST)).toBe('hold');
    expect(loggerZoneFor(130)).toBe('hold');
    expect(loggerZoneFor(LOGGER_APPROACH_DIST)).toBe('hold');
  });
});

describe('loggerCanSweep', () => {
  it('true at or under 160px, false beyond', () => {
    expect(loggerCanSweep(0)).toBe(true);
    expect(loggerCanSweep(LOGGER_SWEEP_RANGE)).toBe(true);
    expect(loggerCanSweep(LOGGER_SWEEP_RANGE + 0.1)).toBe(false);
  });
});

// PACING_PUZZLE.md §14-2②: 帯の長軸はプレイヤー方向と直交する(突きの型=同軸とは違う)。
describe('loggerSweepBand', () => {
  it('places the band center forwardOffset toward the player and perpendicular to it', () => {
    // プレイヤーが右側(pux=1,puy=0)にいる時、帯は縦方向(y軸)に伸びる。
    const band = loggerSweepBand(0, 0, 1, 0, 100, 50);
    expect(band.fx).toBeCloseTo(100);
    expect(band.tx).toBeCloseTo(100);
    expect(band.fy).toBeCloseTo(-50);
    expect(band.ty).toBeCloseTo(50);
  });

  it('rotates with the player direction (プレイヤーが上側=puy=-1)', () => {
    // プレイヤーが上(pux=0,puy=-1)にいる時、帯は横方向(x軸)に伸びる。
    const band = loggerSweepBand(0, 0, 0, -1, 100, 50);
    expect(band.fy).toBeCloseTo(-100);
    expect(band.ty).toBeCloseTo(-100);
    expect(Math.abs(band.fx - band.tx)).toBeCloseTo(100); // 半幅50×2=全長100
  });
});
