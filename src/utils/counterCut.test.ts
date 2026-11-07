import { describe, expect, it } from 'vitest';
import { COUNTER_CUT_GAP_MS, scriptResumeFlag, shouldCutBossMove } from './counterCut';
import { COUNTER_RECOVER_STILL_MS } from './enemyBite';
import type { Enemy } from '../types/game';

describe('counterCut', () => {
  it('技を bossState で持つボスの技中は旗を立てる', () => {
    expect(shouldCutBossMove({ type: 'idol', bossState: 'idol-punch-windup' })).toBe(true);
    expect(shouldCutBossMove({ type: 'skadi', bossState: 'skadi-ice-windup' })).toBe(true);
    expect(shouldCutBossMove({ type: 'miguel', bossState: 'harai-windup' })).toBe(true);
    expect(shouldCutBossMove({ type: 'bounty-maiko', bossState: 'mk-spin-windup' })).toBe(true);
  });
  it('城ボス・雑魚(bossState を持たない)は対象外=aiPhase 側で既に終わる', () => {
    expect(shouldCutBossMove({ type: 'giantbat', bossState: undefined })).toBe(false);
    expect(shouldCutBossMove({ type: 'zombie', bossState: undefined })).toBe(false);
  });
  it('個別の反応を持つトール・フィルは触らない', () => {
    expect(shouldCutBossMove({ type: 'thor', bossState: 'jump-attack' })).toBe(false);
    expect(shouldCutBossMove({ type: 'phillboss', bossState: 'phill-dive-fall' })).toBe(false);
  });
  it('技ではない州・既に反応中の州には立てない', () => {
    for (const st of ['chase', 'return', 'counter-leap', 'laser-broken'] as Enemy['bossState'][]) {
      expect(shouldCutBossMove({ type: 'mimir', bossState: st })).toBe(false);
    }
  });
  it('飛んでくる刃を弾いた時は弾と同じ=ボスの技は続く', () => {
    expect(shouldCutBossMove({ type: 'skadi', bossState: 'skadi-blade-recover' }, true)).toBe(false);
  });
  it('間は城ボス・雑魚のカウンター硬直と同じ1本のツマミ', () => {
    expect(COUNTER_CUT_GAP_MS).toBe(COUNTER_RECOVER_STILL_MS);
  });
  it('台本の残りがある時だけ再開の印を立てる', () => {
    expect(scriptResumeFlag(['harai'])).toBe(true);
    expect(scriptResumeFlag([])).toBeUndefined();
    expect(scriptResumeFlag(undefined)).toBeUndefined();
  });
});
