import { describe, it, expect } from 'vitest';
import { levelUpLayout, levelUpTier } from './levelUpOrder';
import type { UpgradeOption } from '../types/game';

const skill = (id: string, rarity: 'normal' | 'rare' | 'super'): UpgradeOption =>
  ({ id, type: 'skill', name: id, description: '', level: 0, skillRarity: rarity }) as UpgradeOption;
const scrap = (id: string): UpgradeOption => ({ id, type: 'scrap', name: id, description: '', level: 50 }) as UpgradeOption;

describe('levelUpLayout(表示の順だけを変える)', () => {
  it('レアほど下へ。一番下が光る', () => {
    const opts = [skill('s', 'super'), skill('n', 'normal'), skill('r', 'rare'), scrap('x')];
    const l = levelUpLayout(opts);
    expect(l.cards.map(o => o.id)).toEqual(['n', 'r', 's']);
    expect(l.fillers.map(o => o.id)).toEqual(['x']);
    expect(l.flashIndex).toBe(2);
  });

  it('抽選の中身は変えない: 同じ要素・同じ枚数・入力の配列は書き換えない', () => {
    const opts = [skill('a', 'rare'), skill('b', 'normal'), skill('c', 'rare'), scrap('x')];
    const snapshot = [...opts];
    const l = levelUpLayout(opts);
    expect(opts).toEqual(snapshot);
    expect(opts.every((o, i) => o === snapshot[i])).toBe(true);
    const shown = [...l.cards, ...l.fillers];
    expect(shown.length).toBe(opts.length);
    expect(new Set(shown)).toEqual(new Set(opts));
  });

  it('同じ段の中は元の順のまま(安定)', () => {
    const l = levelUpLayout([skill('r1', 'rare'), skill('n', 'normal'), skill('r2', 'rare')]);
    expect(l.cards.map(o => o.id)).toEqual(['n', 'r1', 'r2']);
    expect(l.flashIndex).toBe(2);
  });

  it('全部ノーマルなら光らせない', () => {
    expect(levelUpLayout([skill('a', 'normal'), skill('b', 'normal')]).flashIndex).toBe(-1);
    expect(levelUpLayout([]).flashIndex).toBe(-1);
  });

  it('特殊装備は琥珀の段', () => {
    expect(levelUpTier({ id: 'e', type: 'equipment', name: '', description: '', level: 0 } as UpgradeOption)).toBe('super');
    expect(levelUpTier({ id: 'e', type: 'equipment', name: '', description: '', level: 2 } as UpgradeOption)).toBe('normal');
  });
});
