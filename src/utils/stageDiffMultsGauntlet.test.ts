// research/STAGE_DIFFICULTY.md: 計測路のもう半分=**ガントレット**でも係数は1.0。
// isGauntletRun() はモジュールロード時にURLを1回読む定数なので実行時に立てられない。
// このファイルだけモジュールを差し替えて確かめる(vi.mockはファイル単位で効くため別ファイルにしてある)。
import { describe, it, expect, vi } from 'vitest';

vi.mock('./gauntletMode', () => ({ isGauntletRun: () => true }));

const backing: Record<string, string> = { 'zombie.progress.selectedStage': 'stage-6' };
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in backing ? backing[k] : null),
  setItem: (k: string, v: string) => { backing[k] = v; },
  removeItem: (k: string) => { delete backing[k]; },
  clear: () => { for (const k of Object.keys(backing)) delete backing[k]; },
  key: () => null,
  get length() { return Object.keys(backing).length; },
} as Storage;

import { stageBossDiffMults } from './stageDiffMults';

describe('stageBossDiffMults — ガントレット(計測路)', () => {
  it('階段の最上段(stage-6)を選んでいても 1.0 を返す', () => {
    expect(stageBossDiffMults()).toEqual({ hp: 1, dmg: 1 });
  });
});
