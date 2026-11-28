import { describe, expect, it } from 'vitest';
import {
  stage5BattleActive, buildStage5GradeMatrix, buildStage5SkyMatrix, stage5TintMul, stage5EmberSize,
  S5B_FOG_TINT_MUL, S5B_FRONT_TINT_MUL, S5B_FIRE_POOLS, S5B_EMBER_SIZE_MUL, type Stage5BattleCtx,
  burningWreckFlames, burningWreckSmoke, burningWreckFlicker, S5B_WRECK_MAX,
  burningWreckZIndex, S5B_WRECK_Z_BEHIND,
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
  it('松明の光ほどの明るい暖色は黄白へ飛ばない(緑が天井へ届かない=橙のまま)', () => {
    const [r, gg, b] = applyColorMatrix(g, 0.9, 0.62, 0.3);
    expect(r).toBeGreaterThan(gg);
    expect(gg).toBeLessThan(0.95);
    expect(b).toBeLessThan(0.5);
  });
  it('淡い青(主人公の髪)は赤に塗り替えられない(青が赤以上のまま)', () => {
    const [r, , b] = applyColorMatrix(g, 0.68, 0.75, 0.87);
    expect(b).toBeGreaterThanOrEqual(r);
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
  it('火の溜まりは控えめ(2枚の濃さの和が 0.6 以下=松明の光に重なって白く飛ばない)', () => {
    expect(S5B_FIRE_POOLS.reduce((a, p) => a + p.alpha, 0)).toBeLessThanOrEqual(0.6);
  });
  it('火の粉は奥ほど小さく手前ほど大きい(遠近)', () => {
    expect(stage5EmberSize(8, 0.55)).toBeLessThan(stage5EmberSize(8, 1));
    expect(stage5EmberSize(8, 1.85)).toBeGreaterThan(stage5EmberSize(8, 1));
    expect(stage5EmberSize(8, 1)).toBeCloseTo(8 * S5B_EMBER_SIZE_MUL);
  });
});

describe('燃える残骸の炎・煙(見た目の数)', () => {
  it('絵が広いほど炎が増え(1〜3本)、どれも絵の幅の中・足元より上に根元がある', () => {
    expect(burningWreckFlames(40, 36, 0.3, 0).length).toBe(1);
    expect(burningWreckFlames(80, 60, 0.3, 0).length).toBe(2);
    expect(burningWreckFlames(140, 84, 0.3, 0).length).toBe(3);
    for (const seed of [0, 0.17, 0.5, 0.93]) {
      for (const [w, h] of [[40, 36], [80, 60], [140, 84], [200, 100]]) {
        for (const now of [0, 1234, 98765]) {
          for (const f of burningWreckFlames(w, h, seed, now)) {
            expect(Math.abs(f.dx)).toBeLessThanOrEqual(w / 2);
            expect(f.base).toBeGreaterThan(0);
            expect(f.base).toBeLessThan(h);
            expect(f.h).toBeGreaterThan(0);
            expect(f.h).toBeLessThan(160);
          }
        }
      }
    }
  });
  it('同じ種・同じ時刻なら同じ形(決定的)', () => {
    expect(burningWreckFlames(120, 80, 0.42, 5000)).toEqual(burningWreckFlames(120, 80, 0.42, 5000));
  });
  it('煙は昇りながら広がり、生まれる/消える瞬間は透明(パッと出ない)', () => {
    let prevRise = -1;
    for (let now = 0; now < 3000; now += 100) {
      const sm = burningWreckSmoke(100, 0, 0, now);
      expect(sm.alpha).toBeGreaterThanOrEqual(0);
      expect(sm.alpha).toBeLessThanOrEqual(0.5);
      if (now > 0 && sm.rise > prevRise) expect(sm.size).toBeGreaterThan(burningWreckSmoke(100, 0, 0, now - 100).size);
      prevRise = sm.rise;
    }
    const start = burningWreckSmoke(100, 0, 0, 0);
    expect(start.alpha).toBeLessThan(0.01);
  });
  it('揺らぎは0.8〜1.1の範囲・上限は有限', () => {
    for (let now = 0; now < 5000; now += 37) {
      const f = burningWreckFlicker(now, 0.6);
      expect(f).toBeGreaterThan(0.8);
      expect(f).toBeLessThan(1.1);
    }
    expect(S5B_WRECK_MAX).toBeGreaterThan(0);
    expect(S5B_WRECK_MAX).toBeLessThanOrEqual(16);
  });
});

describe('燃える残骸の炎の並び順(置物のすぐ奥)', () => {
  it('炎は置物の zIndex のすぐ奥(置物より小さく・差は小さい)', () => {
    for (const propZ of [-381.1, 0, 214.07, 326.97, 5000]) {
      const z = burningWreckZIndex(propZ);
      expect(z).toBeLessThan(propZ);
      expect(propZ - z).toBeCloseTo(S5B_WRECK_Z_BEHIND, 9);
    }
  });
  it('置物の手前の物(足元Yがわずかでも大きい)より奥・置物の奥の物(足元Yが小さい)より手前に収まる', () => {
    const propZ = 214.07;
    expect(burningWreckZIndex(propZ)).toBeLessThan(propZ + 0.5);
    expect(burningWreckZIndex(propZ)).toBeGreaterThan(propZ - 1);
  });
  it('並び順は置物の zIndex だけで決まる(?proj=1 の投影後の足元Yが world の足元Yより下でも置物の前へ出ない)', () => {
    // 実測(v0.25.5745・?proj=1): 置物 zIndex=214.07(world の足元)・炎を置く投影後の足元Y=254.54。
    const propZ = 214.07, projectedFootY = 254.54;
    expect(burningWreckZIndex(propZ)).toBeLessThan(propZ);
    expect(burningWreckZIndex(propZ)).toBeLessThan(projectedFootY);
  });
});
