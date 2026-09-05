// research/STAGE_DIFFICULTY.md(ステージ難度の階段): **resetGame が出撃のたびに雑魚の係数をセットする**
// ことの受け入れ条件(旧 bountyRotation.test.ts の置き換え。小ボスの種別はラン内ローテから
// ステージ固定割当=config/stageDifficulty.ts の台帳へ移り、store のローテ状態は撤去された)。
//
// node 既定環境には localStorage が無いので、progress.test.ts と同じ最小モックを**import前に**差す
// (gameStore はモジュール初期化で選択ステージを読む)。
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

import { useGameStore } from './gameStore';
import { spawnEnemyAt, setStageDifficultyMults } from '../utils/enemyUtils';
import { stageHpMult, stageDmgMult, BOUNTY_TYPE_BY_STAGE } from '../config/stageDifficulty';

const SELECTED_KEY = 'zombie.progress.selectedStage';
const AREA0 = { x: 100, y: 100 }; // 色ティア抽選が全0のエリア=HPがブレない
const zombieAt = () => spawnEnemyAt('zombie', AREA0.x, AREA0.y, 0);

// 係数1.0のときの基準値(モジュール変数は持ち越るので毎回1.0へ戻してから取る)。
const baseline = () => { setStageDifficultyMults(1, 1); return zombieAt(); };

beforeEach(() => { setStageDifficultyMults(1, 1); });

describe('resetGame — 雑魚のステージ係数を出撃のたびにセットする', () => {
  it('stage-5 を選んで出撃すると、その後に湧く雑魚へ台帳の係数が乗る', () => {
    const base = baseline();
    backing[SELECTED_KEY] = 'stage-5';
    useGameStore.getState().resetGame('warrior');
    const e = zombieAt();
    expect(e.health).toBeCloseTo(base.health * stageHpMult('stage-5'), 6);
    expect(e.damage).toBe(Math.round(base.damage * stageDmgMult('stage-5')));
  });

  it('ステージを変えて出撃し直すと係数も差し替わる(ランをまたいで持ち越さない)', () => {
    const base = baseline();
    backing[SELECTED_KEY] = 'stage-6';
    useGameStore.getState().resetGame('warrior');
    expect(zombieAt().health).toBeCloseTo(base.health * stageHpMult('stage-6'), 6);
    backing[SELECTED_KEY] = 'stage-1'; // 階段に乗らないステージ=1.0へ戻る
    useGameStore.getState().resetGame('warrior');
    expect(zombieAt().health).toBeCloseTo(base.health, 6);
  });
});

describe('小ボス(賞金首)— ラン内ローテは撤去され、ステージ固定割当になった', () => {
  it('store にラン内ローテの状態を持たない', () => {
    expect('bountyRotation' in useGameStore.getState()).toBe(false);
  });

  it('出撃ステージから種別が一意に決まる(1=バス停 / 3=馬乗り / 4=鋏 / 5=舞妓)', () => {
    backing[SELECTED_KEY] = 'stage-3';
    useGameStore.getState().resetGame('warrior');
    expect(BOUNTY_TYPE_BY_STAGE[backing[SELECTED_KEY]]).toBe('bounty-melee');
  });
});
