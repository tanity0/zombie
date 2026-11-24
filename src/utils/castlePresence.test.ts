import { describe, it, expect } from 'vitest';
import { castlePresent, type CastlePresenceCtx } from './castlePresence';

const run = (o: Partial<CastlePresenceCtx>): CastlePresenceCtx => ({ stageId: 'stage-1', farBackdrop: '', stageTheme: '', corridorMode: false, ...o });

describe('castlePresent(このランに城が在るか)', () => {
  it('ステージ7は城なし(遠景 stage7 の森)', () => {
    expect(castlePresent(run({ stageId: 'stage-7', farBackdrop: 'stage7' }))).toBe(false);
  });
  it('ステージ1/3/4/5 は今のまま城あり', () => {
    expect(castlePresent(run({ stageId: 'stage-1', farBackdrop: '' }))).toBe(true);
    expect(castlePresent(run({ stageId: 'stage-3', farBackdrop: 'city' }))).toBe(true);
    expect(castlePresent(run({ stageId: 'stage-4', farBackdrop: '' }))).toBe(true);
    expect(castlePresent(run({ stageId: 'stage-5', farBackdrop: '' }))).toBe(true);
  });
  it('チュートリアル・エンディング・研究所スキン・洋館通路は今のまま城なし', () => {
    expect(castlePresent(run({ stageId: 'stage-0', farBackdrop: 'tutorial' }))).toBe(false);
    expect(castlePresent(run({ farBackdrop: 'ending' }))).toBe(false);
    expect(castlePresent(run({ stageTheme: 'lab' }))).toBe(false);
    expect(castlePresent(run({ stageId: 'stage-ex1', corridorMode: true }))).toBe(false);
  });
});
