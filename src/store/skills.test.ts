// Unit tests for the reworked melee skill numbers (knife-master combo mult,
// slasher follow-up decay). Pure functions/constants from the store — see
// CLAUDE.md Testing policy (test the changed logic in the same commit).
import { describe, it, expect } from 'vitest';
import { skillMeleeComboMult, SLASHER_MULTS, SLASHER_MAX_HITS,
  skillAttackShooterGunMult, skillRunnerSpeedMult, skillSeekerProcChance, isSeekerActive,
  skillMagnetAmmoRangeMult, skillOverclockChance, skillLastMagazineMult,
  // v0.25.3300 覚醒(Lv3)効果の純関数
  skillComboMasterMult, huntingMeleeRadius, runnerAwakenDamageMult, skillExplosionKbMult,
  sniperGunMult, MELEE_RADIUS,
  // v0.25.3303 カウンターマスター覚醒
  counterMasterAwakenBuffPatch, COUNTER_MASTER_AWAKEN_BUFF_MS, useGameStore,
  RUNNER_RELOAD_BONUS_MULT, applyRescueSignalProc,
  skillOutgoingDamageMult, skillGoldRushMult, skillIncomingDamageMult,
  // SKILL_BUILD_REDESIGN.md §23: 消費カード5種の倍率フック(旧skillScrapBuilderGainMult/
  // skillWarmUp*は§23-1裁定で退役=削除済み)。
  consumableScrapMult, consumableAttackMult, consumableSpeedMult, consumableXpMult, consumableProtectionMult,
  activeConsumableCount, activeConsumableKeys, applyConsumableCard,
  CONSUMABLE_SCRAP_MULT, CONSUMABLE_ATTACK_MULT, CONSUMABLE_SPEED_MULT, CONSUMABLE_XP_MULT, CONSUMABLE_PROTECTION_MULT,
} from './gameStore';
import { vi } from 'vitest';
import { checkPlayerPickupCollisions } from '../utils/collisionUtils';
import { berserkerAwakenFireRateMult } from '../utils/weaponUtils';
import { bomberMiniCount, buildBomberMinis } from '../utils/bomberScatter';
import { HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL } from '../config/hunting';
import type { Pickup } from '../types/game';
import { rollSkillLevel, skillMaxLevel, rarityWeightsForPity, levelWeightsFor,
  gachaPullCost, gachaPullCostFor, GACHA_PRICE_STEPS, GACHA_PULL_COST_CAP, GACHA_REFUND_BY_RARITY,
  gachaSuperPercent, gachaPityRemaining, gachaPromotePercent, skillDescForLevel,
  rollGachaSkill, GACHA_EXCLUDED_SKILLS, SKILLS, RETIRED_SKILLS,
  DEFAULT_OWNED_SKILLS, ensureDefaultOwnedSkills,
  NEW_SLEEPING_SKILLS, OBTAINABLE_SKILL_KEYS } from '../data/campaign';
import { CONSUMABLE_DURATION_MS } from '../data/consumables';
import { RUN_DRAFT_EXCLUDED_SKILLS, newSkillCandidates } from '../utils/runSkillDraft';
import type { Player, SkillKey, ConsumableKey } from '../types/game';

// Minimal player carrying one leveled skill (for the simple multiplier skills).
const withSkill = (key: SkillKey, level: number): Player =>
  ({ skills: [key], skillLevels: { [key]: level } } as unknown as Player);

// SKILL_BUILD_REDESIGN.md §23: 消費カードは全プレイヤー共通(ガチャ外)=skills配列とは無関係。
// Untilフィールド1つだけをセットした最小Player(他4種は0=非アクティブ)。
const withConsumableUntil = (field: 'consumableScrapUntil' | 'consumableAttackUntil' | 'consumableSpeedUntil' | 'consumableXpUntil' | 'consumableProtectionUntil', until: number): Player =>
  ({
    skills: [], skillLevels: {}, maxHealth: 100, health: 100, characterClass: 'soldier',
    consumableScrapUntil: 0, consumableAttackUntil: 0, consumableSpeedUntil: 0,
    consumableXpUntil: 0, consumableProtectionUntil: 0,
    [field]: until,
  } as unknown as Player);

// Minimal player shape for skillMeleeComboMult (reads skills + skillLevels + knifeCombo* only).
const knifeMaster = (count: number, level = 1, until = 10_000): Player =>
  ({ skills: ['knife-master'], skillLevels: { 'knife-master': level }, knifeComboCount: count, knifeComboUntil: until } as unknown as Player);

describe('knife-master combo damage (leveled +2%/+2%/+4% per hit, cap +40%/+50%/+60% — PACING_PUZZLE.md §6.22 M47仕様②)', () => {
  const at = (count: number, level = 1, until = 10_000) =>
    skillMeleeComboMult(knifeMaster(count, level, until), 0, 0, 0);

  it('Lv1: +2%/hit, caps at +40% (×1.4)', () => {
    expect(at(0, 1)).toBeCloseTo(1.0);
    expect(at(1, 1)).toBeCloseTo(1.02);
    expect(at(10, 1)).toBeCloseTo(1.20);
    expect(at(20, 1)).toBeCloseTo(1.4);
    expect(at(99, 1)).toBeCloseTo(1.4); // clamped
  });

  it('Lv2: +2%/hit, caps at +50% (×1.5)', () => {
    expect(at(10, 2)).toBeCloseTo(1.20);
    expect(at(25, 2)).toBeCloseTo(1.5);
    expect(at(99, 2)).toBeCloseTo(1.5); // clamped
  });

  it('Lv3: +4%/hit, caps at +60% (×1.6)', () => {
    expect(at(10, 3)).toBeCloseTo(1.40);
    expect(at(15, 3)).toBeCloseTo(1.6);
    expect(at(99, 3)).toBeCloseTo(1.6); // clamped
  });

  it('reverts to ×1.0 once the 3s combo window has expired', () => {
    // gameTime (0) >= knifeComboUntil (-1) → window dead
    expect(skillMeleeComboMult(knifeMaster(40, 3, -1), 0, 0, 0)).toBeCloseTo(1.0);
  });

  it('is ×1.0 without the skill', () => {
    const noSkill = { skills: [], knifeComboCount: 40, knifeComboUntil: 10_000 } as unknown as Player;
    expect(skillMeleeComboMult(noSkill, 0, 0, 0)).toBeCloseTo(1.0);
  });
});

describe('rarity soft-pity weights', () => {
  it('base weights at pity 0 = 70/25/5', () => {
    expect(rarityWeightsForPity(0)).toEqual({ normal: 70, rare: 25, super: 5 });
  });
  it('each non-super pull shifts normal −5 / rare +4 / super +1', () => {
    expect(rarityWeightsForPity(1)).toEqual({ normal: 65, rare: 29, super: 6 });
    expect(rarityWeightsForPity(10)).toEqual({ normal: 20, rare: 65, super: 15 });
  });
  it('caps at pity 14: normal 0 / rare 81 / super 19, and clamps beyond', () => {
    expect(rarityWeightsForPity(14)).toEqual({ normal: 0, rare: 81, super: 19 });
    expect(rarityWeightsForPity(20)).toEqual({ normal: 0, rare: 81, super: 19 });
    expect(gachaSuperPercent(14)).toBe(19);
    expect(gachaPityRemaining(0)).toBe(14);
    expect(gachaPityRemaining(14)).toBe(0);
  });
});

// ゴールドのシンク接続(社長裁定v0.25.2337)。CORE_LOOP.md の最優先課題「③ランの輪が閉じていない」が
// これで閉じる。価格0(無料)へ戻すとシンクが消えてループが開くので、テストで固定する。
describe('ガチャ価格とゴールドのシンク', () => {
  it('価格は0ではない(=ゴールドの行き先がある)', () => {
    for (const n of [0, 1, 5, 14, 15, 30, 100, 1000]) expect(gachaPullCost(n)).toBeGreaterThan(0);
  });

  // 階段式(社長裁定v0.25.2344)。ヴァンサバ式に「引くほど高く、いずれ頭打ち」。
  it('段は単調増加で、最後は天井に張り付く(安くなって戻ることはない)', () => {
    for (let n = 1; n <= 200; n++) expect(gachaPullCost(n)).toBeGreaterThanOrEqual(gachaPullCost(n - 1));
    const last = GACHA_PRICE_STEPS[GACHA_PRICE_STEPS.length - 1];
    expect(gachaPullCost(last.until)).toBe(GACHA_PULL_COST_CAP);
    expect(gachaPullCost(9999)).toBe(GACHA_PULL_COST_CAP);
    for (const s of GACHA_PRICE_STEPS) expect(s.price).toBeLessThanOrEqual(GACHA_PULL_COST_CAP);
  });

  it('段の境目は until の直前まで据え置き、until ちょうどで次の段(オフバイワン防止)', () => {
    for (const s of GACHA_PRICE_STEPS) expect(gachaPullCost(s.until - 1)).toBe(s.price);
    expect(gachaPullCost(0)).toBe(GACHA_PRICE_STEPS[0].price); // 1回目=いちばん安い段
  });

  // 社長要件①「初回を飽きさせない」: 初戦の稼ぎ(実測 約20g)でその場で2回引けること。
  it('初戦の稼ぎ(20g)で2回引ける', () => {
    expect(gachaPullCostFor(0, 2)).toBeLessThanOrEqual(20);
  });

  // 社長要件②「1プレイで上手ければ複数回引ける」: 良いラン(実測 獲得123g+換金14g ≒ 137g)で
  // 天井に達した後でも2回引けること。ここが崩れると後半が「1ラン1回」に戻って飽きる。
  it('天井到達後でも、良いラン(137g)で2回引ける', () => {
    expect(gachaPullCostFor(999, 2)).toBeLessThanOrEqual(137);
    expect(GACHA_PULL_COST_CAP * 2).toBeLessThanOrEqual(137);
  });

  it('10連の合計は段をまたいでも「その10回の実額」(単価×10ではない)', () => {
    // 3回目から10連 = 3,4,5回目が10g / 6〜12回目が20g
    expect(gachaPullCostFor(2, 10)).toBe(10 * 3 + 20 * 7);
    // 天井後は単価×10と一致する
    expect(gachaPullCostFor(999, 10)).toBe(GACHA_PULL_COST_CAP * 10);
    // 1回ずつ足したものと必ず一致する(表示と課金がズレない)
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += gachaPullCost(7 + i);
    expect(gachaPullCostFor(7, 10)).toBe(sum);
  });

  it('壊れた累計回数(負/NaN/小数)でも最初の段へ落ちる', () => {
    expect(gachaPullCost(-5)).toBe(GACHA_PRICE_STEPS[0].price);
    expect(gachaPullCost(Number.NaN)).toBe(GACHA_PRICE_STEPS[0].price);
    expect(gachaPullCost(2.7)).toBe(gachaPullCost(2));
    expect(gachaPullCostFor(0, -1)).toBe(0);
  });

  // 返金は**固定額**(価格に対する割合ではない)。天井50では超レアの被り返金50gが
  // ちょうど1回ぶんになる=被りの救済が強い、という前提でコンプ距離を見積もってある。
  it('返金は固定額で、天井1回ぶんを超えない', () => {
    expect(GACHA_REFUND_BY_RARITY.normal).toBeLessThan(GACHA_REFUND_BY_RARITY.rare);
    expect(GACHA_REFUND_BY_RARITY.rare).toBeLessThan(GACHA_REFUND_BY_RARITY.super);
    expect(GACHA_REFUND_BY_RARITY.super).toBeLessThanOrEqual(GACHA_PULL_COST_CAP);
  });
});

describe('skill level table (per-skill dupe count)', () => {
  it('reaper is Lv1-only; bomber caps at Lv3 (v0.25.3305: 覚醒=ミニ4個へ到達可能に); others cap at Lv3', () => {
    expect(skillMaxLevel('reaper')).toBe(1);
    expect(skillMaxLevel('bomber')).toBe(3);
    expect(skillMaxLevel('knife-master')).toBe(3);
  });

  it('guardian-spirit(守護霊)はLv1固定(ガチャ重複によるLvアップ経路が無い=G3)', () => {
    expect(skillMaxLevel('guardian-spirit')).toBe(1);
  });

  it('level weights follow the confirmed table', () => {
    expect(levelWeightsFor('normal', 0)).toEqual([80, 15, 5]);
    expect(levelWeightsFor('normal', 1)).toEqual([70, 20, 10]);
    expect(levelWeightsFor('normal', 2)).toEqual([50, 40, 10]);
    expect(levelWeightsFor('normal', 3)).toEqual([20, 40, 40]);
    expect(levelWeightsFor('rare', 1)).toEqual([70, 20, 10]);
    expect(levelWeightsFor('rare', 3)).toEqual([20, 40, 40]);
    expect(levelWeightsFor('super', 0)).toEqual([70, 20, 10]);
    expect(levelWeightsFor('super', 2)).toEqual([10, 30, 60]);
  });

  // 不変条件(社長裁定v0.25.2336「ノーマルは潰して」): **ノーマルの昇格をレアより遅くしない**。
  // 1スキルあたりの排出率はレア度をまたいでほぼ同じ(超3.57%/レア3.18%/ノーマル3.20%)なので、
  // 昇格の刻みに差をつけると「地味なノーマルほど最後まで揃わない」逆転が起きる(旧実装の実バグ)。
  describe('ノーマルはレアより遅く昇格しない(v0.25.2336の逆転を再発させない)', () => {
    it('同じ被り回数ならノーマルとレアの重みは完全に一致する', () => {
      for (let d = 0; d <= 10; d++) {
        expect(levelWeightsFor('normal', d)).toEqual(levelWeightsFor('rare', d));
      }
    });

    it('ノーマルの昇格確率がレアを下回る被り回数は存在しない', () => {
      for (let d = 0; d <= 10; d++) {
        for (const lv of [1, 2]) {
          expect(gachaPromotePercent('normal', lv, d, 3))
            .toBeGreaterThanOrEqual(gachaPromotePercent('rare', lv, d, 3));
        }
      }
    });

    it('最上位表[20,40,40]へは被り3回で届く(旧実装は6回=倍かかっていた)', () => {
      expect(levelWeightsFor('normal', 2)).not.toEqual([20, 40, 40]);
      expect(levelWeightsFor('normal', 3)).toEqual([20, 40, 40]);
    });

    it('超レアは依然として最速で届く(レア度の序列は保つ)', () => {
      expect(levelWeightsFor('super', 2)).toEqual([10, 30, 60]);
      expect(gachaPromotePercent('super', 1, 2, 3))
        .toBeGreaterThan(gachaPromotePercent('normal', 1, 2, 3));
    });
  });

  it('rolls within 1..maxLv; Lv1-only always returns Lv1', () => {
    expect(rollSkillLevel('normal', 0, 1, () => 0)).toBe(1);
    expect(rollSkillLevel('normal', 0, 1, () => 0.999)).toBe(1);
    expect(rollSkillLevel('normal', 0, 3, () => 0)).toBe(1);   // first bucket
    expect(rollSkillLevel('normal', 3, 3, () => 0.999)).toBe(3); // top bucket
  });

  it('gachaPromotePercent = chance the next roll exceeds current Lv', () => {
    // normal dupe3 = [20,40,40]; from Lv1 → chance of Lv2 or Lv3 = 80%.
    expect(gachaPromotePercent('normal', 1, 3, 3)).toBe(80);
    // from Lv2 → only Lv3 = 40%.
    expect(gachaPromotePercent('normal', 2, 3, 3)).toBe(40);
    // at max Lv → 0.
    expect(gachaPromotePercent('normal', 3, 3, 3)).toBe(0);
  });
});

describe('attack-shooter gun damage bonus (+10/20/30%)', () => {
  it('scales by level and is ×1.0 without the skill', () => {
    expect(skillAttackShooterGunMult({ skills: [], skillLevels: {} } as unknown as Player)).toBeCloseTo(1.0);
    expect(skillAttackShooterGunMult(withSkill('attack-shooter', 1))).toBeCloseTo(1.10);
    expect(skillAttackShooterGunMult(withSkill('attack-shooter', 2))).toBeCloseTo(1.20);
    expect(skillAttackShooterGunMult(withSkill('attack-shooter', 3))).toBeCloseTo(1.30);
  });
});

describe('runner move speed bonus (+10/15/20%)', () => {
  it('scales by level and is ×1.0 without the skill', () => {
    expect(skillRunnerSpeedMult({ skills: [], skillLevels: {} } as unknown as Player)).toBeCloseTo(1.0);
    expect(skillRunnerSpeedMult(withSkill('runner', 1))).toBeCloseTo(1.10);
    expect(skillRunnerSpeedMult(withSkill('runner', 2))).toBeCloseTo(1.15);
    expect(skillRunnerSpeedMult(withSkill('runner', 3))).toBeCloseTo(1.20);
  });
  it('リロード中はさらに+10%(Lv不問固定・Lv倍率に乗算・非装備時は1のまま)(§6.8 M31)', () => {
    expect(RUNNER_RELOAD_BONUS_MULT).toBeCloseTo(1.10);
    expect(skillRunnerSpeedMult(withSkill('runner', 1), true)).toBeCloseTo(1.10 * 1.10);
    expect(skillRunnerSpeedMult(withSkill('runner', 2), true)).toBeCloseTo(1.15 * 1.10);
    expect(skillRunnerSpeedMult(withSkill('runner', 3), true)).toBeCloseTo(1.20 * 1.10);
    // 非装備はリロード中でも従来どおり(完全不変)
    expect(skillRunnerSpeedMult({ skills: [], skillLevels: {} } as unknown as Player, true)).toBeCloseTo(1.0);
  });
});

describe('magnet: ammo pickup range mult (+10/20/30%) (§6.8 M31)', () => {
  it('scales by level and is ×1.0 without the skill', () => {
    expect(skillMagnetAmmoRangeMult({ skills: [], skillLevels: {} } as unknown as Player)).toBeCloseTo(1.0);
    expect(skillMagnetAmmoRangeMult(withSkill('magnet', 1))).toBeCloseTo(1.1);
    expect(skillMagnetAmmoRangeMult(withSkill('magnet', 2))).toBeCloseTo(1.2);
    expect(skillMagnetAmmoRangeMult(withSkill('magnet', 3))).toBeCloseTo(1.3);
  });
  it('checkPlayerPickupCollisions: 弾薬+コインを拡大矩形で拾い、経験値は覚醒時のみ(v0.25.3300仕様変更)', () => {
    // プレイヤー32×32 @ (0,0) → 基準拾得矩形 = (-16,-16)〜(48,48)。
    const player = { x: 0, y: 0, width: 32, height: 32 } as unknown as Player;
    // 基準矩形の右端(48)の少し外・×1.3矩形(右端57.6)の内側に置く。
    const ammo = { id: 'a', x: 50, y: 8, type: 'ammo-rifle', value: 10 } as unknown as Pickup;
    const coin = { id: 'c', x: 50, y: 8, type: 'strap', value: 1 } as unknown as Pickup;
    const xp = { id: 'x', x: 50, y: 8, type: 'experience', value: 1 } as unknown as Pickup;
    const crate = { id: 'w', x: 50, y: 8, type: 'weapon-crate', value: 1 } as unknown as Pickup;
    // mult=1(非装備): どれも拾わない=従来挙動
    expect(checkPlayerPickupCollisions(player, [ammo, coin, xp, crate])).toEqual([]);
    // mult=1.3(Lv3・非覚醒): 弾薬+コインだけ拾う。経験値・武器箱は従来矩形のまま
    expect(checkPlayerPickupCollisions(player, [ammo, coin, xp, crate], 1.3)).toEqual(['a', 'c']);
    // 覚醒(Lv3): 経験値も拡大対象。武器箱(設置物)は常に従来矩形
    expect(checkPlayerPickupCollisions(player, [ammo, coin, xp, crate], 1.3, true)).toEqual(['a', 'c', 'x']);
  });
});

// 社長指示v0.25.3300: 覚醒(Lv3)効果の純関数群。
describe('覚醒(Lv3)効果 v0.25.3300', () => {
  it('combo-master覚醒: 窓切れ後も20秒間は倍率を維持する(Lv1/2は従来どおり即1)', () => {
    const p3 = { ...withSkill('combo-master', 3) } as Player;
    const p2 = { ...withSkill('combo-master', 2) } as Player;
    // 窓内: 通常どおり
    expect(skillComboMasterMult(p3, 1000, 10, 2000)).toBeCloseTo(1.4);
    // 窓切れ直後〜+20s: 覚醒は維持、Lv2は1
    expect(skillComboMasterMult(p3, 3000, 10, 2000)).toBeCloseTo(1.4);
    expect(skillComboMasterMult(p3, 2000 + 19_999, 10, 2000)).toBeCloseTo(1.4);
    expect(skillComboMasterMult(p2, 3000, 10, 2000)).toBeCloseTo(1.0);
    // +20s経過後は覚醒でも1
    expect(skillComboMasterMult(p3, 2000 + 20_001, 10, 2000)).toBeCloseTo(1.0);
  });
  it('berserker覚醒: HP40%以下で連射+10%(×1.1)。HPが高い/非覚醒は×1', () => {
    const low = { ...withSkill('berserker', 3), health: 40, maxHealth: 100 } as Player;
    const high = { ...withSkill('berserker', 3), health: 41, maxHealth: 100 } as Player;
    const lv2 = { ...withSkill('berserker', 2), health: 10, maxHealth: 100 } as Player;
    expect(berserkerAwakenFireRateMult(low)).toBeCloseTo(1.1);
    expect(berserkerAwakenFireRateMult(high)).toBeCloseTo(1.0);
    expect(berserkerAwakenFireRateMult(lv2)).toBeCloseTo(1.0);
  });
  it('knife-master覚醒: 近接範囲が常にハンティング相当。溜め中はさらに相対的に伸びる', () => {
    const base = { subWeaponLevels: {}, huntingCharged: false, skills: [], skillLevels: {} } as unknown as Player;
    const km3 = { ...base, skills: ['knife-master'], skillLevels: { 'knife-master': 3 } } as unknown as Player;
    const km3Charged = { ...km3, huntingCharged: true } as Player;
    expect(huntingMeleeRadius(base)).toBe(MELEE_RADIUS);
    expect(huntingMeleeRadius(km3)).toBe(MELEE_RADIUS + HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL[1]);
    expect(huntingMeleeRadius(km3Charged)).toBe(MELEE_RADIUS + HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL[1] * 2);
  });
  it('bomber覚醒: ミニ手榴弾4つ(通常3つ)', () => {
    expect(bomberMiniCount(withSkill('bomber', 2))).toBe(3);
    expect(bomberMiniCount(withSkill('bomber', 3))).toBe(4);
    expect(buildBomberMinis(0, 0, 't', 1000, () => 0.5, 4)).toHaveLength(4);
  });
  it('runner覚醒: 加速中(ランプ半分以上)は被ダメ×0.8', () => {
    const fast = { ...withSkill('runner', 3), speedRampSustainMs: 800 } as Player;
    const slow = { ...withSkill('runner', 3), speedRampSustainMs: 700 } as Player;
    const lv2 = { ...withSkill('runner', 2), speedRampSustainMs: 1500 } as Player;
    expect(runnerAwakenDamageMult(fast)).toBeCloseTo(0.8);
    expect(runnerAwakenDamageMult(slow)).toBeCloseTo(1.0);
    expect(runnerAwakenDamageMult(lv2)).toBeCloseTo(1.0);
  });
  it('exploder覚醒: 爆発KB距離×1.5(非覚醒は×1)', () => {
    expect(skillExplosionKbMult(withSkill('exploder', 3))).toBeCloseTo(1.5);
    expect(skillExplosionKbMult(withSkill('exploder', 2))).toBeCloseTo(1.0);
  });
  it('counter-master覚醒: 成立後3秒間 全攻撃×1.3(パッチ+skillOutgoingDamageMult合流)', () => {
    // パッチ: Lv3のみ付与
    expect(counterMasterAwakenBuffPatch(withSkill('counter-master', 3), 1000)).toEqual({ counterMasterBuffUntil: 1000 + COUNTER_MASTER_AWAKEN_BUFF_MS });
    expect(counterMasterAwakenBuffPatch(withSkill('counter-master', 2), 1000)).toEqual({});
    // 倍率: storeのgameTimeを基準に読む(バフ中×1.3/切れたら×1)
    useGameStore.setState({ gameTime: 2000 });
    const buffed = { ...withSkill('counter-master', 3), counterMasterBuffUntil: 4000, maxHealth: 100, health: 100 } as Player;
    expect(skillOutgoingDamageMult(buffed)).toBeCloseTo(1.3);
    useGameStore.setState({ gameTime: 5000 });
    expect(skillOutgoingDamageMult(buffed)).toBeCloseTo(1.0);
  });
  it('錬金術: 召喚獣1体につき全攻撃+20%(守護霊は数えない・社長指示v0.25.3612)', () => {
    useGameStore.setState({ gameTime: 0 });
    const plain = { ...withSkill('exploder', 0), maxHealth: 100, health: 100 } as Player;
    type Summons = ReturnType<typeof useGameStore.getState>['summons'];
    useGameStore.setState({ summons: [{ kind: 'normal' }, { kind: 'normal' }, { kind: 'ghost-ally' }] as unknown as Summons });
    expect(skillOutgoingDamageMult(plain)).toBeCloseTo(1.4); // 2体=+40%(ghost-allyは対象外)
    useGameStore.setState({ summons: [{ kind: 'rare' }] as unknown as Summons });
    expect(skillOutgoingDamageMult(plain)).toBeCloseTo(1.2); // レア1体も1体
    useGameStore.setState({ summons: [] });
    expect(skillOutgoingDamageMult(plain)).toBeCloseTo(1.0);
  });
  it('sniper覚醒: 距離条件が70%の距離で上限到達', () => {
    const mk = (lv: number) => ({ ...withSkill('sniper', lv), x: 0, y: 0, width: 0, height: 0 }) as Player;
    const enemyAt = (d: number) => ({ x: d, y: 0, width: 0, height: 0, vx: 100, vy: 0 });
    // Lv3(覚醒): 480×0.85×0.7 ≈ 285.6px で距離ボーナス上限(+1.0)に到達
    expect(sniperGunMult(mk(3), enemyAt(480 * 0.85 * 0.7))).toBeCloseTo(2.0);
    // 覚醒前(Lv2)は同距離では上限(+0.75)未達
    expect(sniperGunMult(mk(2), enemyAt(480 * 0.85 * 0.7))).toBeLessThan(1.75);
  });
});

describe('overclock: sub-weapon CD instant reset chance (20/25/30%) (§6.8 M31)', () => {
  it('scales by level and is 0 without the skill', () => {
    expect(skillOverclockChance({ skills: [], skillLevels: {} } as unknown as Player)).toBe(0);
    expect(skillOverclockChance(withSkill('overclock', 1))).toBeCloseTo(0.20);
    expect(skillOverclockChance(withSkill('overclock', 2))).toBeCloseTo(0.25);
    expect(skillOverclockChance(withSkill('overclock', 3))).toBeCloseTo(0.30);
  });
});

describe('last-magazine: final round damage mult (×2.0/2.5/3.0) (§6.8 M31)', () => {
  it('発射前の残弾1(=この発射で空)のときだけ倍率が乗る', () => {
    expect(skillLastMagazineMult(withSkill('last-magazine', 1), 1)).toBeCloseTo(2.0);
    expect(skillLastMagazineMult(withSkill('last-magazine', 2), 1)).toBeCloseTo(2.5);
    expect(skillLastMagazineMult(withSkill('last-magazine', 3), 1)).toBeCloseTo(3.0);
  });
  it('残弾2以上・残弾0・非装備は×1.0(完全不変)', () => {
    expect(skillLastMagazineMult(withSkill('last-magazine', 3), 2)).toBeCloseTo(1.0);
    expect(skillLastMagazineMult(withSkill('last-magazine', 3), 0)).toBeCloseTo(1.0);
    expect(skillLastMagazineMult({ skills: [], skillLevels: {} } as unknown as Player, 1)).toBeCloseTo(1.0);
  });
});

// scrap-builder(旧: scrap pickup gain mult +10/20/30%)は SKILL_BUILD_REDESIGN.md §23-1裁定で
// 消費カードへ転生し退役。skillScrapBuilderGainMultの効果コードは削除済み(所持していても現在は
// 中立=1.0で、そもそもscrap-builder自体を新規取得する経路も無い)。退役の検証は下の
// 「§23-1 退役」describeと、枠会計込みの回帰は runSkillDraft.test.ts 側にある。

describe('rescue-signal: 発動中(アライ存命中)は再発動しない (§6.9 M32)', () => {
  // applyRescueSignalProc(get, player, dmg, hitIds, pcx, pcy)。Math.random=0固定=確率は必ず成功side。
  const enemy = { id: 'e1', x: 30, y: 0, width: 20, height: 20, health: 10 };
  const mkGet = (rescueAllies: unknown[], spawn: (...args: unknown[]) => void) =>
    (() => ({ enemies: [enemy], rescueAllies, spawnRescueAlly: spawn })) as never;
  const player = {
    ...withSkill('rescue-signal', 3),
    characterClass: 'warrior', lastDirection: { x: 1, y: 0 },
  } as unknown as Player;

  it('アライ不在なら発動する(前提確認)/存命中は発動しない/退場後は再発動する', () => {
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0); // 抽選は常に成功側
    try {
      const spawnA = vi.fn();
      applyRescueSignalProc(mkGet([], spawnA), player, 10, ['e1'], 0, 10);
      expect(spawnA).toHaveBeenCalledTimes(1); // 不在=発動
      const spawnB = vi.fn();
      applyRescueSignalProc(mkGet([{ id: 'ally-1' }], spawnB), player, 10, ['e1'], 0, 10);
      expect(spawnB).not.toHaveBeenCalled(); // 存命中=再発動しない(§6.9)
      const spawnC = vi.fn();
      applyRescueSignalProc(mkGet([], spawnC), player, 10, ['e1'], 0, 10);
      expect(spawnC).toHaveBeenCalledTimes(1); // 全員退場後=再発動可
    } finally {
      rand.mockRestore();
    }
  });
});

describe('berserker skillOutgoingDamageMult: 全プレイヤー攻撃へ乗算する倍率(§6.10 M33②で対象拡大)', () => {
  const bers = (level: number, health: number, maxHealth = 100): Player =>
    ({ skills: ['berserker'], skillLevels: { berserker: level }, health, maxHealth } as unknown as Player);
  it('失ったHP割合×係数(Lv1:1.0/Lv2:1.25/Lv3:1.5)で増加。満タンHP=×1.0', () => {
    expect(skillOutgoingDamageMult(bers(1, 100))).toBeCloseTo(1.0);   // 満タン
    expect(skillOutgoingDamageMult(bers(1, 50))).toBeCloseTo(1.5);    // 半分失=+50%
    expect(skillOutgoingDamageMult(bers(2, 50))).toBeCloseTo(1.625);  // ×1.25係数
    expect(skillOutgoingDamageMult(bers(3, 50))).toBeCloseTo(1.75);   // ×1.5係数
  });
  it('非装備は常に×1.0(M33②の対象拡大でも未所持プレイヤーは完全不変)', () => {
    expect(skillOutgoingDamageMult({ skills: [], skillLevels: {}, health: 10, maxHealth: 100 } as unknown as Player)).toBeCloseTo(1.0);
  });
  it('M33②の代表適用例: 犬噛みつき6/molotov DoT 5/召喚接触10 に×1.5(Lv1半減HP)を乗せ四捨五入', () => {
    const m = skillOutgoingDamageMult(bers(1, 50)); // 1.5
    expect(Math.max(1, Math.round(6 * m))).toBe(9);   // 犬 DOG_BITE_DAMAGE=6
    expect(Math.max(1, Math.round(5 * m))).toBe(8);   // molotov MOLOTOV_DOT_DAMAGE=5(エクスプローダー無し時)
    expect(Math.max(1, Math.round(10 * m))).toBe(15); // 錬金召喚の接触(例: amount=10)
  });
});

describe('gold-rush: 永続ゴールド獲得倍率(×1.2/1.35/1.5)(§6.10 M33⑪)', () => {
  it('scales by level and is ×1.0 without the skill', () => {
    expect(skillGoldRushMult({ skills: [], skillLevels: {} } as unknown as Player)).toBeCloseTo(1.0);
    expect(skillGoldRushMult(withSkill('gold-rush', 1))).toBeCloseTo(1.2);
    expect(skillGoldRushMult(withSkill('gold-rush', 2))).toBeCloseTo(1.35);
    expect(skillGoldRushMult(withSkill('gold-rush', 3))).toBeCloseTo(1.5);
  });
  it('適用例(四捨五入): 宿敵討伐/クエスト報酬100G → Lv1=120/Lv2=135/Lv3=150', () => {
    expect(Math.round(100 * skillGoldRushMult(withSkill('gold-rush', 1)))).toBe(120);
    expect(Math.round(100 * skillGoldRushMult(withSkill('gold-rush', 2)))).toBe(135);
    expect(Math.round(100 * skillGoldRushMult(withSkill('gold-rush', 3)))).toBe(150);
  });
});

// warm-up(旧: 出撃60秒間 移動+10%/リロード×0.80/クリ+20%)も §23-1裁定で消費カードへ転生し退役。
// skillWarmUpSpeedMult/skillWarmUpReloadMult/skillWarmUpCritBonus/WARM_UP_*定数は削除済み
// (effectiveReloadMs/gunShotCritChance/meleeHitCritChance/movePlayerの各合流点からも項ごと削除)。
// 「§23-1 退役」describeと、消費カード「スピードブースト」の新テストで置き換えている。

describe('§23-1 退役(RETIRED_SKILLS=旧scrap-builder/warm-up)の効果コード削除', () => {
  it('所持していても消費カード側の倍率フックには一切現れない(効果コードは別関数=consumable*Mult)', () => {
    // 旧scrap-builder/warm-up所持者の効果は「常に中立」になる(効果コード自体を削除したため、
    // これらのスキルを持っていても持っていなくても他の倍率フックの挙動は変わらない=回帰確認)。
    const withRetired = { skills: [...RETIRED_SKILLS], skillLevels: { 'scrap-builder': 3, 'warm-up': 1 },
      consumableScrapUntil: 0, consumableSpeedUntil: 0, consumableProtectionUntil: 0 } as unknown as Player;
    expect(consumableScrapMult(withRetired, 0)).toBeCloseTo(1.0);
    expect(consumableSpeedMult(withRetired, 0)).toBeCloseTo(1.0);
  });
});

// SKILL_BUILD_REDESIGN.md §23-2条件2: 5種の効果が各倍率フックに正しく乗るユニットテスト。
describe('§23-2条件2 消費カード5種の倍率フック', () => {
  it('スクラップブースト: gameTime<Untilの間だけ×1.5(境界: ちょうどUntilで切れる)', () => {
    const p = withConsumableUntil('consumableScrapUntil', 60_000);
    expect(consumableScrapMult(p, 0)).toBeCloseTo(CONSUMABLE_SCRAP_MULT);
    expect(consumableScrapMult(p, 0)).toBeCloseTo(1.5);
    expect(consumableScrapMult(p, 59_999)).toBeCloseTo(1.5);
    expect(consumableScrapMult(p, 60_000)).toBeCloseTo(1.0); // Until==gameTimeは非アクティブ(>で判定)
  });

  it('アタックドーピング: ×1.2', () => {
    const p = withConsumableUntil('consumableAttackUntil', 60_000);
    expect(consumableAttackMult(p, 0)).toBeCloseTo(CONSUMABLE_ATTACK_MULT);
    expect(consumableAttackMult(p, 0)).toBeCloseTo(1.2);
    expect(consumableAttackMult(p, 60_000)).toBeCloseTo(1.0);
  });

  it('スピードブースト: ×1.15', () => {
    const p = withConsumableUntil('consumableSpeedUntil', 60_000);
    expect(consumableSpeedMult(p, 0)).toBeCloseTo(CONSUMABLE_SPEED_MULT);
    expect(consumableSpeedMult(p, 0)).toBeCloseTo(1.15);
    expect(consumableSpeedMult(p, 60_000)).toBeCloseTo(1.0);
  });

  it('経験値ブースト: ×1.5', () => {
    const p = withConsumableUntil('consumableXpUntil', 60_000);
    expect(consumableXpMult(p, 0)).toBeCloseTo(CONSUMABLE_XP_MULT);
    expect(consumableXpMult(p, 0)).toBeCloseTo(1.5);
    expect(consumableXpMult(p, 60_000)).toBeCloseTo(1.0);
  });

  it('プロテクション: 被ダメ×0.7(-30%)。skillIncomingDamageMultへも合流する', () => {
    const p = withConsumableUntil('consumableProtectionUntil', 60_000);
    expect(consumableProtectionMult(p, 0)).toBeCloseTo(CONSUMABLE_PROTECTION_MULT);
    expect(consumableProtectionMult(p, 0)).toBeCloseTo(0.7);
    expect(consumableProtectionMult(p, 60_000)).toBeCloseTo(1.0);
    // 唯一の被ダメ合流点(skillIncomingDamageMult)にも正しく乗る(ナイト/バーサーカー無しなら単独で0.7)。
    expect(skillIncomingDamageMult(p, 0)).toBeCloseTo(0.7);
    expect(skillIncomingDamageMult(p, 60_000)).toBeCloseTo(1.0);
  });

  it('非アクティブ(全Until=0)なら全て中立(×1.0/被ダメ変化なし)', () => {
    const none = withConsumableUntil('consumableScrapUntil', 0);
    expect(consumableScrapMult(none, 0)).toBeCloseTo(1.0);
    expect(consumableAttackMult(none, 0)).toBeCloseTo(1.0);
    expect(consumableSpeedMult(none, 0)).toBeCloseTo(1.0);
    expect(consumableXpMult(none, 0)).toBeCloseTo(1.0);
    expect(consumableProtectionMult(none, 0)).toBeCloseTo(1.0);
  });
});

describe('activeConsumableCount/activeConsumableKeys(§23-2条件1の枠会計が読む数)', () => {
  it('0個・複数個を正しく数える', () => {
    const none = withConsumableUntil('consumableScrapUntil', 0);
    expect(activeConsumableCount(none, 1000)).toBe(0);
    expect(activeConsumableKeys(none, 1000)).toEqual([]);

    const two = { ...none, consumableScrapUntil: 5000, consumableXpUntil: 5000 } as unknown as Player;
    expect(activeConsumableCount(two, 1000)).toBe(2);
    expect(activeConsumableKeys(two, 1000).sort()).toEqual(['scrap-boost', 'xp-boost'].sort());
  });

  it('境界: gameTime===Untilは非アクティブ扱い', () => {
    const p = { skills: [], skillLevels: {}, consumableScrapUntil: 5000, consumableAttackUntil: 0,
      consumableSpeedUntil: 0, consumableXpUntil: 0, consumableProtectionUntil: 0 } as unknown as Player;
    expect(activeConsumableCount(p, 5000)).toBe(0);
    expect(activeConsumableCount(p, 4999)).toBe(1);
  });
});

describe('applyConsumableCard(取得で即発動・§23-1)', () => {
  it('取得した種類のUntilだけを gameTime+60000 にセットし、他は変えない', () => {
    const base = withConsumableUntil('consumableScrapUntil', 0);
    const next = applyConsumableCard(base, 'attack-doping', 10_000);
    expect(next.consumableAttackUntil).toBe(10_000 + CONSUMABLE_DURATION_MS);
    expect(next.consumableScrapUntil).toBe(0);
    expect(next.consumableSpeedUntil).toBe(0);
    expect(next.consumableXpUntil).toBe(0);
    expect(next.consumableProtectionUntil).toBe(0);
  });

  it('全5種のキーで正しいフィールドが更新される', () => {
    const fieldByKey: Record<ConsumableKey, keyof Player> = {
      'scrap-boost': 'consumableScrapUntil',
      'attack-doping': 'consumableAttackUntil',
      'speed-boost': 'consumableSpeedUntil',
      'xp-boost': 'consumableXpUntil',
      'protection': 'consumableProtectionUntil',
    };
    for (const key of Object.keys(fieldByKey) as ConsumableKey[]) {
      const base = withConsumableUntil('consumableScrapUntil', 0);
      const next = applyConsumableCard(base, key, 0) as unknown as Record<string, number>;
      expect(next[fieldByKey[key]]).toBe(CONSUMABLE_DURATION_MS);
    }
  });

  it('再取得は延長せず常に60秒に固定される(温存不可)', () => {
    const base = withConsumableUntil('consumableSpeedUntil', 55_000); // 残り55秒
    const next = applyConsumableCard(base, 'speed-boost', 10_000); // 再取得(10000起点)
    expect(next.consumableSpeedUntil).toBe(10_000 + CONSUMABLE_DURATION_MS); // 55000のままでも延長ではない
  });
});

describe('seeker proc chance (30/40/50%) + active window', () => {
  it('proc chance scales by level, 0 without the skill', () => {
    expect(skillSeekerProcChance({ skills: [], skillLevels: {} } as unknown as Player)).toBe(0);
    expect(skillSeekerProcChance(withSkill('seeker', 1))).toBeCloseTo(0.30);
    expect(skillSeekerProcChance(withSkill('seeker', 2))).toBeCloseTo(0.40);
    expect(skillSeekerProcChance(withSkill('seeker', 3))).toBeCloseTo(0.50);
  });
  it('isSeekerActive compares seekerUntil against gameTime', () => {
    expect(isSeekerActive({ seekerUntil: 5000 } as unknown as Player, 4000)).toBe(true);
    expect(isSeekerActive({ seekerUntil: 5000 } as unknown as Player, 5000)).toBe(false);
    expect(isSeekerActive({ seekerUntil: 0 } as unknown as Player, 1000)).toBe(false);
  });
});

describe('skillDescForLevel (keeps common text + level-specific value)', () => {
  it('appends the current level value but never drops the common description', () => {
    const lv1 = skillDescForLevel('attack-shooter', 1);
    const lv3 = skillDescForLevel('attack-shooter', 3);
    expect(lv1).toContain('銃ダメージが上昇'); // common kept
    expect(lv1).toContain('Lv1');
    expect(lv1).toContain('+10%');
    expect(lv3).toContain('銃ダメージが上昇'); // common still present at Lv3
    expect(lv3).toContain('+30%');
  });
  it('Lv1-fixed skills show only the common description (no level suffix)', () => {
    expect(skillDescForLevel('reaper', 1)).not.toContain('Lv');
    expect(skillDescForLevel('guardian-spirit', 1)).not.toContain('Lv'); // G3: Lvの概念なし
  });
  it('bomber: v0.25.3300で覚醒(Lv3=4個)が付きLv表記に昇格', () => {
    expect(skillDescForLevel('bomber', 3)).toContain('覚醒');
  });
  it('clamps out-of-range / missing level to a valid bucket', () => {
    expect(skillDescForLevel('runner', 0)).toContain('+10%'); // 0 → Lv1
    expect(skillDescForLevel('runner', 9)).toContain('+20%'); // 9 → Lv3
  });
});

describe('slasher follow-up multipliers', () => {
  it('is a 3-hit ladder decaying ×2/3 each (1.0 / 0.667 / 0.444)', () => {
    expect(SLASHER_MULTS).toHaveLength(SLASHER_MAX_HITS);
    expect(SLASHER_MULTS[0]).toBeCloseTo(1.0);
    expect(SLASHER_MULTS[1]).toBeCloseTo(0.6667, 3);
    expect(SLASHER_MULTS[2]).toBeCloseTo(0.4444, 3);
  });
});

describe('gacha excludes the reaper skill (死神は撃破でのみ習得)', () => {
  it('never rolls an excluded skill across pity levels', () => {
    expect(GACHA_EXCLUDED_SKILLS).toContain('reaper');
    expect(GACHA_EXCLUDED_SKILLS).toContain('guardian-spirit'); // G3: 最初から所持なのでガチャに出さない
    let seq = 0;
    const rng = () => { seq = (seq * 9301 + 49297) % 233280; return seq / 233280; };
    for (let pity = 0; pity <= 60; pity++) {
      for (let i = 0; i < 200; i++) {
        expect(GACHA_EXCLUDED_SKILLS).not.toContain(rollGachaSkill(pity, rng));
      }
    }
  });
});

// BOT_AND_GHOST.md G3(社長指示「守護霊スキルは最初から解禁しとこうか」): 守護霊は最初から所持。
// SKILL_BUILD_REDESIGN.md §12-3★2/§19-1点3(社長裁定): ノーマル5+レア4の初期9種も同じ経路で追加。
// 新規セーブ(空)・既存セーブ(欠けあり)の両方を読み込み時マイグレーションで補う。
describe('ensureDefaultOwnedSkills(守護霊+初期9種の所持マイグレーション)', () => {
  it('DEFAULT_OWNED_SKILLS に guardian-spirit が入っている', () => {
    expect(DEFAULT_OWNED_SKILLS).toContain('guardian-spirit');
    expect(DEFAULT_OWNED_SKILLS).toContain('ghost-helper');
    expect(DEFAULT_OWNED_SKILLS).toContain('ghost-slayer');
  });

  it('新規セーブ(空配列)にも既定所持が入る', () => {
    expect(ensureDefaultOwnedSkills([])).toContain('guardian-spirit');
  });

  it('既存セーブ(欠けあり)には末尾へ補い、既存の並びは変えない', () => {
    const owned: SkillKey[] = ['runner', 'seeker'];
    const next = ensureDefaultOwnedSkills(owned);
    expect(next).toEqual([
      'runner', 'seeker',
      'guardian-spirit', 'ghost-helper', 'ghost-slayer',
      'sharpshooter', 'ricochet', 'punisher', 'attack-shooter', 'slasher',
      'fire-shooter', 'bomb-counter', 'knife-master', 'knight',
      'ice-shot', 'vampire',
      'incendiary-round', 'execution-shock', 'gravity-shot',
      'echo-shot', 'barrage-king', 'blood-treads',
    ]);
    expect(owned).toEqual(['runner', 'seeker']); // 引数は破壊しない(純関数)
  });

  it('既に持っていれば何も変えない(同一参照のまま)', () => {
    const owned: SkillKey[] = [
      'guardian-spirit', 'ghost-helper', 'ghost-slayer',
      'sharpshooter', 'ricochet', 'punisher', 'attack-shooter', 'slasher',
      'fire-shooter', 'bomb-counter', 'knife-master', 'knight',
      'ice-shot', 'vampire',
      'incendiary-round', 'execution-shock', 'gravity-shot',
      'echo-shot', 'barrage-king', 'blood-treads',
      'runner',
    ];
    expect(ensureDefaultOwnedSkills(owned)).toBe(owned);
  });

  // SKILL_BUILD_REDESIGN.md §28-3受け入れ条件2(B7・社長指示「台帳だけになってるスキルは実装して
  // スターターに入れて」): 新規プレイヤーは守護霊系(枠外の同行者)とは別に、旧9種+新9種=18種
  // (ノ8/レア7/超3)を持つ。旧仕様の「初期所持は超レア0」(§12-3★2)はこの指示で撤回されている。
  // v0.25.3297: big-bulletはattack-shooterへ統合(RETIRED)=ノ8→7・18種→17種。
  it('新規プレイヤーは守護霊系とは別にノ7/レア7/超3=17種を持つ(§28-3受け入れ条件2+v0.25.3297統合)', () => {
    const initial = ensureDefaultOwnedSkills([]);
    const companionKeys: SkillKey[] = ['guardian-spirit', 'ghost-helper', 'ghost-slayer'];
    const nonCompanion = initial.filter(k => !companionKeys.includes(k));
    expect(nonCompanion).toHaveLength(17);
    expect(nonCompanion.filter(k => SKILLS[k].rarity === 'normal')).toHaveLength(7);
    expect(nonCompanion.filter(k => SKILLS[k].rarity === 'rare')).toHaveLength(7);
    expect(nonCompanion.filter(k => SKILLS[k].rarity === 'super')).toHaveLength(3);
    expect(nonCompanion.sort()).toEqual(
      [
        'sharpshooter', 'ricochet', 'punisher', 'attack-shooter', 'slasher',
        'fire-shooter', 'bomb-counter', 'knife-master', 'knight',
        'ice-shot', 'vampire',
        'incendiary-round', 'execution-shock', 'gravity-shot',
        'echo-shot', 'barrage-king', 'blood-treads',
      ].sort(),
    );
  });
});

// SKILL_BUILD_REDESIGN.md §4(社長承認v0.25.3192・確定)のレア度再算出。
describe('§4 レア度表の差し替え(campaign.ts SKILLS)', () => {
  it('crit-up/sniperは超レアへ昇格', () => {
    expect(SKILLS['crit-up'].rarity).toBe('super');
    expect(SKILLS['sniper'].rarity).toBe('super');
  });
  it('sharpshooter/ricochet/punisher/benkei/reflexはノーマルへ降格', () => {
    for (const k of ['sharpshooter', 'ricochet', 'punisher', 'benkei', 'reflex'] as const) {
      expect(SKILLS[k].rarity, k).toBe('normal');
    }
  });
  it('exploder/fire-shooter/bomber/bomb-counter/knife-master/combo-master/knight/rescue-signalはレアのまま', () => {
    for (const k of ['exploder', 'fire-shooter', 'bomber', 'bomb-counter', 'knife-master', 'combo-master', 'knight', 'rescue-signal'] as const) {
      expect(SKILLS[k].rarity, k).toBe('rare');
    }
  });
});

// SKILL_BUILD_REDESIGN.md §19-1点5(§17-3検収の再確認の結論): 持ち込み廃止によりscrap-builder/
// warm-upはラン中に効果の柱が発火不能。B3でガチャ排出からも除外する(死に景品化の防止)。
describe('§19-1点5 scrap-builder/warm-upのガチャ除外', () => {
  it('GACHA_EXCLUDED_SKILLSに含まれる', () => {
    expect(GACHA_EXCLUDED_SKILLS).toContain('scrap-builder');
    expect(GACHA_EXCLUDED_SKILLS).toContain('warm-up');
  });
});

// SKILL_BUILD_REDESIGN.md §28(B7発注文): 眠り9種は効果配線+スターター入りが完了し、
// NEW_SLEEPING_SKILLSが空になったことで自動的にドラフト・ガチャの両方に解禁されている
// (§28-3受け入れ条件2「ドラフト・ガチャに9種が出る(眠り解除)テスト」)。
describe('§28 新スキル9種はB7で目覚めている(NEW_SLEEPING_SKILLSが空)', () => {
  // v0.25.3297: big-bulletはattack-shooterへ統合(RETIRED)=この検証群から除外。
  const NEW_SKILLS: SkillKey[] = [
    'ice-shot', 'vampire', 'incendiary-round', 'execution-shock',
    'gravity-shot', 'echo-shot', 'barrage-king', 'blood-treads',
  ];

  it('NEW_SLEEPING_SKILLSは空配列(§28-2点3)', () => {
    expect(NEW_SLEEPING_SKILLS).toEqual([]);
  });

  it('台帳(SKILLS)には完成形の文章で存在する', () => {
    for (const k of NEW_SKILLS) {
      expect(SKILLS[k], k).toBeDefined();
      expect(SKILLS[k].name.length, k).toBeGreaterThan(0);
      expect(SKILLS[k].desc.length, k).toBeGreaterThan(0);
      expect(SKILLS[k].desc, k).not.toContain('準備中');
    }
  });

  it('OBTAINABLE_SKILL_KEYS(図鑑分母)に含まれる', () => {
    for (const k of NEW_SKILLS) expect(OBTAINABLE_SKILL_KEYS).toContain(k);
  });

  it('RUN_DRAFT_EXCLUDED_SKILLS/GACHA_EXCLUDED_SKILLSのどちらからも外れている', () => {
    for (const k of NEW_SKILLS) {
      expect(RUN_DRAFT_EXCLUDED_SKILLS).not.toContain(k);
      expect(GACHA_EXCLUDED_SKILLS).not.toContain(k);
    }
  });

  it('多数ガチャロールで実地に出現する', () => {
    let seq = 1;
    const rng = () => { seq = (seq * 9301 + 49297) % 233280; return seq / 233280; };
    const drawn = new Set<SkillKey>();
    for (let pity = 0; pity <= 60; pity++) {
      for (let i = 0; i < 200; i++) drawn.add(rollGachaSkill(pity, rng));
    }
    for (const k of NEW_SKILLS) expect(drawn.has(k), k).toBe(true);
  });

  it('ドラフト(newSkillCandidates)にも所持していれば候補として出る', () => {
    const input = {
      owned: NEW_SKILLS,
      ownedLevels: {},
      runSkills: [],
      runSkillLevels: {},
      playerLevel: 1,
    };
    const pool = newSkillCandidates(input);
    for (const k of NEW_SKILLS) expect(pool).toContain(k);
  });
});
