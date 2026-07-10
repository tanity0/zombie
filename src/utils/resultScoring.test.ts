import { describe, it, expect } from 'vitest';
import { topScoreItem } from './resultScoring';

// PACING_PUZZLE.md §5.19 バッチM18②: 「一番効いた項目」= scoreItems の argmax(同点は先勝ち)。
describe('topScoreItem', () => {
  it('returns the item with the highest value', () => {
    const items = [
      { label: 'a', value: 10 },
      { label: 'b', value: 30 },
      { label: 'c', value: 20 },
    ];
    expect(topScoreItem(items)?.label).toBe('b');
  });

  it('ties go to the first item (stable, no silent reorder)', () => {
    const items = [
      { label: 'first', value: 50 },
      { label: 'second', value: 50 },
    ];
    expect(topScoreItem(items)?.label).toBe('first');
  });

  it('returns null for an empty list', () => {
    expect(topScoreItem([])).toBeNull();
  });

  it('handles a single item', () => {
    expect(topScoreItem([{ label: 'only', value: 5 }])?.label).toBe('only');
  });
});
