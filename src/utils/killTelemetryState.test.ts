import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordKill, getKillTotals, resetKillTelemetry, getCurrentStyle,
  setPhaseKillDebug, getPhaseKillDebug, resetPhaseKillDebug,
} from './killTelemetryState';

describe('killTelemetryState (PACING_REDESIGN.mdバッチ2 singleton)', () => {
  beforeEach(() => {
    resetKillTelemetry();
    resetPhaseKillDebug();
  });

  it('starts at zero for every bucket', () => {
    const t = getKillTotals();
    expect(t.gunKills).toBe(0);
    expect(t.meleeKills).toBe(0);
    expect(t.byBucket).toEqual({ pumpkin: 0, werewolf: 0, plant: 0, ghost: 0, screamer: 0, chaff: 0 });
  });

  it('accumulates kills by type and method independently', () => {
    recordKill('pumpkin', 'gun');
    recordKill('pumpkin', 'melee');
    recordKill('zombie', 'gun');
    const t = getKillTotals();
    expect(t.byBucket.pumpkin).toBe(2);
    expect(t.byBucket.chaff).toBe(1);
    expect(t.gunKills).toBe(2);
    expect(t.meleeKills).toBe(1);
  });

  it('resetKillTelemetry clears the running totals (new-run reset)', () => {
    recordKill('werewolf', 'melee');
    resetKillTelemetry();
    expect(getKillTotals()).toEqual({
      byBucket: { pumpkin: 0, werewolf: 0, plant: 0, ghost: 0, screamer: 0, chaff: 0 },
      gunKills: 0,
      meleeKills: 0,
    });
  });

  it('getCurrentStyle reflects the live cumulative ratio', () => {
    for (let i = 0; i < 8; i++) recordKill('zombie', 'melee');
    for (let i = 0; i < 2; i++) recordKill('zombie', 'gun');
    expect(getCurrentStyle()).toBe('近接');
  });

  it('phase kill debug starts null and holds whatever the caller last set', () => {
    expect(getPhaseKillDebug()).toBeNull();
    setPhaseKillDebug({ phaseKey: 'gate1', killsByBucket: { pumpkin: 1, werewolf: 0, plant: 0, ghost: 0, screamer: 0, chaff: 3 }, style: '近接' });
    expect(getPhaseKillDebug()?.phaseKey).toBe('gate1');
    expect(getPhaseKillDebug()?.killsByBucket.pumpkin).toBe(1);
  });
});
