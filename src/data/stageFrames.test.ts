import { describe, expect, it } from 'vitest';
import { STAGE_FRAMES, STAGE_FRAME_PORTRAIT_VISIBLE_FRAC, stageFrameSprites, stageFrameVisibleFrac, stageFramesTunnelWanted, stageFramesWanted } from './stageFrames';

describe('stageFrames(横長の左右の枠)', () => {
  it('スマホ縦(w <= h)でも出し、幅の1/3だけ映り込ませる。横長は全幅', () => {
    expect(stageFramesWanted({ stageId: 'stage-1', w: 430, h: 932 })).toBe(true);
    expect(stageFramesWanted({ stageId: 'stage-1', w: 375, h: 667 })).toBe(true);
    expect(stageFrameVisibleFrac(430, 932)).toBeCloseTo(1 / 3, 9);
    expect(stageFrameVisibleFrac(800, 800)).toBe(STAGE_FRAME_PORTRAIT_VISIBLE_FRAC);
    expect(stageFrameVisibleFrac(1280, 720)).toBe(1);
  });
  it('横長のステージ1だけ出す(屋内・回廊・登録の無いステージは出さない)', () => {
    expect(stageFramesWanted({ stageId: 'stage-1', w: 1280, h: 720 })).toBe(true);
    expect(stageFramesWanted({ stageId: 'stage-1', w: 1280, h: 720, indoor: true })).toBe(false);
    expect(stageFramesWanted({ stageId: 'stage-1', w: 1280, h: 720, corridor: true })).toBe(false);
    expect(stageFramesWanted({ stageId: 'no-such-stage', w: 1280, h: 720 })).toBe(false);
  });
  it('登場の枠のトンネルは縦持ち・横持ち関係なく、枠のあるステージで出す(屋内・回廊・登録の無いステージは出さない)', () => {
    expect(stageFramesTunnelWanted({ stageId: 'stage-1' })).toBe(true);
    expect(stageFramesTunnelWanted({ stageId: 'stage-1', indoor: true })).toBe(false);
    expect(stageFramesTunnelWanted({ stageId: 'stage-1', corridor: true })).toBe(false);
    expect(stageFramesTunnelWanted({ stageId: 'no-such-stage' })).toBe(false);
  });
  it('登録した絵の名前は frames/ 配下', () => {
    for (const id of Object.keys(STAGE_FRAMES)) {
      for (const n of stageFrameSprites(id)) expect(n.startsWith('frames/'), n).toBe(true);
    }
  });
});

describe('stageFrames: 回廊のステージ(洋館)', () => {
  it('ステージ6は回廊でも枠を出す(縦も)・トンネルは回廊では出さない', () => {
    expect(stageFramesWanted({ stageId: 'stage-6', w: 1280, h: 720, corridor: true })).toBe(true);
    expect(stageFramesWanted({ stageId: 'stage-6', w: 430, h: 932, corridor: true })).toBe(true);
    expect(stageFramesTunnelWanted({ stageId: 'stage-6', corridor: true })).toBe(false);
  });
  it('他のステージは回廊では今どおり出さない', () => {
    expect(stageFramesWanted({ stageId: 'stage-1', w: 1280, h: 720, corridor: true })).toBe(false);
  });
});
