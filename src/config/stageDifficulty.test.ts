// research/STAGE_DIFFICULTY.md(ステージ難度の階段)の台帳=不変条件。
// ①HP/攻撃とも掲載ステージで単調増加・S1/S2/S7/exは1.0 ②小ボスのステージ固定割当
// ③**stage-6は湧かせない**(台帳に行が無い=新しいゲートが実際に効くのは再訪/フリー周回)。
import { describe, it, expect } from 'vitest';
import {
  STAGE_HP_MULT, STAGE_DMG_MULT, stageHpMult, stageDmgMult, BOUNTY_TYPE_BY_STAGE,
  STAGE_BOSS_EXTRA_HP_MULT, STAGE_SCORE_MULT, stageBossExtraHpMult, stageScoreMultFor,
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

// research/MASTERY.md v2 §6 / v2.1 A-13・A-14: 熟練度に合わせた体力の階段・ボスだけの上乗せ・スコアの表。
describe('熟練度に合わせた台帳(体力・ボスの上乗せ・スコア)', () => {
  it('STAGE_HP_MULT = S3 1.56 / S4 2.10 / S5 2.72 / S6 3.42', () => {
    expect(STAGE_HP_MULT).toEqual({ 'stage-3': 1.56, 'stage-4': 2.10, 'stage-5': 2.72, 'stage-6': 3.42 });
  });
  it('STAGE_DMG_MULT は据え置き(S3 1.1 〜 S6 1.4)', () => {
    expect(STAGE_DMG_MULT).toEqual({ 'stage-3': 1.1, 'stage-4': 1.2, 'stage-5': 1.3, 'stage-6': 1.4 });
  });
  it('ボスだけの上乗せは stage-7 と stage-ex1 に ×1.9。それ以外は 1.0', () => {
    expect(STAGE_BOSS_EXTRA_HP_MULT).toEqual({ 'stage-7': 1.9, 'stage-ex1': 1.9 });
    for (const s of ['stage-1', 'stage-2', ...LADDER, '']) expect(stageBossExtraHpMult(s), s).toBe(1);
    expect(stageBossExtraHpMult(null)).toBe(1);
  });
  it('STAGE_SCORE_MULT = S3 1.2 / S4 1.4 / S5 1.6 / S6 1.8(旧の体力の値で据え置き)・他は 1.0', () => {
    expect(STAGE_SCORE_MULT).toEqual({ 'stage-3': 1.2, 'stage-4': 1.4, 'stage-5': 1.6, 'stage-6': 1.8 });
    for (const s of FLAT) expect(stageScoreMultFor(s), s).toBe(1);
    expect(stageScoreMultFor(undefined)).toBe(1);
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
      activeEvent: false,
      redNightActive: false,
      area: 3,               // 初心者ゾーン(0-1)の外
      suppressBounties: false,
      labTheme: false,
      corridorMode: false,   // ★再訪/フリー周回
      tutorialStage: false,
    });
    expect(notBlocked).toBe(false);
    expect(BOUNTY_TYPE_BY_STAGE['stage-6']).toBeUndefined();
  });
});
