import { describe, it, expect, beforeEach } from 'vitest';
import { recordBossAppearances, markBossAppeared, appearedBossKeys, appearedOnly, resetBossAppearances } from './bossAppearances';
import { sortieBossRoster } from './sortieBossRoster';
import type { EnemyType } from '../types/game';

const en = (...types: string[]) => types.map(type => ({ type: type as EnemyType }));

describe('bossAppearances(一時停止のボス一覧=この出撃で出現したボス)', () => {
  beforeEach(() => resetBossAppearances());

  it('盤上に居ないボスは記録しない・雑魚も記録しない', () => {
    expect(recordBossAppearances(en('zombie', 'bat'), 'stage-3')).toBe(0);
    expect(appearedBossKeys().size).toBe(0);
  });
  it('城ボスはステージ付きのキー(giantbat@stage-3)、それ以外は型名で記録する(遭遇記録・roster と同じ形式)', () => {
    recordBossAppearances(en('giantbat', 'miguel', 'zombie'), 'stage-3');
    expect([...appearedBossKeys()].sort()).toEqual(['giantbat@stage-3', 'miguel']);
  });
  it('同じボスを毎ティック渡しても数は増えない(新規だけ数える)', () => {
    expect(recordBossAppearances(en('giantbat'), 'stage-3')).toBe(1);
    expect(recordBossAppearances(en('giantbat'), 'stage-3')).toBe(0);
  });
  it('出撃ごとにリセットされる', () => {
    recordBossAppearances(en('giantbat'), 'stage-3');
    resetBossAppearances();
    expect(appearedBossKeys().size).toBe(0);
  });
  it('変異体は出現時に個別に記録する', () => {
    markBossAppeared('mutant-liberty');
    expect(appearedBossKeys().has('mutant-liberty')).toBe(true);
  });
  it('一覧は「出会い得るボス」のうち出現した物だけ(元の並びのまま)。出会い済みかは known に出る', () => {
    recordBossAppearances(en('giantbat'), 'stage-1');
    markBossAppeared('mutant-astro');
    const roster = sortieBossRoster('stage-1', k => k === 'giantbat@stage-1');
    const shown = appearedOnly(roster);
    expect(shown.map(b => b.encounterKey)).toEqual(['giantbat@stage-1', 'mutant-astro']);
    expect(shown.map(b => b.known)).toEqual([true, false]); // 会ったことの無い方は「?」
  });
  it('このステージの一覧に無いボスが出ても一覧には出ない', () => {
    recordBossAppearances(en('giantbat'), 'stage-3');
    expect(appearedOnly(sortieBossRoster('stage-1', () => true)).map(b => b.encounterKey)).toEqual([]);
  });
  it('1体も出現していなければ空(欄ごと出さない)', () => {
    expect(appearedOnly(sortieBossRoster('stage-1', () => true))).toEqual([]);
  });
});
