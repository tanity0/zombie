// Unit tests for the reworked melee skill numbers (knife-master combo mult,
// slasher follow-up decay). Pure functions/constants from the store — see
// CLAUDE.md Testing policy (test the changed logic in the same commit).
import { describe, it, expect } from 'vitest';
import { skillMeleeComboMult, SLASHER_MULTS, SLASHER_MAX_HITS,
  skillAttackShooterGunMult, skillRunnerSpeedMult, skillSeekerProcChance, isSeekerActive,
  skillMagnetAmmoRangeMult, skillOverclockChance, skillLastMagazineMult,
  skillWarmUpSpeedMult, skillWarmUpReloadMult, skillWarmUpCritBonus, WARM_UP_DURATION_MS,
  RUNNER_RELOAD_BONUS_MULT, skillScrapBuilderGainMult, applyRescueSignalProc,
  skillOutgoingDamageMult, skillGoldRushMult } from './gameStore';
import { vi } from 'vitest';
import { checkPlayerPickupCollisions } from '../utils/collisionUtils';
import type { Pickup } from '../types/game';
import { rollSkillLevel, skillMaxLevel, rarityWeightsForPity, levelWeightsFor,
  gachaPullCost, gachaPullCostFor, GACHA_PRICE_STEPS, GACHA_PULL_COST_CAP, GACHA_REFUND_BY_RARITY,
  gachaSuperPercent, gachaPityRemaining, gachaPromotePercent, skillDescForLevel,
  rollGachaSkill, GACHA_EXCLUDED_SKILLS, SKILLS,
  DEFAULT_OWNED_SKILLS, ensureDefaultOwnedSkills } from '../data/campaign';
import type { Player, SkillKey } from '../types/game';

// Minimal player carrying one leveled skill (for the simple multiplier skills).
const withSkill = (key: SkillKey, level: number): Player =>
  ({ skills: [key], skillLevels: { [key]: level } } as unknown as Player);

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
  it('reaper/bomber are Lv1-only; others cap at Lv3', () => {
    expect(skillMaxLevel('reaper')).toBe(1);
    expect(skillMaxLevel('bomber')).toBe(1);
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
  it('checkPlayerPickupCollisions: 弾薬だけ拡大矩形で拾い、非弾薬(xp)は従来のまま', () => {
    // プレイヤー32×32 @ (0,0) → 基準拾得矩形 = (-16,-16)〜(48,48)。
    const player = { x: 0, y: 0, width: 32, height: 32 } as unknown as Player;
    // 基準矩形の右端(48)の少し外・×1.3矩形(右端57.6)の内側に置く。
    const ammo = { id: 'a', x: 50, y: 8, type: 'ammo-rifle', value: 10 } as unknown as Pickup;
    const xp = { id: 'x', x: 50, y: 8, type: 'xp', value: 1 } as unknown as Pickup;
    // mult=1(非装備): どちらも拾わない=従来挙動
    expect(checkPlayerPickupCollisions(player, [ammo, xp])).toEqual([]);
    // mult=1.3(Lv3): 弾薬だけ拾う。xpは従来矩形のまま
    expect(checkPlayerPickupCollisions(player, [ammo, xp], 1.3)).toEqual(['a']);
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

describe('scrap-builder: scrap pickup gain mult (+10/20/30%) (§6.9 M32)', () => {
  it('scales by level and is ×1.0 without the skill(初期スクラップ効果は別枠=この関数は取得量のみ)', () => {
    expect(skillScrapBuilderGainMult({ skills: [], skillLevels: {} } as unknown as Player)).toBeCloseTo(1.0);
    expect(skillScrapBuilderGainMult(withSkill('scrap-builder', 1))).toBeCloseTo(1.1);
    expect(skillScrapBuilderGainMult(withSkill('scrap-builder', 2))).toBeCloseTo(1.2);
    expect(skillScrapBuilderGainMult(withSkill('scrap-builder', 3))).toBeCloseTo(1.3);
  });
  it('収集式(Math.round=四捨五入)と合成した取得量の例: 5スクラップ×Lv3=7(6.5→7)', () => {
    const gain = (value: number, lv: number) =>
      Math.max(1, Math.round(value * 1 * skillScrapBuilderGainMult(withSkill('scrap-builder', lv))));
    expect(gain(5, 1)).toBe(6);  // 5.5 → 6
    expect(gain(5, 2)).toBe(6);  // 6.0
    expect(gain(5, 3)).toBe(7);  // 6.5 → 7(四捨五入)
    expect(gain(1, 3)).toBe(1);  // 1.3 → 1
  });
});

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

describe('warm-up: first 60s buffs (move+10% / reload×0.80 / crit+20%) (§6.8 M31)', () => {
  const p = withSkill('warm-up', 1);
  it('gameTime<60000 の間だけ効く(境界: 60000ちょうどで切れる)', () => {
    expect(skillWarmUpSpeedMult(p, 0)).toBeCloseTo(1.10);
    expect(skillWarmUpReloadMult(p, 0)).toBeCloseTo(0.80);
    expect(skillWarmUpCritBonus(p, 0)).toBeCloseTo(0.20);
    expect(skillWarmUpSpeedMult(p, WARM_UP_DURATION_MS - 1)).toBeCloseTo(1.10);
    expect(skillWarmUpSpeedMult(p, WARM_UP_DURATION_MS)).toBeCloseTo(1.0);
    expect(skillWarmUpReloadMult(p, WARM_UP_DURATION_MS)).toBeCloseTo(1.0);
    expect(skillWarmUpCritBonus(p, WARM_UP_DURATION_MS)).toBe(0);
  });
  it('非装備は60秒以内でも中立(完全不変)', () => {
    const none = { skills: [], skillLevels: {} } as unknown as Player;
    expect(skillWarmUpSpeedMult(none, 0)).toBeCloseTo(1.0);
    expect(skillWarmUpReloadMult(none, 0)).toBeCloseTo(1.0);
    expect(skillWarmUpCritBonus(none, 0)).toBe(0);
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
    expect(skillDescForLevel('bomber', 1)).not.toContain('Lv');
    expect(skillDescForLevel('guardian-spirit', 1)).not.toContain('Lv'); // G3: Lvの概念なし
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
      'fire-shooter', 'bomb-counter', 'exploder', 'knight',
    ]);
    expect(owned).toEqual(['runner', 'seeker']); // 引数は破壊しない(純関数)
  });

  it('既に持っていれば何も変えない(同一参照のまま)', () => {
    const owned: SkillKey[] = [
      'guardian-spirit', 'ghost-helper', 'ghost-slayer',
      'sharpshooter', 'ricochet', 'punisher', 'attack-shooter', 'slasher',
      'fire-shooter', 'bomb-counter', 'exploder', 'knight',
      'runner',
    ];
    expect(ensureDefaultOwnedSkills(owned)).toBe(owned);
  });

  // §19-2点3: 新規プレイヤーで9種所持・超レア0(守護霊系は「枠外」の同行者なので9種のカウントから除く)。
  it('新規プレイヤーは守護霊系とは別にノーマル5+レア4の9種を持ち、超レアは0(§12-3★2/§19-1点3)', () => {
    const initial = ensureDefaultOwnedSkills([]);
    const companionKeys: SkillKey[] = ['guardian-spirit', 'ghost-helper', 'ghost-slayer'];
    const nonCompanion = initial.filter(k => !companionKeys.includes(k));
    expect(nonCompanion).toHaveLength(9);
    expect(nonCompanion.filter(k => SKILLS[k].rarity === 'normal')).toHaveLength(5);
    expect(nonCompanion.filter(k => SKILLS[k].rarity === 'rare')).toHaveLength(4);
    expect(nonCompanion.filter(k => SKILLS[k].rarity === 'super')).toHaveLength(0);
    expect(nonCompanion.sort()).toEqual(
      ['sharpshooter', 'ricochet', 'punisher', 'attack-shooter', 'slasher', 'fire-shooter', 'bomb-counter', 'exploder', 'knight'].sort(),
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

// SKILL_BUILD_REDESIGN.md §14/§19-1点4: 新スキル9種は台帳に存在するが、ドラフト・ガチャの
// どちらからも絶対に出ない(効果配線はB7)。
describe('§19-1点4 新スキル9種(NEW_SLEEPING_SKILLS)は完全に眠っている', () => {
  const NEW_SKILLS: SkillKey[] = [
    'big-bullet', 'ice-shot', 'vampire', 'incendiary-round', 'execution-shock',
    'gravity-shot', 'echo-shot', 'barrage-king', 'blood-treads',
  ];

  it('台帳(SKILLS)には存在する', () => {
    for (const k of NEW_SKILLS) {
      expect(SKILLS[k], k).toBeDefined();
      expect(SKILLS[k].name.length, k).toBeGreaterThan(0);
      expect(SKILLS[k].desc.length, k).toBeGreaterThan(0);
      expect(SKILLS[k].desc, k).not.toContain('準備中'); // 台帳上は完成形の文章(§19-1点4)
    }
  });

  it('ガチャからは絶対に出ない(GACHA_EXCLUDED_SKILLS+多数ロールでの実地確認)', () => {
    for (const k of NEW_SKILLS) expect(GACHA_EXCLUDED_SKILLS).toContain(k);
    let seq = 1;
    const rng = () => { seq = (seq * 9301 + 49297) % 233280; return seq / 233280; };
    for (let pity = 0; pity <= 60; pity++) {
      for (let i = 0; i < 200; i++) {
        expect(NEW_SKILLS).not.toContain(rollGachaSkill(pity, rng));
      }
    }
  });
});
