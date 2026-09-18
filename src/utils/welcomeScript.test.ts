import { describe, it, expect } from 'vitest';
import {
  WELCOME_SCRIPT, WELCOME_STEP_GAP_MS, WELCOME_FORCE_END_MS, WELCOME_FORCE_END_AREA,
  welcomeStageScript, welcomeStepCount, welcomeUnitsAt, welcomeAdvance, welcomeSpawnAt,
} from './welcomeScript';
import type { Player, GameBounds, Enemy } from '../types/game';

const mkPlayer = (x = 0, y = 0): Player =>
  ({ x, y, width: 32, height: 32, lastDirection: null } as unknown as Player);
const BOUNDS: GameBounds = { width: 800, height: 600 };

describe('welcomeStageScript / welcomeStepCount (§17-11 受け入れ条件1)', () => {
  it('S1/S3/S4/S5/S6は3段', () => {
    for (const id of ['stage-1', 'stage-3', 'stage-4', 'stage-5', 'stage-6']) {
      expect(welcomeStepCount(id), id).toBe(3);
      expect(welcomeStageScript(id), id).toHaveLength(3);
    }
  });
  it('S2(ラボ)・S7・EXは台本を持たない(undefined)', () => {
    for (const id of ['stage-2', 'stage-7', 'stage-ex1', 'stage-tutorial', '', 'unknown']) {
      expect(welcomeStepCount(id), id).toBeUndefined();
      expect(welcomeStageScript(id), id).toBeUndefined();
    }
  });
  it('welcomeUnitsAtは範囲外・台本なしでundefined', () => {
    expect(welcomeUnitsAt('stage-1', 3)).toBeUndefined();
    expect(welcomeUnitsAt('stage-2', 0)).toBeUndefined();
  });
});

describe('§17-10 台本の中身(社長確定の表と一致)', () => {
  it('S1: 1段目バット1(赤)/2段目バット1・スケルトン1(赤)/3段目パンプキン1', () => {
    expect(WELCOME_SCRIPT['stage-1']).toEqual([
      [{ type: 'bat', count: 1, tier: 'red' }],
      [{ type: 'bat', count: 1 }, { type: 'skeleton', count: 1, tier: 'red' }],
      [{ type: 'pumpkin', count: 1 }],
    ]);
  });
  it('S4-2段目: ゾンビ1(赤)・バット2・プラント2・叫喚型1(2026-09-18差し替え後)', () => {
    expect(WELCOME_SCRIPT['stage-4']![1]).toEqual([
      { type: 'zombie', count: 1, tier: 'red' }, { type: 'bat', count: 2 },
      { type: 'plant', count: 2 }, { type: 'screamer', count: 1 },
    ]);
  });
  it('赤が1体も居ない段が5つ(S1-3/S3-2/S4-3/S5-3/S6-1)=意図して空けた「たまに」', () => {
    const noRedSteps: [string, number][] = [
      ['stage-1', 2], ['stage-3', 1], ['stage-4', 2], ['stage-5', 2], ['stage-6', 0],
    ];
    for (const [stageId, step] of noRedSteps) {
      const units = welcomeUnitsAt(stageId, step)!;
      expect(units.some(u => u.tier === 'red'), `${stageId}-${step + 1}`).toBe(false);
    }
  });
});

describe('welcomeAdvance(§17-11 B2・受け入れ条件2/3/4)', () => {
  const base = { gameTime: 0, stepClearedAt: null, stageId: 'stage-1', areaIndex: 0 };

  it('最初の呼び出し(step=-1)は即1段目を湧かせる', () => {
    const r = welcomeAdvance({ ...base, step: -1, aliveOfWelcome: 0 });
    expect(r).toEqual({ step: 0, spawnNow: welcomeUnitsAt('stage-1', 0), endedAt: null });
  });

  it('段の敵が1体でも生きている間は次の段が湧かない(受け入れ条件2)', () => {
    const r = welcomeAdvance({ ...base, step: 0, aliveOfWelcome: 1, gameTime: 50_000, stepClearedAt: null });
    expect(r).toEqual({ step: 0, spawnNow: null, endedAt: null });
  });

  it('全滅直後(gap未経過)は待つ', () => {
    const r = welcomeAdvance({
      ...base, step: 0, aliveOfWelcome: 0, gameTime: 1000, stepClearedAt: 1000 + WELCOME_STEP_GAP_MS - 1,
    });
    // stepClearedAt はこの時点で gameTime 以降になってしまう不整合な入力だが、境界を跨ぐ直前の
    // 通常ケース(gameTime===stepClearedAtの直後)を別テストで確認する。ここでは経過0msのケース。
    const r2 = welcomeAdvance({ ...base, step: 0, aliveOfWelcome: 0, gameTime: 5000, stepClearedAt: 5000 });
    expect(r2).toEqual({ step: 0, spawnNow: null, endedAt: null });
    expect(r.spawnNow).toBeNull();
  });

  it('全滅+WELCOME_STEP_GAP_MS経過で次の段が湧く', () => {
    const clearedAt = 5000;
    const r = welcomeAdvance({
      ...base, step: 0, aliveOfWelcome: 0, gameTime: clearedAt + WELCOME_STEP_GAP_MS, stepClearedAt: clearedAt,
    });
    expect(r).toEqual({ step: 1, spawnNow: welcomeUnitsAt('stage-1', 1), endedAt: null });
  });

  it('gap未経過(1ms前)ではまだ湧かない', () => {
    const clearedAt = 5000;
    const r = welcomeAdvance({
      ...base, step: 0, aliveOfWelcome: 0, gameTime: clearedAt + WELCOME_STEP_GAP_MS - 1, stepClearedAt: clearedAt,
    });
    expect(r).toEqual({ step: 0, spawnNow: null, endedAt: null });
  });

  it('最後の段を倒し切った時刻がendedAt(受け入れ条件3前半)', () => {
    const clearedAt = 40_000;
    const endGameTime = clearedAt + WELCOME_STEP_GAP_MS;
    const r = welcomeAdvance({
      ...base, step: 2, aliveOfWelcome: 0, gameTime: endGameTime, stepClearedAt: clearedAt,
    });
    expect(r).toEqual({ step: 2, spawnNow: null, endedAt: endGameTime });
  });

  it('倒し切る前でも60秒でendedAtが立つ(受け入れ条件3後半)', () => {
    const r = welcomeAdvance({ ...base, step: 0, aliveOfWelcome: 3, gameTime: WELCOME_FORCE_END_MS });
    expect(r).toEqual({ step: 0, spawnNow: null, endedAt: WELCOME_FORCE_END_MS });
  });

  it('60秒未満は強制終了しない', () => {
    const r = welcomeAdvance({ ...base, step: 0, aliveOfWelcome: 3, gameTime: WELCOME_FORCE_END_MS - 1 });
    expect(r.endedAt).toBeNull();
  });

  it('研究対象区域(area>=1)以上へ入ったら即endedAt(受け入れ条件4)', () => {
    const r = welcomeAdvance({
      ...base, step: 0, aliveOfWelcome: 2, gameTime: 3000, areaIndex: WELCOME_FORCE_END_AREA,
    });
    expect(r).toEqual({ step: 0, spawnNow: null, endedAt: 3000 });
  });

  it('area0のままなら強制終了しない', () => {
    const r = welcomeAdvance({ ...base, step: 0, aliveOfWelcome: 2, gameTime: 3000, areaIndex: 0 });
    expect(r.endedAt).toBeNull();
  });

  it('強制終了(60秒/区域)は台本を持たないステージ扱いより先に見ても壊れない(台本なしステージは即終了)', () => {
    const r = welcomeAdvance({ ...base, stageId: 'stage-2', step: -1, aliveOfWelcome: 0, gameTime: 0 });
    expect(r.endedAt).toBe(0);
    expect(r.spawnNow).toBeNull();
  });
});

describe('welcomeSpawnAt(§17-11 B1b・受け入れ条件10)', () => {
  it('isWelcome=trueが付く', () => {
    const e = welcomeSpawnAt({ type: 'bat', count: 1 }, mkPlayer(), BOUNDS, 0);
    expect(e.isWelcome).toBe(true);
    expect(e.type).toBe('bat');
  });
  it('tier未指定はforcedColorTier=noneが渡り、色ティアが付かない(受け入れ条件10)', () => {
    const e = welcomeSpawnAt({ type: 'bat', count: 1 }, mkPlayer(), BOUNDS, 0);
    expect(e.colorTier).toBeUndefined();
  });
  it('tier: redを指定すると赤で固定される(抽選を経ない)', () => {
    const e = welcomeSpawnAt({ type: 'bat', count: 1, tier: 'red' }, mkPlayer(), BOUNDS, 0);
    expect(e.colorTier).toBe('red');
  });
  it('画面(spawnBounds)の外側に湧く', () => {
    const player = mkPlayer(1000, 1000);
    const e: Enemy = welcomeSpawnAt({ type: 'zombie', count: 1 }, player, BOUNDS, 0);
    const dx = Math.abs(e.x - player.x);
    const dy = Math.abs(e.y - player.y);
    expect(dx > BOUNDS.width / 2 || dy > BOUNDS.height / 2).toBe(true);
  });
});
