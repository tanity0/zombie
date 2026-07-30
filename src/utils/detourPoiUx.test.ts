// 寄り道POIの体験まわり(PACING_PUZZLE.md §6.24-UX「POI-UX」)の純関数テスト。
// 守りたい不変条件:
//  - 通信は**1ラン1回/種**(種ごとに独立)。
//  - 通信の数値(スクラップ額/滞在秒)は**定数から埋まる**=バランス調整で文面が嘘にならない。
//  - 通信の話者は**その方角を担当する護衛**(既存の「担当NPCが喋る」慣例)。護衛が居なければ null
//    =呼び出し側がバナーへフォールバックできる。
import { describe, it, expect } from 'vitest';
import {
  POI_LABEL, POI_DWELL_SEC, poiIntelLine, shouldShowPoiIntel, emptyPoiIntelShown,
  pickPoiIntelSpeaker, poiUnlockBandText, POI_BAND_MS, POI_VACCINE_DESC, POI_SKILL_NOTE,
} from './detourPoiUx';
import { ARMORY_SCRAP_COST } from '../world/armory';
import { DETOUR_DWELL_MS } from '../world/detourPoi';

describe('poiIntelLine(進入時の通信)', () => {
  it('3種とも「何の場所か」「何をすれば」「何が貰えるか」を1行で言う', () => {
    const h = poiIntelLine('hospital');
    expect(h).toContain('病院');
    expect(h).toContain('サークル');
    expect(h).toContain('ワクチン');

    const a = poiIntelLine('armory');
    expect(a).toContain('武器庫');
    expect(a).toContain('サークル');
    expect(a).toContain('装備');

    const p = poiIntelLine('police');
    expect(p).toContain('警察署');
    expect(p).toContain('全滅');
    expect(p).toContain('この出撃');
  });

  it('武器庫の通信は取引内容(スクラップいくらで交換か)を含む=同意なしの自動支払いにしない(裁定a)', () => {
    expect(poiIntelLine('armory')).toContain(`スクラップ${ARMORY_SCRAP_COST}`);
  });

  it('滞在秒は定数(DETOUR_DWELL_MS)から埋まる=秒数を変えても文面が嘘にならない', () => {
    expect(POI_DWELL_SEC).toBe(Math.round(DETOUR_DWELL_MS / 1000));
    expect(poiIntelLine('hospital')).toContain(`${POI_DWELL_SEC}秒`);
    expect(poiIntelLine('armory')).toContain(`${POI_DWELL_SEC}秒`);
  });

  it('1行(改行を含まない)', () => {
    for (const k of ['police', 'armory', 'hospital'] as const) {
      expect(poiIntelLine(k)).not.toContain('\n');
    }
  });
});

describe('shouldShowPoiIntel(1ラン1回/種)', () => {
  it('新ランの初期値では3種とも出せる', () => {
    const shown = emptyPoiIntelShown();
    expect(shown).toEqual({ police: false, armory: false, hospital: false });
    for (const k of ['police', 'armory', 'hospital'] as const) {
      expect(shouldShowPoiIntel(shown, k)).toBe(true);
    }
  });

  it('一度出した種は二度と出さない。他の種は独立して出せる', () => {
    const shown = { ...emptyPoiIntelShown(), hospital: true };
    expect(shouldShowPoiIntel(shown, 'hospital')).toBe(false);
    expect(shouldShowPoiIntel(shown, 'armory')).toBe(true);
    expect(shouldShowPoiIntel(shown, 'police')).toBe(true);
  });
});

describe('pickPoiIntelSpeaker(通信の話者)', () => {
  const escorts = [
    { baseId: 'base-0', soldierIndex: 0 },
    { baseId: 'base-1', soldierIndex: 1 },
    { baseId: 'base-2', soldierIndex: 2 },
    { baseId: 'base-3', soldierIndex: 3 },
  ];

  it('その方角(セクター)を担当する護衛が喋る', () => {
    expect(pickPoiIntelSpeaker(escorts, 2)?.soldierIndex).toBe(2);
    expect(pickPoiIntelSpeaker(escorts, 0)?.soldierIndex).toBe(0);
  });

  it('担当が居なければロスターの先頭にフォールバックする', () => {
    expect(pickPoiIntelSpeaker([escorts[1], escorts[3]], 0)?.soldierIndex).toBe(1);
  });

  it('護衛が1人も居ない出撃では null(呼び出し側がバナーへ落とす)', () => {
    expect(pickPoiIntelSpeaker([], 1)).toBeNull();
  });
});

describe('解放の到達帯 / トーストの固定文言', () => {
  it('帯は「{POI名} 解放」', () => {
    expect(poiUnlockBandText('police')).toBe(`${POI_LABEL.police} 解放`);
    expect(poiUnlockBandText('armory')).toBe('武器庫 解放');
    expect(poiUnlockBandText('hospital')).toBe('病院 解放');
    expect(POI_BAND_MS).toBeGreaterThan(0);
  });

  it('ワクチンの効果説明と、警察署スキルの但し書きがある(名前だけにしない)', () => {
    expect(POI_VACCINE_DESC).toContain('復活');
    expect(POI_SKILL_NOTE).toBe('この出撃のみ');
  });
});
