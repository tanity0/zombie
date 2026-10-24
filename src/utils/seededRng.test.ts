import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * ★不変条件: **`?seed=` が無ければ `Math.random` そのもの**。
 * ここが崩れると「seed化したら難度カーブが変わった」という事故になる(実装者が心配していた点)。
 * モジュールはURLを**評価時に1回だけ**読むので、seedの有無は `vi.resetModules()` で入れ替える。
 */
const loadWith = async (search: string) => {
  vi.resetModules();
  const url = new URL('http://localhost/zombie/' + search);
  vi.stubGlobal('window', { location: { search: url.search } } as unknown as Window);
  return await import('./seededRng');
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ランの再現性のための乱数', () => {
  it('★★seed未指定なら Math.random をそのまま使う(通常プレイの分布を変えない)', async () => {
    const m = await loadWith('');
    expect(m.isSeededRun()).toBe(false);
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.4242);
    const rng = m.makeSeededRng('spawn');
    expect(rng()).toBe(0.4242);
    expect(spy).toHaveBeenCalled();          // 本当に Math.random を通っている
  });

  it('★同じseedなら同じ列が出る', async () => {
    const m = await loadWith('?seed=777');
    expect(m.isSeededRun()).toBe(true);
    const a = m.makeSeededRng('spawn');
    const first = Array.from({ length: 12 }, () => a());
    a.reset();
    const again = Array.from({ length: 12 }, () => a());
    expect(again).toEqual(first);
    expect(new Set(first).size).toBeGreaterThan(8);   // 定数を返しているだけではない
  });

  it('★★系統ごとに独立した流れ(後からドロップを足しても湧きの並びが動かない)', async () => {
    const m = await loadWith('?seed=777');
    const spawn = m.makeSeededRng('spawn');
    const drop = m.makeSeededRng('drop');
    const spawnFirst = Array.from({ length: 8 }, () => spawn());
    // ドロップ側をいくら引いても、湧き側の続きは変わらない
    for (let i = 0; i < 50; i++) drop();
    spawn.reset();
    expect(Array.from({ length: 8 }, () => spawn())).toEqual(spawnFirst);
    // 別の系統は別の列
    drop.reset();
    expect(Array.from({ length: 8 }, () => drop())).not.toEqual(spawnFirst);
  });

  it('seedが違えば列が違う', async () => {
    const a = (await loadWith('?seed=1')).makeSeededRng('spawn');
    const listA = Array.from({ length: 8 }, () => a());
    const b = (await loadWith('?seed=2')).makeSeededRng('spawn');
    expect(Array.from({ length: 8 }, () => b())).not.toEqual(listA);
  });

  it('resetSeededRngs で全系統が頭へ戻る(2回目の出撃が同じ並びになる)', async () => {
    const m = await loadWith('?seed=99');
    const spawn = m.makeSeededRng('spawn');
    const first = Array.from({ length: 6 }, () => spawn());
    for (let i = 0; i < 20; i++) spawn();
    m.resetSeededRngs();
    expect(Array.from({ length: 6 }, () => spawn())).toEqual(first);
  });
});
