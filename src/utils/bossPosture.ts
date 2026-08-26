import type { Enemy, EnemyType } from '../types/game';
import { isEngageableBoss } from './bossEngagement';
import { isBountyType, isGuardianPhantom } from './enemyUtils';

// 社長指示v0.25.3295「パンプキンなどの強敵にも紫システムだけ追加」: 交戦ボスに加え、この強敵2体
// (isBossTypeだがボス交戦システム=カメラ/湧き制御を持たない)も体勢値→紫の完全気絶を持つ。
// **「だけ」の意味**: クリ減速(usesBossCrit)・ボスカメラ・湧きリラックス(isEngageableBoss)には
// 入れない。体勢値の蓄積と紫だけをこの表で足す。
export const POSTURE_ELITE_TYPES = new Set<EnemyType>(['pumpkin', 'lab-zombie-3']);

/** 体勢システムの判定に必要な最小形(タイプ+色ティア)。★v0.25.3547で色が入ったため型で受けない。 */
export type PostureSubject = Pick<Enemy, 'type' | 'colorTier'>;

/**
 * 体勢値(→紫の完全気絶)を持つか。
 *
 * ★v0.25.3547(社長裁定「強個体です」): **赤い個体を追加**。引数を `EnemyType` から
 * 「タイプ+色ティア」へ広げたのはこのため——赤は型ではなく**個体の色**なので、型だけでは判定できない。
 * 対象は**ピークの確定赤に限らず、すべての赤い個体**(深いエリアの色抽選で出た赤も同じ)。
 * 色で2種類の赤を作るとプレイヤーに説明できないため。
 */
export const usesPostureSystem = (e: PostureSubject): boolean =>
  // ★research/GHOST_BOSS.md v5/v6(社長裁定「そもそも紫ゲージ無くす」): 幻影は**体勢値を持たない**。
  // プレイヤーには体勢値が無いので、持たせると「全て同条件」が成立しない(紫の5秒フルスタンが
  // 裁定「殴り続けても止まらない」を裏口から壊す)。ここ1箇所で外すと、紫ゲージUI・ブレイク・
  // 紫の報酬予算・5倍処刑は全て postureBoss ガード経由で自動的に出なくなる。
  !isGuardianPhantom(e.type)
  && (isEngageableBoss(e.type) || POSTURE_ELITE_TYPES.has(e.type) || e.colorTier === 'red');

export type BossPostureImpact = 'counter' | 'melee' | 'heavy' | 'gun-crit' | 'reflect';

export const BOSS_POSTURE_BREAK_MS = 5000; // v0.25.3036(社長指示「紫は5秒に延長」・旧2200)
export const BOSS_POSTURE_RECOVERY_DELAY_MS = 8000;
export const BOSS_POSTURE_RECOVERY_PER_SEC = 0.03;
export const BOSS_POSTURE_REBREAK_LOCK_MS = 6000;
export const BOSS_BREAK_REWARD_HP_RATIO = 0.25;

// PACING_PUZZLE.md §7-11c-1: 体勢チップの実機テスト用ツマミ。`?posturechip=<倍率>`で全発生源
// (カウンター/強攻撃/銃クリ/打返し/近接)へ一括で乗算する。適用点はここ(bossPosture適用点)1箇所
// のみ=呼び出し側(damageEnemy/カウンター各種/近接各種)は無改修。既定=1(現行どおり)。
export const DEFAULT_POSTURE_CHIP_MULT = 1;

/** 純関数: URLパラメータ生値→体勢チップ倍率(空/NaN/負値は既定1へフォールバック)。 */
export const parsePostureChipMult = (raw: string | null | undefined): number => {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_POSTURE_CHIP_MULT;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_POSTURE_CHIP_MULT;
};

const POSTURE_CHIP_MULT = typeof window === 'undefined'
  ? DEFAULT_POSTURE_CHIP_MULT
  : parsePostureChipMult(new URLSearchParams(window.location.search).get('posturechip'));

/** ★SAME_ARENA §9: 対人の体勢削り(pvpPosture)にも同じ `?posturechip=` を掛ける(手綱を1本に保つ)。 */
export const postureChipMult = (): number => POSTURE_CHIP_MULT;

const IMPACT_RATIO: Record<BossPostureImpact, number> = {
  counter: 0.20,
  melee: 0.04,
  heavy: 0.10,
  'gun-crit': 0.05,
  // v0.25.3219(社長指示「カウンター弾でも体勢値を少し削れる様にして」): 打ち返した弾の命中。
  // 「少し」=gun-critと同格の0.05(叩き台)。反射はカウンター由来だが1アクションで複数枚
  // 返せる(弾幕を纏めて打ち返す)ため、counter(0.20)より大幅に軽くする。
  reflect: 0.05,
};

export const bossPostureMax = (e: PostureSubject): number => {
  const type = e.type;
  // ★v0.25.3547: 赤い個体も強個体なので**同じ60**。格ごとに1つの数字にしておく(赤専用のティアを
  // 作らない)。ただし型の強個体2体より先に見る=赤いパンプキンでも60で変わらない。
  if (e.colorTier === 'red') return 60; // 叩き台(強個体の既存値と同値)
  if (POSTURE_ELITE_TYPES.has(type)) return 60; // 強敵2体(v0.25.3295叩き台・城ボス80より軽い)
  if (type === 'giantbat') return 80;
  if (type === 'mimir' || type === 'jormungand' || type === 'skadi' || type === 'thor') return 120;
  // PACING_PUZZLE.md §6.38 v6 D-2(賞金首): パンプキン基準(60)×1.5=90(叩き台・実機調整前提)。
  // POSTURE_ELITE_TYPESには入れない(usesPostureSystemはisEngageableBoss経由で既に付くため。
  // 入れると60分岐に当たって×1.5にならない=このif分岐を専用に足す)。
  if (isBountyType(type)) return 90;
  return 100;
};

export const bossPostureNow = (enemy: Enemy): number =>
  Math.max(0, Math.min(bossPostureMax(enemy), enemy.bossPosture ?? bossPostureMax(enemy)));

export const isBossPostureBroken = (enemy: Enemy, gameTime: number): boolean =>
  usesPostureSystem(enemy)
  && enemy.bossFullStunUntil !== undefined
  && gameTime < enemy.bossFullStunUntil;

export const applyBossPostureDamage = (
  enemy: Enemy,
  impact: BossPostureImpact,
  gameTime: number,
  // SKILL_BUILD_REDESIGN.md §28(B7/§28-1): 弾幕の王(barrage-king)が'reflect'の体勢削りに掛ける
  // 倍率(×1.5/1.75/2.0)。既定1=他の全impact/未所持は無改変。
  impactMult = 1,
): { patch: Partial<Enemy>; triggered: boolean } | null => {
  if (!usesPostureSystem(enemy) || isBossPostureBroken(enemy, gameTime)) return null;
  if (gameTime < (enemy.bossPostureLockUntil ?? 0)) return null;
  const max = bossPostureMax(enemy);
  const before = bossPostureNow(enemy);
  const after = Math.max(0, before - max * IMPACT_RATIO[impact] * impactMult * POSTURE_CHIP_MULT);
  let recoveryCap = enemy.bossPostureRecoveryCap ?? max;
  for (const checkpoint of [0.75, 0.50, 0.25]) {
    const value = max * checkpoint;
    if (before > value && after <= value) recoveryCap = Math.min(recoveryCap, value);
  }
  if (after > 0) {
    return {
      patch: { bossPosture: after, bossPostureRecoveryCap: recoveryCap, bossPostureLastDamageAt: gameTime },
      triggered: false,
    };
  }
  const until = gameTime + BOSS_POSTURE_BREAK_MS;
  return {
    patch: {
      bossPosture: 0,
      bossPostureRecoveryCap: 0,
      bossPostureLastDamageAt: gameTime,
      bossFullStunUntil: until,
      stunUntil: until,
      bossPostureLockUntil: until + BOSS_POSTURE_REBREAK_LOCK_MS,
      bossBreakRewardRemaining: enemy.maxHealth * BOSS_BREAK_REWARD_HP_RATIO,
      // v0.25.3037(社長裁定・案1「紫になったら全技キャンセル」): 未起爆の遅延ヒット(滑空二撃目/
      // 三連突進の氷/翼撃三拍目/血の弧の未着弾ぶん)は紫の瞬間に破棄する。既に起爆済みで床として
      // 残っている物(burst=true・血溜まり等)は「もう世界に出た危険物」なので残す(裁定=B現状維持)。
      ...(enemy.giantDelayedHits !== undefined
        ? { giantDelayedHits: enemy.giantDelayedHits.filter(h => h.burst === true) }
        : {}),
    },
    triggered: true,
  };
};

export const tickBossPosture = (enemy: Enemy, gameTime: number, deltaTime: number): Partial<Enemy> | null => {
  if (!usesPostureSystem(enemy)) return null;
  const max = bossPostureMax(enemy);
  if (enemy.bossFullStunUntil !== undefined) {
    if (gameTime < enemy.bossFullStunUntil) return null;
    return {
      bossPosture: max,
      bossPostureRecoveryCap: max,
      bossFullStunUntil: undefined,
      bossBreakRewardRemaining: undefined,
      stunUntil: enemy.stunUntil === enemy.bossFullStunUntil ? undefined : enemy.stunUntil,
    };
  }
  const posture = bossPostureNow(enemy);
  if (posture >= max || gameTime < (enemy.bossPostureLastDamageAt ?? -Infinity) + BOSS_POSTURE_RECOVERY_DELAY_MS) return null;
  const cap = enemy.bossPostureRecoveryCap ?? max;
  const next = Math.min(cap, posture + max * BOSS_POSTURE_RECOVERY_PER_SEC * deltaTime);
  return next === posture ? null : { bossPosture: next };
};

export const applyBrokenGunReward = (
  enemy: Enemy, baseDamage: number, gameTime: number,
): { damage: number; patch: Partial<Enemy> } | null => {
  if (!isBossPostureBroken(enemy, gameTime)) return null;
  const remaining = Math.max(0, enemy.bossBreakRewardRemaining ?? 0);
  const bonus = Math.min(remaining, baseDamage * 4);
  return { damage: baseDamage + bonus, patch: { bossBreakRewardRemaining: remaining - bonus } };
};

// v0.25.3035(社長指示「全ボス、紫killを食らった直後は2秒停止してから活動再開(動きも技も)」):
// 致命の一撃の後、ボスはこの時間だけその場で停止する(stunUntilで表現=全ボスのコントローラが
// 既に尊重している唯一の汎用フリーズ。新フィールドだと4系統の制御器へ個別配線が要る)。
export const BOSS_FATAL_DAZE_MS = 2000;

export const applyBrokenMeleeFatal = (
  enemy: Enemy, baseDamage: number, gameTime: number,
): { damage: number; patch: Partial<Enemy> } | null => {
  if (!isBossPostureBroken(enemy, gameTime)) return null;
  return {
    damage: baseDamage * 5 + Math.max(0, enemy.bossBreakRewardRemaining ?? 0),
    patch: {
      bossPosture: bossPostureMax(enemy),
      bossPostureRecoveryCap: bossPostureMax(enemy),
      bossFullStunUntil: undefined,
      bossBreakRewardRemaining: undefined,
      // 旧: undefined(=命中と同時に再開)。v0.25.3035で致命後の停止(2秒)に変更。
      // 紫(bossFullStunUntil)は消えるので致命の連鎖はしない(applyBrokenMeleeFatalは紫中のみ発火)。
      stunUntil: gameTime + BOSS_FATAL_DAZE_MS,
      bossPostureLockUntil: gameTime + BOSS_POSTURE_REBREAK_LOCK_MS,
    },
  };
};
