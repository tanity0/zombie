import { describe, expect, it } from 'vitest';
import type { Enemy, EnemyType } from '../types/game';
import {
  applyBossPostureDamage, applyBrokenGunReward, applyBrokenMeleeFatal,
  bossPostureMax, tickBossPosture, usesPostureSystem, POSTURE_ELITE_TYPES, BOSS_POSTURE_BREAK_MS, BOSS_POSTURE_REBREAK_LOCK_MS,
  BOSS_FATAL_DAZE_MS, parsePostureChipMult, DEFAULT_POSTURE_CHIP_MULT,
} from './bossPosture';

// PACING_PUZZLE.md §7-11c-1: `?posturechip=<倍率>`のパース(純関数)。実際の乗算はモジュール読み込み
// 時に一度だけ確定するURL値を使うため(テスト環境はwindow未定義=常に既定1)、ここでは
// パース関数そのものだけを検算する(適用点=applyBossPostureDamageの動作は既存のテストで担保済み)。
describe('parsePostureChipMult(§7-11c-1・体勢チップ実機テストツマミ)', () => {
  it('正の数値はそのまま倍率になる', () => {
    expect(parsePostureChipMult('2')).toBe(2);
    expect(parsePostureChipMult('0.5')).toBe(0.5);
    expect(parsePostureChipMult('0')).toBe(0); // 0=完全無効化も許容(体勢が一切削れない検証用)
  });
  it('空/null/undefined/負値/NaNは既定1へフォールバック', () => {
    expect(parsePostureChipMult(null)).toBe(DEFAULT_POSTURE_CHIP_MULT);
    expect(parsePostureChipMult(undefined)).toBe(DEFAULT_POSTURE_CHIP_MULT);
    expect(parsePostureChipMult('')).toBe(DEFAULT_POSTURE_CHIP_MULT);
    expect(parsePostureChipMult('-1')).toBe(DEFAULT_POSTURE_CHIP_MULT);
    expect(parsePostureChipMult('junk')).toBe(DEFAULT_POSTURE_CHIP_MULT);
  });
});

const boss = (type: EnemyType = 'giantbat', over: Partial<Enemy> = {}): Enemy => ({
  id: 'boss', type, x: 0, y: 0, width: 100, height: 100,
  health: 1000, maxHealth: 1000, damage: 10, speed: 10, lastHit: 0,
  ...over,
} as Enemy);

describe('boss posture', () => {
  it('uses 80/100/120 maxima and five counters break every boss class', () => {
    expect(bossPostureMax({ type: 'giantbat' })).toBe(80);
    expect(bossPostureMax({ type: 'miguel' })).toBe(100);
    expect(bossPostureMax({ type: 'mimir' })).toBe(120);
    for (const type of ['giantbat', 'miguel', 'mimir'] as EnemyType[]) {
      let e = boss(type);
      for (let i = 0; i < 5; i++) {
        const result = applyBossPostureDamage(e, 'counter', 1000 + i)!;
        e = { ...e, ...result.patch };
        expect(result.triggered).toBe(i === 4);
      }
      expect(e.bossPosture).toBe(0);
      expect(e.bossBreakRewardRemaining).toBe(250);
    }
  });

  // PACING_PUZZLE.md §6.38 v6 D-2(賞金首): パンプキン基準(60)×1.5=90。POSTURE_ELITE_TYPESには
  // 入れない(isEngageableBoss経由でusesPostureSystemが既に付く)専用if分岐。
  it('賞金首4型: max=90でPOSTURE_ELITE_TYPESには入っていない(isEngageableBoss経由でusesPostureSystem)', () => {
    for (const type of ['bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko'] as EnemyType[]) {
      expect(bossPostureMax({ type: type }), type).toBe(90);
      expect(POSTURE_ELITE_TYPES.has(type), type).toBe(false);
      expect(usesPostureSystem({ type: type }), type).toBe(true);
    }
  });

  it('locks recovery to crossed checkpoints and starts after eight seconds', () => {
    let e = boss('miguel');
    for (let i = 0; i < 3; i++) e = { ...e, ...applyBossPostureDamage(e, 'heavy', i)!.patch };
    expect(e.bossPosture).toBe(70);
    expect(e.bossPostureRecoveryCap).toBe(75);
    expect(tickBossPosture(e, 8003, 1)?.bossPosture).toBe(73);
    e = { ...e, bossPosture: 75 };
    expect(tickBossPosture(e, 9000, 1)).toBeNull();
  });

  it('caps gun reward and consumes all remaining reward with a melee fatal', () => {
    const now = 500;
    const e = boss('giantbat', {
      bossPosture: 0,
      bossFullStunUntil: now + BOSS_POSTURE_BREAK_MS,
      bossBreakRewardRemaining: 30,
    });
    const gun = applyBrokenGunReward(e, 10, now)!;
    expect(gun.damage).toBe(40);
    expect(gun.patch.bossBreakRewardRemaining).toBe(0);
    const fatal = applyBrokenMeleeFatal(e, 12, now)!;
    expect(fatal.damage).toBe(90);
    expect(fatal.patch.bossFullStunUntil).toBeUndefined();
    expect(fatal.patch.bossPostureLockUntil).toBe(now + BOSS_POSTURE_REBREAK_LOCK_MS);
  });

  it('致命(紫kill)後は2秒停止してから活動再開(v0.25.3035・社長指示)', () => {
    const now = 500;
    const e = boss('giantbat', {
      bossPosture: 0,
      bossFullStunUntil: now + BOSS_POSTURE_BREAK_MS,
      bossBreakRewardRemaining: 30,
    });
    const fatal = applyBrokenMeleeFatal(e, 12, now)!;
    // 停止はstunUntil(全ボスの制御器が既に尊重する汎用フリーズ)で2秒。
    expect(fatal.patch.stunUntil).toBe(now + BOSS_FATAL_DAZE_MS);
    expect(BOSS_FATAL_DAZE_MS).toBe(2000);
    // 紫(bossFullStunUntil)は消える=停止中にもう一度致命が連鎖することはない。
    expect(fatal.patch.bossFullStunUntil).toBeUndefined();
  });

  it('紫の発火で未起爆の遅延ヒットは破棄・起爆済みの床(burst)は残す(v0.25.3037・裁定案1)', () => {
    const now = 500;
    const e = boss('giantbat', {
      bossPosture: 1,
      giantDelayedHits: [
        { x: 0, y: 0, radius: 40, fireAt: now + 800 },                                  // 未起爆→破棄
        { x: 1, y: 1, radius: 40, fireAt: now - 200, burst: true, floorUntil: now + 4000 }, // 血溜まり床→残す
      ] as Enemy['giantDelayedHits'],
    });
    const r = applyBossPostureDamage(e, 'counter', now)!;
    expect(r.triggered).toBe(true);
    expect(r.patch.giantDelayedHits).toHaveLength(1);
    expect(r.patch.giantDelayedHits![0].burst).toBe(true);
  });
});

describe('★赤い個体=強個体(社長裁定v0.25.3547「強個体です」)', () => {
  it('赤い雑魚は体勢システムを持つ(型では持たない敵でも色で付く)', () => {
    // 赤はエリア抽選でもピークの確定枠でも同じ扱い=「2種類の赤」を作らない。
    expect(usesPostureSystem({ type: 'bat' })).toBe(false);
    expect(usesPostureSystem({ type: 'bat', colorTier: 'red' })).toBe(true);
    expect(usesPostureSystem({ type: 'zombie', colorTier: 'red' })).toBe(true);
  });

  it('★【不変条件】青・紫は雑魚のまま(体勢を持たない)', () => {
    // 色ティアのうち強個体へ上げるのは**赤だけ**。青/紫まで上げると雑魚が消える。
    for (const t of ['bat', 'skeleton', 'zombie'] as const) {
      expect(usesPostureSystem({ type: t, colorTier: 'blue' }), t).toBe(false);
      expect(usesPostureSystem({ type: t, colorTier: 'purple' }), t).toBe(false);
    }
  });

  it('赤の体勢最大値は強個体と同じ60(格ごとに1つの数字)', () => {
    expect(bossPostureMax({ type: 'bat', colorTier: 'red' })).toBe(60);
    expect(bossPostureMax({ type: 'pumpkin' })).toBe(60);
    // 赤いパンプキンでも60のまま(赤専用ティアを作っていない)。
    expect(bossPostureMax({ type: 'pumpkin', colorTier: 'red' })).toBe(60);
  });

  it('★【不変条件】ボスの体勢最大値は色で変わらない', () => {
    // 城ボス等は色が付かない(CONSTANT_STRENGTH_TYPES)が、万一付いても格が下がってはいけない。
    expect(bossPostureMax({ type: 'giantbat' })).toBe(80);
    expect(bossPostureMax({ type: 'mimir' })).toBe(120);
  });
});
