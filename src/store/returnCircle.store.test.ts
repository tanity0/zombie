// 帰還サークル(beginReturnPhase)を「行ける帯」の外へ食い込ませない(社長報告2026-10-20「ゴールが歩行禁止区域に食い込んでる時がある」)。
// ステージ2(屋外ラボ)の帯は上下±LAB_CORRIDOR_Y_LIMIT_PX。プレイヤーのそばで出すと、避ける押し出し・空き地探しが上下へ逃げて帯の外に出ていた。
import { describe, it, expect } from 'vitest';
import { useGameStore, LAB_CORRIDOR_Y_LIMIT_PX } from './gameStore';
import { isCircleInPlayableArea, clampCircleToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';

const LAB: PlayableAreaCtx = { farBackdrop: 'lab', labTheme: true, corridorMode: false, m0AdvanceLimitX: null, corridorRunInActive: false };

describe('帰還サークルは行ける帯の内側に出る', () => {
  it('純関数: 帯の外の円は内側へ寄る/内側の円はそのまま', () => {
    const r = 95;
    const c = clampCircleToPlayableArea(300, 400, r, LAB);
    expect(c.x).toBe(300);
    expect(c.y).toBe(LAB_CORRIDOR_Y_LIMIT_PX - r);
    expect(isCircleInPlayableArea(c.x, c.y, r, LAB)).toBe(true);
    expect(isCircleInPlayableArea(300, 0, r, LAB)).toBe(true);
    expect(isCircleInPlayableArea(300, LAB_CORRIDOR_Y_LIMIT_PX, r, LAB)).toBe(false);
  });

  it('ステージ2: プレイヤーが上下どこにいても、どの向きから避けても円は帯からはみ出さない', () => {
    const r0 = useGameStore.getState();
    for (const py of [-180, -90, 0, 90, 180]) {
      for (const [ox, oy] of [[0, -40], [0, 40], [30, 0], [-30, 10], [0, 0]]) {
        useGameStore.setState({
          stageTheme: 'lab', indoorMode: false, farBackdrop: 'lab', corridorMode: false, m0AdvanceLimitX: null, corridorRunInActive: false,
          returnCircle: null, gameWon: false,
          player: { ...r0.player, x: 5000 - r0.player.width / 2, y: py - r0.player.height / 2 },
        });
        useGameStore.getState().beginReturnPhase(5000 + ox, py + oy, true);
        const rc = useGameStore.getState().returnCircle;
        expect(rc).not.toBeNull();
        expect(Math.abs(rc!.y) + rc!.radius).toBeLessThanOrEqual(LAB_CORRIDOR_Y_LIMIT_PX + 1e-6);
      }
    }
  });
});
