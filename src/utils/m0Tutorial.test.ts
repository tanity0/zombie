// 訓練(M0)「移動」チュートリアルの発火条件。**M0は毎出撃で出る**(社長指示v0.25.2266)ことと、
// 台帳(src/data/tutorials.ts)の体裁を固定する。
import { describe, it, expect } from 'vitest';
import { shouldShowMoveTutorial, M0_MOVE_TUTORIAL_AT_MS } from './m0Tutorial';
import { TUTORIALS, getTutorial } from '../data/tutorials';

const OPEN = { shownThisRun: false, popupOpen: false, menuOpen: false };

describe('shouldShowMoveTutorial', () => {
  it('待ち時間を過ぎたら出す', () => {
    expect(shouldShowMoveTutorial({ ...OPEN, gameTimeMs: M0_MOVE_TUTORIAL_AT_MS })).toBe(true);
  });

  it('待ち時間の前は出さない(開幕の登場演出とぶつけない)', () => {
    expect(shouldShowMoveTutorial({ ...OPEN, gameTimeMs: M0_MOVE_TUTORIAL_AT_MS - 1 })).toBe(false);
  });

  // **M0はチュートリアルステージなので毎出撃で出す**(社長指示v0.25.2266)。
  // 見るのは「この出撃で出したか」だけで、端末の既読(zombie:tutorialsSeen)は見ない。
  // v0.25.2264で端末既読ゲートを入れたのは取り違えだった。この2件がその撤回を固定する。
  it('同じ出撃で2回目は出さない(連発防止)', () => {
    expect(shouldShowMoveTutorial({ ...OPEN, shownThisRun: true, gameTimeMs: 9999 })).toBe(false);
  });

  it('端末で表示済みでも次の出撃では出る(M0は毎回)', () => {
    // 端末既読は引数に無い=そもそも参照しない設計。新しい出撃では shownThisRun=false から始まる。
    expect(shouldShowMoveTutorial({ ...OPEN, gameTimeMs: 9999 })).toBe(true);
  });

  it('他ポップアップ/メニューが開いている間は出さない(UIを重ねない)', () => {
    expect(shouldShowMoveTutorial({ ...OPEN, popupOpen: true, gameTimeMs: 9999 })).toBe(false);
    expect(shouldShowMoveTutorial({ ...OPEN, menuOpen: true, gameTimeMs: 9999 })).toBe(false);
  });
});

// CLAUDE.md「チュートリアルの作り方」= 本文台帳が唯一の出どころ。全件がその形を満たすことを機械化する。
describe('台帳の体裁(全チュートリアル共通)', () => {
  it('全件に題・本文・出典があり、idが重複しない', () => {
    for (const t of TUTORIALS) {
      expect(t.title.length, t.id).toBeGreaterThan(0);
      expect(t.lines.length, t.id).toBeGreaterThan(0);
      expect(t.where.length, t.id).toBeGreaterThan(0);
    }
    expect(new Set(TUTORIALS.map(t => t.id)).size).toBe(TUTORIALS.length);
  });

  it('全件に手本(img)が付いている', () => {
    for (const t of TUTORIALS) expect(t.img, `${t.id} に手本が無い`).toBeTruthy();
  });

  // 「本文に数値を書かない」(後でバランス調整した時に文面が嘘にならないようにする)。
  // px/秒/m などの単位つき数値が本文に混ざっていないことを見る。
  it('本文に単位つきの数値を書いていない', () => {
    for (const t of TUTORIALS) {
      const body = t.lines.join('');
      expect(body, `${t.id} の本文に数値がある`).not.toMatch(/\d+\s*(px|ピクセル|秒|ms|m)\b/);
    }
  });

  it('移動チュートリアルは台帳から引ける', () => {
    expect(getTutorial('move')?.title).toBe('移動');
  });
});
