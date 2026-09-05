import { describe, expect, it } from 'vitest';
import { enemyDeathLabel } from './gameStore';
import { bossCutinName } from '../data/bossCutin';

describe('enemyDeathLabel', () => {
  // UI名称統一バッチ(社長指示v0.25.3443「死因や資料室など他のUIも名前を揃える」):
  // 固有名ボスの表示名はカットイン台帳(src/data/bossCutin.ts)の和名と一致すること。
  it('固有名ボス・賞金首の死因表示はカットイン台帳の和名と一致する', () => {
    for (const type of [
      'mimir', 'jormungand', 'skadi', 'thor', 'idol',
      'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel',
      'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko',
    ] as const) {
      expect(enemyDeathLabel(type), type).toBe(bossCutinName(type));
    }
  });

  it('ステージ2のidolを偶像と表示する(台帳名)', () => {
    expect(enemyDeathLabel('idol')).toBe('偶像');
  });

  it('未知の型はフォールバック「変異体」', () => {
    expect(enemyDeathLabel('unknown-type')).toBe('変異体');
  });
});
