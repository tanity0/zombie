// 熟練度の**配線**テスト(research/MASTERY.md v2 §3 / v2.1 A-3・A-4・A-11・A-12)。純関数側は utils/mastery.test.ts。
// 見るのは resetGame の焼き込み(回収→焼き込み→無視する出撃の旗)と、守護霊・幻影の疑似プレイヤーの上書きだけ。
import { describe, it, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => { mem.clear(); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;

const { useGameStore } = await import('./gameStore');
const { MASTERY_PENDING_KEY, SUB_TO_MASTERY_KEY } = await import('../data/mastery');
const { saveMastery, loadMastery, masteryNeedFor } = await import('../utils/mastery');
const { noteMasteryDamage, isMasteryRunIgnored, getPendingMastery } = await import('../utils/masteryRun');
const { buildPseudoPlayer } = await import('../utils/playerBuild');

const sortie = () => useGameStore.getState().resetGame('warrior');

/** 持っている物から loadout の集合を数え直す(テスト側の独立した数え方)。 */
const loadoutKeys = (): Set<string> => {
  const p = useGameStore.getState().player;
  const set = new Set<string>();
  for (const w of p.weapons) if (!w.isMelee && w.category) set.add(w.category);
  const subs = p.subWeapons ?? [];
  if (p.weapons.some(w => w.isMelee)) set.add(subs.includes('brawler') ? 'brawler' : 'melee');
  for (const s of subs) { const k = SUB_TO_MASTERY_KEY[s]; if (k) set.add(k); }
  return set;
};

beforeEach(() => {
  mem.clear();
  useGameStore.getState().setBenchmarkRun(false);
  useGameStore.getState().setPendingFarBackdrop('');
  sortie();
  mem.clear();
});

describe('resetGame の焼き込み', () => {
  it('保存が空: 育つキーは全部1(欄なし)・max は ×1.9・loadout は 1', () => {
    sortie();
    const p = useGameStore.getState().player;
    expect(p.masteryMult).toEqual({ max: 1.9 });
    expect(p.masteryLoadoutMult).toBe(1);
    expect(isMasteryRunIgnored()).toBe(false);
  });

  it('保存の段階が倍率になる。loadout は出撃開始時に持っている物の平均', () => {
    const p0 = useGameStore.getState().player;
    const gun = p0.weapons.find(w => !w.isMelee)?.category;
    expect(gun).toBeDefined();
    saveMastery({ xp: { [gun!]: masteryNeedFor(gun!, 1) + masteryNeedFor(gun!, 2) + masteryNeedFor(gun!, 3) } }); // Lv4
    sortie();
    const p = useGameStore.getState().player;
    expect(p.masteryMult?.[gun!]).toBeCloseTo(1.3, 10);
    const keys = loadoutKeys();
    expect(keys.has(gun!)).toBe(true);
    expect(p.masteryLoadoutMult).toBeCloseTo((1.3 + (keys.size - 1)) / keys.size, 10);
  });

  it('ベンチ・チュートリアルは無視する出撃(倍率は全部1・貯めない)', () => {
    saveMastery({ xp: { handgun: 999999 } });
    useGameStore.getState().setBenchmarkRun(true);
    sortie();
    expect(useGameStore.getState().player.masteryMult).toEqual({});
    expect(useGameStore.getState().player.masteryLoadoutMult).toBe(1);
    expect(isMasteryRunIgnored()).toBe(true);
    noteMasteryDamage('handgun', 100);
    expect(getPendingMastery()).toEqual({});
    useGameStore.getState().setBenchmarkRun(false);

    useGameStore.getState().setPendingFarBackdrop('tutorial');
    sortie();
    expect(useGameStore.getState().player.masteryMult).toEqual({});
    expect(isMasteryRunIgnored()).toBe(true);
    useGameStore.getState().setPendingFarBackdrop('');
    sortie();
    expect(isMasteryRunIgnored()).toBe(false);
    expect(loadMastery().xp).toEqual({ handgun: 999999 }); // 無視した出撃の分は流れていない
  });

  it('リザルトを通らずに次の出撃: 貯めた分は次の resetGame で本体へ足される(1回だけ)', () => {
    sortie();
    noteMasteryDamage('rifle', 120);
    sortie();
    expect(loadMastery().xp).toEqual({ rifle: 120 });
    expect(mem.has(MASTERY_PENDING_KEY)).toBe(false);
    sortie();
    expect(loadMastery().xp).toEqual({ rifle: 120 });
  });
});

describe('守護霊・幻影の疑似プレイヤー', () => {
  it('記録が無い道でも masteryMult={}・masteryLoadoutMult=1 で上書きする(本人の値を引き継がない)', () => {
    saveMastery({ xp: { handgun: 999999, melee: 999999 } });
    sortie();
    const live = useGameStore.getState().player;
    expect(live.masteryMult?.handgun).toBe(1.9);
    const pseudo = buildPseudoPlayer(undefined, live);
    expect(pseudo.masteryMult).toEqual({});
    expect(pseudo.masteryLoadoutMult).toBe(1);
  });
});
