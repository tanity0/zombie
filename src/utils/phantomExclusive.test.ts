import { describe, expect, it } from 'vitest';
import { phantomOnField, phantomSlotFree } from './phantomExclusive';
import type { Enemy } from '../types/game';

type E = Pick<Enemy, 'type' | 'health' | 'corpseUntil' | 'phantomUnique' | 'kenkiLeaveAt'>;
const generic = (o: Partial<E> = {}): E => ({ type: 'guardian-phantom', health: 100, ...o });
const brawler = (o: Partial<E> = {}): E => ({ type: 'guardian-phantom', health: 100, phantomUnique: 'brawler', ...o });
const zombie = (): E => ({ type: 'zombie', health: 100 });

describe('phantomOnField', () => {
  it('生きている汎用の幻影・孫悟空を種類ごとに数える', () => {
    expect(phantomOnField([generic()], 'generic')).toBe(true);
    expect(phantomOnField([generic()], 'brawler')).toBe(false);
    expect(phantomOnField([brawler()], 'brawler')).toBe(true);
    expect(phantomOnField([brawler()], 'generic')).toBe(false);
    expect(phantomOnField([zombie()], 'generic')).toBe(false);
    expect(phantomOnField([], 'brawler')).toBe(false);
  });
  it('HP0・死体は居ない扱い', () => {
    expect(phantomOnField([generic({ health: 0 })], 'generic')).toBe(false);
    expect(phantomOnField([generic({ corpseUntil: 5000 })], 'generic')).toBe(false);
    expect(phantomOnField([brawler({ health: 0 })], 'brawler')).toBe(false);
    expect(phantomOnField([brawler({ corpseUntil: 5000 })], 'brawler')).toBe(false);
  });
  it('跳び去り中の孫悟空も居る扱い(消え切るまで待つ)', () => {
    expect(phantomOnField([brawler({ kenkiLeaveAt: 1000 })], 'brawler')).toBe(true);
  });
});

describe('phantomSlotFree', () => {
  it('相手が場に居る間は出せない・居なくなれば出せる', () => {
    expect(phantomSlotFree([brawler()], 'generic')).toBe(false);
    expect(phantomSlotFree([generic()], 'brawler')).toBe(false);
    expect(phantomSlotFree([zombie(), brawler()], 'generic')).toBe(false);
    expect(phantomSlotFree([brawler({ corpseUntil: 1 })], 'generic')).toBe(true);
    expect(phantomSlotFree([generic({ health: 0 })], 'brawler')).toBe(true);
    expect(phantomSlotFree([brawler({ kenkiLeaveAt: 1 })], 'generic')).toBe(false);
    expect(phantomSlotFree([], 'generic')).toBe(true);
  });
  it('同じ種類が居ても止めない(同種の入れ替えは出す側の既存の作法)', () => {
    expect(phantomSlotFree([generic()], 'generic')).toBe(true);
    expect(phantomSlotFree([brawler()], 'brawler')).toBe(true);
  });
});
