// ★馬乗り(変異)の攻撃のシート(社長支給2026-09-29「馬乗りの攻撃全部」)。
import { describe, it, expect } from 'vitest';
import bountyTickSrc from './bountyTick.ts?raw';
import { BOSS_PHASE_SHEETS, ENEMY_FRAME_OFFSETS, bossPhaseFor, bossPhaseFrame, bossReleaseFrame, bossIntroFrame } from './enemySheets';

describe('馬乗りの攻撃', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'bounty-melee-lash')!;
  it('全技(突進・360度ムチ・3段コンボ・懲罰狙撃)の州がこのシートを引き、州名は台本に実在する', () => {
    for (const ph of spec.phases) expect(bountyTickSrc.includes(`'${ph.state}'`), ph.state).toBe(true);
    for (const st of ['bm-charge-windup', 'bm-charge', 'bm-whip360-windup', 'bm-whip360', 'bm-charge-recover',
      'bm-combo1-windup', 'bm-combo2-windup', 'bm-combo3-windup', 'bm-combo1-recover', 'bm-combo2-recover', 'bm-combo3-recover',
      'bm-snipe-windup', 'bm-snipe', 'bm-snipe-recover']) {
      expect(bossPhaseFor('bounty-melee', st)?.spec.name, st).toBe('bounty-melee-lash');
    }
  });
  it('コマは範囲内・体の位置のずらしはコマ数ぶん', () => {
    for (const ph of spec.phases) for (const f of ph.seq) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(spec.frames); }
    expect(ENEMY_FRAME_OFFSETS['bounty-melee-lash']?.length).toBe(spec.frames);
  });
  it('★コンボ・狙撃は当たる瞬間(溜め明け=硬直の頭)に打ち出しのコマ(2)', () => {
    for (const st of ['bm-combo1-recover', 'bm-combo2-recover', 'bm-combo3-recover', 'bm-snipe', 'bm-snipe-recover']) {
      expect(bossPhaseFrame(bossPhaseFor('bounty-melee', st)!.phase, 0, 0, 90), st).toBe(2);
    }
  });
});

describe('鋏の攻撃', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'bounty-balance-slash')!;
  it('全技(薙ぎ・3連薙ぎ・ロール後の高速弾・跳びかかり)の州がこのシートを引き、州名は台本に実在する', () => {
    for (const ph of spec.phases) {
      expect(bountyTickSrc.includes(`'${ph.state}'`), ph.state).toBe(true);
      expect(bossPhaseFor('bounty-balance', ph.state)?.spec.name, ph.state).toBe('bounty-balance-slash');
    }
    expect(bossPhaseFor('bounty-balance', 'bb-backroll')).toBeNull(); // ロール(移動)は歩き/立ち絵
  });
  it('★溜めの終わりで振りかぶり切り(5)、当たった直後(硬直の頭)で振り下ろす(6)・ずらしはコマ数ぶん', () => {
    for (const w of ['bb-sweep-windup', 'bb-triple1-windup', 'bb-triple2-windup', 'bb-triple3-windup', 'bb-quickshot-windup', 'leap-windup']) {
      expect(bossPhaseFrame(bossPhaseFor('bounty-balance', w)!.phase, 0.999, 0, 90), w).toBe(5);
    }
    for (const r of ['bb-sweep-recover', 'bb-triple1-recover', 'bb-triple2-recover', 'bb-quickshot-recover', 'leap-recover']) {
      expect(bossPhaseFrame(bossPhaseFor('bounty-balance', r)!.phase, 0, 0, 90), r).toBe(6);
    }
    expect(ENEMY_FRAME_OFFSETS['bounty-balance-slash']?.length).toBe(spec.frames);
  });
});

describe('バス停の攻撃', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'bounty-ranged-flail')!;
  it('全技(押しのけ・三段突き・レーザー)の州がこのシートを引き、州名は台本に実在する・ロールは引かない', () => {
    for (const ph of spec.phases) {
      expect(bountyTickSrc.includes(`'${ph.state}'`), ph.state).toBe(true);
      expect(bossPhaseFor('bounty-ranged', ph.state)?.spec.name, ph.state).toBe('bounty-ranged-flail');
    }
    expect(bossPhaseFor('bounty-ranged', 'br-roll')).toBeNull();
  });
  it('★技ごとに1本(同じ group の州は時計を切らない)。最初の溜めで 0→7、明けたら 8〜15 を往復', () => {
    for (const g of ['br-push', 'br-triple', 'br-laser']) {
      const phs = spec.phases.filter(p => p.group === g);
      expect(phs.length, g).toBeGreaterThan(1);
    }
    const ph = bossPhaseFor('bounty-ranged', 'br-triple-windup')!.phase;
    expect(bossReleaseFrame(ph, 0.999, 0, 90)).toBe(7);
    for (let t = 0; t < 3000; t += 41) expect(bossReleaseFrame(ph, null, t, 90)).toBeGreaterThanOrEqual(8);
  });
});

describe('舞妓の技', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'bounty-maiko-cast')!;
  it('全技(毬の薙ぎ単発/2連・毬回し・水鳥乱舞・手毬打ち)の州がこのシートを引き、州名は台本に実在する・バックロールと型切替は引かない', () => {
    for (const ph of spec.phases) {
      expect(bountyTickSrc.includes(`'${ph.state}'`), ph.state).toBe(true);
      expect(bossPhaseFor('bounty-maiko', ph.state)?.spec.name, ph.state).toBe('bounty-maiko-cast');
    }
    expect(bossPhaseFor('bounty-maiko', 'mk-backroll')).toBeNull();
    expect(bossPhaseFor('bounty-maiko', 'mk-repose')).toBeNull();
  });
  it('★1コマ目から入り(0→1→2を1回)、技が終わるまで4〜15コマ目(3〜14)を頭から繰り返す', () => {
    const ph = bossPhaseFor('bounty-maiko', 'mk-spin')!.phase;
    expect([0, 90, 180].map(t => bossIntroFrame(ph, t, 90))).toEqual([0, 1, 2]);
    expect(bossIntroFrame(ph, 270, 90)).toBe(3);
    expect(bossIntroFrame(ph, 270 + 11 * 90, 90)).toBe(14);
    expect(bossIntroFrame(ph, 270 + 12 * 90, 90)).toBe(3);
    for (let t = 270; t < 8000; t += 37) {
      const f = bossIntroFrame(ph, t, 90);
      expect(f).toBeGreaterThanOrEqual(3);
      expect(f).toBeLessThanOrEqual(14);
    }
  });
  it('同じ技の州は1つの group(2連の1段目と2段目で抱き寄せ直さない)', () => {
    expect(bossPhaseFor('bounty-maiko', 'mk-naginata1-windup')!.phase.group)
      .toBe(bossPhaseFor('bounty-maiko', 'mk-naginata2-recover')!.phase.group);
    expect(ENEMY_FRAME_OFFSETS['bounty-maiko-cast']?.length).toBe(spec.frames);
  });
});
