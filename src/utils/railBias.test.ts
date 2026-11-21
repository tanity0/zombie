import { describe, expect, it } from 'vitest';
import {
  parseRailKind, parseRailMult, DEFAULT_RAIL_MULT, railSkillClassOf, railSkillWeight,
  pickWeighted, railAmmoDropMult, railTreasureDropMult, RAIL_KINDS,
} from './railBias';
import type { SkillKey } from '../types/game';

describe('parseRailKind', () => {
  it('judge/elite/dpsはそのまま', () => {
    for (const k of RAIL_KINDS) expect(parseRailKind(k)).toBe(k);
  });
  it('未知の値/null/undefinedはnull(レール無し)', () => {
    expect(parseRailKind('junk')).toBeNull();
    expect(parseRailKind(null)).toBeNull();
    expect(parseRailKind(undefined)).toBeNull();
    expect(parseRailKind('')).toBeNull();
  });
});

describe('parseRailMult', () => {
  it('正の数値はそのまま', () => {
    expect(parseRailMult('2')).toBe(2);
    expect(parseRailMult('1')).toBe(1);
  });
  it('空/null/undefined/0以下/NaNは既定1.5', () => {
    expect(parseRailMult(null)).toBe(DEFAULT_RAIL_MULT);
    expect(parseRailMult(undefined)).toBe(DEFAULT_RAIL_MULT);
    expect(parseRailMult('')).toBe(DEFAULT_RAIL_MULT);
    expect(parseRailMult('0')).toBe(DEFAULT_RAIL_MULT);
    expect(parseRailMult('-2')).toBe(DEFAULT_RAIL_MULT);
    expect(parseRailMult('junk')).toBe(DEFAULT_RAIL_MULT);
  });
});

describe('railSkillClassOf(分類表)', () => {
  it('judge=処刑/近接系', () => {
    for (const k of ['reaper', 'execution-shock', 'combo-master', 'knife-master', 'slasher', 'rescue-signal', 'counter-master'] as SkillKey[]) {
      expect(railSkillClassOf(k), k).toBe('judge');
    }
  });
  it('elite=体勢/クリ系', () => {
    for (const k of ['crit-up', 'echo-shot', 'benkei', 'barrage-king'] as SkillKey[]) {
      expect(railSkillClassOf(k), k).toBe('elite');
    }
  });
  it('dps=火力系', () => {
    for (const k of ['berserker', 'attack-shooter', 'last-magazine', 'sniper', 'fire-shooter', 'exploder', 'bomber', 'incendiary-round', 'gravity-shot'] as SkillKey[]) {
      expect(railSkillClassOf(k), k).toBe('dps');
    }
  });
  it('迷うスキル/未登録は対象外(null)', () => {
    for (const k of ['knight', 'gold-rush', 'runner', 'seeker', 'magnet', 'ice-shot', 'vampire', 'big-bullet', 'time-keeper'] as SkillKey[]) {
      expect(railSkillClassOf(k), k).toBeNull();
    }
  });
});

describe('railSkillWeight', () => {
  it('rail=nullなら常に1(現行どおり=完全均等)', () => {
    expect(railSkillWeight('reaper', null, 1.5)).toBe(1);
    expect(railSkillWeight('knight', null, 1.5)).toBe(1);
  });
  it('railが一致するクラスのスキルだけrailmultが乗る', () => {
    expect(railSkillWeight('reaper', 'judge', 1.5)).toBe(1.5);
    expect(railSkillWeight('reaper', 'elite', 1.5)).toBe(1); // 他クラスは1のまま
    expect(railSkillWeight('crit-up', 'elite', 2)).toBe(2);
    expect(railSkillWeight('knight', 'judge', 1.5)).toBe(1); // 未分類は常に1
  });
  it('負のrailmultは0にクランプ(選ばれなくなるだけで負の重みは作らない)', () => {
    expect(railSkillWeight('reaper', 'judge', -1)).toBe(0);
  });
});

describe('pickWeighted', () => {
  it('全員同重み(rail無し相当)なら均等抽選と同じ分布になる(大数試行で近似検算)', () => {
    const pool = ['a', 'b', 'c'];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    let seed = 1;
    const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 6000; i++) counts[pickWeighted(pool, () => 1, rng)] += 1;
    for (const k of pool) expect(counts[k]).toBeGreaterThan(1600); // 均等なら各約2000
  });
  it('重み0のアイテムは選ばれない(他の重みの合計が正なら)', () => {
    const pool = ['a', 'b'];
    const weights: Record<string, number> = { a: 0, b: 1 };
    for (let i = 0; i < 50; i++) {
      expect(pickWeighted(pool, x => weights[x], () => i / 50)).toBe('b');
    }
  });
  it('全重み0はrng比例のフォールバック(空選択にならない)', () => {
    const pool = ['a', 'b'];
    expect(pickWeighted(pool, () => 0, () => 0)).toBe('a');
    expect(pickWeighted(pool, () => 0, () => 0.9)).toBe('b');
  });
});

describe('railAmmoDropMult / railTreasureDropMult(ドロップバイアス)', () => {
  it('judge/dps=弾・elite=トレジャーだけrailmultが乗る、それ以外は1', () => {
    expect(railAmmoDropMult('judge', 1.5)).toBe(1.5);
    expect(railAmmoDropMult('dps', 1.5)).toBe(1.5);
    expect(railAmmoDropMult('elite', 1.5)).toBe(1);
    expect(railAmmoDropMult(null, 1.5)).toBe(1);

    expect(railTreasureDropMult('elite', 2)).toBe(2);
    expect(railTreasureDropMult('judge', 2)).toBe(1);
    expect(railTreasureDropMult('dps', 2)).toBe(1);
    expect(railTreasureDropMult(null, 2)).toBe(1);
  });
});
