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
// v0.25.2480(社長裁定「1」=旧★未決の解消): counterアクションの効果は実行側(useGameLoop)が
// 「請求(ghostCounter.ts)→per-bossハンドラで消費」の形で本物化された(パリィ=技の中断/反応遷移+
// 確定クリ=bumpBossCrit蓄積)。このファイル(意思決定・乱数消費順)は不変。
// isBossCounterableNowApprox は語尾ヒューリスティックの概算のままで、特に giantbat は windup を
// 「機会あり」と数える(実際のパリィ可否=combatTick.tsのdashParried表)。差分は消費側が各ボスの
// プレイヤー用判定で弾くので、プレイヤーが弾けない状態のcounterスイングは通常近接として落着する。
//
// v0.25.2529(BOT_AND_GHOST.md §2.12 行動品質): 原則 **「選択=計測値・実行=常に本気」**。
// 「下手さ」の二重再現(hitsPerMin→dodgeStrengthの逆写像)を廃止し、回避ベクトルは常に全力。
// 個性は ①反応遅延(reactionMs) ②間合いの取り方(preferredDist+予告中の安全マージン)
// ③移動リズム(stationaryFrac/approachPerMin) ④苦手技は食らう(tank率=現行維持) で出す。
import type { Enemy, Projectile, SkillKey } from '../types/game';
import { dodgeVector, pickTarget, botSkillProfile, type BotSkillProfile, type DodgeThreat } from './botSkill';
import { isBossType } from './enemyUtils'; // v0.25.2470: 雑魚回避(非ボス判定)用
import { isBossCounterableNowApprox } from './bossScript';
import { ghostExtraTelegraphDodge, isTelegraphActive } from './ghostTelegraph'; // §2.12 要件7: 予告台帳(全ボス)
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
   * §2.9(2)/§2.12(3): 移動リズムの2ノブ(計測値)。**旧プロファイルには無い**ので任意=
   * 欠損時は下の既定値(GHOST_DEFAULT_STATIONARY_FRAC/GHOST_DEFAULT_APPROACH_PER_MIN)へ落ちる。
   */
  stationaryFrac?: number;
  approachPerMin?: number;
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
    stationaryFrac: GHOST_DEFAULT_STATIONARY_FRAC,
    approachPerMin: GHOST_DEFAULT_APPROACH_PER_MIN,
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

/** subUsesPerMin→予約間隔(ms)。0以下は「サブを使わない人」= null(プロファイル上は予約間隔なし)。 */
export const ghostSubUseIntervalMs = (subUsesPerMin: number): number | null =>
  subUsesPerMin > 0 ? 60000 / subUsesPerMin : null;

/**
 * v0.25.2472(社長指示「守護霊のサブウェポンは実装されないなら、してほしい」): ボス交戦中の
 * サブ使用頻度の床=予約間隔の上限。プロファイルの subUsesPerMin が小さくても(0でも)、
 * 交戦中は最低この間隔で1回は予約する(叩き台20〜30秒の中庸=25秒)。shouldGhostClaimSub は
 * 呼び出し側(useGameLoop)が「紐付いたボスの生存中」だけ呼ぶので、床も自然にボス交戦中限定になる。
 */
export const GHOST_SUB_USE_MAX_INTERVAL_MS = 25_000;

/** 実効の予約間隔 = min(プロファイル由来, 床)。プロファイルが「使わない人」(null)でも床は生きる。 */
export const ghostSubClaimIntervalMs = (subUsesPerMin: number): number => {
  const fromProfile = ghostSubUseIntervalMs(subUsesPerMin);
  return fromProfile === null
    ? GHOST_SUB_USE_MAX_INTERVAL_MS
    : Math.min(fromProfile, GHOST_SUB_USE_MAX_INTERVAL_MS);
};

/**
 * このtickで「次のサブ発動1回」を予約するか。交戦中かの判定は呼び出し側(紐付いたボスの生存)。
 * lastSubUseAtMs は「最後にゴーストがサブを実際に使った時刻」(未使用なら0=召喚直後から予約可)。
 */
export const shouldGhostClaimSub = (
  lastSubUseAtMs: number,
  nowMs: number,
  subUsesPerMin: number,
): boolean => nowMs - lastSubUseAtMs >= ghostSubClaimIntervalMs(subUsesPerMin);

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
// v0.25.2470(社長裁定「雑魚は基本的に避けつつボスと戦う」): 雑魚回避の反発半径と混合の強さ(叩き台)。
export const GHOST_MOB_AVOID_PX = 90;
export const GHOST_MOB_AVOID_WEIGHT = 1.2;

// ---- §2.12 行動品質の定数(**全て叩き台=実機調整前提**。1箇所にまとめる) ------------------------
/** 反応遅延のclamp(§2.12(1)・計測側 playerTraits の reactionMs と同じ範囲)。 */
export const GHOST_REACTION_MIN_MS = 100;
export const GHOST_REACTION_MAX_MS = 800;
/**
 * §2.12(2) 距離の取り方: **ボスの予告(windup)中だけ**平時の間合いへ足す安全マージン(px)。
 * 予告が消えれば元の間合いへ戻る=「危ないから一歩下がる」だけの表現。
 */
export const GHOST_WINDUP_SAFE_MARGIN_PX = 120;
/**
 * §2.12 実行側の修正: カウンター待ちの見切り時間(ms)。窓が開いてからこれを過ぎても成立しなければ
 * 待つのをやめて通常行動へ戻る(旧: 無時限に張り付いたまま被弾していた)。
 */
export const GHOST_COUNTER_WAIT_MS = 1000;
/** §2.12(3) 接近リズム: approachPerMin をこの値で割って「詰めに行くtickの確率」にする。 */
export const GHOST_APPROACH_REF_PER_MIN = 6;
/** 同上の床。接近性が0の人でも完全には固まらない(交戦が成立しなくなる事故の防止)。 */
export const GHOST_APPROACH_MIN_CHANCE = 0.25;
/** 移動リズム2ノブの既定値(旧プロファイル/計測なしの欠損時。playerTraits.SEED_PROFILEと同値)。 */
export const GHOST_DEFAULT_STATIONARY_FRAC = 0.35;
export const GHOST_DEFAULT_APPROACH_PER_MIN = 3;
/**
 * §2.12追補(社長裁定v0.25.2534「人間なら攻撃/移動/カウンター待ちのどれかを必ずしている。
 * ぼーっと立たない——せめてボスを正面に横に歩かせる」): 静止していた場面を全て
 * 「ボス正対の横流れ(オービット)」に置換する。値は移動速度への倍率(0..1)・全て叩き台=実機調整前提。
 * 例外はカウンター待ちの静止(=意味のある静止・窓リング表示つき)のみ。
 */
export const GHOST_ORBIT_BASE_FRAC = 0.55;   // 帯内(間合いが合っている)の移動tick=普通の横歩き
export const GHOST_ORBIT_IDLE_FRAC = 0.3;    // 止まり癖tick(旧: 完全停止)=遅い横流れ。個性は速度差で残す
export const GHOST_ORBIT_TANK_FRAC = 0.35;   // tankロールの予告中=「避けようとして間に合わない」ゆっくり歩き
                                             // (速すぎると狙い撃ち技が偶然外れ、hitRate再現=「苦手技は食らう」が壊れる)
export const GHOST_ORBIT_FLIP_CHANCE = 0.004; // 1tickあたりの旋回方向の反転確率(約4秒に1回@60fps)

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

const norm = (x: number, y: number): [number, number] => {
  const l = Math.hypot(x, y);
  return l < 0.0001 ? [0, 0] : [x / l, y / l];
};

/** §2.12(1): 計測 reactionMs を [100,800] にclampした「気づきの早さ」。欠損/異常値は下限へ寄せる。 */
export const ghostReactionMs = (reactionMs: number): number =>
  Number.isFinite(reactionMs)
    ? Math.max(GHOST_REACTION_MIN_MS, Math.min(GHOST_REACTION_MAX_MS, reactionMs))
    : GHOST_REACTION_MIN_MS;

/**
 * §2.12(3): 平時に「このtickで動くか」の確率。動き続ける癖(mobility)と立ち止まる癖
 * (stationaryFrac)は測り方が別(入力ベース/変位ベース)なので、**両者の平均**を採る(叩き台)。
 * 既定値(mobility0.6 / stationaryFrac0.35)で 0.625 ≒ 従来の mobility 単独運用と同じ体感になる。
 */
export const ghostMoveChance = (mobility: number, stationaryFrac?: number): number =>
  clamp01((clamp01(mobility) + (1 - clamp01(stationaryFrac ?? GHOST_DEFAULT_STATIONARY_FRAC))) / 2);

/** §2.12(3): 「詰めに行く」tickの確率。接近エピソードが少ない人ほど、じりじりとしか詰めない。 */
export const ghostApproachChance = (approachPerMin?: number): number => {
  const v = approachPerMin ?? GHOST_DEFAULT_APPROACH_PER_MIN;
  if (!Number.isFinite(v)) return GHOST_APPROACH_MIN_CHANCE;
  return Math.max(GHOST_APPROACH_MIN_CHANCE, Math.min(1, v / GHOST_APPROACH_REF_PER_MIN));
};

/** §2.12(2): このtickの目標間合い。ボスの予告中だけ安全マージンを足して退避する。 */
export const ghostDesiredDist = (preferredDist: number, addSafeMargin: boolean): number =>
  preferredDist + (addSafeMargin ? GHOST_WINDUP_SAFE_MARGIN_PX : 0);

/** §2.12: カウンター待ちを見切ったか(窓が開いてから GHOST_COUNTER_WAIT_MS 経過)。 */
export const ghostCounterWaitExpired = (pendingAt: number | undefined, nowMs: number): boolean =>
  pendingAt !== undefined && nowMs - pendingAt >= GHOST_COUNTER_WAIT_MS;

// dodgeVector に渡す最小限のBotSkillProfile shim。dodgeVectorが実際に読むのは dodge/dodgeStrength の
// 2フィールドだけ(botSkill.tsのdodgeVector実装参照)なので、残りはTSの構造的型付けを満たすためだけの
// 無害なプレースホルダ値(ゴーストの標的選択/交戦距離判断そのものには一切使わない)。
// **dodgeStrength は常に1(§2.12「実行は常に本気」)**=旧hitsPerMin逆写像は廃止した。
const GHOST_DODGE_PROFILE: BotSkillProfile = {
  reactionMs: 0, counterChance: 0, dodge: 'aoe', targeting: 'threat', surroundCount: 0,
  disengageHp: 0, engageDist: 0, dodgeVsAttack: 0, avoidContactDist: 0, meleeVsDanger: true,
  warpReact: false, upgradePolicy: 'random', dodgeStrength: 1,
};

/**
 * ゴーストの回避ベクトル(常に全力)。既存 dodgeVector(弾/汎用ジャンプ/突進/既存の予告表)に、
 * §2.12 要件7の**全ボス予告台帳が足す差分**(ghostTelegraph)を合成する。
 * 戻り値 null = 避けるものが無い。
 */
export const ghostDodgeVector = (
  gcx: number, gcy: number,
  enemies: readonly Enemy[],
  projectiles: readonly Projectile[],
): { x: number; y: number } | null => {
  const base = dodgeVector(GHOST_DODGE_PROFILE, gcx, gcy, enemies, projectiles, 0);
  // base は合成済みの単位ベクトル(強さ1)。差分の脅威は自分の weight(0..1)で足す。
  let sx = base ? base.x : 0, sy = base ? base.y : 0;
  for (const e of enemies) {
    const extras: DodgeThreat[] = ghostExtraTelegraphDodge(gcx, gcy, e);
    for (const t of extras) { sx += t.ux * t.weight; sy += t.uy * t.weight; }
  }
  const [ux, uy] = norm(sx, sy);
  return ux === 0 && uy === 0 ? null : { x: ux, y: uy };
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
  /** §2.12(1): 危険(予告/脅威)を最初に認知した時刻。reactionMs後に回避を開始する。undefined=危険なし。 */
  dangerSeenAt?: number;
  /** §2.12追補: オービット(横流れ)の旋回方向。持ち越して低確率で反転(毎tick変わるとジグザグになる)。 */
  orbitSign?: 1 | -1;
}

export interface GhostDriverInput {
  ghost: GhostSelf;
  player: { x: number; y: number; width: number; height: number };
  /** 交戦対象の候補(通常はボス1体のみを想定=「ゴーストは戦闘だけする」)。 */
  enemies: readonly Enemy[];
  /** v0.25.2469(社長指示「基本的にボスを狙う」): 紐付いたボスのid。生きていれば常にこれを狙い、
   * 雑魚へ流れない(不在の瞬間だけ従来のpickTargetへフォールバック)。 */
  boundBossId?: string;
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
  dangerSeenAt?: number;    // §2.12(1): 次tickへ持ち越す(危険が消えたらundefinedに戻る)
  orbitSign?: 1 | -1;       // §2.12追補: オービットの旋回方向(次tickへ持ち越し)
}

/** 毎tick1回呼ぶ純関数。次tickへ持ち越す自己状態(lastShotAt等)も戻り値に含めて返す。 */
export const decideGhost = (input: GhostDriverInput): GhostDecision => {
  const { ghost, player, enemies, projectiles, profile, weapon, gameTime, nowMs } = input;
  const rand = input.rand ?? Math.random;
  const gcx = ghost.x + ghost.width / 2;
  const gcy = ghost.y + ghost.height / 2;

  // 標的選択: **紐付いたボスが生きていれば常にボス**(社長指示v0.25.2469「基本的にボスを狙う様に
  // しないと雑魚に流れていってる」)。不在の瞬間だけ従来のpickTarget('threat')へフォールバック。
  const bound = input.boundBossId ? enemies.find(e => e.id === input.boundBossId) : undefined;
  const target = bound ?? pickTarget('threat', gcx, gcy, enemies, gameTime);
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
      moveRoll: undefined, dangerSeenAt: undefined, orbitSign: ghost.orbitSign,
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

  // 回避(§2.12「実行は常に本気」=強さは常に1)。既存 dodgeVector + 全ボス予告台帳の差分。
  const dodge = ghostDodgeVector(gcx, gcy, enemies, projectiles);

  // §2.12(1) 反応遅延: 「危険」(標的ボスの予告 or 回避対象の脅威)を認知した時刻を持ち回り、
  // 計測 reactionMs(100-800clamp)経過して初めて回避を始める。気づきの早さがそのまま個性になる。
  const reactionMs = ghostReactionMs(profile.reactionMs);
  const windupNow = isTelegraphActive(target);
  const dangerNow = windupNow || dodge !== null;
  const dangerSeenAt = dangerNow ? (ghost.dangerSeenAt ?? nowMs) : undefined;
  const reacted = dangerSeenAt !== undefined && nowMs - dangerSeenAt >= reactionMs;
  const activeDodge = reacted ? dodge : null;

  // カウンター窓の見切り(§2.12・要件6)。**移動より先に**判定する: 見切った後は「詰める/張り付く」を
  // やめて通常の間合い管理へ戻す(旧: 窓が閉じるまで無時限に張り付いて被弾していた)。
  const inMeleeRange = dist <= GHOST_MELEE_RANGE;
  const counterable = inMeleeRange && isBossCounterableNowApprox(target.aiPhase, target.bossState);
  const counterGaveUp = counterable && ghostCounterWaitExpired(ghost.counterPendingAt, nowMs);
  const counterWatching = counterable && !counterGaveUp;

  // 間合い管理: preferredDist(平時)/+安全マージン(予告中)へ寄せる。
  // §2.12追補(社長裁定v0.25.2534): 静止は「カウンター待ち」以外に存在させない。旧実装で立ち尽くして
  // いた場面(帯内静止・止まり癖tick・tank予告中の棒立ち)は全てボス正対の横流れ(オービット)に置換。
  let orbitSign: 1 | -1 = ghost.orbitSign ?? (rand() < 0.5 ? 1 : -1);
  if (rand() < GHOST_ORBIT_FLIP_CHANCE) orbitSign = orbitSign === 1 ? -1 : 1;
  // 接線方向(半径ベクトルの90°回転)×速度倍率。dist≈0ではnormが[0,0]を返す=安全に停止。
  const orbitVec = (frac: number): [number, number] => {
    const [rx, ry] = norm(gcx - tcx, gcy - tcy);
    return [-ry * orbitSign * frac, rx * orbitSign * frac];
  };
  let moveX = 0, moveY = 0;
  if (reaction === 'counter' && !counterGaveUp) {
    // G4b 'counter': その技をカウンターしにいく=この技の間は回避せず近接間合いへ詰め、
    // 射程内では静止して窓(counterable)を待つ。リズムのゲートも通さない(「行く」と決めた行動は確実に出す)。
    // ※この静止は§2.12追補でも維持=「カウンター待ちしている」という意味のある静止(窓リング表示つき)。
    if (dist > GHOST_MELEE_RANGE) [moveX, moveY] = norm(tcx - gcx, tcy - gcy);
  } else if (activeDodge && reaction !== 'tank') {
    // G4b 'tank'(苦手の再現): この技に限り回避を抑制=逃げずに戦い続ける(①によりダメージは実際に入る)。
    moveX = activeDodge.x; moveY = activeDodge.y;
  } else {
    // §2.12(2)(3) 平時の間合い+移動リズム。
    // 安全マージンは「予告が出ているのに dodge/tank ロールを引いていない時」だけ足す(§2.12(2)の文言どおり)。
    const desired = ghostDesiredDist(
      profile.preferredDist,
      windupNow && reaction !== 'tank' && reaction !== 'dodge',
    );
    // **危険時(予告中/脅威あり)は必ず動く**=リズム(止まる癖)は平時のみ。
    const mustMove = dangerNow;
    // tankロールの予告中は「避けようとしたが間に合わない」ゆっくり歩き(速いと苦手技が偶然外れる)。
    const tankHolding = windupNow && reaction === 'tank';
    if (mustMove || rand() < ghostMoveChance(profile.mobility, profile.stationaryFrac)) {
      if (dist > desired + GHOST_MOVE_BAND_PX) {
        // 接近は approachPerMin のリズムに従う(詰めない人はじりじりとしか詰めない)。
        if (mustMove || rand() < ghostApproachChance(profile.approachPerMin)) {
          [moveX, moveY] = norm(tcx - gcx, tcy - gcy);
        } else {
          [moveX, moveY] = orbitVec(GHOST_ORBIT_IDLE_FRAC); // 詰めない人=詰めずに横へ流れる
        }
      } else if (dist < desired - GHOST_MOVE_BAND_PX) {
        [moveX, moveY] = norm(gcx - tcx, gcy - tcy);
      } else {
        // 帯内=間合いは合っている。立ち止まらず横流れ(§2.12追補)。
        [moveX, moveY] = orbitVec(tankHolding ? GHOST_ORBIT_TANK_FRAC : GHOST_ORBIT_BASE_FRAC);
      }
    } else {
      // 止まり癖tick: 完全停止を廃止し遅い横流れ。「足を止めがち」の個性は速度差(IDLE_FRAC)と
      // 「前後に詰めない」で残る(§2.12追補)。
      [moveX, moveY] = orbitVec(GHOST_ORBIT_IDLE_FRAC);
    }
  }

  // v0.25.2470(社長裁定「雑魚は基本的に避けつつボスと戦う。が正解」): 非ボスの雑魚からの反発
  // ベクトルを移動へ混ぜる(近いほど強い)。ボス狙い・回避・カウンター詰めの意思決定は変えず、
  // 進路だけ雑魚を捌くように曲げる。'tank'ロール(苦手の再現)中も雑魚回避は生きる(ボスの技を
  // 食らいに行くのであって雑魚に揉まれるのは別)。
  {
    let avX = 0, avY = 0;
    for (const e of enemies) {
      if (e.id === target.id || isBossType(e.type)) continue;
      const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
      const ddx = gcx - ecx, ddy = gcy - ecy;
      const dd = Math.hypot(ddx, ddy);
      if (dd > 0 && dd < GHOST_MOB_AVOID_PX) {
        const w = 1 - dd / GHOST_MOB_AVOID_PX;
        avX += (ddx / dd) * w; avY += (ddy / dd) * w;
      }
    }
    if (avX !== 0 || avY !== 0) {
      [moveX, moveY] = norm(moveX + avX * GHOST_MOB_AVOID_WEIGHT, moveY + avY * GHOST_MOB_AVOID_WEIGHT);
    }
  }

  // 攻撃判定。
  const meleeReady = nowMs - ghost.lastMeleeAt >= GHOST_MELEE_COOLDOWN_MS;
  const gunReady = nowMs - ghost.lastShotAt >= weapon.gunIntervalMs;

  let action: GhostDecision['action'] = 'none';
  let lastShotAt = ghost.lastShotAt;
  let lastMeleeAt = ghost.lastMeleeAt;
  let counterPendingAt = ghost.counterPendingAt;
  let counterWillAttempt = ghost.counterWillAttempt ?? false;

  if (counterWatching) {
    // カウンター相当: reactionMs(反応遅延・clamp済み)+counterChance(試行確率)で抽選
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
    if (counterWillAttempt && meleeReady && nowMs - counterPendingAt >= reactionMs) {
      action = 'melee'; lastMeleeAt = nowMs;
      counterPendingAt = undefined; counterWillAttempt = false;
    }
  } else {
    // 窓が無い、または**見切った**(§2.12: 約1秒待って成立しなければ離脱)。見切りの時は
    // counterPendingAt を残す=同じ窓では二度と構え直さない(窓が閉じた時にだけクリアされる)。
    if (!counterable) counterPendingAt = undefined;
    counterWillAttempt = false;
    // 通常の近接/銃の振り分けはmeleeBias(近接の傾向)で抽選。
    if (inMeleeRange && meleeReady && rand() < profile.meleeBias) {
      action = 'melee'; lastMeleeAt = nowMs;
    }
  }
  // 近接を選ばなかった tick は、射程内なら銃で代替する(手を空けない)。
  // ただし**窓を見ている最中(counterWatching)は代替しない**=銃を挟まない(反応遅延で待っている/
  // 抽選に外れた、のどちらでも「その窓には手を出さない」で統一する)。見切った後は通常どおり撃つ。
  if (action === 'none' && !counterWatching && gunReady && dist <= weapon.gunRangePx) {
    action = 'shoot'; lastShotAt = nowMs;
  }

  return {
    moveX, moveY, action, targetId: target.id, facing,
    lastShotAt, lastMeleeAt, counterPendingAt, counterWillAttempt,
    moveRoll, dangerSeenAt, orbitSign,
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
