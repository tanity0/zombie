import { describe, expect, it } from 'vitest';
import { enemyDeathLabel } from './gameStore';

describe('enemyDeathLabel', () => {
  it('ステージ2のidolをアイドルと表示する', () => {
    expect(enemyDeathLabel('idol')).toBe('アイドル');
  });
});
