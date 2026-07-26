import { describe, it, expect } from 'vitest';
import { skinLayersExpectedFor } from './stageTextures';

// ステージ別素材が届くまで「森(=ステージ1)の下地」を見せないためのホールド対象レイヤー。
// 社長報告v0.25.2279「たまにステージ1がチラッと映る」の対策。過剰に隠すと黒が出る/
// 足りないと森が漏れるので、どちらの向きの間違いも不変条件で固定しておく。
describe('skinLayersExpectedFor', () => {
  it('既定の森スキン(M1=farBackdrop無し)は何もホールドしない(森が正解の画)', () => {
    expect([...skinLayersExpectedFor(undefined, '', 'forest')]).toEqual([]);
    expect([...skinLayersExpectedFor(undefined, 'forest', 'forest')]).toEqual([]);
  });

  it('M7(遠景だけ差し替え・地面/森1/近景は森のまま)は遠景だけホールドする', () => {
    const set = skinLayersExpectedFor(undefined, 'stage7', 'forest');
    expect([...set]).toEqual(['far']);
    // 地面/近景/地平帯を隠すとM7では「本来正しい森」まで消えて黒が出る=隠してはいけない。
    expect(set.has('ground')).toBe(false);
    expect(set.has('front')).toBe(false);
    expect(set.has('horizon')).toBe(false);
  });

  it('M3(city)は遠景/地面/地平帯/近景すべて差し替えるので全部ホールドする', () => {
    const set = skinLayersExpectedFor(undefined, 'city', 'city');
    for (const l of ['far', 'ground', 'horizon', 'front'] as const) expect(set.has(l)).toBe(true);
  });

  it('M4(snow)/M5(stage5)/M0(tutorial)も差し替えるレイヤーを取りこぼさない', () => {
    for (const key of ['snow', 'stage5', 'tutorial']) {
      const set = skinLayersExpectedFor(undefined, key, key);
      expect(set.has('far')).toBe(true);
      expect(set.has('ground')).toBe(true);
      expect(set.has('front')).toBe(true);
    }
  });

  it('M2(lab)は遠景/地面/近景をホールドする(既存のlab専用ガードと同じ範囲)', () => {
    const set = skinLayersExpectedFor('lab', '', 'lab');
    expect(set.has('far')).toBe(true);
    expect(set.has('ground')).toBe(true);
    expect(set.has('front')).toBe(true);
  });

  it('洋館通路(corridorMode)は別パイプラインなのでホールドしない', () => {
    expect([...skinLayersExpectedFor(undefined, 'mansion', 'forest', true)]).toEqual([]);
  });
});
