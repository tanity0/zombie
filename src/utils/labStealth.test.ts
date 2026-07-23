import { describe, it, expect } from 'vitest';
import { isLabOffscreenLost, LAB_OFFSCREEN_MARGIN } from './labStealth';

// ステージ2の索敵解除(v0.25.2064変更「画面外にいったら見失う」)。
// 可視域はスマホ縦想定の半幅215/半高466で代表(値はテスト内の代表値であり実機依存)。
const HALF_W = 215;
const HALF_H = 466;

describe('isLabOffscreenLost (ステージ2・画面外で見失う)', () => {
  it('マージン(叩き台40px)が定義されている', () => {
    expect(LAB_OFFSCREEN_MARGIN).toBe(40);
  });

  it('画面内(半幅/半高以内)なら見失わない', () => {
    expect(isLabOffscreenLost(0, 0, HALF_W, HALF_H)).toBe(false);
    expect(isLabOffscreenLost(HALF_W, HALF_H, HALF_W, HALF_H)).toBe(false);
    expect(isLabOffscreenLost(-HALF_W, -HALF_H, HALF_W, HALF_H)).toBe(false);
  });

  it('画面端の少し外(マージン内)はまだ見失わない=見切れ猶予', () => {
    expect(isLabOffscreenLost(HALF_W + LAB_OFFSCREEN_MARGIN, 0, HALF_W, HALF_H)).toBe(false);
    expect(isLabOffscreenLost(0, -(HALF_H + LAB_OFFSCREEN_MARGIN), HALF_W, HALF_H)).toBe(false);
  });

  it('マージンを超えて画面外へ出たら見失う(横/縦どちらの軸でも)', () => {
    expect(isLabOffscreenLost(HALF_W + LAB_OFFSCREEN_MARGIN + 1, 0, HALF_W, HALF_H)).toBe(true);
    expect(isLabOffscreenLost(-(HALF_W + LAB_OFFSCREEN_MARGIN + 1), 0, HALF_W, HALF_H)).toBe(true);
    expect(isLabOffscreenLost(0, HALF_H + LAB_OFFSCREEN_MARGIN + 1, HALF_W, HALF_H)).toBe(true);
  });

  it('片軸が画面内でも、もう片軸が外なら見失う(矩形判定)', () => {
    expect(isLabOffscreenLost(10, HALF_H + LAB_OFFSCREEN_MARGIN + 1, HALF_W, HALF_H)).toBe(true);
  });
});
