import { describe, it, expect } from 'vitest';
import { countsOnPuzzleBoard, puzzleBoardCount, PUZZLE_MANAGED_TYPES } from './spawnRefill';
import {
  decideNextSpawn, chaffTargetForKoma, chaffWeightsForKoma, ZERO_NUISANCE, RELAX_CHAFF_TARGET_MAX,
} from './scriptPuzzle';
import type { EnemyType } from '../types/game';

// 解放軍群(変異)の取り巻き=libertyTick.makeHordeBat が作る赤いバット男(type 'bat'・hordeLeaderId あり)。
const hordeBat = () => ({ type: 'bat' as EnemyType, hordeLeaderId: 'liberty-leader-1' });
const fiveHordeBats = Array.from({ length: 5 }, () => hordeBat());

describe('盤面の数(puzzleBoardCount): 解放軍群の取り巻きは別カウント', () => {
  it('取り巻き5体だけなら盤面の数は0', () => {
    expect(puzzleBoardCount(fiveHordeBats)).toBe(0);
    expect(countsOnPuzzleBoard(hordeBat())).toBe(false);
  });

  it('ふつうのバット男(hordeLeaderId なし)は数える', () => {
    expect(countsOnPuzzleBoard({ type: 'bat' })).toBe(true);
    expect(puzzleBoardCount([...fiveHordeBats, { type: 'bat' }, { type: 'skeleton' }])).toBe(2);
  });

  it('英雄・解放軍群の旗手など countsTowardEnemyCap が外す物は数えない', () => {
    for (const t of ['mutant-hero', 'mutant-liberty', 'mutant-astro', 'mutant-wraith'] as EnemyType[]) {
      expect(countsOnPuzzleBoard({ type: t })).toBe(false);
    }
  });

  it('盤面が管理する型は(取り巻きでなければ)全部数える', () => {
    for (const t of PUZZLE_MANAGED_TYPES) expect(countsOnPuzzleBoard({ type: t })).toBe(true);
  });

  it('リラックス(目標3)で取り巻き5体だけの盤面なら湧きを返す(不具合の再発止め)', () => {
    const target = chaffTargetForKoma('relax', 10);
    expect(target).toBe(RELAX_CHAFF_TARGET_MAX);
    const decision = decideNextSpawn({
      boardCount: puzzleBoardCount(fiveHordeBats),
      boardTarget: target,
      cdElapsedMs: 99999, cdMs: 500,
      nuisanceElapsedMs: 99999, nuisanceTargetCounts: ZERO_NUISANCE, nuisanceSpawnedCounts: ZERO_NUISANCE,
      specialElapsedMs: 99999, area: -1, aliveSpecial: {},
      msSinceLastHit: 99999, chaffWeights: chaffWeightsForKoma('relax'), tieBreakRandom: 0.5,
    });
    expect(decision).not.toBeNull();
    expect(decision?.slot).toBe('chaff');
  });
});
