// TEST_HANDOFF/REQUEST-devbridge.md C節(P0-3 の seed)のユニットテスト。
// devTestKnobs.ts はモジュール評価時に `window.location.search` を1回だけ読むため
// (?weapon=/?sub=と同じ作法)、`window` を最小スタブで用意した上で vi.resetModules() +
// 動的importでモジュールを毎回作り直す(testEvents.test.tsと同じ作法)。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mulberry32 } from './botUpgradePolicy';

const installLocation = (search: string) => {
  (globalThis as unknown as { window: { location: { search: string } } }).window = {
    location: { search },
  };
};

describe('devTestKnobs: DEV_SEED_PARAM(?seed=)', () => {
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;

  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  });

  it('未指定では null(=既定の挙動=botRandRefはseed1のまま・通常プレイ不変)', async () => {
    installLocation('');
    const mod = await import('./devTestKnobs');
    expect(mod.DEV_SEED_PARAM).toBeNull();
    // 呼び出し側と同じ式(`DEV_SEED_PARAM ?? 1`)で「実際に使われるseed」を読める。
    expect(mod.DEV_SEED_PARAM ?? 1).toBe(1);
  });

  it('?seed=<整数>を渡すとその値がparseされる', async () => {
    installLocation('?seed=777');
    const mod = await import('./devTestKnobs');
    expect(mod.DEV_SEED_PARAM).toBe(777);
  });

  it('整数でない値(小数・文字列)は無視してnullにフォールバックする', async () => {
    installLocation('?seed=abc');
    const modA = await import('./devTestKnobs');
    expect(modA.DEV_SEED_PARAM).toBeNull();

    vi.resetModules();
    installLocation('?seed=1.5');
    const modB = await import('./devTestKnobs');
    expect(modB.DEV_SEED_PARAM).toBeNull();
  });

  it('負の整数・0も有効な整数として受け付ける', async () => {
    installLocation('?seed=0');
    const modA = await import('./devTestKnobs');
    expect(modA.DEV_SEED_PARAM).toBe(0);

    vi.resetModules();
    installLocation('?seed=-5');
    const modB = await import('./devTestKnobs');
    expect(modB.DEV_SEED_PARAM).toBe(-5);
  });
});

describe('devTestKnobs: seedの再現性(mulberry32経由・botRandRefと同じ使い方)', () => {
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;

  beforeEach(() => {
    vi.resetModules();
    installLocation('?seed=42');
  });
  afterEach(() => {
    (globalThis as unknown as { window?: unknown }).window = originalWindow;
  });

  it('同じseedからは同じ乱数列が出る(useGameLoop.tsのbotRandRefと同じ式)', async () => {
    const mod = await import('./devTestKnobs');
    const a = mulberry32(mod.DEV_SEED_PARAM ?? 1);
    const b = mulberry32(mod.DEV_SEED_PARAM ?? 1);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
});
