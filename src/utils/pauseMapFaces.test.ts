import { describe, it, expect, beforeEach } from 'vitest';
import { pauseMapFaceOf } from './pauseMapFaces';
import { recordMapSightings, resetMapSightings, mapThreatSightings } from './mapSightings';
import { BOSS_HEAD_CROPS } from '../data/bossHeadCrops';

describe('一時停止の地図のボスの顔', () => {
  it('城ボスはステージの絵・顔の表にある絵だけ', () => {
    expect(pauseMapFaceOf({ type: 'giantbat' }, 'stage-3')).toEqual({ sprite: 'stage3-enemies/giantbat', patrol: false });
    expect(pauseMapFaceOf({ type: 'giantbat' }, 'stage-5')).toEqual({ sprite: 'stage5-enemies/giantbat', patrol: false });
    expect(pauseMapFaceOf({ type: 'thor' }, 'stage-4')).toEqual({ sprite: 'thor', patrol: false });
  });
  it('徘徊の枠(宇宙飛行群・亡霊・拳鬼)は血の赤の縁', () => {
    expect(pauseMapFaceOf({ type: 'mutant-astro' }, 'stage-1')).toEqual({ sprite: 'mutant-astro', patrol: true });
    expect(pauseMapFaceOf({ type: 'mutant-wraith' }, 'stage-1')).toEqual({ sprite: 'mutant-wraith', patrol: true });
    expect(pauseMapFaceOf({ type: 'guardian-phantom', phantomUnique: 'brawler' }, 'stage-1')).toEqual({ sprite: 'kenki-idle', patrol: true });
  });
  it('顔の表に無い物(宿敵の雑魚・拳鬼以外の幻影・表に無いボス)は null=菱形のまま', () => {
    expect(pauseMapFaceOf({ type: 'zombie' }, 'stage-1')).toBeNull();
    expect(pauseMapFaceOf({ type: 'guardian-phantom' }, 'stage-1')).toBeNull();
    expect(pauseMapFaceOf({ type: 'acrasiel' }, 'stage-1')).toBeNull();
  });
  it('返す絵は必ず顔の表にある', () => {
    for (const t of ['giantbat', 'mimir', 'jormungand', 'skadi', 'thor', 'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'idol', 'phillboss', 'mutant-astro', 'mutant-wraith'] as const) {
      for (const st of ['stage-1', 'stage-3', 'stage-4', 'stage-5']) {
        const f = pauseMapFaceOf({ type: t }, st);
        if (f) expect(BOSS_HEAD_CROPS[f.sprite]).toBeDefined();
      }
    }
  });
});

describe('mapThreatSightings は型を添える', () => {
  beforeEach(() => resetMapSightings());
  it('出会った物の型と幻影の誰かを返す(位置は mapThreatPositions と同じ)', () => {
    recordMapSightings([
      { id: 'a', type: 'thor', x: 100, y: 100, width: 40, height: 40 },
      { id: 'b', type: 'guardian-phantom', phantomUnique: 'brawler', x: 200, y: 100, width: 40, height: 40 },
    ], { x: 0, y: 0 }, { width: 400, height: 800 }, 1);
    expect(mapThreatSightings([])).toEqual([
      { x: 120, y: 120, type: 'thor' },
      { x: 220, y: 120, type: 'guardian-phantom', phantomUnique: 'brawler' },
    ]);
  });
});
