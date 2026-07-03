import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordDirectorSample, getDirectorSamples, resetDirectorSamples, DIRECTOR_EVENT_BIT,
} from './aiDirectorDebug';

describe('aiDirectorDebug samples (PACING_REDESIGN.mdバッチ2.5 診断計測)', () => {
  beforeEach(() => {
    resetDirectorSamples();
  });

  it('starts empty', () => {
    expect(getDirectorSamples()).toEqual([]);
  });

  it('records phaseKind/pressure/areaIdx/events alongside the existing fields', () => {
    recordDirectorSample({
      t: 1, intensity: 0.5, performance: 0.4, macro: 'buildup',
      phaseKind: 'gate', pressure: 0.62, areaIdx: 2,
      events: DIRECTOR_EVENT_BIT.hunter | DIRECTOR_EVENT_BIT.redNight,
      debt: 0,
      upswing: 0,
      gateProgramId: null,
    });
    const [s] = getDirectorSamples();
    expect(s.phaseKind).toBe('gate');
    expect(s.pressure).toBe(0.62);
    expect(s.areaIdx).toBe(2);
    expect(s.events & DIRECTOR_EVENT_BIT.hunter).toBeTruthy();
    expect(s.events & DIRECTOR_EVENT_BIT.redNight).toBeTruthy();
    expect(s.events & DIRECTOR_EVENT_BIT.arena).toBeFalsy();
  });

  it('records debt (バッチ3.5-B: 盤面在庫)', () => {
    recordDirectorSample({ t: 1, intensity: 0.5, performance: 0.4, macro: 'buildup', phaseKind: 'gate', pressure: 0.3, areaIdx: 1, events: 0, debt: 7.5, upswing: 0, gateProgramId: null });
    expect(getDirectorSamples()[0].debt).toBe(7.5);
  });

  it('records upswing (バッチ6小物: 診断グラフのup+N線)', () => {
    recordDirectorSample({ t: 1, intensity: 0.5, performance: 0.4, macro: 'buildup', phaseKind: 'gate', pressure: 0.3, areaIdx: 1, events: 0, debt: 0, upswing: 6, gateProgramId: null });
    expect(getDirectorSamples()[0].upswing).toBe(6);
  });

  it('pressure is null outside gate phases (緩フェーズは対象外)', () => {
    recordDirectorSample({ t: 1, intensity: 0.2, performance: 0.5, macro: 'relax', phaseKind: 'buildup', pressure: null, areaIdx: 0, events: 0, debt: 0, upswing: 0, gateProgramId: null });
    expect(getDirectorSamples()[0].pressure).toBeNull();
  });

  it('records gateProgramId (PACING_V2.mdバッチR3: 診断グラフ用の関所台本id)', () => {
    recordDirectorSample({ t: 1, intensity: 0.5, performance: 0.4, macro: 'buildup', phaseKind: 'gate', pressure: 0.3, areaIdx: 1, events: 0, debt: 0, upswing: 0, gateProgramId: 'gate-number' });
    expect(getDirectorSamples()[0].gateProgramId).toBe('gate-number');
  });

  it('caps the ring buffer at 3000 and drops the oldest', () => {
    for (let i = 0; i < 3002; i++) {
      recordDirectorSample({ t: i, intensity: 0, performance: 0, macro: 'buildup', phaseKind: 'buildup', pressure: null, areaIdx: 0, events: 0, debt: 0, upswing: 0, gateProgramId: null });
    }
    const samples = getDirectorSamples();
    expect(samples.length).toBe(3000);
    expect(samples[0].t).toBe(2);
  });

  it('resetDirectorSamples clears the buffer (new-run reset)', () => {
    recordDirectorSample({ t: 1, intensity: 0, performance: 0, macro: 'buildup', phaseKind: 'buildup', pressure: null, areaIdx: 0, events: 0, debt: 0, upswing: 0, gateProgramId: null });
    resetDirectorSamples();
    expect(getDirectorSamples()).toEqual([]);
  });
});
