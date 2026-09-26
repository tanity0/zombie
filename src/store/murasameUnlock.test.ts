// 小烏丸(murasame)解禁の純ロジックのユニット。
//  ・maybeUnlockMurasame(store の純関数): 前提=トール討伐済み かつ 刀Lv3(MAX)所持のときだけ murasame:1 を陳列。
//  ・markKogarasuUnlocked / isKogarasuUnlocked(progress の永続フラグ): 初回のみ true・dedup・resetProgressで消える。
// node 既定環境には localStorage が無いので、progress.ts を叩くテスト用に最小モックを差す
// (progress.test.ts と同じ手口。ESMの import 評価後にこの代入が走り、テスト実行時にはモックが効いている)。
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

import { maybeUnlockMurasame } from './gameStore';
import { markKogarasuUnlocked, isKogarasuUnlocked, resetProgress } from '../data/progress';
import type { Player, SubWeaponKey } from '../types/game';

beforeEach(() => { for (const k of Object.keys(backing)) delete backing[k]; });

// maybeUnlockMurasame は player.subWeapons / player.subWeaponLevels しか読まない。最小の Player 形で足りる。
const withKatana = (level: number | null): Player =>
  (level === null
    ? { subWeapons: [], subWeaponLevels: {} }
    : { subWeapons: ['katana'], subWeaponLevels: { katana: level } }) as unknown as Player;

describe('maybeUnlockMurasame(小烏丸の陳列判定)', () => {
  it('トール未討伐なら刀Lv3所持でも null(前提条件=トール討伐)', () => {
    expect(maybeUnlockMurasame(withKatana(3), {}, false)).toBeNull();
  });

  it('トール討伐済み × 刀Lv3所持 → murasame:1 を返し、既存の陳列は保持する', () => {
    const unlocked: Partial<Record<SubWeaponKey, number>> = { 'sage-stone': 1 };
    const next = maybeUnlockMurasame(withKatana(3), unlocked, true);
    expect(next).toEqual({ 'sage-stone': 1, murasame: 1 });
    // 元のオブジェクトは破壊しない(新しいマップを返す)。
    expect(unlocked).toEqual({ 'sage-stone': 1 });
  });

  it('刀を所持していない → null', () => {
    expect(maybeUnlockMurasame(withKatana(null), {}, true)).toBeNull();
  });

  it('刀Lv2(MAX未満)→ null', () => {
    expect(maybeUnlockMurasame(withKatana(2), {}, true)).toBeNull();
  });

  it('既に murasame:1 が陳列済みなら null(重複解禁しない)', () => {
    expect(maybeUnlockMurasame(withKatana(3), { murasame: 1 }, true)).toBeNull();
  });
});

describe('markKogarasuUnlocked / isKogarasuUnlocked(永続解禁フラグ)', () => {
  it('初期状態は未解禁', () => {
    expect(isKogarasuUnlocked()).toBe(false);
  });

  it('初回 mark は true を返し、以後 isKogarasuUnlocked が true になる', () => {
    expect(markKogarasuUnlocked()).toBe(true);
    expect(isKogarasuUnlocked()).toBe(true);
  });

  it('2回目以降の mark は false(=ポップアップは初回討伐のランに限定)', () => {
    expect(markKogarasuUnlocked()).toBe(true);
    expect(markKogarasuUnlocked()).toBe(false);
    expect(isKogarasuUnlocked()).toBe(true);
  });

  it('resetProgress で解禁フラグも消える(開発用)', () => {
    markKogarasuUnlocked();
    resetProgress();
    expect(isKogarasuUnlocked()).toBe(false);
  });
});
