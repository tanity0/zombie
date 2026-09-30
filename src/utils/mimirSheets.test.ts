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
  it('巣へ戻る間は引かない(移動の絵のまま)', () => {
    for (const st of ['return', 'chase']) {
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

describe('トールの一閃', () => {
  it('一閃の4州がこのシートを引き、州名は台本に実在する。抜き放ち(3)=踏み込み斬りの頭', () => {
    for (const st of ['issen-nihil', 'issen-windup', 'issen-dash', 'issen-recover']) {
      expect(loopSrc.includes(`'${st}'`), st).toBe(true);
      expect(bossPhaseFor('thor', st)?.spec.name, st).toBe('thor-issen');
    }
    expect(bossPhaseFrame(bossPhaseFor('thor', 'issen-dash')!.phase, 0, 0, 90)).toBe(3);
    expect(bossPhaseFor('thor', 'tsuki-windup')?.spec.name).toBe('thor-tsuki');
  });
});

describe('トールの薙ぎ払い', () => {
  it('薙ぎ払いの3州がこのシートを引き、振り下ろし(7)=当たる州の頭。刀の向きに揃えて左向き扱い', async () => {
    for (const st of ['harai-windup', 'harai', 'harai-recover']) {
      expect(loopSrc.includes(`'${st}'`), st).toBe(true);
      expect(bossPhaseFor('thor', st)?.spec.name, st).toBe('thor-harai');
    }
    expect(bossPhaseFrame(bossPhaseFor('thor', 'harai')!.phase, 0, 0, 90)).toBe(7);
    const m = await import('./enemySheets');
    expect(m.sheetArtFacesRight('thor', 'thor-harai')).toBe(false);
    expect(m.sheetArtFacesRight('thor', 'thor-issen')).toBe(true);
  });
});

describe('トールの歩き', () => {
  it('歩きのシートを持ち、止まったら立ち絵へ戻る・右向き', async () => {
    const m = await import('./enemySheets');
    expect(m.walkSheetFrames('thor')).toBe(16);
    expect(m.walkStopsToIdle('thor')).toBe(true);
    expect(m.sheetArtFacesRight('thor', 'thor-walk')).toBe(true);
  });
});

describe('スカジの魔法1・魔法2', () => {
  it('即発動(檻・全方位)=魔法1、続けて放つ(氷塊・氷の刃・3連射)=魔法2。州名は台本に実在する', () => {
    for (const st of ['cage-windup', 'cage-recover', 'aim-radial', 'radial-recover']) {
      expect(loopSrc.includes(`'${st}'`), st).toBe(true);
      expect(bossPhaseFor('skadi', st)?.spec.name, st).toBe('skadi-cast1');
    }
    for (const st of ['skadi-ice-windup', 'skadi-ice', 'skadi-ice-recover', 'skadi-blade-windup', 'skadi-blade', 'skadi-blade-recover', 'aim-burst', 'burst', 'burst-recover']) {
      expect(loopSrc.includes(`'${st}'`), st).toBe(true);
      expect(bossPhaseFor('skadi', st)?.spec.name, st).toBe('skadi-cast2');
    }
    expect(bossPhaseFor('skadi', 'dash')).toBeNull();
    // 魔法1: 氷の弧(6)=出る瞬間(硬直の頭)
    expect(bossPhaseFrame(bossPhaseFor('skadi', 'cage-recover')!.phase, 0, 0, 90)).toBe(6);
  });
});

describe('スカジの歩き', () => {
  it('歩きのシートを持ち、止まったら立ち絵へ戻る', async () => {
    const m = await import('./enemySheets');
    expect(m.walkSheetFrames('skadi')).toBe(11);
    expect(m.walkStopsToIdle('skadi')).toBe(true);
  });
});

describe('ミーミルのレーザー', () => {
  it('溜めで瞳を絞り(0→11)、撃つ間は最後の3コマ(12〜14)を往復、撃ち終わりと中断で戻す', () => {
    for (const st of ['laser-windup', 'laser-fire', 'laser-recover', 'laser-broken']) {
      expect(loopSrc.includes(`'${st}'`), st).toBe(true);
      expect(bossPhaseFor('mimir', st)?.spec.name, st).toBe('mimir-laser');
    }
    expect(bossPhaseFrame(bossPhaseFor('mimir', 'laser-windup')!.phase, 0.999, 0, 90)).toBe(11);
    const fire = bossPhaseFor('mimir', 'laser-fire')!.phase;
    for (let t = 0; t < 3000; t += 37) expect([12, 13, 14]).toContain(bossPhaseFrame(fire, 0, t, 90));
    expect(bossPhaseFrame(bossPhaseFor('mimir', 'laser-recover')!.phase, 0.999, 0, 90)).toBe(0);
  });
});

describe('トールのジャンプ攻撃', () => {
  it('溜め/滞空/硬直がこのシートを引き、滞空は浮く・着地の突き立て(8)=硬直の頭', () => {
    for (const st of ['jump-windup', 'jump-attack', 'jump-recover']) {
      expect(loopSrc.includes(`'${st}'`), st).toBe(true);
      expect(bossPhaseFor('thor', st)?.spec.name, st).toBe('thor-jump');
    }
    expect(bossPhaseFor('thor', 'jump-attack')!.phase.lift).toBeGreaterThan(0);
    expect(bossPhaseFrame(bossPhaseFor('thor', 'jump-recover')!.phase, 0, 0, 90)).toBe(8);
  });
});

describe('トールの突き', () => {
  it('溜めは構え(0)、突きの州で突き出し(1→5)、硬直で引き戻す(5→0)=ピンポン。左向き扱い', async () => {
    for (const st of ['tsuki-windup', 'tsuki', 'tsuki-recover']) {
      expect(loopSrc.includes(`'${st}'`), st).toBe(true);
      expect(bossPhaseFor('thor', st)?.spec.name, st).toBe('thor-tsuki');
    }
    expect(bossPhaseFrame(bossPhaseFor('thor', 'tsuki')!.phase, 0.999, 0, 90)).toBe(5);
    expect(bossPhaseFrame(bossPhaseFor('thor', 'tsuki-recover')!.phase, 0.999, 0, 90)).toBe(0);
    const m = await import('./enemySheets');
    expect(m.sheetArtFacesRight('thor', 'thor-tsuki')).toBe(false);
  });
});
