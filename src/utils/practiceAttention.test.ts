import { describe, it, expect } from 'vitest';
import { isPointInZoomedViewport } from './cameraZoom';
import {
  practiceBossAttnDelayMs, practiceSpawnWaitMs, practiceEdgeInsideDistance, PRACTICE_EDGE_INSET_SCREEN_PX,
} from './practiceAttention';

const view = { width: 430, height: 932 };
// 主人公(中心 0,0)が画面の真ん中に居るカメラ
const camAt = (cx: number, cy: number) => ({ x: cx - view.width / 2, y: cy - view.height / 2 });

describe('practiceAttention', () => {
  it('本編(練習でない)は今の値をそのまま返す', () => {
    expect(practiceBossAttnDelayMs(false, 950)).toBe(950);
    expect(practiceSpawnWaitMs(false, 3000)).toBe(3000);
  });
  it('練習ランは遅れ・待ちが0', () => {
    expect(practiceBossAttnDelayMs(true, 950)).toBe(0);
    expect(practiceSpawnWaitMs(true, 3000)).toBe(0);
  });

  for (const zoom of [1, 0.8, 0.55, 0.4]) {
    it(`真上: 中心点が上の縁から内側へ24px(zoom ${zoom})・画面の内側に入る`, () => {
      const d = practiceEdgeInsideDistance({ x: 0, y: 0 }, { x: 0, y: -1 }, camAt(0, 0), view, zoom);
      expect(d).not.toBeNull();
      expect(d!).toBeCloseTo(view.height / 2 / zoom - PRACTICE_EDGE_INSET_SCREEN_PX / zoom, 6);
      expect(isPointInZoomedViewport(0, -d!, camAt(0, 0), view, zoom)).toBe(true);
      // 縁のすぐ内側(あと 24px+1 外へ出したら画面の外)
      expect(isPointInZoomedViewport(0, -d! - (PRACTICE_EDGE_INSET_SCREEN_PX + 1) / zoom, camAt(0, 0), view, zoom)).toBe(false);
    });
  }

  it('斜め向き: 先に当たる縁で止まり、その点は画面の内側', () => {
    const dir = { x: 1, y: -1 };
    const d = practiceEdgeInsideDistance({ x: 0, y: 0 }, dir, camAt(0, 0), view, 1)!;
    const u = Math.SQRT1_2;
    // 縦長なので横の縁(215-24)で止まる
    expect(d * u).toBeCloseTo(view.width / 2 - PRACTICE_EDGE_INSET_SCREEN_PX, 6);
    expect(isPointInZoomedViewport(d * u, -d * u, camAt(0, 0), view, 1)).toBe(true);
  });

  it('カメラが主人公からずれていても、今の可視域で測る', () => {
    const cam = { x: -view.width / 2, y: -view.height / 2 + 200 }; // カメラが下へ200
    const d = practiceEdgeInsideDistance({ x: 0, y: 0 }, { x: 0, y: -1 }, cam, view, 1)!;
    expect(d).toBeCloseTo(view.height / 2 - 200 - PRACTICE_EDGE_INSET_SCREEN_PX, 6);
  });

  it('起点が画面の外(カメラがまだ合っていない)・向き0なら null', () => {
    expect(practiceEdgeInsideDistance({ x: 5000, y: 5000 }, { x: 0, y: -1 }, camAt(0, 0), view, 1)).toBeNull();
    expect(practiceEdgeInsideDistance({ x: 0, y: 0 }, { x: 0, y: 0 }, camAt(0, 0), view, 1)).toBeNull();
  });
});
