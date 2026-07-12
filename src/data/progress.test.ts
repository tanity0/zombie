// 歴史年表(chronicle)の純ロジック(初回のみ記録=dedup / ラベル前置 / stageId空ガード)のユニット。
// node 既定環境には localStorage が無く、progress.ts の各リーダーは `typeof localStorage === 'undefined'`
// で早期returnする。ここでは最小の localStorage モックを差してから記録系を叩く(import は遅延読みなので
// 呼び出し時にモックが効いていれば良い)。
import { describe, it, expect, beforeEach } from 'vitest';

const backing: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => { backing[k] = v; },
  removeItem: (k: string) => { delete backing[k]; },
  clear: () => { for (const k of Object.keys(backing)) delete backing[k]; },
  key: () => null,
  get length() { return Object.keys(backing).length; },
} as Storage;

import { recordChronicle, loadChronicle, stageChronicleLabel } from './progress';

beforeEach(() => { for (const k of Object.keys(backing)) delete backing[k]; });

describe('歴史年表(chronicle)', () => {
  it('初回のみ記録: 同じ(stage,kind,detail)は2回目以降 false で重複しない', () => {
    expect(recordChronicle('stage-1', 'zone', '4', '深層域に到達')).toBe(true);
    expect(recordChronicle('stage-1', 'zone', '4', '深層域に到達')).toBe(false);
    expect(loadChronicle().filter(e => e.key === 'stage-1::zone::4')).toHaveLength(1);
  });

  it('detail違い / kind違い / ステージ違いは別レコードとして共存する', () => {
    recordChronicle('stage-1', 'zone', '3', 'デンジャーゾーンに到達');
    recordChronicle('stage-1', 'zone', '4', '深層域に到達');
    recordChronicle('stage-1', 'boss', 'mimir', 'ミーミルを討伐');
    recordChronicle('stage-2', 'zone', '4', '深層域に到達');
    expect(loadChronicle()).toHaveLength(4);
  });

  it('ラベルにステージ見出し(main=「ステージN」)を前置する', () => {
    recordChronicle('stage-1', 'boss', 'mimir', 'ミーミルを討伐');
    expect(loadChronicle().find(e => e.kind === 'boss')?.label).toBe('ステージ1 ミーミルを討伐');
  });

  it('stageId が空なら記録しない', () => {
    expect(recordChronicle('', 'reaper', 'reaper', '死神を討伐')).toBe(false);
    expect(loadChronicle()).toHaveLength(0);
  });

  it('stageChronicleLabel: 本編ステージは「ステージN」', () => {
    expect(stageChronicleLabel('stage-1')).toBe('ステージ1');
  });
});
