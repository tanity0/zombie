// research/STAGE_DIFFICULTY.md: ボス個別適用の係数ヘルパ。
// ①選択ステージの係数を返す ②**計測路(ボスメーカー/ガントレット)では1.0**(育成と同じ
// 「計測の基準を動かさない」原則=過去のTTKログと比較可能に保つ)。
//
// node 既定環境には localStorage も window も無いので、progress.test.ts と同じ作法で最小モックを差す
// (getSelectedStageId は `typeof localStorage === 'undefined'` で早期returnするため)。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => { backing[k] = v; },
  removeItem: (k: string) => { delete backing[k]; },
  clear: () => { for (const k of Object.keys(backing)) delete backing[k]; },
  key: () => null,
  get length() { return Object.keys(backing).length; },
} as Storage;

import { stageBossDiffMults, stageMobDiffMults, stageScoreMult } from './stageDiffMults';
import { stageHpMult, stageDmgMult, STAGE_SCORE_MULT } from '../config/stageDifficulty';
import { beginPracticeRun, endPracticeRun, PRACTICE_SLOTS } from './bossPractice';

const SELECTED_KEY = 'zombie.progress.selectedStage';
const setStage = (id: string) => { backing[SELECTED_KEY] = id; };

beforeEach(() => { for (const k of Object.keys(backing)) delete backing[k]; });
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe('stageBossDiffMults — 通常出撃は選択ステージの係数', () => {
  it('stage-4 を選んでいれば台帳と同じ値を返す', () => {
    setStage('stage-4');
    expect(stageBossDiffMults()).toEqual({ hp: stageHpMult('stage-4'), dmg: stageDmgMult('stage-4') });
  });

  it('階段に乗らないステージ(stage-1/2)と未選択は 1.0', () => {
    for (const s of ['stage-1', 'stage-2', '']) {
      setStage(s);
      expect(stageBossDiffMults(), s).toEqual({ hp: 1, dmg: 1 });
    }
  });

  // research/MASTERY.md v2 §6 / v2.1 A-13: ボスだけの上乗せ(stage-7 / stage-ex1 は体力×1.9・攻撃は据え置き)。
  it('stage-7 / stage-ex1 のボスは体力×1.9(攻撃は1.0)', () => {
    for (const s of ['stage-7', 'stage-ex1']) {
      setStage(s);
      expect(stageBossDiffMults(), s).toEqual({ hp: 1.9, dmg: 1 });
    }
  });
});

describe('stageMobDiffMults — 雑魚にはボスだけの上乗せを入れない', () => {
  it('stage-4 は台帳どおり・stage-7 / stage-ex1 は 1.0', () => {
    setStage('stage-4');
    expect(stageMobDiffMults()).toEqual({ hp: stageHpMult('stage-4'), dmg: stageDmgMult('stage-4') });
    for (const s of ['stage-7', 'stage-ex1', 'stage-1', '']) {
      setStage(s);
      expect(stageMobDiffMults(), s).toEqual({ hp: 1, dmg: 1 });
    }
  });
});

describe('stageScoreMult — スコアは体力とは別の表', () => {
  it('stage-3〜6 は STAGE_SCORE_MULT(1.2〜1.8)、stage-7 は 1.0', () => {
    for (const s of ['stage-3', 'stage-4', 'stage-5', 'stage-6']) {
      setStage(s);
      expect(stageScoreMult(), s).toBe(STAGE_SCORE_MULT[s]);
    }
    setStage('stage-7');
    expect(stageScoreMult()).toBe(1);
  });
  it('ボスメーカーでは 1.0', () => {
    setStage('stage-6');
    (globalThis as unknown as { window: unknown }).window = { location: { search: '?bossmaker=1' } };
    expect(stageScoreMult()).toBe(1);
  });
});

describe('練習ランは体力・攻撃の係数を無視する(research/MASTERY.md v2 §6)', () => {
  it('練習ラン中はボス用・雑魚用とも 1.0。スコアは従来どおり(枠のステージの値)', () => {
    const slot = PRACTICE_SLOTS.find(s => s.stageId === 'stage-6') ?? PRACTICE_SLOTS.find(s => s.stageId === 'stage-5')!;
    beginPracticeRun(slot, { stageId: '', mission: 'main', free: false });
    try {
      expect(stageBossDiffMults()).toEqual({ hp: 1, dmg: 1 });
      expect(stageMobDiffMults()).toEqual({ hp: 1, dmg: 1 });
      expect(stageScoreMult()).toBe(STAGE_SCORE_MULT[slot.stageId]);
    } finally {
      endPracticeRun();
    }
  });
});

describe('stageBossDiffMults — 計測路は 1.0', () => {
  it('ボスメーカーの部屋(?bossmaker=1)では、係数のあるステージでも 1.0', () => {
    setStage('stage-6'); // 階段の最上段(1.8/1.4)を選んでも…
    expect(stageBossDiffMults()).toEqual({ hp: stageHpMult('stage-6'), dmg: stageDmgMult('stage-6') });
    // isBossMakerRun() は呼び出しのたびに window.location.search を読む(モジュール定数ではない)。
    (globalThis as unknown as { window: unknown }).window = { location: { search: '?bossmaker=1' } };
    expect(stageBossDiffMults()).toEqual({ hp: 1, dmg: 1 });
    expect(stageMobDiffMults()).toEqual({ hp: 1, dmg: 1 });
  });
});
