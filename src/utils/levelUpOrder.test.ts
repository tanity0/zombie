import { describe, it, expect } from 'vitest';
import { levelUpLayout, levelUpTier } from './levelUpOrder';
import type { UpgradeOption } from '../types/game';

const skill = (id: string, rarity: 'normal' | 'rare' | 'super'): UpgradeOption =>
  ({ id, type: 'skill', name: id, description: '', level: 0, skillRarity: rarity }) as UpgradeOption;
const scrap = (id: string): UpgradeOption => ({ id, type: 'scrap', name: id, description: '', level: 50 }) as UpgradeOption;
const equip = (id: string, level: number): UpgradeOption =>
  ({ id, type: 'equipment', name: id, description: '', level }) as UpgradeOption;

describe('levelUpLayout(表示の順だけを変える・超レアだけ下へ)', () => {
  it('超レアが無ければ完全に元の順(レアも並べ替えない)', () => {
    const l = levelUpLayout([skill('r', 'rare'), skill('n1', 'normal'), skill('n2', 'normal'), scrap('x')]);
    expect(l.cards.map(o => o.id)).toEqual(['r', 'n1', 'n2']);
    expect(l.fillers.map(o => o.id)).toEqual(['x']);
  });

  it('超レア1枚は最後へ。残りは元の順のまま。最後が光る', () => {
    const l = levelUpLayout([skill('s', 'super'), skill('r', 'rare'), skill('n', 'normal'), scrap('x')]);
    expect(l.cards.map(o => o.id)).toEqual(['r', 'n', 's']);
    expect(l.fillers.map(o => o.id)).toEqual(['x']);
    expect(l.flashIndex).toBe(2);
  });

  it('超レアが複数なら、元の順のまま最後にまとまる', () => {
    const l = levelUpLayout([skill('s1', 'super'), skill('r', 'rare'), skill('s2', 'super'), skill('n', 'normal')]);
    expect(l.cards.map(o => o.id)).toEqual(['r', 'n', 's1', 's2']);
    expect(l.flashIndex).toBe(3);
  });

  it('特殊装備(宝箱の金枠)は超レアと同じ扱いで最後へ。強化の装備は元の位置', () => {
    const l = levelUpLayout([equip('box', 0), equip('up', 2), skill('s', 'super'), skill('n', 'normal')]);
    expect(l.cards.map(o => o.id)).toEqual(['up', 'n', 'box', 's']);
    expect(l.flashIndex).toBe(3);
  });

  it('抽選の中身は変えない: 同じ要素・同じ枚数・入力の配列は書き換えない', () => {
    const opts = [skill('a', 'super'), skill('b', 'normal'), skill('c', 'rare'), scrap('x')];
    const snapshot = [...opts];
    const l = levelUpLayout(opts);
    expect(opts).toEqual(snapshot);
    expect(opts.every((o, i) => o === snapshot[i])).toBe(true);
    const shown = [...l.cards, ...l.fillers];
    expect(shown.length).toBe(opts.length);
    expect(new Set(shown)).toEqual(new Set(opts));
  });

  it('光の規則は従来どおり(一番下のカードがノーマル以外なら光る)', () => {
    expect(levelUpLayout([skill('r', 'rare'), skill('n', 'normal')]).flashIndex).toBe(-1);
    expect(levelUpLayout([skill('n', 'normal'), skill('r', 'rare')]).flashIndex).toBe(1);
    expect(levelUpLayout([skill('a', 'normal'), skill('b', 'normal')]).flashIndex).toBe(-1);
    expect(levelUpLayout([]).flashIndex).toBe(-1);
  });

  it('特殊装備は琥珀の段', () => {
    expect(levelUpTier(equip('e', 0))).toBe('super');
    expect(levelUpTier(equip('e', 2))).toBe('normal');
  });
});
