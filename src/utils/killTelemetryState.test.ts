import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordKill, getKillTotals, resetKillTelemetry, getCurrentStyle,
  setPhaseKillDebug, getPhaseKillDebug, resetPhaseKillDebug, getLastKillAt,
  snapshotKillTotals, recordSpawn, snapshotSpawns,
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

  describe('getLastKillAt (バッチ3.5-Bの追補: 問題児リフラクトリ用)', () => {
    it('is undefined for a type never killed', () => {
      expect(getLastKillAt('pumpkin')).toBeUndefined();
    });
    it('records the gameTime of the most recent kill when provided', () => {
      recordKill('pumpkin', 'gun', 12345);
      expect(getLastKillAt('pumpkin')).toBe(12345);
      recordKill('pumpkin', 'melee', 20000);
      expect(getLastKillAt('pumpkin')).toBe(20000);
    });
    it('stays undefined when gameTimeMs is omitted (back-compat callers)', () => {
      recordKill('werewolf', 'gun');
      expect(getLastKillAt('werewolf')).toBeUndefined();
    });
    it('resetKillTelemetry clears last-kill times too', () => {
      recordKill('ghost', 'gun', 5000);
      resetKillTelemetry();
      expect(getLastKillAt('ghost')).toBeUndefined();
    });
  });
});

describe('snapshotKillTotals / recordSpawn (v0.25.1343)', () => {
  it('snapshot is a deep copy — later kills do not mutate the snapshot (aliasing regression)', () => {
    resetKillTelemetry();
    const snap = snapshotKillTotals();
    recordKill('pumpkin', 'gun');
    expect(snap.byBucket.pumpkin).toBe(0);
    expect(getKillTotals().byBucket.pumpkin).toBe(1);
  });

  it('records spawns by bucket and snapshots them independently', () => {
    resetKillTelemetry();
    recordSpawn('werewolf');
    recordSpawn('werewolf');
    recordSpawn('bat'); // chaff
    const snap = snapshotSpawns();
    expect(snap.werewolf).toBe(2);
    expect(snap.chaff).toBe(1);
    recordSpawn('werewolf');
    expect(snap.werewolf).toBe(2); // コピーであること
    expect(snapshotSpawns().werewolf).toBe(3);
  });
});
