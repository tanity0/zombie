// ステージ1「1周目」(STAGE1_FIRST_LOOP.md)の resetGame の配線を固定する。
// ①1周目でない出撃(pendingStage1FirstLoop=false=フラグOFF/2周目以降)は現行のステージ1と同じ(stage1Loop=null・4人・城・寄り道)。
// ②1周目は §3/§7.6 D の「出さない物」が初期状態から無い・西の拠点だけが対象・軍人1名。
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
import { LOOP1_BASE_ID } from '../utils/stage1FirstLoop';
import { getEventQuestMeta, getStage1FirstLoopCleared, markStage1FirstLoopCleared, getClearedStages } from '../data/progress';

beforeEach(() => {
  for (const k of Object.keys(backing)) delete backing[k];
  useGameStore.getState().setPendingStage1FirstLoop(false);
});

describe('1周目でない出撃は現行どおり', () => {
  it('stage-1・pendingStage1FirstLoop=false: stage1Loop=null・4人・城は近く・寄り道あり・二人組v4は生きている', () => {
    setStage('stage-1');
    useGameStore.getState().resetGame('warrior');
    const s = useGameStore.getState();
    expect(s.stage1Loop).toBeNull();
    expect(s.stage1LoopTalk).toBeNull();
    expect(s.escorts.length + s.pendingEscorts.length).toBe(4);
    expect(Math.hypot(s.castleEvent.x, s.castleEvent.y)).toBeLessThan(100000);
    expect(s.hospital).not.toBeNull();
    expect(s.armory).not.toBeNull();
    expect(s.police).not.toBeNull();
    expect(s.baseSites.length).toBe(4);
    expect(s.baseSites.some(b => b.loop1Hidden)).toBe(false);
    expect(s.eventQuestNpc.status).not.toBe('gone');
  });
});

describe('2周目以降のステージ1はウェルカムが無い(社長指示2026-11-19)', () => {
  it('1周目クリア済み: ウェルカムは済んだ扱い=護衛は出撃の瞬間から居る', () => {
    setStage('stage-1');
    markStage1FirstLoopCleared();
    useGameStore.getState().resetGame('warrior');
    const s = useGameStore.getState();
    expect(s.stage1Loop).toBeNull();
    expect(s.welcomeRetired).toBe(true);
    expect(s.pendingEscorts.length).toBe(0);
    expect(s.escorts.length).toBe(4);
  });
  it('1周目未クリアの通常出撃(1周目フラグなし)はウェルカムが従来どおり', () => {
    setStage('stage-1');
    useGameStore.getState().resetGame('warrior');
    expect(useGameStore.getState().welcomeRetired).toBe(false);
  });
});

describe('1周目の初期状態', () => {
  const start = () => {
    setStage('stage-1');
    useGameStore.getState().setPendingStage1FirstLoop(true);
    useGameStore.getState().resetGame('warrior');
    return useGameStore.getState();
  };
  it('段=base・軍人は西の拠点の担当1名だけ(ウェルカム無し=出撃の瞬間から居る)', () => {
    const s = start();
    expect(s.stage1Loop?.phase).toBe('base');
    expect(s.pendingEscorts.length).toBe(0);
    expect(s.escorts.length).toBe(1);
    expect(s.escorts[0].baseId).toBe(LOOP1_BASE_ID);
    expect(s.stage1Loop?.soldierIndex).toBe(s.escorts[0].soldierIndex);
  });
  it('サブクエストは無し(右上の討伐の行を出さない)', () => {
    start();
    useGameStore.getState().refillSubquests();
    expect(useGameStore.getState().subquests).toEqual([]);
  });
  it('拠点データは4つ残し、西以外は隠す(ハンターの判定は現行どおり)', () => {
    const s = start();
    expect(s.baseSites.length).toBe(4);
    expect(s.baseSites.filter(b => !b.loop1Hidden).map(b => b.id)).toEqual([LOOP1_BASE_ID]);
  });
  it('出さない物: 城(遠方)・裏ボス・隠し地点・廃病院(拠点前)・武器庫・警察署・祠・二人組v4', () => {
    const s = start();
    expect(Math.hypot(s.castleEvent.x, s.castleEvent.y)).toBeGreaterThanOrEqual(100000);
    expect(s.castleEvent.bossSpawned).toBe(false);
    expect(s.hiddenBoss).toBeNull();
    expect(s.secretPois).toEqual([]);
    expect(s.hospital).toBeNull();
    expect(s.armory).toBeNull();
    expect(s.police).toBeNull();
    expect(s.shrines).toEqual([]);
    expect(s.eventQuestNpc.status).toBe('gone');
  });
  it('次の出撃で pending を下ろせば現行へ戻る(可逆)', () => {
    start();
    useGameStore.getState().setPendingStage1FirstLoop(false);
    useGameStore.getState().resetGame('warrior');
    expect(useGameStore.getState().stage1Loop).toBeNull();
  });
});

describe('1周目のゴールの納品(§7.6 F / §7.7 A2・B8)', () => {
  it('meta.delivered だけを立て、v4 の状態とステージ解放には触らない', () => {
    setStage('stage-1');
    useGameStore.getState().setPendingStage1FirstLoop(true);
    useGameStore.getState().resetGame('warrior');
    const before = useGameStore.getState().eventQuestNpc.status;
    useGameStore.getState().completeStage1FirstLoopDelivery();
    expect(getEventQuestMeta('stage-1').delivered).toBe(true);
    expect(useGameStore.getState().eventQuestNpc.status).toBe(before);
    expect(getClearedStages().has('stage-1')).toBe(false);
  });
  it('1周目クリア済みの旗', () => {
    expect(getStage1FirstLoopCleared()).toBe(false);
    markStage1FirstLoopCleared();
    expect(getStage1FirstLoopCleared()).toBe(true);
  });
});
