import { describe, it, expect } from 'vitest';
import loopSrc from '../hooks/useGameLoop.ts?raw';
import { BOSS_PHASE_SHEETS, ENEMY_FRAME_OFFSETS, bossPhaseFor, bossPhaseFrame } from './enemySheets';

describe('ミーミルの攻撃', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'mimir-attack')!;
  it('レーザー以外の全技(噛みつき・3連射・全方位・突進)の州がこのシートを引き、州名は台本に実在する', () => {
    for (const ph of spec.phases) {
      expect(loopSrc.includes(`'${ph.state}'`), ph.state).toBe(true);
      expect(bossPhaseFor('mimir', ph.state)?.spec.name, ph.state).toBe('mimir-attack');
    }
  });
  it('レーザーと巣へ戻る間は引かない(移動の絵のまま)', () => {
    for (const st of ['laser-windup', 'laser-fire', 'laser-recover', 'laser-broken', 'return', 'chase']) {
      expect(bossPhaseFor('mimir', st), st).toBeNull();
    }
  });
  it('溜めで 0→15 と見開き切り、戻りで 15→0 と閉じる', () => {
    const w = bossPhaseFor('mimir', 'bite-windup')!.phase;
    expect(bossPhaseFrame(w, 0, 0, 90)).toBe(0);
    expect(bossPhaseFrame(w, 0.999, 0, 90)).toBe(15);
    const r = bossPhaseFor('mimir', 'bite-recover')!.phase;
    expect(bossPhaseFrame(r, 0, 0, 90)).toBe(15);
    expect(bossPhaseFrame(r, 0.999, 0, 90)).toBe(0);
    expect(ENEMY_FRAME_OFFSETS['mimir-attack']?.length).toBe(spec.frames);
  });
});

describe('ヨルムンガルドの威嚇', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'jormungand-roar')!;
  it('弾を出す技(3連射・全方位)と突進の溜めがこのシートを引き、州名は台本に実在する', () => {
    for (const ph of spec.phases) {
      expect(loopSrc.includes(`'${ph.state}'`), ph.state).toBe(true);
      expect(bossPhaseFor('jormungand', ph.state)?.spec.name, ph.state).toBe('jormungand-roar');
    }
  });
  it('突進の走り・巣へ戻るは引かない(移動の絵のまま)', () => {
    for (const st of ['dash', 'dash-recover', 'return', 'chase']) {
      expect(bossPhaseFor('jormungand', st), st).toBeNull();
    }
    expect(ENEMY_FRAME_OFFSETS['jormungand-idle']?.length).toBe(16);
  });
});

describe('ヨルムンガルドの薙ぎ払い(うねり)', () => {
  it('うねりの3州がこのシートを引き、振り上げ切る(7)=溜めの末・振り下ろす(8)=判定の州の頭', () => {
    for (const st of ['coil-windup', 'coil', 'coil-recover']) {
      expect(loopSrc.includes(`'${st}'`), st).toBe(true);
      expect(bossPhaseFor('jormungand', st)?.spec.name, st).toBe('jormungand-sweep');
    }
    expect(bossPhaseFrame(bossPhaseFor('jormungand', 'coil-windup')!.phase, 0.999, 0, 90)).toBe(7);
    expect(bossPhaseFrame(bossPhaseFor('jormungand', 'coil')!.phase, 0, 0, 90)).toBe(8);
  });
});
