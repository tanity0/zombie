// 作戦室の地図に出すボスの顔(research/SORTIE_MAP_BOSS_ICONS.md §2・§5)。
import { describe, it, expect } from 'vitest';
import {
  mapBossFaces, stageFixedMapBossCandidates, allMapBossSprites, layoutMapFaces, MAP_BOSS_EXCLUDED_TYPES,
  MAP_FACE_MAX_PER_SPOT, type MapBossFace,
} from './sortieMapBosses';
import { PRACTICE_SLOTS } from './bossPractice';
import { BOSS_HEAD_CROPS } from '../data/bossHeadCrops';
import { OPS_MAP_PLACES } from '../data/opsMapPlaces';

const ALL_STAGES = new Set(Object.keys(OPS_MAP_PLACES));
const allKeys = new Set([...PRACTICE_SLOTS.map(s => s.encounterSlotKey), 'phantom-brawler']);

describe('載せる条件', () => {
  it('出会った・倒していないステージ固定のボスが、その枠のステージに出る', () => {
    const faces = mapBossFaces({ encountered: new Set(['giantbat@stage-3', 'mimir']), defeated: new Set(), sortieableStageIds: ALL_STAGES, patrol: null });
    expect(faces.map(f => [f.key, f.stageId])).toEqual([['giantbat@stage-3', 'stage-3'], ['mimir', 'stage-1']]);
  });
  it('倒したら出ない・出会っていなければ出ない', () => {
    const faces = mapBossFaces({ encountered: new Set(['giantbat@stage-3', 'mimir']), defeated: new Set(['mimir']), sortieableStageIds: ALL_STAGES, patrol: null });
    expect(faces.map(f => f.key)).toEqual(['giantbat@stage-3']);
  });
  it('練習の slotKey(…@practice)では照らさない', () => {
    const faces = mapBossFaces({ encountered: new Set(['bounty-ranged@practice']), defeated: new Set(), sortieableStageIds: ALL_STAGES, patrol: null });
    expect(faces).toEqual([]);
  });
  it('出撃できないステージには出さない', () => {
    const faces = mapBossFaces({ encountered: new Set(['giantbat@stage-3']), defeated: new Set(), sortieableStageIds: new Set(['stage-1']), patrol: null });
    expect(faces).toEqual([]);
  });
  it('ハンター・死神・使者・変異塊・英雄・解放軍群はどんな状態でも出ない', () => {
    const faces = mapBossFaces({ encountered: new Set([...allKeys, ...MAP_BOSS_EXCLUDED_TYPES]), defeated: new Set(), sortieableStageIds: ALL_STAGES, patrol: null });
    const keys = faces.map(f => f.key);
    for (const t of ['hunter', 'reaper', 'hangedman', 'lab-crawler', 'mutant-hero', 'mutant-liberty']) expect(keys).not.toContain(t);
    for (const s of stageFixedMapBossCandidates()) expect(MAP_BOSS_EXCLUDED_TYPES).not.toContain(PRACTICE_SLOTS.find(p => p.encounterSlotKey === s.key)?.bossType);
  });
  it('徘徊の枠: 確定した時だけ・出会っていて倒していない時だけ、確定したステージに出る', () => {
    const base = { defeated: new Set<string>(), sortieableStageIds: ALL_STAGES };
    expect(mapBossFaces({ ...base, encountered: new Set(['mutant-wraith']), patrol: { boss: 'wraith', stageId: 'stage-4' } }))
      .toEqual([{ key: 'mutant-wraith', stageId: 'stage-4', sprite: 'mutant-wraith', patrol: true }]);
    expect(mapBossFaces({ ...base, encountered: new Set(['phantom-brawler']), patrol: { boss: 'brawler', stageId: 'stage-5' } }))
      .toEqual([{ key: 'phantom-brawler', stageId: 'stage-5', sprite: 'kenki-idle', patrol: true }]);
    expect(mapBossFaces({ ...base, encountered: new Set(['mutant-wraith']), patrol: { boss: 'none' } })).toEqual([]);
    expect(mapBossFaces({ ...base, encountered: new Set(), patrol: { boss: 'wraith', stageId: 'stage-4' } })).toEqual([]);
    expect(mapBossFaces({ ...base, defeated: new Set(['mutant-astro']), encountered: new Set(['mutant-astro']), patrol: { boss: 'astro', stageId: 'stage-1' } })).toEqual([]);
  });
});

describe('頭の切り抜きの表', () => {
  it('地図に出し得る全ボスの絵に行がある(台帳漏れ)', () => {
    const missing = allMapBossSprites().filter(s => !BOSS_HEAD_CROPS[s]);
    expect(missing).toEqual([]);
  });
  it('値の範囲(中心は絵の中・半径は正)', () => {
    for (const [k, c] of Object.entries(BOSS_HEAD_CROPS)) {
      expect(c.u, k).toBeGreaterThan(0); expect(c.u, k).toBeLessThan(1);
      expect(c.v, k).toBeGreaterThan(0); expect(c.v, k).toBeLessThan(1);
      expect(c.r, k).toBeGreaterThan(0); expect(c.r, k).toBeLessThan(0.5);
      expect(c.w, k).toBeGreaterThan(0); expect(c.h, k).toBeGreaterThan(0);
    }
  });
});

describe('1地点の並べ方', () => {
  const face = (key: string, stageId = 'stage-1', patrol = false): MapBossFace => ({ key, stageId, sprite: 'mimir', ...(patrol ? { patrol: true } : {}) });
  const place = (id: string) => (id === 'stage-7' ? [500, 990] as const : id === 'stage-1' ? [500, 400] as const
    : id === 'stage-2' ? [520, 420] as const : id === 'stage-edge' ? [5, 400] as const : undefined);
  const o = { diameter: 80, gap: 10, offset: 20, mapW: 2000, mapH: 1000, moreW: 30, markHalf: 10 };
  it('最大4つまで横一列で点の真下・中央揃え、5つ目以降は「+N」', () => {
    const [spot] = layoutMapFaces([face('a'), face('b'), face('c'), face('d'), face('e'), face('f')], place, o);
    expect(spot.faces.length).toBe(MAP_FACE_MAX_PER_SPOT);
    expect(MAP_FACE_MAX_PER_SPOT).toBe(4);
    expect(spot.faces.map(f => f.x)).toEqual([365, 455, 545, 635]);
    expect(spot.faces.every(f => f.y === 400 + 20 + 40)).toBe(true);
    expect(spot.below).toBe(true);
    expect(spot.more).toBe(2);
    expect(spot.moreX).toBe(325 + 350 + 10);
  });
  it('徘徊は必ず先頭に並び、「+N」に入らない', () => {
    const [spot] = layoutMapFaces([face('a'), face('b'), face('c'), face('d'), face('e'), face('p', 'stage-1', true)], place, o);
    expect(spot.faces[0].face.key).toBe('p');
    expect(spot.faces.map(f => f.face.key)).toEqual(['p', 'a', 'b', 'c']);
    expect(spot.more).toBe(2);
  });
  it('下端からはみ出すなら点の上側へ', () => {
    const [spot] = layoutMapFaces([face('a', 'stage-7')], place, o);
    expect(spot.faces[0].y).toBe(990 - 20 - 40);
    expect(spot.below).toBe(false);
    expect(spot.more).toBe(0);
  });
  it('地図の左右からはみ出すなら内へ寄せる', () => {
    const [spot] = layoutMapFaces([face('a', 'stage-edge'), face('b', 'stage-edge')], place, o);
    expect(spot.faces[0].x - 40).toBe(0);
  });
  it('近い地点の列が重なる時は、後の地点の列を上下へ逃がす', () => {
    const [s1, s2] = layoutMapFaces([face('a', 'stage-1'), face('b', 'stage-2')], place, o);
    expect(s1.faces[0].y).toBe(460);
    // stage-2 の下(520)は stage-1 の列と重なる → 上(420-20-40=360)へ
    expect(s2.faces[0].y).toBe(360);
    const box = (y: number) => [y - 45, y + 45];
    const [a0, a1] = box(s1.faces[0].y), [b0, b1] = box(s2.faces[0].y);
    expect(a0 < b1 && b0 < a1).toBe(false);
  });
  it('避ける印(NEXT の菱形など)の上には被せない', () => {
    const [spot] = layoutMapFaces([face('a')], place, { ...o, avoid: [{ x: 500, y: 470, half: 20 }] });
    expect(spot.below).toBe(false);
    expect(spot.faces[0].y).toBe(400 - 20 - 40);
  });
  it('引き線は点の縁から先頭の顔の縁まで', () => {
    const [spot] = layoutMapFaces([face('a')], place, o);
    expect(spot.line).toEqual({ x1: 500, y1: 410, x2: 500, y2: 420 });
  });
  it('同じ座標は同じ地点にまとめる・場所の無いステージは出さない', () => {
    const spots = layoutMapFaces([face('a'), face('b', 'stage-9'), face('c')], place, o);
    expect(spots.length).toBe(1);
    expect(spots[0].faces.map(f => f.face.key)).toEqual(['a', 'c']);
  });
});
