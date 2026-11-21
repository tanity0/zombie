import { describe, expect, it } from 'vitest';
import {
  stage5BattleActive, buildStage5GradeMatrix, buildStage5SkyMatrix, stage5TintMul, stage5EmberSize,
  S5B_FOG_TINT_MUL, S5B_FRONT_TINT_MUL, S5B_FIRE_POOLS, S5B_EMBER_SIZE_MUL, type Stage5BattleCtx,
} from './stage5Battlefield';
import { applyColorMatrix, stage1NightActive } from './weatherWet';

const ID = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const base: Stage5BattleCtx = { stageId: 'stage-5', indoor: false, corridor: false, farKey: 'stage5', daylight: false };

describe('ステージ5(戦場)の光・色・コントラスト: 効く所', () => {
  it('ステージ5の戦場の外(遠景=stage5)だけで効く', () => {
    expect(stage5BattleActive(base)).toBe(true);
  });
  it('他のステージでは一切効かない(遠景が stage5 でも)', () => {
    for (const stageId of ['stage-0', 'stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-6', 'stage-7', 'tutorial', '']) {
      expect(stage5BattleActive({ ...base, stageId })).toBe(false);
    }
  });
  it('屋内・廊下・昼・他の遠景では効かない', () => {
    expect(stage5BattleActive({ ...base, indoor: true })).toBe(false);
    expect(stage5BattleActive({ ...base, corridor: true })).toBe(false);
    expect(stage5BattleActive({ ...base, daylight: true })).toBe(false);
    for (const farKey of ['forest', 'snow', 'city', 'lab', null]) expect(stage5BattleActive({ ...base, farKey })).toBe(false);
  });
  it('ステージ1の森の夜とは同時に効かない(互いのステージで相手は止まる)', () => {
    expect(stage1NightActive({ stageId: 'stage-5', indoor: false, corridor: false, farKey: 'stage5', wetActive: false })).toBe(false);
    expect(stage5BattleActive({ ...base, stageId: 'stage-1', farKey: 'forest' })).toBe(false);
  });
});

describe('ステージ5(戦場)の光・色・コントラスト: 効き具合 0 は厳密にそのまま', () => {
  it('色行列(世界・空)は単位行列', () => {
    expect(buildStage5GradeMatrix(0)).toEqual(ID);
    expect(buildStage5SkyMatrix(0)).toEqual(ID);
  });
  it('煙・近景の色の掛け率は 1', () => {
    expect(stage5TintMul(S5B_FOG_TINT_MUL, 0)).toEqual({ r: 1, g: 1, b: 1 });
    expect(stage5TintMul(S5B_FRONT_TINT_MUL, 0)).toEqual({ r: 1, g: 1, b: 1 });
  });
  it('効き具合は滑らかに寄る(途中は両端の間・端で傾き0=慣性)', () => {
    const at = (m: number) => applyColorMatrix(buildStage5GradeMatrix(m), 0.6, 0.6, 0.6)[0];
    const a0 = at(0), a1 = at(1), am = at(0.5);
    expect(am).toBeGreaterThan(Math.min(a0, a1));
    expect(am).toBeLessThan(Math.max(a0, a1));
    expect(Math.abs(at(0.01) - a0)).toBeLessThan(Math.abs(a1 - a0) * 0.01);
  });
});

describe('ステージ5(戦場)の光・色・コントラスト: 狙いどおりの向き', () => {
  const g = buildStage5GradeMatrix(1);
  it('黒は深く沈む(暗い灰は暗くなる)', () => {
    const [r, gg, b] = applyColorMatrix(g, 0.08, 0.08, 0.08);
    expect(r).toBeLessThan(0.08);
    expect(gg).toBeLessThan(0.08);
    expect(b).toBeLessThan(0.08);
  });
  it('明るい所は持ち上がり、赤が一番強い(火の照り)', () => {
    const [r, gg, b] = applyColorMatrix(g, 0.6, 0.6, 0.6);
    expect(r).toBeGreaterThan(0.6);
    expect(gg).toBeGreaterThan(0.6);
    expect(r).toBeGreaterThan(gg);
    expect(gg).toBeGreaterThan(b);
  });
  it('明暗差が広がる(明るい灰と暗い灰の差が元より大きい)', () => {
    const lum = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const hi = lum(applyColorMatrix(g, 0.5, 0.5, 0.5)), lo = lum(applyColorMatrix(g, 0.1, 0.1, 0.1));
    expect(hi - lo).toBeGreaterThan(0.4 * 1.2);
  });
  it('空は赤が立ち、青と緑は沈む(焦げた赤黒い空)', () => {
    const [r, gg, b] = applyColorMatrix(buildStage5SkyMatrix(1), 0.4, 0.4, 0.4);
    expect(r).toBeGreaterThan(0.4);
    expect(gg).toBeLessThan(0.4);
    expect(b).toBeLessThan(gg);
    const dark = applyColorMatrix(buildStage5SkyMatrix(1), 0.03, 0.03, 0.03);
    for (const c of dark) expect(c).toBeLessThan(0.03);
  });
  it('煙の色は暖色へ(青を一番抜く)。濃さは触らない(掛け率は色だけ)', () => {
    const m = stage5TintMul(S5B_FOG_TINT_MUL, 1);
    expect(m.b).toBeLessThan(m.g);
    expect(m.g).toBeLessThanOrEqual(m.r);
    expect(Object.keys(m).sort()).toEqual(['b', 'g', 'r']);
  });
});

describe('ステージ5(戦場): 火の溜まり・火の粉', () => {
  it('火の溜まりは外側が広く薄く、芯が狭い。濃さは 0..1', () => {
    const [outer, core] = S5B_FIRE_POOLS;
    expect(outer.w).toBeGreaterThan(core.w);
    expect(outer.h).toBeGreaterThan(core.h);
    for (const p of S5B_FIRE_POOLS) {
      expect(p.alpha).toBeGreaterThan(0);
      expect(p.alpha).toBeLessThanOrEqual(1);
      expect(p.tintMix).toBeGreaterThanOrEqual(0);
      expect(p.tintMix).toBeLessThanOrEqual(1);
    }
  });
  it('火の粉は奥ほど小さく手前ほど大きい(遠近)', () => {
    expect(stage5EmberSize(8, 0.55)).toBeLessThan(stage5EmberSize(8, 1));
    expect(stage5EmberSize(8, 1.85)).toBeGreaterThan(stage5EmberSize(8, 1));
    expect(stage5EmberSize(8, 1)).toBeCloseTo(8 * S5B_EMBER_SIZE_MUL);
  });
});
