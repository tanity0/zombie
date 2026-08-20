// research/STAGE_DIFFICULTY.md(ステージ難度の階段)の台帳=不変条件。
// ①HP/攻撃とも掲載ステージで単調増加・S1/S2/S7/exは1.0 ②小ボスのステージ固定割当
// ③**stage-6は湧かせない**(台帳に行が無い=新しいゲートが実際に効くのは再訪/フリー周回)。
import { describe, it, expect } from 'vitest';
import {
  STAGE_HP_MULT, STAGE_DMG_MULT, stageHpMult, stageDmgMult, BOUNTY_TYPE_BY_STAGE,
} from './stageDifficulty';
import { isBountyType } from '../utils/enemyUtils';
import { bountySpawnBlocked } from '../utils/bountyTick';

const LADDER = ['stage-3', 'stage-4', 'stage-5', 'stage-6'] as const;
const FLAT = ['stage-1', 'stage-2', 'stage-7', 'stage-ex1'] as const;

describe('ステージ係数の台帳(HP/攻撃)', () => {
  it('掲載ステージ(3〜6)で単調増加する', () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(stageHpMult(LADDER[i])).toBeGreaterThan(stageHpMult(LADDER[i - 1]));
      expect(stageDmgMult(LADDER[i])).toBeGreaterThan(stageDmgMult(LADDER[i - 1]));
    }
  });

  it('S1/S2/S7/ex と未知のステージは 1.0(=現状不変)', () => {
    for (const s of FLAT) {
      expect(stageHpMult(s), s).toBe(1);
      expect(stageDmgMult(s), s).toBe(1);
    }
    expect(stageHpMult('')).toBe(1);
    expect(stageHpMult(null)).toBe(1);
    expect(stageDmgMult(undefined)).toBe(1);
  });

  it('攻撃の階段はHPの階段より緩やか(社長裁定=案A・被ダメの即死圧を守る)', () => {
    for (const s of LADDER) {
      expect(stageDmgMult(s), s).toBeGreaterThan(1);
      expect(stageDmgMult(s), s).toBeLessThan(stageHpMult(s));
    }
  });

  it('台帳に載っているのは階段の4ステージだけ(S2/S7を階段に載せない)', () => {
    expect(Object.keys(STAGE_HP_MULT).sort()).toEqual([...LADDER].sort());
    expect(Object.keys(STAGE_DMG_MULT).sort()).toEqual([...LADDER].sort());
  });
});

describe('小ボス(賞金首)のステージ固定割当', () => {
  it('1=バス停 / 3=馬乗り / 4=鋏 / 5=舞妓', () => {
    expect(BOUNTY_TYPE_BY_STAGE['stage-1']).toBe('bounty-ranged');
    expect(BOUNTY_TYPE_BY_STAGE['stage-3']).toBe('bounty-melee');
    expect(BOUNTY_TYPE_BY_STAGE['stage-4']).toBe('bounty-balance');
    expect(BOUNTY_TYPE_BY_STAGE['stage-5']).toBe('bounty-maiko');
  });

  it('割当は4種すべてを重複なく使い、いずれも賞金首の型', () => {
    const types = Object.values(BOUNTY_TYPE_BY_STAGE).filter((t): t is NonNullable<typeof t> => !!t);
    expect(types.length).toBe(4);
    expect(new Set(types).size).toBe(4);
    for (const t of types) expect(isBountyType(t), t).toBe(true);
  });

  it('小ボスが居ないステージ(2/6/7・ex)には行が無い=湧かせない', () => {
    for (const s of ['stage-2', 'stage-6', 'stage-7', 'stage-ex1']) {
      expect(BOUNTY_TYPE_BY_STAGE[s], s).toBeUndefined();
    }
  });

  it('★stage-6の再訪/フリー周回: 既存ゲート(bountySpawnBlocked)は塞がないので、湧きを止めるのは台帳だけ', () => {
    // 本編S6は corridorMode=true の既存ゲートで塞がっているが、再訪/フリー周回では corridorMode=false。
    // その入力では既存ゲートが素通り(=false)になることを確かめた上で、台帳に行が無いことを確認する
    // (ここを見ないテストは「新しいゲートが無くても通ってしまう」ので意味がない)。
    const notBlocked = bountySpawnBlocked({
      bossFightNow: false,
      bossAlive: false,
      activeEvent: false,
      hiddenBossAlive: false,
      redNightActive: false,
      area: 3,               // 初心者ゾーン(0-1)の外
      storyBossOnly: false,
      labTheme: false,
      corridorMode: false,   // ★再訪/フリー周回
      tutorialStage: false,
    });
    expect(notBlocked).toBe(false);
    expect(BOUNTY_TYPE_BY_STAGE['stage-6']).toBeUndefined();
  });
});
