// 熟練度の**配線**テスト(research/MASTERY.md v2 §3 / v2.1 A-3・A-4・A-11・A-12)。純関数側は utils/mastery.test.ts。
// 見るのは resetGame の焼き込み(回収→焼き込み→無視する出撃の旗)と、守護霊・幻影の疑似プレイヤーの上書きだけ
// (守護霊=記録の値・幻影={}/1。守護霊の当たりは masteryGuardian.store.test.ts)。
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
const { MASTERY_PENDING_KEY, SUB_TO_MASTERY_KEY, gunMasteryKeyOfWeaponKey } = await import('../data/mastery');
const { saveMastery, loadMastery, masteryNeedFor } = await import('../utils/mastery');
const { noteMasteryDamage, isMasteryRunIgnored, getPendingMastery } = await import('../utils/masteryRun');
const { buildPseudoPlayer } = await import('../utils/playerBuild');

const sortie = () => useGameStore.getState().resetGame('warrior');

/** Lv10 に届く量(必要量の値から導く=値を動かしても落ちない)。 */
const MAX_XP = Math.max(...(['handgun-t1', 'hatchet-t2'] as const).map(k => {
  let t = 0;
  for (let l = 1; l < 10; l++) t += masteryNeedFor(k, l);
  return t;
}));

/** 持っている物から loadout の集合を数え直す(テスト側の独立した数え方)。 */
const loadoutKeys = (): Set<string> => {
  const p = useGameStore.getState().player;
  const set = new Set<string>();
  for (const w of p.weapons) if (!w.isMelee) set.add(String(w.key)); // 銃は武器ごと=持っている銃のキー
  const subs = p.subWeapons ?? [];
  const melee = p.weapons.find(w => w.isMelee);
  if (melee) set.add(subs.includes('brawler') ? 'brawler' : String(melee.key)); // 近接はナイフ毎=装備している近接武器のキー
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
    const gun = gunMasteryKeyOfWeaponKey(p0.weapons.find(w => !w.isMelee)?.key);
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
    saveMastery({ xp: { 'handgun-t1': MAX_XP } });
    useGameStore.getState().setBenchmarkRun(true);
    sortie();
    expect(useGameStore.getState().player.masteryMult).toEqual({});
    expect(useGameStore.getState().player.masteryLoadoutMult).toBe(1);
    expect(isMasteryRunIgnored()).toBe(true);
    noteMasteryDamage('handgun-t1', 100);
    expect(getPendingMastery()).toEqual({});
    useGameStore.getState().setBenchmarkRun(false);

    useGameStore.getState().setPendingFarBackdrop('tutorial');
    sortie();
    expect(useGameStore.getState().player.masteryMult).toEqual({});
    expect(isMasteryRunIgnored()).toBe(true);
    useGameStore.getState().setPendingFarBackdrop('');
    sortie();
    expect(isMasteryRunIgnored()).toBe(false);
    expect(loadMastery().xp).toEqual({ 'handgun-t1': MAX_XP }); // 無視した出撃の分は流れていない
  });

  it('リザルトを通らずに次の出撃: 貯めた分は次の resetGame で本体へ足される(1回だけ)', () => {
    sortie();
    noteMasteryDamage('rifle-t1', 120);
    sortie();
    expect(loadMastery().xp).toEqual({ 'rifle-t1': 120 });
    expect(mem.has(MASTERY_PENDING_KEY)).toBe(false);
    sortie();
    expect(loadMastery().xp).toEqual({ 'rifle-t1': 120 });
  });
});

describe('守護霊・幻影の疑似プレイヤー', () => {
  it('幻影(既定=guardian 省略): 記録の有無にかかわらず masteryMult={}・masteryLoadoutMult=1(本人の値を引き継がない)', () => {
    saveMastery({ xp: { 'handgun-t1': MAX_XP, 'hatchet-t2': MAX_XP } });
    sortie();
    const live = useGameStore.getState().player;
    expect(live.masteryMult?.['handgun-t1']).toBe(1.9);
    const pseudo = buildPseudoPlayer(undefined, live);
    expect(pseudo.masteryMult).toEqual({});
    expect(pseudo.masteryLoadoutMult).toBe(1);
    const withRecord = buildPseudoPlayer({ maxHealth: 100, speed: 200, level: 1, masteryMult: { 'handgun-t1': 1.5 }, masteryLoadoutMult: 1.3 }, live);
    expect(withRecord.masteryMult).toEqual({});
    expect(withRecord.masteryLoadoutMult).toBe(1);
  });
  it('守護霊(guardian): 記録の値を持つ。記録が無い/欄が無い時は {}/1(本人の値を引き継がない)', () => {
    saveMastery({ xp: { 'handgun-t1': MAX_XP, 'hatchet-t2': MAX_XP } });
    sortie();
    const live = useGameStore.getState().player;
    const g = buildPseudoPlayer({ maxHealth: 100, speed: 200, level: 1, masteryMult: { 'handgun-t1': 1.5 }, masteryLoadoutMult: 1.3 }, live, { guardian: true });
    expect(g.masteryMult).toEqual({ 'handgun-t1': 1.5 });
    expect(g.masteryLoadoutMult).toBeCloseTo(1.3, 10);
    for (const snap of [undefined, { maxHealth: 100, speed: 200, level: 1 }]) {
      const old = buildPseudoPlayer(snap, live, { guardian: true });
      expect(old.masteryMult).toEqual({});
      expect(old.masteryLoadoutMult).toBe(1);
    }
  });
});
