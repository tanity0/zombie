// 寄り道POIのチュートリアル(PACING_PUZZLE.md §6.24-UX 裁定c)の発火条件。
// 守りたい不変条件:
//  - **M1(stage-1)だけ**・**端末で1度だけ**(本編ステージ扱い)。M0の「毎出撃」型ではない。
//  - 寄り道POIが立たない出撃では説明しない(存在しないものを説明しない)。
//  - 開幕の会話/通信・他のポップアップ・メニューには割り込まない。
//  - 本文に数値を書かない(CLAUDE.md「チュートリアルの作り方」)。
import { describe, it, expect } from 'vitest';
import {
  shouldShowDetourPoiTutorial, DETOUR_POI_TUTORIAL_STAGE_ID, DETOUR_POI_TUTORIAL_AT_MS,
} from './detourPoiTutorial';
import { getTutorial } from '../data/tutorials';

const OPEN = {
  stageId: DETOUR_POI_TUTORIAL_STAGE_ID,
  poiPresent: true,
  seen: false,
  popupOpen: false,
  menuOpen: false,
  dialogueActive: false,
  gameTimeMs: DETOUR_POI_TUTORIAL_AT_MS,
};

describe('shouldShowDetourPoiTutorial', () => {
  it('M1の出撃で、寄り道POIが立っていて、待ちを過ぎたら出す', () => {
    expect(shouldShowDetourPoiTutorial(OPEN)).toBe(true);
  });

  it('M1以外のステージでは出さない(社長裁定「M1来た時に一度だけ」)', () => {
    expect(shouldShowDetourPoiTutorial({ ...OPEN, stageId: 'stage-2' })).toBe(false);
    expect(shouldShowDetourPoiTutorial({ ...OPEN, stageId: '' })).toBe(false);
  });

  it('寄り道POIが立たない出撃では出さない', () => {
    expect(shouldShowDetourPoiTutorial({ ...OPEN, poiPresent: false })).toBe(false);
  });

  it('端末で既読なら二度と出さない(本編ステージ扱い=1度だけ)', () => {
    expect(shouldShowDetourPoiTutorial({ ...OPEN, seen: true })).toBe(false);
  });

  it('別のポップアップ/メニューが開いている間は出さない', () => {
    expect(shouldShowDetourPoiTutorial({ ...OPEN, popupOpen: true })).toBe(false);
    expect(shouldShowDetourPoiTutorial({ ...OPEN, menuOpen: true })).toBe(false);
  });

  it('出撃時の会話/通信が流れている間は割り込まない', () => {
    expect(shouldShowDetourPoiTutorial({ ...OPEN, dialogueActive: true })).toBe(false);
  });

  it('開幕の待ち(登場演出とぶつけない間)より前は出さない', () => {
    expect(shouldShowDetourPoiTutorial({ ...OPEN, gameTimeMs: DETOUR_POI_TUTORIAL_AT_MS - 1 })).toBe(false);
  });
});

describe('台帳(src/data/tutorials.ts)の本文', () => {
  const entry = getTutorial('detour-poi');

  it('台帳に1枚ある(ゲーム中のポップアップと資料室が同じ文章を引く)', () => {
    expect(entry).toBeTruthy();
    expect(entry!.lines.length).toBeGreaterThan(0);
  });

  it('3種が何をくれる場所かと、矢印の色の意味を書いてある', () => {
    const body = entry!.lines.join('');
    for (const word of ['病院', '武器庫', '警察署', '緑', '琥珀', '青', '赤']) {
      expect(body).toContain(word);
    }
  });

  it('本文に数値を書かない(バランス調整で文面が嘘にならないように)', () => {
    for (const line of entry!.lines) expect(line).not.toMatch(/[0-9０-９]/);
  });
});
