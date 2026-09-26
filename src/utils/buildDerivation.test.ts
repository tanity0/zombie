// research/SAME_ARENA.md §4-c(社長方針2026-08-23):
// 「持つべき情報はビルドであって、何を持ってるのか?さえ分かれば、あとはゲーム内の規定数値に
//   変換すればいいだけ。**後から数値仕様が変わっても、勝手に揃うはず**」
//
// この「勝手に揃う」を機械化する。記録が持つ数値ではなく**今の表**から引けていることを、
// 「表を差し替えたら結果が動く」という形で確かめる(数値を写経して固定しない)。
import { describe, it, expect } from 'vitest';
import { buildPseudoPlayer } from './playerBuild';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { aggregateEquipBonus, equipMaxHealthOf } from '../data/equipment';
import { strongestGuardian } from '../data/fixedGuardians';
import { useGameStore } from '../store/gameStore';
import type { PlayerBuildSnapshot } from '../types/game';

const live = () => useGameStore.getState().player;
const snapOf = (): PlayerBuildSnapshot => ({ ...(strongestGuardian().profile.snapshot as PlayerBuildSnapshot) });

describe('§4-c 数値は「持ち物」から引く(記録の数値を信じない)', () => {
  it('★最大HP=クラスの素のHP+装備のHP加算(記録の maxHealth は使わない)', () => {
    const snap = snapOf();
    const p = buildPseudoPlayer(snap, live());
    const cls = snap.characterClass!;
    expect(p.maxHealth).toBe(PLAYER_PROFILES[cls].maxHp + equipMaxHealthOf(snap.equipment!));
  });

  it('★記録の maxHealth が嘘でも、持ち物から正しい値が出る(=数値仕様が変わっても勝手に揃う)', () => {
    const snap = snapOf();
    const correct = buildPseudoPlayer(snap, live()).maxHealth;
    const lying: PlayerBuildSnapshot = { ...snap, maxHealth: 99999 };
    expect(buildPseudoPlayer(lying, live()).maxHealth).toBe(correct);
    const stale: PlayerBuildSnapshot = { ...snap, maxHealth: 1 };
    expect(buildPseudoPlayer(stale, live()).maxHealth).toBe(correct);
  });

  it('★装備効果も持ち物から引く(記録の equipBonus は使わない=改造耐性にもなる)', () => {
    const snap = snapOf();
    const tampered: PlayerBuildSnapshot = {
      ...snap,
      equipBonus: { ...snap.equipBonus!, damageMult: 5, critBonus: 1 },
    };
    const p = buildPseudoPlayer(tampered, live());
    expect(p.equipBonus).toEqual(aggregateEquipBonus(snap.equipment!));
    expect(p.equipBonus?.damageMult).not.toBe(5);
  });

  it('装備を差し替えれば結果が動く(=表を引いている証拠。値を写経していない)', () => {
    const snap = snapOf();
    const naked: PlayerBuildSnapshot = {
      ...snap,
      equipment: { body: null, arms: null, accessory: null } as PlayerBuildSnapshot['equipment'],
    };
    const withGear = buildPseudoPlayer(snap, live()).maxHealth;
    const without = buildPseudoPlayer(naked, live()).maxHealth;
    expect(withGear).toBeGreaterThan(without);
    expect(without).toBe(PLAYER_PROFILES[snap.characterClass!].maxHp);
  });

  it('★識別子が欠けた旧データだけ、記録の数値へ落ちる(後方互換)', () => {
    const snap = snapOf();
    const old: PlayerBuildSnapshot = { ...snap, characterClass: undefined, equipment: undefined, equipBonus: undefined };
    const p = buildPseudoPlayer(old, live());
    expect(p.maxHealth).toBe(old.maxHealth); // 引けないので記録の数値
  });

  it('レベルアップで積んだ値(クリ率/装填/リロード)は持ち物から引けないので記録のまま', () => {
    const snap: PlayerBuildSnapshot = { ...snapOf(), critChance: 0.17, magBonus: 3, reloadMult: 0.8 };
    const p = buildPseudoPlayer(snap, live());
    expect(p.critChance).toBe(0.17);
    expect(p.magBonus).toBe(3);
    expect(p.reloadMult).toBe(0.8);
  });
});
