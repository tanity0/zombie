// BOT_AND_GHOST.md G2(ゴースト本体)。プレイヤーの実測プロファイル(playerTraits.ts)で駆動する
// 「戦闘だけする」薄い専用ドライバ。純関数(store/React/PixiJS非依存)=ヘッドレスでテスト可能。
//
// 設計(BOT_AND_GHOST.md §2.5 未決1の裁定):
// - botObjective(POI/回収/前進)は使わない。ゴーストは戦闘だけする。
// - 流用する既存純関数: pickTarget(botSkill)/dodgeVector+telegraphDodge(botSkill)。
//   カウンター相当(counterChance/reactionMsで抽選)は playtestBot の CounterThreatState の流儀を
//   参考に、ゴースト用に軽く再実装している(プレイヤー入力系=playtestBot.ts自体には触れていない)。
// - 追従リーシュ: プレイヤーから GHOST_LEASH_PX を超えたら瞬時にプレイヤー脇へワープする
//   (霊体という設定なのでワープが世界観的に許される。演出は後回し)。
//
// ★未決(BOT_AND_GHOST.md最終報告に転記): ゴーストの近接ダメージは「射程内なら毎回damageEnemyを
// 通す簡易スイング」で、各ボス固有のカウンター専用ボーナス(青FX/確定クリ/怯ませ/後退ジャンプ等)は
// 再現していない。isBossCounterableNowApprox は語尾ヒューリスティックの概算であり、特に giantbat は
// 実際の当たり判定(combatTick.tsのdashParried)より「機会あり」を広めに数える(bossScript.ts参照)。
import type { Enemy, Projectile } from '../types/game';
import { dodgeVector, pickTarget, botSkillProfile, type BotSkillProfile } from './botSkill';
import { isBossCounterableNowApprox } from './bossScript';

// ---- プロファイル(playerTraits.PlayerProfileと同じ6ノブ形。循環import回避のため型は独立定義) ----
export interface GhostProfile {
  reactionMs: number;
  counterChance: number;
  preferredDist: number;
  meleeBias: number;
  mobility: number;
  hitsPerMin: number;
}

/**
 * プロファイル未保存(初回)時のフォールバック(BOT_AND_GHOST.md「botSkillのcasual相当から変換」)。
 * reactionMs/counterChanceはbotSkill.tsのcasualの値そのもの。preferredDist/meleeBias/mobility/
 * hitsPerMinはbotSkillに対応する軸が無いため、casualらしい振る舞いになる目安値(叩き台)を置く。
 */
export const defaultGhostProfile = (): GhostProfile => {
  const casual = botSkillProfile('casual');
  return {
    reactionMs: casual.reactionMs,
    counterChance: casual.counterChance,
    preferredDist: 180,
    meleeBias: 0.4,
    mobility: 0.6,
    hitsPerMin: 3,
  };
};

// ---- 定数(BOT_AND_GHOST.md §3裁定 + 実装の叩き台) ---------------------------------------------
export const GHOST_HP_FRAC = 0.6;       // ゴーストHP = player.maxHealth × これ(叩き台)
export const GHOST_BOSS_HP_MULT = 1.6;  // 召喚成立の瞬間に1回だけボスhealth/maxHealthへ乗せる(§3裁定)
export const GHOST_LEASH_PX = 600;      // これを超えたらプレイヤー脇へ瞬間ワープ
// MELEE_RADIUS(gameStore.ts)=74 の複製値。store非依存を保つため import せず複製する
// (playerTraits.ts / playtestBot.ts の MELEE_ENGAGE_DIST と同じ前例)。
export const GHOST_MELEE_RANGE = 74;
const GHOST_MELEE_COOLDOWN_MS = 600;   // 叩き台(実機調整前提)
const GHOST_MOVE_BAND_PX = 40;         // preferredDistの許容帯(叩き台)
const HITS_PER_MIN_DODGE_REF = 8;      // hitsPerMin→dodgeStrength逆写像の基準(叩き台)

const norm = (x: number, y: number): [number, number] => {
  const l = Math.hypot(x, y);
  return l < 0.0001 ? [0, 0] : [x / l, y / l];
};

/**
 * hitsPerMin(被弾/分)→dodgeStrength(0..1)の逆写像(BOT_AND_GHOST.md §2.6)。
 * 被弾が多い人ほど回避が下手=dodgeStrengthを低くする。0.15を床にして「回避が完全に死んで
 * 何もしない」状態は避ける(即死ループの事故防止)。
 */
export const hitsPerMinToDodgeStrength = (hitsPerMin: number): number =>
  Math.max(0.15, Math.min(1, 1 - hitsPerMin / HITS_PER_MIN_DODGE_REF));

// dodgeVector に渡す最小限のBotSkillProfile shim。dodgeVectorが実際に読むのは dodge/dodgeStrength の
// 2フィールドだけ(botSkill.tsのdodgeVector実装参照)なので、残りはTSの構造的型付けを満たすためだけの
// 無害なプレースホルダ値(ゴーストの標的選択/交戦距離判断そのものには一切使わない)。
const GHOST_DODGE_PROFILE_TEMPLATE: Omit<BotSkillProfile, 'dodgeStrength'> = {
  reactionMs: 0, counterChance: 0, dodge: 'aoe', targeting: 'threat', surroundCount: 0,
  disengageHp: 0, engageDist: 0, dodgeVsAttack: 0, avoidContactDist: 0, meleeVsDanger: true,
  warpReact: false, upgradePolicy: 'random',
};

// ---- ゴースト本体の入出力 -----------------------------------------------------------------------
export interface GhostWeapon {
  gunDamage: number;
  gunIntervalMs: number;
  gunRangePx: number;
  meleeDamage: number;
}

export interface GhostSelf {
  x: number; y: number; width: number; height: number;
  facing: 1 | -1;
  lastShotAt: number;   // ms(Date.now())
  lastMeleeAt: number;  // ms
  counterPendingAt?: number;    // カウンター相当の機会が開いた時刻(undefined=機会なし)
  counterWillAttempt?: boolean; // その機会で抽選済みの「試みるか」
}

export interface GhostDriverInput {
  ghost: GhostSelf;
  player: { x: number; y: number; width: number; height: number };
  /** 交戦対象の候補(通常はボス1体のみを想定=「ゴーストは戦闘だけする」)。 */
  enemies: readonly Enemy[];
  projectiles: readonly Projectile[];
  profile: GhostProfile;
  weapon: GhostWeapon;
  gameTime: number; // pickTargetのスタン判定に使う(sim時計)
  nowMs: number;     // クールダウン/反応遅延の時計(ゲーム本体のcounterWindowEndと同じDate.now系)
  rand?: () => number;
}

export interface GhostDecision {
  moveX: number; // -1..1
  moveY: number; // -1..1
  action: 'shoot' | 'melee' | 'none';
  targetId: string | null;
  facing: 1 | -1;
  lastShotAt: number;
  lastMeleeAt: number;
  counterPendingAt?: number;
  counterWillAttempt?: boolean;
}

/** 毎tick1回呼ぶ純関数。次tickへ持ち越す自己状態(lastShotAt等)も戻り値に含めて返す。 */
export const decideGhost = (input: GhostDriverInput): GhostDecision => {
  const { ghost, player, enemies, projectiles, profile, weapon, gameTime, nowMs } = input;
  const rand = input.rand ?? Math.random;
  const gcx = ghost.x + ghost.width / 2;
  const gcy = ghost.y + ghost.height / 2;

  // 標的選択(流用: pickTarget)。'threat'=攻撃中/スタン中を優先(ゴーストは戦闘だけするので
  // targeting段階を持たない=固定モード)。
  const target = pickTarget('threat', gcx, gcy, enemies, gameTime);
  if (!target) {
    // 交戦対象が居ない(ボス撃破直後の1tick等): プレイヤーへ寄るだけ。
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const dx = pcx - gcx, dy = pcy - gcy;
    const d = Math.hypot(dx, dy);
    const [ux, uy] = d > GHOST_MOVE_BAND_PX ? norm(dx, dy) : [0, 0];
    return {
      moveX: ux, moveY: uy, action: 'none', targetId: null,
      facing: ux !== 0 ? (ux > 0 ? 1 : -1) : ghost.facing,
      lastShotAt: ghost.lastShotAt, lastMeleeAt: ghost.lastMeleeAt,
      counterPendingAt: undefined, counterWillAttempt: false,
    };
  }

  const tcx = target.x + target.width / 2, tcy = target.y + target.height / 2;
  const dist = Math.hypot(tcx - gcx, tcy - gcy);
  const facing: 1 | -1 = (tcx - gcx) >= 0 ? 1 : -1;

  // 回避(流用: dodgeVector+telegraphDodge。常に最優先=間合い管理より生存)。
  const dodgeStrength = hitsPerMinToDodgeStrength(profile.hitsPerMin);
  const dodgeProfile: BotSkillProfile = { ...GHOST_DODGE_PROFILE_TEMPLATE, dodgeStrength };
  const dodge = dodgeVector(dodgeProfile, gcx, gcy, enemies, projectiles, 0);

  // 間合い管理: preferredDistへ寄せる。mobility=このtickで実際に動くかの確率ゲート
  // (低いゴーストは足が止まる=下手さも再現される。BOT_AND_GHOST.md §2.6)。
  let moveX = 0, moveY = 0;
  if (dodge) {
    moveX = dodge.x; moveY = dodge.y;
  } else if (rand() < profile.mobility) {
    if (dist > profile.preferredDist + GHOST_MOVE_BAND_PX) {
      [moveX, moveY] = norm(tcx - gcx, tcy - gcy);
    } else if (dist < profile.preferredDist - GHOST_MOVE_BAND_PX) {
      [moveX, moveY] = norm(gcx - tcx, gcy - tcy);
    }
  }

  // 攻撃判定。
  const inMeleeRange = dist <= GHOST_MELEE_RANGE;
  const meleeReady = nowMs - ghost.lastMeleeAt >= GHOST_MELEE_COOLDOWN_MS;
  const gunReady = nowMs - ghost.lastShotAt >= weapon.gunIntervalMs;
  const counterable = inMeleeRange && isBossCounterableNowApprox(target.aiPhase, target.bossState);

  let action: GhostDecision['action'] = 'none';
  let lastShotAt = ghost.lastShotAt;
  let lastMeleeAt = ghost.lastMeleeAt;
  let counterPendingAt = ghost.counterPendingAt;
  let counterWillAttempt = ghost.counterWillAttempt ?? false;

  if (counterable) {
    // カウンター相当: reactionMs(反応遅延)+counterChance(試行確率)で抽選
    // (playtestBotのCounterThreatStateの流儀を軽く再実装。1機会=1回だけ試みる)。
    if (counterPendingAt === undefined) {
      counterPendingAt = nowMs;
      counterWillAttempt = rand() < profile.counterChance;
    }
    if (counterWillAttempt && meleeReady && nowMs - counterPendingAt >= profile.reactionMs) {
      action = 'melee'; lastMeleeAt = nowMs;
      counterPendingAt = undefined; counterWillAttempt = false;
    }
  } else {
    counterPendingAt = undefined; counterWillAttempt = false;
    // 通常の近接/銃の振り分けはmeleeBias(近接の傾向)で抽選。
    if (inMeleeRange && meleeReady && rand() < profile.meleeBias) {
      action = 'melee'; lastMeleeAt = nowMs;
    }
  }
  // 近接を選ばなかった tick は、射程内なら銃で代替する(手を空けない)。
  // ただし**カウンター可能局面(counterable)の間は代替しない**=窓を見ている最中は銃を挟まない
  // (反応遅延で待っている/抽選に外れた、のどちらでも「その窓には手を出さない」で統一する)。
  if (action === 'none' && !counterable && gunReady && dist <= weapon.gunRangePx) {
    action = 'shoot'; lastShotAt = nowMs;
  }

  return {
    moveX, moveY, action, targetId: target.id, facing,
    lastShotAt, lastMeleeAt, counterPendingAt, counterWillAttempt,
  };
};

// ---- 追従リーシュ(BOT_AND_GHOST.md「プレイヤーから600px超えたら瞬時にプレイヤー脇へワープ」) ----
export interface GhostLeashResult { x: number; y: number }

export const ghostLeashWarp = (
  ghost: { x: number; y: number; width: number; height: number },
  player: { x: number; y: number; width: number; height: number },
): GhostLeashResult | null => {
  const gcx = ghost.x + ghost.width / 2, gcy = ghost.y + ghost.height / 2;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  if (Math.hypot(gcx - pcx, gcy - pcy) <= GHOST_LEASH_PX) return null;
  const SIDE_OFFSET_PX = 40; // プレイヤーの右脇へ出す(叩き台・演出は後回しでよい=BOT_AND_GHOST.md)。
  return {
    x: player.x + player.width / 2 + SIDE_OFFSET_PX - ghost.width / 2,
    y: player.y + player.height / 2 - ghost.height / 2,
  };
};
