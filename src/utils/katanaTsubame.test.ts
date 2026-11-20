// 刀の燕返し・切り傷・殺陣(research/KATANA_TSUBAME.md)の純関数。
import { describe, it, expect } from 'vitest';
import {
  tsubameAccepts, tsubamePath, tsubameDashMs, nextKatanaCuts, triggersSatsujin, satsujinAngles, satsujinCoverAlpha,
  KATANA_CUT_MAX, SATSUJIN_HITS, SATSUJIN_FADE_IN_MS, SATSUJIN_FADE_OUT_MS,
} from './katanaTsubame';
import { FLICK_FOLLOWUP_WINDOW_MS } from './flickFollowup';

const w = { hitAt: 1000, dirX: 1, dirY: 0, hitIds: ['a'], used: false, originX: 0, originY: 0 };

describe('燕返しの受付', () => {
  it('一閃の向きと反対(120°以上)だけ・300msの間だけ・1回だけ', () => {
    expect(tsubameAccepts(w, { x: -1, y: 0 }, 1100)).toBe(true);
    expect(tsubameAccepts(w, { x: -1, y: 1.7 }, 1100)).toBe(true); // 120°
    expect(tsubameAccepts(w, { x: -1, y: 2 }, 1100)).toBe(false);  // 116°
    expect(tsubameAccepts(w, { x: 1, y: 0 }, 1100)).toBe(false);   // 進行方向
    expect(tsubameAccepts(w, { x: 0, y: 1 }, 1100)).toBe(false);   // 横
    expect(tsubameAccepts(w, { x: -1, y: 0 }, 1000 + FLICK_FOLLOWUP_WINDOW_MS + 1)).toBe(false);
    expect(tsubameAccepts({ ...w, used: true }, { x: -1, y: 0 }, 1100)).toBe(false);
    expect(tsubameAccepts(null, { x: -1, y: 0 }, 1100)).toBe(false);
  });
});

describe('燕返しの道', () => {
  it('今の位置→元の位置(一閃の最大距離まで)', () => {
    const p = tsubamePath({ x: 100, y: 0 }, { x: 0, y: 0 }, 154)!;
    expect(p.ux).toBeCloseTo(-1);
    expect(p.dist).toBeCloseTo(100);
    expect(tsubamePath({ x: 300, y: 0 }, { x: 0, y: 0 }, 154)!.dist).toBe(154);
    expect(tsubamePath({ x: 2, y: 0 }, { x: 0, y: 0 }, 154)).toBeNull();
  });
  it('所要時間は一閃と同じ速さ', () => {
    expect(tsubameDashMs(154, 154, 180)).toBe(180);
    expect(tsubameDashMs(77, 154, 180)).toBe(90);
    expect(tsubameDashMs(500, 154, 180)).toBe(180);
  });
});

describe('切り傷と殺陣', () => {
  it('当たるたびに+1・最大4', () => {
    expect(nextKatanaCuts(undefined)).toBe(1);
    expect(nextKatanaCuts(3)).toBe(4);
    expect(nextKatanaCuts(4)).toBe(KATANA_CUT_MAX);
  });
  it('4本入っている敵への当たりで殺陣・4本未満では出ない', () => {
    expect(triggersSatsujin(4)).toBe(true);
    expect(triggersSatsujin(3)).toBe(false);
    expect(triggersSatsujin(undefined)).toBe(false);
  });
  it('5発の向きは一周に散る(同じ向きが無い・隣どうし大きく離れる)', () => {
    const a = satsujinAngles(0, () => 0.5);
    expect(a).toHaveLength(SATSUJIN_HITS);
    const norm = a.map(x => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((p, q) => p - q);
    for (let i = 1; i < norm.length; i++) expect(norm[i] - norm[i - 1]).toBeGreaterThan(0.8);
    for (let i = 1; i < a.length; i++) {
      const d = Math.abs(Math.atan2(Math.sin(a[i] - a[i - 1]), Math.cos(a[i] - a[i - 1])));
      expect(d).toBeGreaterThan(2); // 前の1発の反対寄りから
    }
  });
  it('赤い画面: 速く入り、最後の止めの後に慣性つきで戻る', () => {
    expect(satsujinCoverAlpha(0, 500, -1)).toBe(0);
    expect(satsujinCoverAlpha(0, 500, SATSUJIN_FADE_IN_MS)).toBe(1);
    expect(satsujinCoverAlpha(0, 500, 300)).toBe(1);
    const mid = satsujinCoverAlpha(0, 500, 500 + SATSUJIN_FADE_OUT_MS / 2);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    expect(satsujinCoverAlpha(0, 500, 500 + SATSUJIN_FADE_OUT_MS)).toBe(0);
  });
});
