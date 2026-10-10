// PACING_PUZZLE.md §17-14(社長指示「ウェルカム終わるまでは画面に存在させない」)。
//
// この作り直しの一番壊しやすい箇所=「ウェルカムを持たないランでは出撃の瞬間から4人が居る
// (1フレームも遅れない)」を、gameStore.ts の resetGame を直接呼んで固定する
// (実装精度の規律「★『ウェルカムが無いランでは出撃の瞬間から居る』を必ずテストで固定する」)。
//
// node既定環境にはlocalStorageが無く、getSelectedStageId()は早期returnで''を返す
// (typeof localStorage === 'undefined')。stageIdを切り替えて検証するため、
// exStage.test.ts / stageDiffMults.test.ts と同じ作法で最小モックを差す。
import { describe, it, expect, beforeEach } from 'vitest';

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => { backing[k] = v; },
  removeItem: (k: string) => { delete backing[k]; },
  clear: () => { for (const k of Object.keys(backing)) delete backing[k]; },
  key: () => null,
  get length() { return Object.keys(backing).length; },
} as Storage;

const SELECTED_KEY = 'zombie.progress.selectedStage';
const setStage = (id: string) => { backing[SELECTED_KEY] = id; };

import { useGameStore } from './gameStore';

beforeEach(() => { for (const k of Object.keys(backing)) delete backing[k]; });

describe('§17-14: resetGameでの escorts / pendingEscorts 振り分け', () => {
  it('ウェルカムを持たないステージ(stage-7)は出撃の瞬間からescortsに4人居る(pendingEscortsは空)', () => {
    setStage('stage-7');
    useGameStore.getState().resetGame('warrior');
    const s = useGameStore.getState();
    expect(s.escorts.length).toBe(4);
    expect(s.pendingEscorts.length).toBe(0);
  });

  it('未選択(空stageId)も従来どおり出撃の瞬間からescortsに4人居る', () => {
    useGameStore.getState().resetGame('warrior');
    const s = useGameStore.getState();
    expect(s.escorts.length).toBe(4);
    expect(s.pendingEscorts.length).toBe(0);
  });

  it('台本を持つステージ(stage-1)はescortsが空で始まり、名簿はpendingEscortsに預けられる', () => {
    setStage('stage-1');
    useGameStore.getState().resetGame('warrior');
    const s = useGameStore.getState();
    expect(s.escorts.length).toBe(0);
    expect(s.pendingEscorts.length).toBe(4);
  });

  it('predingEscorts(stage-1)は座標を持つ本物の名簿(作り直しではない=配置の乱数を二度引かない)', () => {
    setStage('stage-1');
    useGameStore.getState().resetGame('warrior');
    const s = useGameStore.getState();
    for (const esc of s.pendingEscorts) {
      expect(Number.isFinite(esc.x) && Number.isFinite(esc.y)).toBe(true);
      expect(esc.appearedAt).toBeUndefined(); // まだ出陣していない個体にはフェードイン打刻が無い
    }
  });
});
