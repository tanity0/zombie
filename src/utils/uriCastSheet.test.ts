// ★ウリの魔法の詠唱(社長支給2026-09-29「後半、剣がてっぺん超えたら剣先を光らせて」)。
import { describe, it, expect } from 'vitest';
import angelTickSrc from './angelBossTick.ts?raw';
import { BOSS_PHASE_SHEETS, SHEET_TIP_GLOW, bossPhaseFor, bossPhaseFrame } from './enemySheets';

describe('ウリの詠唱', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'uri-cast')!;
  it('雷弾の3州がこのシートを引き(剣技は待機のまま)、州名は台本に実在する', () => {
    for (const st of ['bolt-windup', 'bolt', 'bolt-recover']) {
      expect(bossPhaseFor('uri', st)?.spec.name, st).toBe('uri-cast');
      expect(angelTickSrc.includes(`'${st}'`), st).toBe(true);
    }
    for (const st of ['sweep-windup', 'downslash', 'thrust-windup']) expect(bossPhaseFor('uri', st)?.spec.name, st).toBe('uri-slash');
    expect(bossPhaseFor('uri', 'chase')).toBeNull();
  });
  it('溜めの終わりで真上(9)へ掲げ切り、撃つ間は必ず「てっぺんを越えた」コマ(10〜15)', () => {
    expect(bossPhaseFrame(bossPhaseFor('uri', 'bolt-windup')!.phase, 0.999, 0, 90)).toBe(9);
    const bolt = bossPhaseFor('uri', 'bolt')!.phase;
    for (let k = 0; k < 100; k++) expect(bossPhaseFrame(bolt, k / 100, 0, 90)).toBeGreaterThanOrEqual(10);
  });
  it('★剣先が全開になるのは「てっぺんを越えた」コマ(10〜15)の撃つ間だけ・点は枠の中・明るさを持つコマは必ず点を持つ', () => {
    const g = SHEET_TIP_GLOW['uri-cast'];
    expect(Object.entries(g.levels.bolt).filter(([, v]) => v >= 1).map(([k]) => Number(k))).toEqual([10, 11, 12, 13, 14, 15]);
    // 溜め・戻りは全開にならない(振り上げの終わりで薄く灯り、振り下ろしで尾を引く)
    for (const st of ['bolt-windup', 'bolt-recover']) for (const v of Object.values(g.levels[st])) expect(v).toBeLessThan(1);
    for (const lv of Object.values(g.levels)) for (const f of Object.keys(lv)) expect(g.points[Number(f)], f).toBeDefined();
    for (const [x, y] of Object.values(g.points)) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1504 / spec.frames);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThan(170);
    }
    // 光る州は台本の州名(州名を変えたら光が黙って消える形を止める)
    for (const st of Object.keys(g.levels)) expect(angelTickSrc.includes(`'${st}'`), st).toBe(true);
  });
});

describe('ウリの斬撃', () => {
  const spec = BOSS_PHASE_SHEETS.find(s => s.name === 'uri-slash')!;
  it('剣技3つの全州がこのシートを引き、州名は台本に実在する・コマは範囲内', () => {
    for (const t of ['sweep', 'downslash', 'thrust']) for (const st of [`${t}-windup`, t, `${t}-recover`]) {
      expect(bossPhaseFor('uri', st)?.spec.name, st).toBe('uri-slash');
      expect(angelTickSrc.includes(`'${st}'`), st).toBe(true);
    }
    for (const ph of spec.phases) for (const f of ph.seq) { expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(spec.frames); }
  });
  it('★溜めの終わり=燃え上がる剣(8)、当たる州の中で振り下ろし(9〜11)を出し切る', () => {
    for (const t of ['sweep', 'downslash', 'thrust']) {
      expect(bossPhaseFrame(bossPhaseFor('uri', `${t}-windup`)!.phase, 0.999, 0, 90), t).toBe(8);
      const act = bossPhaseFor('uri', t)!.phase;
      const seen = new Set(Array.from({ length: 100 }, (_, k) => bossPhaseFrame(act, k / 100, 0, 90)));
      for (const f of [9, 10, 11]) expect(seen.has(f), `${t} ${f}`).toBe(true);
    }
  });
});
