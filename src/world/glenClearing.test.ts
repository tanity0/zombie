import { afterEach, describe, expect, it } from 'vitest';
import {
  glenClearHides, glenClearFadeKAt, glenClearingFadeK, glenClearingFadingTrees, clearGlenClearing, isGlenClearedTree,
  GLEN_CLEAR_FADE_MS, GLEN_CLEAR_PROTECT_HALF_W, GLEN_CLEAR_PROTECT_H,
} from './glenClearing';
import { GLEN_TF_APPEAR_MS } from '../utils/glenIntro';
import { applyGlenClearing, pickGlenClearing } from './glenClearingPick';
import { treesInRegion, treesInRegionRaw, treeArtRect } from './trees';
import { torchesInRegion, torchArtRect } from './torches';

// 社長指示2026-11-25「木はグレンの前に生やさない」→「グレン、登場の時点で近くに生やさないで」
// (ステージ7 グレンの変身の場面・research/GLEN_TRANSFORM.md)。奥か手前かを問わず、絵がグレンに掛かる物は消す。
describe('グレンの前の空き地', () => {
  afterEach(() => clearGlenClearing());

  const art = (fx: number, fy: number, w = 100, h = 200) => ({ x: fx - w / 2, y: fy - h, width: w, height: h });

  it('絵が掛かる物は手前でも奥でも弾き、絵が掛からない遠い物は残す', () => {
    const gx = 1000, gy = 500;
    const hides = (fx: number, fy: number) => glenClearHides(art(fx, fy), fx, fy, gx, gy);
    expect(hides(gx + 20, gy + 60)).toBe(true); // 正面の手前
    expect(hides(gx + GLEN_CLEAR_PROTECT_HALF_W + 40, gy + 30)).toBe(true); // 左右(絵が掛かる)
    expect(hides(gx, gy - 63)).toBe(true); // すぐ後ろの大木(撮影で根元が63px奥の木が被さって見えた)
    expect(hides(gx - 60, gy - GLEN_CLEAR_PROTECT_H + 10)).toBe(true); // 奥でも足元が守る矩形の中なら掛かる
    expect(hides(gx, gy - GLEN_CLEAR_PROTECT_H - 400)).toBe(false); // 奥に遠い(絵が守る矩形まで届かない)
    expect(hides(gx + 900, gy + 60)).toBe(false); // 横に遠い
    expect(hides(gx + 900, gy - 63)).toBe(false); // 奥の横に遠い
  });

  it('消える物のフェードは、人間のグレンが現れ切る時刻までに終わる', () => {
    expect(GLEN_CLEAR_FADE_MS).toBeLessThanOrEqual(GLEN_TF_APPEAR_MS);
    expect(glenClearFadeKAt(GLEN_TF_APPEAR_MS)).toBe(0);
    expect(GLEN_CLEAR_FADE_MS).toBeGreaterThan(0); // パッと消さない
  });

  it('消える物のフェードは慣性つき(動き始めと止まりがゆっくり)で、長さどおりに消え切る', () => {
    expect(glenClearFadeKAt(0)).toBe(1);
    expect(glenClearFadeKAt(GLEN_CLEAR_FADE_MS)).toBe(0);
    expect(glenClearFadeKAt(GLEN_CLEAR_FADE_MS / 2)).toBeCloseTo(0.5, 5);
    let prev = 1;
    for (let t = 0; t <= GLEN_CLEAR_FADE_MS; t += 10) { const k = glenClearFadeKAt(t); expect(k).toBeLessThanOrEqual(prev); prev = k; }
    const d = GLEN_CLEAR_FADE_MS / 20;
    const startDrop = 1 - glenClearFadeKAt(d), midDrop = glenClearFadeKAt(GLEN_CLEAR_FADE_MS / 2 - d / 2) - glenClearFadeKAt(GLEN_CLEAR_FADE_MS / 2 + d / 2);
    expect(startDrop).toBeLessThan(midDrop / 3); // 等速で始まらない
    expect(glenClearFadeKAt(GLEN_CLEAR_FADE_MS - d)).toBeLessThan(midDrop / 3); // 瞬間停止しない
  });

  // 決定的散布なので、手前に木が立つグレンの足元を一度見つければ固定。
  const findSpot = () => {
    for (let k = 0; k < 2000; k++) {
      const fx = 3000 + k * 37, fy = 2000;
      if (treesInRegion(fx - 300, fy - 300, fx + 300, fy + 300).some(t => t.footY - fy > 30 && t.footY - fy < 170 && Math.abs(t.footX - fx) < 50)) return { fx, fy };
    }
    return null;
  };

  it('すぐ後ろの木も欠番になる', () => {
    let hit: { fx: number; fy: number } | null = null;
    for (let k = 0; k < 2000 && !hit; k++) {
      const fx = 3000 + k * 37, fy = 2000;
      if (treesInRegion(fx - 300, fy - 300, fx + 300, fy + 300).some(t => fy - t.footY > 40 && fy - t.footY < 160 && Math.abs(t.footX - fx) < 50)) hit = { fx, fy };
    }
    expect(hit).not.toBeNull();
    const { fx, fy } = hit!;
    const n = applyGlenClearing(fx, fy, 0);
    expect(n.trees).toBeGreaterThan(0);
    const after = treesInRegion(fx - 1500, fy - 1500, fx + 1500, fy + 1500);
    expect(after.some(t => fy - t.footY > 40 && fy - t.footY < 160 && Math.abs(t.footX - fx) < 50)).toBe(false);
    expect(after.some(t => glenClearHides(treeArtRect(t), t.footX, t.footY, fx, fy))).toBe(false);
    expect(after.length).toBeGreaterThan(0); // 遠い木は残る
  });

  it('手前の木は当たり判定ごと欠番になり、周りの木は動かない。新ランで戻る', () => {
    const spot = findSpot();
    expect(spot).not.toBeNull();
    const { fx, fy } = spot!;
    const box = [fx - 1500, fy - 1500, fx + 1500, fy + 1500] as const;
    const before = treesInRegion(...box);
    const n = applyGlenClearing(fx, fy, 1000);
    expect(n.trees).toBeGreaterThan(0);
    const after = treesInRegion(...box);
    // 絵が掛かる木は1本も残らない
    expect(after.some(t => glenClearHides(treeArtRect(t), t.footX, t.footY, fx, fy))).toBe(false);
    // 消えたのは選ばれた木だけ・残りは同じ位置のまま(選び直しで別の場所へ生え替わらない)
    const key = (t: { key: string; footX: number; footY: number }) => `${t.key}@${t.footX},${t.footY}`;
    const afterKeys = new Set(after.map(key));
    for (const t of before) expect(afterKeys.has(key(t))).toBe(!isGlenClearedTree(t.key));
    expect(after.length).toBe(before.length - n.trees);
    // 生成そのもの(下の層の避け方・置き場所)は変えない
    expect(treesInRegionRaw(...box).length).toBe(before.length);
    clearGlenClearing();
    expect(treesInRegion(...box).map(key)).toEqual(before.map(key));
  });

  it('フェードの間だけ消える木を描画へ渡し、消え切ったら渡さない', () => {
    const spot = findSpot()!;
    applyGlenClearing(spot.fx, spot.fy, 1000);
    expect(glenClearingFadeK(1000)).toBe(1);
    expect(glenClearingFadingTrees(1000 + GLEN_CLEAR_FADE_MS / 2).length).toBeGreaterThan(0);
    expect(glenClearingFadingTrees(1000 + GLEN_CLEAR_FADE_MS).length).toBe(0);
    clearGlenClearing();
    expect(glenClearingFadeK(5000)).toBe(1); // 空き地が無い=何も消えない
  });

  it('手前の松明も欠番になる', () => {
    let hit: { fx: number; fy: number } | null = null;
    for (let k = 0; k < 4000 && !hit; k++) {
      const fx = -8000 + k * 29, fy = 3000;
      const t = torchesInRegion(fx - 800, fy - 800, fx + 800, fy + 800).find(q => q.footY - fy > 10 && q.footY - fy < 120 && Math.abs(q.footX - fx) < 60);
      if (t) hit = { fx, fy };
    }
    expect(hit).not.toBeNull();
    const { torches } = pickGlenClearing(hit!.fx, hit!.fy);
    expect(torches.length).toBeGreaterThan(0);
    applyGlenClearing(hit!.fx, hit!.fy, 0);
    const left = torchesInRegion(hit!.fx - 1500, hit!.fy - 1500, hit!.fx + 1500, hit!.fy + 1500, 1);
    expect(left.some(t => glenClearHides(torchArtRect(t), t.footX, t.footY, hit!.fx, hit!.fy))).toBe(false);
  });
});
