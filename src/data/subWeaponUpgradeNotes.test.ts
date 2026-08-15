// 台帳(SUB_WEAPON_UPGRADE_NOTES)の取りこぼしゼロを機械化する。
// 「商人に並びうる全サブウェポン」= SUB_WEAPON_KEYS(通常陳列)∪ CHARACTER_SUBWEAPON_KEYS(装備中のみ陳列)
// ∪ murasame/sage-stone(刀Lv3/錬金Lv3到達で特殊陳列・maybeUnlockMurasame/maybeUnlockSageStone)。
// これは SubWeaponKey 型の全体と一致する(gameStore.ts:1416/1401でこの2つも unlocked に足される)。
// 将来 SubWeaponKey が増えた時に、台帳側が Record<SubWeaponKey,...> で型チェックに強制されるのに加え、
// ここでも実行時に取りこぼしを検出する(型だけに頼らない=二重の安全網)。
import { describe, it, expect } from 'vitest';
import { SUB_WEAPON_UPGRADE_NOTES, subWeaponUpgradeNoteText } from './subWeaponUpgradeNotes';
import { SUB_WEAPON_KEYS, CHARACTER_SUBWEAPON_KEYS } from './campaign';
import type { SubWeaponKey } from '../types/game';

// 商人に並びうる全サブウェポン(通常陳列 + 職固有 + murasame/sage-stoneの特殊陳列)。
const MERCHANT_SHELVABLE_KEYS: SubWeaponKey[] = [
  ...SUB_WEAPON_KEYS,
  ...CHARACTER_SUBWEAPON_KEYS,
  'murasame',
  'sage-stone',
];

describe('SUB_WEAPON_UPGRADE_NOTES(取りこぼしゼロ)', () => {
  it('商人に並びうる全サブウェポンに台帳の行が存在する', () => {
    for (const key of MERCHANT_SHELVABLE_KEYS) {
      expect(SUB_WEAPON_UPGRADE_NOTES[key], `${key} の台帳行が無い`).toBeDefined();
    }
  });

  it('台帳のキー集合は商人に並びうる全サブウェポンの集合と一致する(余剰・不足ゼロ)', () => {
    const ledgerKeys = Object.keys(SUB_WEAPON_UPGRADE_NOTES).sort();
    const shelvableKeys = Array.from(new Set(MERCHANT_SHELVABLE_KEYS)).sort();
    expect(ledgerKeys).toEqual(shelvableKeys);
  });

  it('各行は lv2/lv3 のどちらも string か null(未記入=undefinedを許さない)', () => {
    for (const [key, note] of Object.entries(SUB_WEAPON_UPGRADE_NOTES)) {
      expect(note.lv2 === null || typeof note.lv2 === 'string', `${key}.lv2`).toBe(true);
      expect(note.lv3 === null || typeof note.lv3 === 'string', `${key}.lv3`).toBe(true);
    }
  });

  it('文面には数値を書かない(CLAUDE.md「本文に数値を書かない」)', () => {
    for (const [key, note] of Object.entries(SUB_WEAPON_UPGRADE_NOTES)) {
      for (const [lv, text] of [['lv2', note.lv2], ['lv3', note.lv3]] as const) {
        if (text === null) continue;
        expect(text, `${key}.${lv} に数値が書かれている: "${text}"`).not.toMatch(/[0-9]/);
      }
    }
  });
});

describe('subWeaponUpgradeNoteText', () => {
  it('nextLevel<=1(初回習得)は台帳を使わない専用文言', () => {
    expect(subWeaponUpgradeNoteText('dog', 1)).toBe('装備できるようになる');
    expect(subWeaponUpgradeNoteText('dog', 0)).toBe('装備できるようになる');
  });

  it('nextLevel=2/3は台帳のlv2/lv3をそのまま返す', () => {
    expect(subWeaponUpgradeNoteText('dog', 2)).toBe(SUB_WEAPON_UPGRADE_NOTES.dog.lv2);
    expect(subWeaponUpgradeNoteText('dog', 3)).toBe(SUB_WEAPON_UPGRADE_NOTES.dog.lv3);
  });

  it('レベルで変化しないサブウェポン(murasame/sage-stone)はその旨のフォールバック文言', () => {
    expect(subWeaponUpgradeNoteText('murasame', 2)).toBe('このLvでは変化しない');
    expect(subWeaponUpgradeNoteText('sage-stone', 2)).toBe('このLvでは変化しない');
  });

  // 社長裁定v0.25.3482でタレットにLv差が付いた(Lv1=10秒/Lv2=13秒/Lv3=15秒+たまに爆発)。
  // 「Lvで変化しない」枠から外れたことを固定する(元に戻すと落ちる)。
  it('タレットはLv2/Lv3で強化される(v0.25.3482)', () => {
    expect(subWeaponUpgradeNoteText('turret', 2)).not.toBe('このLvでは変化しない');
    expect(subWeaponUpgradeNoteText('turret', 3)).not.toBe('このLvでは変化しない');
  });
});
