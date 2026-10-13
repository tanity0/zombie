// ファストトラベルの行き先(research/FAST_TRAVEL.md §2-2)のユニット。
import { describe, it, expect } from 'vitest';
import { listTravelDestinations, hasTravelTargets, TRAVEL_ARRIVE_GAP_PX } from './fastTravel';

const bases = [
  { id: 'base-0', x: 4800, y: 0, status: 'captured' },
  { id: 'base-1', x: 0, y: 4800, status: 'open' },
  { id: 'base-2', x: -4800, y: 0, status: 'captured' },
  { id: 'base-3', x: 0, y: -4800, status: 'open' },
];
const merchant = { x: 0, y: -130, radius: 58 };
const base = { merchant, bases, armoryRadius: 50, baseRadius: 130 };

describe('ファストトラベルの行き先', () => {
  it('武器商人+解放済みの拠点だけ(東→西の順)', () => {
    const l = listTravelDestinations({ ...base, player: { x: 4800, y: 30 } });
    expect(l.map(d => d.label)).toEqual(['武器商人', '東部拠点', '西部拠点']);
  });
  it('今いる場所は current(拠点の円の中・商人の近く)', () => {
    const atBase = listTravelDestinations({ ...base, player: { x: 4800, y: 30 } });
    expect(atBase.find(d => d.id === 'base-0')!.current).toBe(true);
    expect(atBase.find(d => d.id === 'merchant')!.current).toBe(false);
    const atMerchant = listTravelDestinations({ ...base, player: { x: 0, y: -130 } });
    expect(atMerchant.find(d => d.id === 'merchant')!.current).toBe(true);
  });
  it('着く地点は武器庫/商人の円の外(下側)・拠点の円の中', () => {
    const l = listTravelDestinations({ ...base, player: { x: 0, y: 0 } });
    const b0 = l.find(d => d.id === 'base-0')!;
    const dy = b0.arriveY - 0;
    expect(dy).toBe(50 + TRAVEL_ARRIVE_GAP_PX);
    expect(dy).toBeGreaterThan(50);
    expect(dy).toBeLessThan(130);
    const m = l.find(d => d.id === 'merchant')!;
    expect(m.arriveY - merchant.y).toBeGreaterThan(merchant.radius);
  });
  it('商人が居ない(研究所・ウェルカム中)+解放済みの拠点が無い=行き先なし', () => {
    const l = listTravelDestinations({ merchant: null, bases: bases.map(b => ({ ...b, status: 'open' })), armoryRadius: 50, baseRadius: 130, player: { x: 0, y: 0 } });
    expect(hasTravelTargets(l)).toBe(false);
  });
  it('今いる場所だけなら移動先なし', () => {
    const l = listTravelDestinations({ ...base, bases: bases.map(b => ({ ...b, status: 'open' })), player: { x: 0, y: -130 } });
    expect(l).toHaveLength(1);
    expect(hasTravelTargets(l)).toBe(false);
  });
});
