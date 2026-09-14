// §9 v2(処刑・カウンターの当たった瞬間の絵)の不変条件。監査の(A)を機械で固定する。
import { describe, expect, it } from 'vitest';
import {
  impactBurstPlan, impactBurstRepeatFilter, IMPACT_FLASH_R, IMPACT_SPARK_TOTAL,
  IMPACT_REPEAT_MS, IMPACT_SPARK_COLORS, type ImpactBeat,
} from './impactBurst';

const plan = (over: Partial<Parameters<typeof impactBurstPlan>[0]> = {}) =>
  impactBurstPlan({ mode: 'execute', bladeRad: 0, targetW: 120, seed: 7, ...over });

const kinds = (bs: ImpactBeat[]) => new Set(bs.map(b => b.kind));

describe('台本の骨格', () => {
  it('遅れは昇順で、全部 400ms 以内に撒き始める(接触の一拍で終わる)', () => {
    const bs = plan();
    for (let i = 1; i < bs.length; i++) expect(bs[i].atMs).toBeGreaterThanOrEqual(bs[i - 1].atMs);
    expect(Math.max(...bs.map(b => b.atMs))).toBeLessThanOrEqual(400 + 15);
    expect(bs[0].atMs).toBe(0); // 接触の瞬間に必ず何か在る
  });
  it('接触の瞬間(0ms)に閃光と斬帯と火花が同時に在る(受け入れ条件)', () => {
    const at0 = kinds(plan().filter(b => b.atMs === 0));
    expect(at0.has('flash')).toBe(true);
    expect(at0.has('slashBurst')).toBe(true);
    expect(at0.has('spark')).toBe(true);
  });
  it('閃光の半径は**固定**(相手の体格で変えない=44以上で投影影を落とす光源に切り替わるため)', () => {
    for (const targetW of [60, 120, 400]) {
      const f = plan({ targetW }).find(b => b.kind === 'flash');
      expect(f?.size).toBe(IMPACT_FLASH_R);
      expect(IMPACT_FLASH_R).toBeLessThan(44);
    }
  });
});

describe('処刑とカウンターは倍率違いではなく別の絵', () => {
  const e = kinds(plan({ mode: 'execute' })), c = kinds(plan({ mode: 'counter' }));
  it('処刑だけ: 破片・土煙・地面の跡(下向きの重さ)', () => {
    for (const k of ['debris', 'smoke', 'stain'] as const) {
      expect(e.has(k), `execute は ${k} を出す`).toBe(true);
      expect(c.has(k), `counter は ${k} を出さない`).toBe(false);
    }
  });
  it('共通は閃光と輪(と帯・火花)', () => {
    for (const k of ['flash', 'shock', 'slashBurst', 'spark'] as const) {
      expect(e.has(k) && c.has(k), k).toBe(true);
    }
  });
  it('カウンターは輪が短く、火花が広く散る(跳ね返りの絵)', () => {
    const es = plan({ mode: 'execute' }), cs = plan({ mode: 'counter' });
    expect(cs.find(b => b.kind === 'shock')!.durationMs).toBeLessThan(es.find(b => b.kind === 'shock')!.durationMs);
    const eSpread = es.filter(b => b.kind === 'spark')[0].spreadRad;
    const cSpread = cs.filter(b => b.kind === 'spark')[0].spreadRad;
    expect(cSpread).toBeGreaterThan(eSpread);
  });
});

describe('火花は刃の走った向きへ出る(押し込み方向ではない)', () => {
  it('bladeRad をそのまま基準角に使う', () => {
    for (const bladeRad of [0, 1.2, -2.4]) {
      for (const b of plan({ bladeRad }).filter(x => x.kind === 'spark')) expect(b.angleRad).toBe(bladeRad);
    }
  });
  it('細い束+外れ値の2種でできている(均等な扇にしない)', () => {
    const sp = plan().filter(b => b.kind === 'spark');
    const spreads = new Set(sp.map(b => Math.round(b.spreadRad * 100)));
    expect(spreads.size).toBeGreaterThan(1); // 束と外れ値で広がりが違う
    const wide = sp.reduce((m, b) => Math.max(m, b.spreadRad), 0);
    const tight = sp.reduce((m, b) => Math.min(m, b.spreadRad), 9);
    expect(wide / tight).toBeGreaterThan(3);
    expect(sp.reduce((s, b) => s + b.count, 0)).toBeLessThanOrEqual(IMPACT_SPARK_TOTAL + 4);
  });
});

describe('色の禁則は**形**で書く(色だけで書くと血まで止まる)', () => {
  it('輪と帯に赤を使わない。火花は暖色3系のいずれか', () => {
    for (const mode of ['execute', 'counter'] as const) {
      for (const b of plan({ mode })) {
        if (b.kind === 'shock' || b.kind === 'slashBurst') {
          expect(b.color === undefined || !/#(dc|7f|b9)/i.test(b.color), `${b.kind} に赤を置かない`).toBe(true);
        }
        if (b.kind === 'spark') expect(IMPACT_SPARK_COLORS).toContain(b.color as typeof IMPACT_SPARK_COLORS[number]);
      }
    }
  });
});

describe('毎回同じにしない / 反復は芯を残して重い物だけ落とす', () => {
  it('種が違えば遅れか数が変わる', () => {
    const a = JSON.stringify(plan({ seed: 1 })), b = JSON.stringify(plan({ seed: 2 }));
    expect(a).not.toBe(b);
    expect(JSON.stringify(plan({ seed: 1 }))).toBe(a); // 同じ種なら同じ
  });
  it('2回目以降は土煙・破片・跡だけ落とし、閃光と輪と火花と帯は100%のまま', () => {
    const bs = plan();
    const rep = impactBurstRepeatFilter(bs, 1000, 1000 + IMPACT_REPEAT_MS - 1);
    const k = kinds(rep);
    expect(k.has('smoke') || k.has('debris') || k.has('stain')).toBe(false);
    for (const core of ['flash', 'shock', 'spark', 'slashBurst'] as const) expect(k.has(core), core).toBe(true);
    // 芯の拍は**数も尺も落とさない**(一律に弱めない)
    expect(rep.filter(b => b.kind === 'spark')).toEqual(bs.filter(b => b.kind === 'spark'));
  });
  it('窓が空いたら全部戻る(窓は共有CDと同じ10秒)', () => {
    const bs = plan();
    expect(impactBurstRepeatFilter(bs, 1000, 1000 + IMPACT_REPEAT_MS)).toEqual(bs);
    expect(impactBurstRepeatFilter(bs, 0, 99999)).toEqual(bs);
  });
});

describe('足元基準の拍(空中で止まらせない)', () => {
  it('破片・土煙・跡は atFoot、接触点の絵は atFoot でない', () => {
    for (const b of plan()) {
      const foot = b.kind === 'debris' || b.kind === 'smoke' || b.kind === 'stain';
      expect(!!b.atFoot, b.kind).toBe(foot);
    }
  });
});
