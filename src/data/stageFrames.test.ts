import { describe, expect, it } from 'vitest';
import { STAGE_FRAMES, stageFrameSprites, stageFramesWanted } from './stageFrames';

describe('stageFrames(横長の左右の枠)', () => {
  it('スマホ縦(w <= h)では出さない', () => {
    expect(stageFramesWanted({ stageId: 'stage-1', w: 430, h: 932 })).toBe(false);
    expect(stageFramesWanted({ stageId: 'stage-1', w: 375, h: 667 })).toBe(false);
    expect(stageFramesWanted({ stageId: 'stage-1', w: 800, h: 800 })).toBe(false);
  });
  it('横長のステージ1だけ出す(屋内・回廊・登録の無いステージは出さない)', () => {
    expect(stageFramesWanted({ stageId: 'stage-1', w: 1280, h: 720 })).toBe(true);
    expect(stageFramesWanted({ stageId: 'stage-1', w: 1280, h: 720, indoor: true })).toBe(false);
    expect(stageFramesWanted({ stageId: 'stage-1', w: 1280, h: 720, corridor: true })).toBe(false);
    expect(stageFramesWanted({ stageId: 'stage-3', w: 1280, h: 720 })).toBe(false);
  });
  it('登録した絵の名前は frames/ 配下', () => {
    for (const id of Object.keys(STAGE_FRAMES)) {
      for (const n of stageFrameSprites(id)) expect(n.startsWith('frames/'), n).toBe(true);
    }
  });
});
