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

import { stageBossDiffMults } from './stageDiffMults';
import { stageHpMult, stageDmgMult } from '../config/stageDifficulty';

const SELECTED_KEY = 'zombie.progress.selectedStage';
const setStage = (id: string) => { backing[SELECTED_KEY] = id; };

beforeEach(() => { for (const k of Object.keys(backing)) delete backing[k]; });
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe('stageBossDiffMults — 通常出撃は選択ステージの係数', () => {
  it('stage-4 を選んでいれば台帳と同じ値を返す', () => {
    setStage('stage-4');
    expect(stageBossDiffMults()).toEqual({ hp: stageHpMult('stage-4'), dmg: stageDmgMult('stage-4') });
  });

  it('階段に乗らないステージ(stage-1/2/7)と未選択は 1.0', () => {
    for (const s of ['stage-1', 'stage-2', 'stage-7', '']) {
      setStage(s);
      expect(stageBossDiffMults(), s).toEqual({ hp: 1, dmg: 1 });
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
  });
});
