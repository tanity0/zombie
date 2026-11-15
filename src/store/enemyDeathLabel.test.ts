import { describe, expect, it } from 'vitest';
import { enemyDeathLabel } from './gameStore';
import { bossCutinName } from '../data/bossCutin';
import { BESTIARY } from '../data/campaign';

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

  // 呼び名の統一(社長裁定2026-11-15「揃える」): 礼賛・監視者もカットインと死因で同じ名前。
  it('礼賛(reaper)・監視者(hunter)の死因表示はカットイン台帳と一致する', () => {
    expect(enemyDeathLabel('reaper')).toBe(bossCutinName('reaper'));
    expect(enemyDeathLabel('hunter')).toBe(bossCutinName('hunter'));
    expect(enemyDeathLabel('reaper')).toBe('礼賛');
    expect(enemyDeathLabel('hunter')).toBe('監視者');
  });

  it('資料室の変異体図鑑の名前は死因表示と同じ(並びも社長裁定どおり)', () => {
    for (const b of BESTIARY) expect(b.name, b.id).toBe(enemyDeathLabel(b.id));
    expect(BESTIARY.map(b => b.name)).toEqual([
      'ハロウィン', '患者', 'ビルダー', '車椅子', '自転車', '妊婦', '花婿', '蜘蛛', '削岩機',
      '伐採人', '監視者', '礼賛', '使者',
    ]);
  });

  it('ステージ2のidolを偶像と表示する(台帳名)', () => {
    expect(enemyDeathLabel('idol')).toBe('偶像');
  });

  it('未知の型はフォールバック「変異体」', () => {
    expect(enemyDeathLabel('unknown-type')).toBe('変異体');
  });
});
