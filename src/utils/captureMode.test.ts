import { describe, expect, it } from 'vitest';
import { getCaptureMode, parseCaptureMode, setCaptureMode } from './captureMode';

describe('captureMode', () => {
  it('既定は OFF・"1" の時だけ ON', () => {
    expect(parseCaptureMode(null)).toBe(false);
    expect(parseCaptureMode('0')).toBe(false);
    expect(parseCaptureMode('true')).toBe(false);
    expect(parseCaptureMode('1')).toBe(true);
  });
  it('set で切り替わる(保存できない環境でも落ちない)', () => {
    const before = getCaptureMode();
    setCaptureMode(!before);
    expect(getCaptureMode()).toBe(!before);
    setCaptureMode(before);
    expect(getCaptureMode()).toBe(before);
  });
});
