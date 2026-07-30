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
import type { Enemy, Projectile, SkillKey } from '../types/game';
import { dodgeVector, pickTarget, botSkillProfile, type BotSkillProfile } from './botSkill';
import { isBossCounterableNowApprox } from './bossScript';
import { moveKeyForEnemy, type MoveReactionTable } from './moveReaction'; // G4b(§2.9(4)): 技キー導出は計測側と同じ純関数を流用(二重実装しない)

// ---- プロファイル(playerTraits.PlayerProfileと同じノブ形。循環import回避のため型は独立定義) ----
export interface GhostProfile {
  reactionMs: number;
  counterChance: number;
  preferredDist: number;
  meleeBias: number;
  mobility: number;
  hitsPerMin: number;
  /** G2.6: 実プレイヤーのサブウェポン使用回数/分(EMA)。ゴーストのサブ使用頻度の上限になる。 */
  subUsesPerMin: number;
  /**
   * G4b(BOT_AND_GHOST.md §2.9(4)): 技への反応表(G4aがplayerTraitsで実測)。技の立ち上がりで
   * counterRate/dodgeRate/hitRateからロールし、その技への反応(カウンター/離脱/苦手=被弾)を再現する。
   * 未定義・空表(旧プロファイル/既定プロファイル)は全技フォールバック=従来挙動(グローバルノブ)。
   */
  moveReactions?: MoveReactionTable;
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
    subUsesPerMin: DEFAULT_SUB_USES_PER_MIN,
    moveReactions: {}, // G4b: 実測なし=全技フォールバック(従来挙動)
  };
};

// ---- G4b(BOT_AND_GHOST.md §2.9(4)): 技への反応の再現(ロールの状態機械・純関数) -----------------
// ボスの溜め(aiPhase/bossState)の立ち上がりで技キーを導出(moveReaction.moveKeyForEnemyをそのまま
// 流用)し、プロファイルの moveReactions[moveKey] で**技1回の発動につき1回だけ**ロールする:
//   r < counterRate                → 'counter' = その技をカウンターしにいく(既存カウンター試行を優先発動)
//   r < counterRate + dodgeRate    → 'dodge'   = 離脱(既存のtelegraphDodge/dodgeVectorに従う=従来挙動)
//   残り(= hitRate)               → 'tank'    = 「苦手」の再現: この技に限り回避を抑制(①により実際に食らう)
// n < GHOST_MOVE_ROLL_MIN_N の技・キー未定義(天使等G4b計測未対応)は 'fallback' = 従来挙動
// (グローバルノブ)。ロールは技の解決(キーがnull/別キーへ変化)かタイムアウトでリセットする。
export type GhostMoveDecision = 'counter' | 'dodge' | 'tank' | 'fallback';
export interface GhostMoveRoll {
  moveKey: string;
  decision: GhostMoveDecision;
  rolledAtMs: number;
}
/** §2.9(1)の約束: 暴露n<3の技は既存グローバルノブへフォールバック(初見の技で変な確信を持たせない)。 */
export const GHOST_MOVE_ROLL_MIN_N = 3;
/** 同一技キーが異常に続いた時の安全弁(通常の技はaiPhase/bossStateが数秒で抜ける)。超えたら従来挙動へ。 */
export const GHOST_MOVE_ROLL_TIMEOUT_MS = 10_000;

export const rollGhostMoveReaction = (
  prev: GhostMoveRoll | undefined,
  target: Pick<Enemy, 'type' | 'aiPhase' | 'bossState'> | null,
  moveReactions: MoveReactionTable | undefined,
  nowMs: number,
  rand: () => number,
): GhostMoveRoll | undefined => {
  const moveKey = target ? moveKeyForEnemy(target) : null;
  if (!moveKey) return undefined; // 技が解決した(または技なし)=リセット
  if (prev && prev.moveKey === moveKey) {
    // 同じ技が続く間は振り直さない(技1回の発動=1ロール)。タイムアウトだけは従来挙動へ落とす。
    if (nowMs - prev.rolledAtMs <= GHOST_MOVE_ROLL_TIMEOUT_MS) return prev;
    return prev.decision === 'fallback' ? prev : { moveKey, decision: 'fallback', rolledAtMs: prev.rolledAtMs };
  }
  const stat = moveReactions?.[moveKey];
  if (!stat || stat.n < GHOST_MOVE_ROLL_MIN_N) return { moveKey, decision: 'fallback', rolledAtMs: nowMs };
  const counterRate = Math.max(0, Math.min(1, stat.counterRate));
  const hitRate = Math.max(0, Math.min(1, stat.hitRate));
  const dodgeRate = Math.max(0, 1 - counterRate - hitRate); // dodgeRate=1-両者(moveReaction.tsの保存形)
  const r = rand();
  const decision: GhostMoveDecision =
    r < counterRate ? 'counter'
      : r < counterRate + dodgeRate ? 'dodge'
        : 'tank';
  return { moveKey, decision, rolledAtMs: nowMs };
};

// ---- G3: 装備スキル「守護霊」(BOT_AND_GHOST.md §2.5 実装順3・社長指示「最初から解禁」) ----------
/** 装備スキルキー(campaign.SKILLS の 'guardian-spirit')。 */
export const GUARDIAN_SPIRIT_SKILL: SkillKey = 'guardian-spirit';

/**
 * このランでゴースト系を有効にするか(召喚ゲート)。`?ghost=1`(開発用・従来どおり装備なしでも動く)
 * OR 守護霊(guardian-spirit)を装備している。**計測停止(§2.7 制約1)も同じ判定を使う**
 * =「ゴーストが出うるランは丸ごと測らない」(装備中のボス戦は必ず召喚が起きるので同値・§2.7)。
 */
export const ghostRunEnabled = (ghostDebugEnabled: boolean, equippedSkills: readonly SkillKey[]): boolean =>
  ghostDebugEnabled || equippedSkills.includes(GUARDIAN_SPIRIT_SKILL);

// ---- G2.6: サブウェポン使用の予約(BOT_AND_GHOST.md §2.8) --------------------------------------
// ゴーストはプレイヤーの装備サブウェポンを「自分をオーナーとして」使える。CDは既存の1本を共有
// (「1つの財布」=帳簿1つ)なので、ゴースト側の意思決定は「次のサブ発動1回を予約するか」だけ。
// 予約された1発は、サブ発動入口(useGameLoopの自動発動ブロック)がオーナー=ゴーストで解決する。
// 頻度は subUsesPerMin ノブに従う(=実測の上限。実際の使用間隔は共有CDの明き次第でこれより疎になる)。
/** playerTraits.SEED_PROFILE と同じ「控えめな既定値」(叩き台)。欠損時のフォールバックにも使う。 */
export const DEFAULT_SUB_USES_PER_MIN = 2;

/** subUsesPerMin→予約間隔(ms)。0以下は「サブを使わない人」= null(予約しない)。 */
export const ghostSubUseIntervalMs = (subUsesPerMin: number): number | null =>
  subUsesPerMin > 0 ? 60000 / subUsesPerMin : null;

/**
 * このtickで「次のサブ発動1回」を予約するか。交戦中かの判定は呼び出し側(紐付いたボスの生存)。
 * lastSubUseAtMs は「最後にゴーストがサブを実際に使った時刻」(未使用なら0=召喚直後から予約可)。
 */
export const shouldGhostClaimSub = (
  lastSubUseAtMs: number,
  nowMs: number,
  subUsesPerMin: number,
): boolean => {
  const interval = ghostSubUseIntervalMs(subUsesPerMin);
  return interval !== null && nowMs - lastSubUseAtMs >= interval;
};

// ---- 定数(BOT_AND_GHOST.md §3裁定 + 実装の叩き台) ---------------------------------------------
// GHOST_HP_FRAC(0.6)は v0.25.2468 で廃止: 社長裁定「HPは計測時のHPを100%再現。全ステータスを
// そのまま再現」により、HP/速度/レベルはプロファイルの計測時スナップショットを100%使う
// (directorTick.ts参照。旧プロファイル等でスナップショットが無ければ召喚時の本人値=×1.0)。
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
  moveRoll?: GhostMoveRoll;     // G4b: 進行中の技への反応ロール(undefined=技なし/フォールバック運転)
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
  moveRoll?: GhostMoveRoll; // G4b: 次tickへ持ち越す(技の解決でundefinedに戻る)
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
      moveRoll: undefined,
    };
  }

  const tcx = target.x + target.width / 2, tcy = target.y + target.height / 2;
  const dist = Math.hypot(tcx - gcx, tcy - gcy);
  const facing: 1 | -1 = (tcx - gcx) >= 0 ? 1 : -1;

  // G4b(§2.9(4)): 技への反応の再現。ボスの技(aiPhase/bossState)の立ち上がりで1回だけロールし、
  // 同じ技が続く間は保持する(毎tick振り直さない)。'fallback'(n<3・キー未定義=天使等G4b計測未対応)
  // の間は以降の全分岐が従来挙動(グローバルノブ)のまま=乱数の消費順も従来と同一。
  const moveRoll = rollGhostMoveReaction(ghost.moveRoll, target, profile.moveReactions, nowMs, rand);
  const reaction = moveRoll?.decision;

  // 回避(流用: dodgeVector+telegraphDodge。常に最優先=間合い管理より生存)。
  const dodgeStrength = hitsPerMinToDodgeStrength(profile.hitsPerMin);
  const dodgeProfile: BotSkillProfile = { ...GHOST_DODGE_PROFILE_TEMPLATE, dodgeStrength };
  const dodge = dodgeVector(dodgeProfile, gcx, gcy, enemies, projectiles, 0);

  // 間合い管理: preferredDistへ寄せる。mobility=このtickで実際に動くかの確率ゲート
  // (低いゴーストは足が止まる=下手さも再現される。BOT_AND_GHOST.md §2.6)。
  let moveX = 0, moveY = 0;
  if (reaction === 'counter') {
    // G4b 'counter': その技をカウンターしにいく=この技の間は回避せず近接間合いへ詰め、
    // 射程内では静止して窓(counterable)を待つ。mobilityゲートも通さない(「行く」と決めた行動は確実に出す)。
    if (dist > GHOST_MELEE_RANGE) [moveX, moveY] = norm(tcx - gcx, tcy - gcy);
  } else if (dodge && reaction !== 'tank') {
    // G4b 'tank'(苦手の再現): この技に限り回避を抑制=逃げずに戦い続ける(①によりダメージは実際に入る)。
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
    // G4b: 技ロールがある時はロールの3分類が排他に決める: 'counter'=必ず試みる /
    // 'dodge'・'tank'=この技では構えない(離脱/被弾の再現を汚さない) / 'fallback'=従来の抽選。
    if (counterPendingAt === undefined) {
      counterPendingAt = nowMs;
      counterWillAttempt = reaction === 'counter'
        ? true
        : reaction === 'dodge' || reaction === 'tank'
          ? false
          : rand() < profile.counterChance;
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
    moveRoll,
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
