import { describe, expect, it } from 'vitest';
import { STAGES } from '../data/campaign';
import { OPS_MAP_PLACES } from '../data/opsMapPlaces';
import { stageFixedMapBossCandidates } from './sortieMapBosses';
import {
  currentMapPick, lockedPreviewStage, lockedSortieHint, mapPickFor, MAP_PICK_LABEL, openMapStages, pickMapStageHit, type MapPickContext,
} from './opsMapSelect';
import { nextOperationStage, sortieTarget, type SortieTarget } from './dsHome';
import { emptyStoryFlags } from '../data/progress';

const MAINS = ['stage-tutorial', 'stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-6', 'stage-7'];
const st = (id: string) => STAGES.find(s => s.id === id)!;
const unlocked = (cleared: Set<string>) => new Set(STAGES.filter(s => s.kind === 'main' && (s.unlockBy === null || cleared.has(s.unlockBy))).map(s => s.id));

// 途中(ステージ3まで)・NEXT=ステージ4
const midCleared = new Set(MAINS.slice(0, 4));
const midTarget: SortieTarget = { stage: st('stage-4'), kind: 'next' };
const midCtx = (): MapPickContext => ({
  stages: STAGES, cleared: midCleared, target: midTarget, sortieableIds: unlocked(midCleared), locked: lockedPreviewStage(STAGES, midTarget),
});
// 全クリア後・前回=ステージ3
const allCleared = new Set(MAINS);
const lastTarget: SortieTarget = { stage: st('stage-3'), kind: 'last' };
const allCtx = (): MapPickContext => ({
  stages: STAGES, cleared: allCleared, target: lastTarget, sortieableIds: unlocked(allCleared), locked: lockedPreviewStage(STAGES, lastTarget),
});

describe('lockedPreviewStage(NEXT の1つ先だけ)', () => {
  it('NEXT=ステージ4 なら、ステージ4 をクリアすると開くステージ5', () => {
    expect(lockedPreviewStage(STAGES, midTarget)?.id).toBe('stage-5');
  });
  it('解放の判定(unlockBy)から決まる=NEXT を前提に持つ本編', () => {
    for (const s of STAGES.filter(x => x.kind === 'main' && !x.hidden)) {
      const l = lockedPreviewStage(STAGES, { stage: s, kind: 'next' });
      if (l) expect(l.unlockBy).toBe(s.id);
    }
  });
  it('「前回」・出撃先なしでは出さない', () => {
    expect(lockedPreviewStage(STAGES, lastTarget)).toBeNull();
    expect(lockedPreviewStage(STAGES, null)).toBeNull();
  });
});

describe('mapPickFor / currentMapPick', () => {
  it('開いた時は NEXT(全クリア後は前回)', () => {
    expect(currentMapPick(null, midCtx())).toMatchObject({ kind: 'next', stage: { id: 'stage-4' } });
    expect(currentMapPick(null, allCtx())).toMatchObject({ kind: 'last', stage: { id: 'stage-3' } });
  });
  it('出撃先が無ければ選択中も無い', () => {
    expect(currentMapPick(null, { ...midCtx(), target: null, locked: null })).toBeNull();
  });
  it('クリア済み=再訪・選ぶと任務はそのステージ', () => {
    const p = mapPickFor('stage-5', allCtx());
    expect(p?.kind).toBe('revisit');
    expect(p?.stage.main.title).toBe(st('stage-5').main.title);
  });
  it('未解放(NEXT の1つ先)=locked・開く条件は前のステージの場所の名', () => {
    const p = mapPickFor('stage-5', midCtx());
    expect(p?.kind).toBe('locked');
    expect(p?.after?.id).toBe('stage-4');
    expect(lockedSortieHint(p?.after)).toBe(`${st('stage-4').locationTitle}の後に開く`);
  });
  it('NEXT の2つ先・地図に場所の無いステージは選べない(選ぶと開いた時の形に戻る)', () => {
    expect(mapPickFor('stage-6', midCtx())).toBeNull();
    expect(mapPickFor('no-such-stage', midCtx())).toBeNull();
    expect(currentMapPick('stage-6', midCtx())).toMatchObject({ kind: 'next', stage: { id: 'stage-4' } });
  });
  it('札の言葉', () => {
    expect(MAP_PICK_LABEL.next).toBe('目標');
    expect(MAP_PICK_LABEL.last).toBe('前回');
    expect(MAP_PICK_LABEL.revisit).toBe('再訪');
    expect(MAP_PICK_LABEL.locked).toBe('未解放');
  });
  it('ボスの顔のステージ(データの対応)は、地図に場所があり出撃できれば選べる', () => {
    const ctx = allCtx();
    for (const f of stageFixedMapBossCandidates()) {
      if (!OPS_MAP_PLACES[f.stageId] || !ctx.sortieableIds.has(f.stageId)) continue;
      expect(mapPickFor(f.stageId, ctx)?.stage.id).toBe(f.stageId);
    }
  });
});

describe('任意のチュートリアル(目標ではないが地図で選べる)', () => {
  const ctxFor = (cleared: Set<string>): MapPickContext => {
    const f = emptyStoryFlags();
    const target = sortieTarget(STAGES, nextOperationStage(STAGES, cleared, f), cleared, f, null);
    return { stages: STAGES, cleared, target, sortieableIds: unlocked(cleared), locked: lockedPreviewStage(STAGES, target) };
  };
  it('新しい端末: 目標=ステージ1・洞窟は「未踏」の印(押せば選べる)・未解放の予告=ステージ2', () => {
    const c = ctxFor(new Set());
    expect(currentMapPick(null, c)).toMatchObject({ kind: 'next', stage: { id: 'stage-1' } });
    expect(openMapStages(c).map(s => s.id)).toEqual(['stage-tutorial']);
    expect(mapPickFor('stage-tutorial', c)).toMatchObject({ kind: 'open', stage: { id: 'stage-tutorial' } });
    expect(MAP_PICK_LABEL.open).toBe('未踏');
    expect(c.locked?.id).toBe('stage-2');
  });
  it('チュートリアルだけクリア: 目標=ステージ1・洞窟は再訪(未踏の印は無い)', () => {
    const c = ctxFor(new Set(['stage-tutorial']));
    expect(currentMapPick(null, c)).toMatchObject({ kind: 'next', stage: { id: 'stage-1' } });
    expect(openMapStages(c)).toEqual([]);
    expect(mapPickFor('stage-tutorial', c)?.kind).toBe('revisit');
  });
  it('ステージ1だけクリア(洞窟は未クリア): 目標=ステージ2・洞窟は未踏の印のまま', () => {
    const c = ctxFor(new Set(['stage-1']));
    expect(currentMapPick(null, c)).toMatchObject({ kind: 'next', stage: { id: 'stage-2' } });
    expect(openMapStages(c).map(s => s.id)).toEqual(['stage-tutorial']);
  });
  it('未踏の印は目標・未解放の予告と重ねない(通常の進行=チュートリアル以外は出ない)', () => {
    for (let n = 0; n <= MAINS.length; n++) {
      for (const skipTut of [false, true]) {
        const cleared = new Set(MAINS.slice(0, n).filter(id => !(skipTut && id === 'stage-tutorial')));
        const c = ctxFor(cleared);
        for (const s of openMapStages(c)) {
          expect(s.id).toBe('stage-tutorial');
          expect(s.id).not.toBe(c.target?.stage.id);
          expect(s.id).not.toBe(c.locked?.id);
        }
      }
    }
  });
});

describe('pickMapStageHit(44px 四方・重なる所は近い方)', () => {
  const hits = [{ stageId: 'a', x: 0, y: 0 }, { stageId: 'b', x: 30, y: 0 }];
  it('当たりの外は null', () => {
    expect(pickMapStageHit(hits, -23, 0, 22)).toBeNull();
    expect(pickMapStageHit(hits, 0, 23, 22)).toBeNull();
  });
  it('四角の角まで当たる', () => {
    expect(pickMapStageHit(hits, -22, 22, 22)).toBe('a');
  });
  it('重なる所は押した点に近い方', () => {
    expect(pickMapStageHit(hits, 14, 0, 22)).toBe('a');
    expect(pickMapStageHit(hits, 16, 0, 22)).toBe('b');
    expect(pickMapStageHit(hits, 16, 20, 22)).toBe('b');
  });
  it('同じ距離なら一覧の先', () => {
    expect(pickMapStageHit(hits, 15, 0, 22)).toBe('a');
  });
});
