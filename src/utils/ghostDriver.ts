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
import { dodgeVector, pickTarget, botSkillProfile, type BotSkillProfile } from './botSkill';
// v0.25.2470: 雑魚回避(非ボス判定)用 / ENEMY_PROJECTILE_DURATION=弾の寿命(tankした弾技の弾を無視し続ける長さ)
import { isBossType, aimEnemyDist2, ENEMY_PROJECTILE_DURATION } from './enemyUtils';
import { isCounterOpportunityNow } from './counterReach'; // ★憲法(v0.25.3948)
import {
  isGiantAimWindup, isGiantDeadWindup, impactAtWindupEnd,
  ghostAimSwingNow, ghostAimLeadMs, ghostAimSlowness01,
} from './ghostCounterAim'; // A-2(社長裁定v0.25.2600): 着弾の瞬間から逆算して振る(純関数・store非依存)
import { ghostExtraTelegraphDodge, isTelegraphActive, type GhostDodgeThreat } from './ghostTelegraph'; // §2.12 要件7: 予告台帳(全ボス)
import { anyMoveKeyForEnemy, isProjectileMoveKey, type MoveReactionTable, type MoveReactionStat, type DodgeDirStat } from './moveReaction'; // G4b(§2.9(4)): 技キー導出は計測側と同じ純関数を流用(二重実装しない)
import { drawFromCommandBag } from './commandBag'; // §2.18(GHOST-CMD-1): 決定の出どころ=境界ガード付き袋式
import { drawFromModeBag } from './modeBag'; // GHOST-CMD-2A: 汎用2モード袋(隙コマンドの「詰める/撃つ」)
import {
  punishWindowsOpen, activePunishContext, punishModeStat, PUNISH_DEFAULT_MODE,
  type PunishContext, type PunishMode, type PunishProfile,
} from './punishWindow'; // GHOST-CMD-2A(§2.18追補): 隙の窓判定は計測側と共有の純関数
// GHOST-COUNTER-PARITY(社長指示「プレイヤーと揃えろ」): カウンターが成立しうるスイングの周期は
// プレイヤーの COUNTER_WINDOW+COUNTER_COOLDOWN と**同じ値**にする。値を手写しすると変更時にズレる
// (CLAUDE.md の前例)ため、定数そのものを import する。GHOST_MELEE_RANGE(store非依存の複製値)とは
// 事情が違う: あちらは「意思決定側の間合いの目安」で多少ズレても実害が小さいが、こちらは社長が
// 明示的に「プレイヤーの値と揃えろ」と指示した数値なので複製ではなくimportを選ぶ。
import { COUNTER_WINDOW, COUNTER_COOLDOWN } from '../store/gameStore';

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
   * その技への反応(カウンター/離脱/苦手=被弾)を決めて再現する。§2.18(GHOST-CMD-1)以降、決定は
   * 記録から導出した袋(commandBag.ts=境界ガード付き袋式)からの1枚引き。
   * 未定義・空表(旧プロファイル/既定プロファイル)は全技フォールバック=従来挙動(グローバルノブ)。
   */
  moveReactions?: MoveReactionTable;
  /**
   * GHOST-SUBS-FINAL(社長裁定2026-07-31): ホーミングの「押す→離す」保持時間の計測平均(ms)。
   * 欠損(旧プロファイル/未使用)= 計測なし ⇒ 消費側(utils/homing.ghostHomingHoldMs)が
   * 「満タンで発射」へフォールバックする。directorTick が召喚時に subStyles から解決して載せる。
   */
  homingHoldMsAvg?: number;
  /**
   * GHOST-CMD-1B(§2.18-2/-3 dodgeの味付け): 避け方向の癖(playerTraits.PlayerProfile.dodgeDirと同形)。
   * directorTickの effectiveGhostProfile 経路(PlayerProfileの構造互換)でそのまま載る。
   * 消費は**円形タグ付き脅威の回避ベクトルの接線回転だけ**(ghostDodgeVector)。
   * 欠損(旧プロファイル/既定プロファイル/n=0)= バイアス0 = 従来とビット一致。
   */
  dodgeDir?: DodgeDirStat;
  /**
   * GHOST-CMD-2A(§2.18追補 隙コマンド): 隙(気絶/技後硬直/カウンター成立直後)に「詰めて叩く」か
   * 「撃つ」かの文脈別記録(playerTraits.PlayerProfile.punishと同形)。directorTickの
   * effectiveGhostProfile経路(PlayerProfileの構造互換)でそのまま載る。
   * **欠損(旧プロファイル/既定プロファイル/n=0)= 既定の 'rush'(詰めて叩く)**
   * (社長裁定「数値がなければベストで動く/数値があるのに決めつけない」)。
   */
  punish?: PunishProfile;
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

// ---- G4b(BOT_AND_GHOST.md §2.9(4))→§2.18(GHOST-CMD-1): 技への反応(ロールの状態機械・純関数) ----
// ボスの溜め(aiPhase/bossState)の立ち上がりで技キーを導出(moveReaction.anyMoveKeyForEnemyをそのまま
// 流用=**弾技も含む**(GHOST-BULLET-TECH: 裏ボスburst/radial・天使volley/uri bolt・idol射撃など))し、
// プロファイルの moveReactions[moveKey] で**技1回の発動につき1回だけ**決める:
//   'counter' = その技をカウンターしにいく(既存カウンター試行を優先発動)
//   'dodge'   = 離脱(既存のtelegraphDodge/dodgeVectorに従う=従来挙動)
//   'tank'    = 「苦手」の再現: この技に限り回避を抑制(①により実際に食らう)
// §2.18(GHOST-CMD-1): 決定の出どころは毎回の確率ロール→**境界ガード付き袋式**(commandBag.ts)へ置換。
// 記録の結果をそのまま袋に入れて引き切る=ラン全体で見れば割合は記録どおり(1ラン=記録の1回の再演)。
// ロールの状態機械(技1回=1引き・持ち越し・タイムアウト・キー変化でリセット)は従来のまま。
// n < GHOST_MOVE_ROLL_MIN_N の技・キー未定義(天使等G4b計測未対応)は 'fallback' = 従来挙動
// (グローバルノブ)。ロールは技の解決(キーがnull/別キーへ変化)かタイムアウトでリセットする。
export type GhostMoveDecision = 'counter' | 'dodge' | 'tank' | 'fallback';
export interface GhostMoveRoll {
  moveKey: string;
  decision: GhostMoveDecision;
  rolledAtMs: number;
}
/**
 * §2.18裁定(社長2026-07-31)「n=1は確定行動になる=仕様として許容」: 旧ゲートn<3(§2.9(1))を廃し、
 * 記録が1回でもあれば袋を引く(記録がある所を集計デフォで上書きしない=§2.18-8)。
 * n=0(記録なし)・キー未定義は従来どおり'fallback'(乱数消費を含め1bit不変)。
 */
export const GHOST_MOVE_ROLL_MIN_N = 1;
/**
 * v0.25.2610(社長裁定「1で」): **記録が無い技の既定の反応**。
 *
 * 社長報告「データ持ってないAIが遠くをキープしててほぼ何もしない。ボスがくると逃げるだけ」の原因:
 * 記録が無い技は全て `'fallback'` になり、`'fallback'` は `'tank'` でも `'dodge'` でもないため、
 * 間合い計算(下の `ghostDesiredDist`)の**安全マージン +120px が予告のたびに必ず足されていた**。
 * 既定 `preferredDist=180` と合わせて常に **300px** に居座る一方、近接の間合いは `GHOST_MELEE_RANGE=74`。
 * ⇒ **届かない → カウンター窓に入れない → counterChance 0.65 が一度も試行されない**。
 * 「詰める理由」を生む `'counter'` を引く可能性がゼロなので、構造的に永久カイターになっていた。
 * (天使6体は G4b の計測自体が未対応=常にこの状態だった。)
 *
 * よって記録が無い場合も**袋を引く**ようにし、その袋の中身をこの既定値から導く。
 * `deriveBagCounts` の規則(counter=round(n×counterRate) / tank=min(round(n×hitRate), n−counter) /
 * dodge=残り)により **counter 4 / dodge 4 / tank 2**(社長承認の「カウンター4割・回避4割・耐える2割」)。
 * **値は叩き台=実機調整前提。** 記録がある技は従来どおり本人の記録が勝つ(ここは一切変わらない)。
 */
export const GHOST_DEFAULT_MOVE_STAT: MoveReactionStat = { n: 10, counterRate: 0.4, hitRate: 0.2 };
/** 同一技キーが異常に続いた時の安全弁(通常の技はaiPhase/bossStateが数秒で抜ける)。超えたら従来挙動へ。 */
export const GHOST_MOVE_ROLL_TIMEOUT_MS = 10_000;

export const rollGhostMoveReaction = (
  prev: GhostMoveRoll | undefined,
  target: Pick<Enemy, 'type' | 'aiPhase' | 'bossState'> | null,
  moveReactions: MoveReactionTable | undefined,
  nowMs: number,
  rand: () => number,
): GhostMoveRoll | undefined => {
  const moveKey = target ? anyMoveKeyForEnemy(target) : null;
  if (!moveKey) return undefined; // 技が解決した(または技なし)=リセット
  if (prev && prev.moveKey === moveKey) {
    // 同じ技が続く間は振り直さない(技1回の発動=1ロール)。タイムアウトだけは従来挙動へ落とす。
    if (nowMs - prev.rolledAtMs <= GHOST_MOVE_ROLL_TIMEOUT_MS) return prev;
    return prev.decision === 'fallback' ? prev : { moveKey, decision: 'fallback', rolledAtMs: prev.rolledAtMs };
  }
  // v0.25.2610: 記録が無い技も袋を引く(既定の配分=GHOST_DEFAULT_MOVE_STAT)。旧実装はここで
  // 'fallback' を返しており、それが「データ無し守護霊は何もしない」の直接原因だった(上の注記)。
  const recorded = moveReactions?.[moveKey];
  const stat = (recorded && recorded.n >= GHOST_MOVE_ROLL_MIN_N) ? recorded : GHOST_DEFAULT_MOVE_STAT;
  // §2.18(GHOST-CMD-1): 確率ロール→袋式の1枚引きへ。乱数消費は従来と同じ「決定1回=rand1回」。
  const decision: GhostMoveDecision = drawFromCommandBag(moveKey, stat, rand);
  return { moveKey, decision, rolledAtMs: nowMs };
};

// ---- G3: 装備スキル「守護霊」(BOT_AND_GHOST.md §2.5 実装順3・社長指示「最初から解禁」) ----------
/** 装備スキルキー(campaign.SKILLS の 'guardian-spirit')。 */
export const GUARDIAN_SPIRIT_SKILL: SkillKey = 'guardian-spirit';
export const GHOST_HELPER_SKILL: SkillKey = 'ghost-helper';
export const GHOST_SLAYER_SKILL: SkillKey = 'ghost-slayer';
export const GHOST_SKILLS: ReadonlySet<SkillKey> = new Set([
  GUARDIAN_SPIRIT_SKILL, GHOST_HELPER_SKILL, GHOST_SLAYER_SKILL,
]);

/**
 * このランでゴースト系を有効にするか(召喚ゲート)。`?ghost=1`(開発用・従来どおり装備なしでも動く)
 * OR 守護霊(guardian-spirit)を装備している。**計測停止(§2.7 制約1)も同じ判定を使う**
 * =「ゴーストが出うるランは丸ごと測らない」(装備中のボス戦は必ず召喚が起きるので同値・§2.7)。
 *
 * SKILL_BUILD_REDESIGN.md §20(B4・同行者枠の正式化): `equippedSkills` は player.skills ではなく
 * gameStore.companionSkill を1件配列に包んだもの(呼び出し側=directorTick.tsのrunGhostAndTraitsStep)。
 * 同行者はplayer.skillsに入らない(§8点1)ため、この関数自体は引数だけを見る(汎用のまま据え置き)。
 */
export const ghostRunEnabled = (ghostDebugEnabled: boolean, equippedSkills: readonly SkillKey[]): boolean =>
  ghostDebugEnabled || equippedSkills.some(skill => GHOST_SKILLS.has(skill));

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
const GHOST_MELEE_COOLDOWN_MS = 600;   // 叩き台(実機調整前提)。通常近接スイングの間隔=不変(社長指示)。
/**
 * GHOST-COUNTER-PARITY: カウンターが成立しうるスイングだけの周期(プレイヤーの820ms=
 * COUNTER_WINDOW+COUNTER_COOLDOWNをimportして加算。値そのものを手写ししない)。
 * **通常近接(GHOST_MELEE_COOLDOWN_MS=600)には掛けない**——掛けると通常近接まで遅くなってしまい、
 * 社長指示「通常近接まで遅くしてはいけない」に反する。ゲートは下の counterMeleeReady のみに使う。
 */
export const GHOST_COUNTER_MELEE_PERIOD_MS = COUNTER_WINDOW + COUNTER_COOLDOWN;
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
/**
 * v0.25.2564(社長裁定「対処して」=テスト#7/#8の溶け対策): **ボスの体は、HPに関わらず常時回避対象**。
 * 借り物のHP閾値(CONTACT_DANGER_HP_FRAC=ボット用ヒューリスティック)はボスには適用しない
 * (高HP記録の守護霊がボス体当たりを1発も避けない実バグの根治)。雑魚の弱接触は従来どおり
 * 閾値制のまま=臆病化しない。距離は**体の縁(meleeDist注入=プレイヤーと同じAABB最近点)基準**。
 * 近接レンジ(74)より内側の値にして、攻撃の踏み込み(近接/カウンター)は殺さない(叩き台)。
 */
export const GHOST_BOSS_BODY_AVOID_PX = 48;
/**
 * GHOST-BULLET-TECH A(認知の持続・**叩き台2000ms**): 危険が見えなくなってもこの時間は「認知」を
 * 保持する。旧実装は危険が1tickでも途切れると認知が undefined へ戻り、**弾の波ごとに反応遅延
 * (100-800ms)の盲目窓が再発生**していた(近距離弾は200-500msで着弾=ほぼ確定被弾)。
 * 反応遅延は**危険エピソードにつき1回だけ**払い、記憶が切れて初めて次の危険でまた遅れる
 * =「初弾は食らうが、以降は本気で避ける」人間らしさ。
 */
export const GHOST_DANGER_MEMORY_MS = 2000;
/**
 * GHOST-BULLET-TECH B(苦手な弾技の再現): 弾技で 'tank' を引いた時、その技の弾を回避対象から
 * 外し続ける長さ。技の状態(windup/active/recover)は弾より先に終わるので、状態だけで判定すると
 * 「撃たれた瞬間だけ避けない」になってしまう。**弾の寿命ぶん**(ENEMY_PROJECTILE_DURATION)覚えておく。
 */
export const GHOST_BULLET_TANK_MS = ENEMY_PROJECTILE_DURATION;

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

// ---- GHOST-CMD-1B(§2.18-2/-3): 避け方向の癖(dodgeの味付け・成功が主・癖は従) --------------------
/**
 * 円形脅威の回避を接線側へ倒す最大角(45°)。cos45°>0 = 半径成分が必ず残る = 円からは必ず脱出できる
 * (成功優先の上限=§2.18-3「正解が複数ある時だけ癖で選ぶ」の円形版)。
 */
export const GHOST_DODGE_DIR_MAX_RAD = Math.PI / 4;

/**
 * 「横へ流す」度合い(0..1)= lateralRate + throughRate。前抜け(through)は v1 では横に畳む
 * (敵を横切る移動の真実装はPhase 2スコープ)。throughRate は 1 − away − lateral から導出。
 * 欠損(旧プロファイル)・n=0 は 0 = バイアス無し(従来とビット一致)。
 */
export const ghostDodgeLateralFrac = (dodgeDir?: DodgeDirStat): number => {
  if (!dodgeDir || dodgeDir.n <= 0) return 0;
  const away = clamp01(dodgeDir.awayRate);
  const lateral = clamp01(dodgeDir.lateralRate);
  const through = Math.max(0, 1 - away - lateral);
  return clamp01(lateral + through);
};

// ---- GHOST-CMD-2A(§2.18追補): 隙コマンド(詰めて叩く/撃つ) --------------------------------------
/**
 * 隙コマンドの袋キー(**文脈×ラン**で引き切り・詰め直し=commandBagと同じ寿命規則。
 * ラン境界のリセットは modeBag.resetModeBags を gameStore.resetGame が呼ぶ)。
 */
export const punishBagKey = (ctx: PunishContext): string => `punish:${ctx}`;

/**
 * その文脈のモードを袋から1枚引く(**文脈が開いた瞬間に1回だけ**呼ぶ)。
 * primary札='rush'(rate=rushRate)。**記録なし(n=0/欠損)は PUNISH_DEFAULT_MODE='rush' で、
 * この時 rand は1回も消費しない**(引く札が無い=抽選が発生しない)。
 */
export const drawPunishMode = (
  punish: PunishProfile | undefined,
  ctx: PunishContext,
  rand: () => number,
): PunishMode =>
  drawFromModeBag(punishBagKey(ctx), punishModeStat(punish, ctx), rand, PUNISH_DEFAULT_MODE === 'rush')
    ? 'rush'
    : 'shoot';

// ---- GHOST-BULLET-TECH A: 危険の認知(エピソード)の状態機械(純関数) --------------------------
// 状態遷移: **危険なし → 認知(seenAt) → 反応済み(reactionMs経過) → 記憶(危険が消えても保持) → 失効**。
//  - 認知〜反応済みは「エピソードにつき1回」。同じエピソードの間は何度危険が途切れても遅延を払い直さない。
//  - 記憶は最後に危険を見てから GHOST_DANGER_MEMORY_MS で失効し、次の危険がまた「初認知」になる。
export interface GhostDangerMemory {
  /** 危険エピソードを最初に認知した時刻(ms)。反応遅延の起点。 */
  seenAt: number;
  /**
   * 最後に危険が見えた時刻(ms)。記憶の失効起点。
   * **undefined = 旧状態(v0.25.2542以前のSummon)からの引き継ぎ**で、記憶は「生きている」として扱う
   * (失効判定の材料が無いのに勝手に切ると、移行tickだけ反応遅延を余計に払うため)。
   */
  lastDangerAt?: number;
}

/**
 * 危険の認知を1tick進める。戻り値 reacted=true の間だけ回避を実行してよい。
 * `reactionMs` は ghostReactionMs() でclamp済みの値を渡すこと。
 */
export const stepGhostDanger = (
  prev: GhostDangerMemory | undefined,
  dangerNow: boolean,
  nowMs: number,
  reactionMs: number,
): { memory: GhostDangerMemory | undefined; reacted: boolean } => {
  const expired = prev !== undefined && prev.lastDangerAt !== undefined
    && nowMs - prev.lastDangerAt > GHOST_DANGER_MEMORY_MS;
  const alive = expired ? undefined : prev;
  // 危険が見えないtick: 記憶だけ保持する(回避するものが無いので reacted は問わない)。
  if (!dangerNow) return { memory: alive, reacted: false };
  const seenAt = alive?.seenAt ?? nowMs;
  return { memory: { seenAt, lastDangerAt: nowMs }, reacted: nowMs - seenAt >= reactionMs };
};

/**
 * GHOST-SUBS-FINAL: 「今このtickで実際に動いているか」(火炎瓶/援護射撃の“移動中のみ”の主語判定)。
 * プレイヤーの `isMoving`(gameStore: 速度 > 最大速×0.15)と**同じしきい値**で、ゴーストの移動ベクトル
 * (最大速に対する割合そのもの)を見る。オービット(0.3〜0.55)は「動いている」側になる。
 */
export const GHOST_MOVING_SPEED_FRAC = 0.15;
export const ghostIsMovingNow = (moveX: number, moveY: number): boolean =>
  Math.hypot(moveX, moveY) > GHOST_MOVING_SPEED_FRAC;

/** §2.12: カウンター待ちを見切ったか(窓が開いてから GHOST_COUNTER_WAIT_MS 経過)。 */
export const ghostCounterWaitExpired = (pendingAt: number | undefined, nowMs: number): boolean =>
  pendingAt !== undefined && nowMs - pendingAt >= GHOST_COUNTER_WAIT_MS;

// dodgeVector に渡す最小限のBotSkillProfile shim。dodgeVectorが実際に読むのは dodge/dodgeStrength の
// 2フィールドだけ(botSkill.tsのdodgeVector実装参照)なので、残りはTSの構造的型付けを満たすためだけの
// 無害なプレースホルダ値(ゴーストの標的選択/交戦距離判断そのものには一切使わない)。
// **dodgeStrength は常に1(§2.12「実行は常に本気」)**=旧hitsPerMin逆写像は廃止した。
//
// GHOST-BULLET-TECH(v0.25.2543): **dodge を 'aoe' → 'all' へ是正**。'aoe' 段は
// `dodgeHandles('aoe','projectile') === false`(botSkill.ts)=**弾を1発も回避対象にしない**段で、
// 守護霊は今まで敵弾を一切避けていなかった(赤い予告と突進だけ避ける人)。発注仕様B「タグ無し弾=
// 従来どおり常時回避対象」「'tank'した弾技の弾だけ外す」が成立する前提そのものが無かったため是正する。
// 'all' との差分は**弾('projectile')だけ**: 'jump'/'charge'/'aoe' は 'aoe' 段でも既に true で、
// 'contact' は ghostDodgeVector が maxHealth=0 を渡す(=`contactDodge` が常に null)ので不活性のまま。
const GHOST_DODGE_PROFILE: BotSkillProfile = {
  reactionMs: 0, counterChance: 0, dodge: 'all', targeting: 'threat', surroundCount: 0,
  disengageHp: 0, engageDist: 0, dodgeVsAttack: 0, avoidContactDist: 0, meleeVsDanger: true,
  warpReact: false, upgradePolicy: 'random', dodgeStrength: 1,
  // ★v0.25.3554: 守護霊はカウンターを撃たない(counterChance:0)ので、この項目は無関係=false。
  seesBossCounterPhases: false,
  // ★v0.25.3780: 同じ理由(守護霊は近接を振らない)でトールの紫円の学習も無関係=false。
  respectsNihilCircle: false,
};

/**
 * ゴーストの回避ベクトル(常に全力)。既存 dodgeVector(弾/汎用ジャンプ/突進/既存の予告表)に、
 * §2.12 要件7の**全ボス予告台帳が足す差分**(ghostTelegraph)を合成する。
 * 戻り値 null = 避けるものが無い。
 *
 * `tankedBulletKey`(GHOST-BULLET-TECH B)= その技キーの弾は**避けない**(計測hitRateで'tank'を
 * 引いた=「この弾技は苦手」の再現)。タグの無い弾(非ボス/従来の弾)は常に回避対象のまま。
 *
 * `dodgeDir`/`orbitSign`(GHOST-CMD-1B)= 避け方向の癖。**台帳(ghostTelegraph)の円形タグ付き
 * 脅威だけ**、放射方向の単位ベクトルを接線側(orbitSignの旋回向き)へ
 * θ = min(45°, 45° × (lateralRate+throughRate)) 回転してから合成する(θ≤45°なので半径成分は
 * 必ず正=円からは必ず脱出できる=成功が主・癖は従=§2.18-3)。帯・突進・弾・接触、および
 * base(dodgeVector=botSkill)内の着地円(jumpDodge/telegraphDodgeの円)は**本バッチのバイアス
 * 対象外**=幾何のまま(botSkill.tsはテストボット共用のため不触)。回転は決定的(randを使わない)。
 * dodgeDir欠損(旧プロファイル・n=0)= θ=0 = 従来とベクトルもビット一致。
 */
export const ghostDodgeVector = (
  gcx: number, gcy: number,
  enemies: readonly Enemy[],
  projectiles: readonly Projectile[],
  maxHealth: number,
  meleeDist?: (cx: number, cy: number, e: Enemy) => number,
  tankedBulletKey?: string,
  dodgeDir?: DodgeDirStat,
  orbitSign?: 1 | -1,
): { x: number; y: number } | null => {
  const seen = tankedBulletKey === undefined
    ? projectiles
    : projectiles.filter(p => p.srcMoveKey !== tankedBulletKey);
  // v0.25.2547(社長裁定「オンにして」): 接触(体当たり)回避を有効化。maxHealth を渡すと
  // botSkill の既存規格(接触ダメージ >= 最大HPの CONTACT_DANGER_HP_FRAC(20%) の敵が
  // DODGE_CONTACT_DIST(260px) 以内 → 離れる)がそのまま効く=**雑魚向けの規格として維持**。
  // 0を渡すと従来どおり無効(テストの明示用)。
  const base = dodgeVector(GHOST_DODGE_PROFILE, gcx, gcy, enemies, seen, maxHealth);
  // base は合成済みの単位ベクトル(強さ1)。差分の脅威は自分の weight(0..1)で足す。
  let sx = base ? base.x : 0, sy = base ? base.y : 0;
  // GHOST-CMD-1B: 接線回転の角度(決定的・randなし)。0なら従来の合成式に1bitも触れない。
  const theta = Math.min(GHOST_DODGE_DIR_MAX_RAD, GHOST_DODGE_DIR_MAX_RAD * ghostDodgeLateralFrac(dodgeDir));
  for (const e of enemies) {
    const extras: GhostDodgeThreat[] = ghostExtraTelegraphDodge(gcx, gcy, e);
    for (const t of extras) {
      if (theta > 0 && t.shape === 'circle') {
        // 放射(ux,uy)を接線側へθ回転。接線の向きの規約は decideGhost の orbitVec と同一:
        // 放射(rx,ry)に対し (-ry*s, rx*s)=orbitSignの旋回側。
        const s = orbitSign ?? 1;
        const cosT = Math.cos(theta), sinT = Math.sin(theta);
        sx += (t.ux * cosT - t.uy * sinT * s) * t.weight;
        sy += (t.uy * cosT + t.ux * sinT * s) * t.weight;
      } else {
        sx += t.ux * t.weight; sy += t.uy * t.weight;
      }
    }
    // v0.25.2564(社長裁定「対処して」): **ボスの体は常時回避対象**(HP閾値なし・縁基準)。
    // meleeDist(プレイヤーと同じAABB最近点)注入時のみ有効。縁からGHOST_BOSS_BODY_AVOID_PX未満で
    // 体の中心から離れる方向へ、縁に近いほど強く反発(重なり=weight1)。近接レンジ(74)より内側の
    // 帯なので、攻撃の踏み込みは届く距離で保てる。
    if (meleeDist && isBossType(e.type)) {
      const ed = meleeDist(gcx, gcy, e);
      if (ed < GHOST_BOSS_BODY_AVOID_PX) {
        const bcx = e.x + e.width / 2, bcy = e.y + e.height / 2;
        const [ax, ay] = norm(gcx - bcx, gcy - bcy);
        const w = 1 - Math.max(0, ed) / GHOST_BOSS_BODY_AVOID_PX;
        sx += ax * w; sy += ay * w;
      }
    }
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
  /** v0.25.2547(接触回避オン): 接触脅威判定(botSkill既存規格=damage>=最大HPの20%)に使う。 */
  maxHealth: number;
  facing: 1 | -1;
  lastShotAt: number;   // ms(Date.now())
  lastMeleeAt: number;  // ms
  counterPendingAt?: number;    // カウンター相当の機会が開いた時刻(undefined=機会なし)
  counterArmKey?: string;       // ★検収2巡(中C): その錨を張った時の州(州が変わったら錨を張り直す)
  counterWillAttempt?: boolean; // その機会で抽選済みの「試みるか」
  /**
   * GHOST-COUNTER-PARITY: 最後に「カウンターするつもりで」melee actionを出した時刻(ms・Date.now基準)。
   * 通常近接の lastMeleeAt とは別枠(通常近接まで遅くしないため)。undefined=まだ一度も試みていない。
   */
  lastCounterAttemptAt?: number;
  moveRoll?: GhostMoveRoll;     // G4b: 進行中の技への反応ロール(undefined=技なし/フォールバック運転)
  /** §2.12(1): 危険(予告/脅威)を最初に認知した時刻。reactionMs後に回避を開始する。undefined=危険なし。 */
  dangerSeenAt?: number;
  /** GHOST-BULLET-TECH A: 最後に危険が見えた時刻(記憶=GHOST_DANGER_MEMORY_MSの失効起点)。 */
  dangerLastAt?: number;
  /** §2.12追補: オービット(横流れ)の旋回方向。持ち越して低確率で反転(毎tick変わるとジグザグになる)。 */
  orbitSign?: 1 | -1;
  /** GHOST-BULLET-TECH B: 'tank'を引いた弾技の技キー(この技の弾は避けない)。 */
  tankedBulletKey?: string;
  /** 同上の有効期限(ms)。これを過ぎたら弾を避ける側へ戻る。 */
  tankedBulletUntil?: number;
  /** GHOST-CMD-2A: 自分のカウンターが成立した時刻(ms・Date.now基準=Summon.ghostLastCounterAt)。
   * afterCounter文脈の窓判定に使う(プレイヤー側のlastCounterSuccessTimeと同じ意味)。 */
  lastCounterAtMs?: number;
  /** GHOST-CMD-2A: いま従っている隙の文脈(undefined=窓が開いていない)。 */
  punishContext?: PunishContext;
  /** GHOST-CMD-2A: その文脈で引いたモード(窓の間だけ持ち越す)。 */
  punishMode?: PunishMode;
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
  /**
   * GHOST-SUBS-FINAL(裁定「クイマガ回収の割り込み=許容」): 拾いに行く自分の落し物の位置
   * (現状はクイックマガジンのみ)。**間合い管理より優先**して歩いて取りに行く
   * (戦闘中に拾い歩きするのは人間も同じ)。回避/カウンターの方が優先(危険は避ける)。
   * undefined = 拾う物なし=従来と1bit同じ意思決定。
   */
  retrieveTarget?: { x: number; y: number };
  /**
   * v0.25.2564(社長裁定「対処して」): 近接/カウンター射程の物差し=**プレイヤーと同じ**
   * 「体の縁(当たり判定のAABB最近点)までの距離」を注入する(gameStore.enemyMeleeDist。store依存の
   * 関数なので、katanaAutoの前例どおり注入で受けて純関数を保つ)。旧実装は中心間距離で
   * GHOST_MELEE_RANGE(74)を測っていたため、巨体ボス(例: mimir幅248=半幅124)では**体内に
   * 立たない限り近接もカウンターも成立しない**=体当たりを食らい続けるパリティ写し損ねだった。
   */
  meleeDist: (cx: number, cy: number, e: Enemy) => number;
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
  counterArmKey?: string;
  counterWillAttempt?: boolean;
  lastCounterAttemptAt?: number; // GHOST-COUNTER-PARITY: 次tickへ持ち越す(GhostSelfと同じ意味)
  /**
   * GHOST-COUNTER-PARITY(掟3「意図しないスイングで請求を積まない」): この tick の action==='melee' が
   * **カウンターするつもりの振り**だったか。true の時だけ呼び出し側(useGameLoop)は請求(claim)を積む。
   * counterWatching分岐(意図してカウンターへ行った)経由でのみ true。meleeBias抽選/punishRushの
   * 通常近接では常に false(ボスがたまたま「成立しうる状態」でも、ghostDriverが狙って振ったのでなければ
   * 請求を積まない=意図と請求を一致させる)。
   */
  meleeIsCounterAttempt: boolean;
  moveRoll?: GhostMoveRoll; // G4b: 次tickへ持ち越す(技の解決でundefinedに戻る)
  dangerSeenAt?: number;    // §2.12(1): 次tickへ持ち越す(記憶が切れたらundefinedに戻る)
  dangerLastAt?: number;    // GHOST-BULLET-TECH A: 最後に危険が見えた時刻(記憶の失効起点)
  orbitSign?: 1 | -1;       // §2.12追補: オービットの旋回方向(次tickへ持ち越し)
  tankedBulletKey?: string;  // GHOST-BULLET-TECH B: 避けない弾技(undefined=全ての弾を避ける)
  tankedBulletUntil?: number;
  punishContext?: PunishContext; // GHOST-CMD-2A: 隙の文脈(窓が閉じたらundefinedへ戻る)
  punishMode?: PunishMode;       // GHOST-CMD-2A: その窓で引いたモード('rush'=詰めて叩く)
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
      lastCounterAttemptAt: ghost.lastCounterAttemptAt, meleeIsCounterAttempt: false,
      moveRoll: undefined, dangerSeenAt: undefined, dangerLastAt: undefined, orbitSign: ghost.orbitSign,
      // 弾技のtank記憶は持ち越す(標的が1tick居ないだけで在弾は飛び続けているため。期限で自然に切れる)。
      tankedBulletKey: ghost.tankedBulletKey, tankedBulletUntil: ghost.tankedBulletUntil,
      // GHOST-CMD-2A: 交戦相手が居ない=隙の窓も無い(次に開いた時にまた引く)。
      punishContext: undefined, punishMode: undefined,
    };
  }

  const tcx = target.x + target.width / 2, tcy = target.y + target.height / 2;
  // v0.25.2564: 近接/カウンターの射程は**体の縁**(meleeDist=プレイヤーと同じAABB最近点)で測る。
  // v0.25.2567(監査9-3の是正): 間合い管理(preferredDist)も縁基準。計測側(playerTraits.bossBandDist)が
  // 縁で測っている(設計書§2.6「判定帯への最近点距離」どおり)のに、消費だけ中心間だった単位取り違え
  // =巨体ボスでは「体から60pxの人」が「中心から60px=体内」に立とうとしていた。
  const edgeDist = input.meleeDist(gcx, gcy, target);
  // v0.25.2567(監査9-2の是正): 銃の射程ゲートは**プレイヤーと同じ式**(aimEnemyDist2=裏ボスのみ
  // AABB最近点・他は中心)。プレイヤー側は是正済み(weaponUtils「銃が中心にしか届かない」)なのに
  // 守護霊だけ中心間のままで、ショットガン(120)等は裏ボスの体外から永久に撃てなかった。
  const gunDist = Math.sqrt(aimEnemyDist2(gcx, gcy, target));
  const facing: 1 | -1 = (tcx - gcx) >= 0 ? 1 : -1;

  // G4b(§2.9(4))→§2.18(GHOST-CMD-1): 技への反応。ボスの技(aiPhase/bossState)の立ち上がりで1回だけ
  // 袋から引き、同じ技が続く間は保持する(毎tick振り直さない)。'fallback'(n=0=記録なし・キー未定義=
  // 天使等G4b計測未対応)の間は以降の全分岐が従来挙動(グローバルノブ)のまま=乱数の消費順も従来と同一。
  const moveRoll = rollGhostMoveReaction(ghost.moveRoll, target, profile.moveReactions, nowMs, rand);
  const reaction = moveRoll?.decision;

  // GHOST-BULLET-TECH B: 弾技で'tank'を引いたら、その技の弾を**弾の寿命ぶん**回避対象から外す
  // (技の状態は弾より先に終わるので、状態だけ見ると「撃たれた瞬間だけ避けない」になってしまう)。
  let tankedBulletKey = ghost.tankedBulletKey;
  let tankedBulletUntil = ghost.tankedBulletUntil;
  if (moveRoll?.decision === 'tank' && isProjectileMoveKey(moveRoll.moveKey)) {
    tankedBulletKey = moveRoll.moveKey;
    tankedBulletUntil = nowMs + GHOST_BULLET_TANK_MS;
  } else if (tankedBulletUntil !== undefined && nowMs >= tankedBulletUntil) {
    tankedBulletKey = undefined; tankedBulletUntil = undefined; // 期限切れ=また避ける人へ戻る
  }

  // §2.12追補: オービット(横流れ)の旋回方向。GHOST-CMD-1B: 回避の接線バイアス(避け方向の癖)が
  // 同じ旋回向きを共有するため、回避計算の**前**に確定させる。randの呼び出し順は従来と同一
  // (ロール→旋回初期化→旋回反転→移動リズム→カウンター。この間に乱数を読む処理は無いので、
  // ブロックの位置繰り上げだけでは消費順は1bitも変わらない)。
  let orbitSign: 1 | -1 = ghost.orbitSign ?? (rand() < 0.5 ? 1 : -1);
  if (rand() < GHOST_ORBIT_FLIP_CHANCE) orbitSign = orbitSign === 1 ? -1 : 1;

  // GHOST-CMD-2A(§2.18追補 隙コマンド): 標的の隙(気絶/技後硬直/自分のカウンター成立直後)の窓。
  // 判定は計測側(playerTraits)と**共有の純関数**(punishWindow.ts)=気絶/硬直の判定を発明しない。
  // モードは**文脈が開いた瞬間に1回だけ**2モード袋から引き、窓の間は持ち越す(毎tick引き直さない)。
  // 窓が開いていない時・記録が無い時(=デフォルトの'rush')は rand を1回も消費しない
  // =窓の外の意思決定は従来と1bitも変わらない。
  const punishOpen = punishWindowsOpen(target, gameTime, ghost.lastCounterAtMs, nowMs);
  const punishContext = activePunishContext(punishOpen);
  let punishMode: PunishMode | undefined;
  if (punishContext !== null) {
    punishMode = (punishContext === ghost.punishContext && ghost.punishMode !== undefined)
      ? ghost.punishMode // 同じ窓が続いている=引き直さない(1窓=1引き)
      : drawPunishMode(profile.punish, punishContext, rand);
  }
  // 'rush' = 「詰めて叩く」。'shoot'/窓なしは従来どおり(間合い管理のまま撃つ)。
  const punishRush = punishMode === 'rush';

  // 回避(§2.12「実行は常に本気」=強さは常に1)。既存 dodgeVector + 全ボス予告台帳の差分。
  // v0.25.2547: maxHealth を渡す=接触(体当たり)回避が有効(危険な接触のみ・botSkill既存規格)。
  // GHOST-CMD-1B: 避け方向の癖(円形タグ付き脅威だけ接線へ≤45°回転・決定的)。欠損=従来とビット一致。
  const dodge = ghostDodgeVector(
    gcx, gcy, enemies, projectiles, ghost.maxHealth, input.meleeDist, tankedBulletKey,
    profile.dodgeDir, orbitSign,
  );

  // §2.12(1) 反応遅延 + GHOST-BULLET-TECH A(認知の持続): 「危険」(標的ボスの予告 or 回避対象の脅威)を
  // **エピソード**として持ち回り、計測 reactionMs(100-800clamp)経過して初めて回避を始める。
  // 遅延を払うのは**エピソードにつき1回**で、危険が途切れても GHOST_DANGER_MEMORY_MS は認知を保つ
  // =弾幕の波ごとに盲目窓が再発生しない(初弾は食らうが以降は本気で避ける)。
  const reactionMs = ghostReactionMs(profile.reactionMs);
  const windupNow = isTelegraphActive(target);
  const dangerNow = windupNow || dodge !== null;
  const danger = stepGhostDanger(
    ghost.dangerSeenAt !== undefined ? { seenAt: ghost.dangerSeenAt, lastDangerAt: ghost.dangerLastAt } : undefined,
    dangerNow, nowMs, reactionMs,
  );
  const dangerSeenAt = danger.memory?.seenAt;
  const dangerLastAt = danger.memory?.lastDangerAt;
  const activeDodge = danger.reacted ? dodge : null;

  // カウンター窓の見切り(§2.12・要件6)。**移動より先に**判定する: 見切った後は「詰める/張り付く」を
  // やめて通常の間合い管理へ戻す(旧: 窓が閉じるまで無時限に張り付いて被弾していた)。
  const inMeleeRange = edgeDist <= GHOST_MELEE_RANGE;
  // A-2(社長裁定v0.25.2600): 城ボス系(giantbat)は**狙う表と成立表が食い違っていた**ので揃える。
  //  - 死に予告(その終わりにダメージが無い予告)は狙わない=空振りで近接CDを捨てない。
  //    これだけで飛び掛かり(g-jump-air)や体当たりに振りを回せる(社長報告の主因)。
  //  - 成立表にあるのに近似が拾えていなかった実行フェーズ(g-dash-charge/g-sweep-active)を監視に加える。
  // 他ファミリー(トール/裏3/天使/idol)は近似=成立州で一致しているので**一切変えない**(giantbat限定)。
  const targetIsGiant = target.type === 'giantbat';
  const aimWindup = targetIsGiant && isGiantAimWindup(target.aiPhase);
  const deadWindup = targetIsGiant && isGiantDeadWindup(target.aiPhase);
  // ★カウンター憲法(v0.25.3948・検収監査2巡目(A)): 旧 isBossCounterableNowApprox(語尾=windup/recover)
  // だと、憲法で消えた面成立の窓を**回避をやめて棒立ちで待ち、予告を食らう**。
  // 「今カウンターが成立しうる州」(isCounterOpportunityNow)だけを待つ。溜め中は下の分岐で回避が勝つ。
  // ★判定時置換ミラー(社長裁定2026-08-27「守護霊もプレイヤーの動きに揃える」・GHOST_PARITY_LEDGER.md
  // ★仕様 §構え): 成立が「攻撃の判定が守護霊に触れる瞬間×窓(振り始め+300ms)」になったので、
  // プレイヤーの「赤が消え切る瞬間に押す」を写す——**着弾時刻の分かる予告中**も機会に加え、
  // 振る時刻は着弾からの逆算(下の aimReady・A-2をgiantbat限定から拡張)。
  // ★検収1巡(重2/重3/重5): 対象は総当たりではなく**宣言表(IMPACT_AT_WINDUP_END_BOSS_STATES)の
  // 予告だけ**——「終わりに着弾しない予告での早振り」「消費担当の無いidol/紫レーザーでの棒立ち」
  // 「ACTIVE州の反応遅延の消滅」を全部防ぐ(表の条件=①終了フレームから判定が生きる②消費担当がある)。
  // ★検収2巡(重A): 表は**型ゲート付き**(`type:state`)で引く——'harai-windup'等の州名はミゲルも使うため、
  // 州名だけの一致だと別ボスの(消費担当の無い)予告をすくって棒立ちが戻る(moveReaction.tsと同じ作法)。
  const windupImpactAt = impactAtWindupEnd(target.type, target.bossState)
    ? target.bossStateUntil
    : undefined;
  const counterable = inMeleeRange && !deadWindup
    && (isCounterOpportunityNow(target) || windupImpactAt !== undefined);
  // ★検収2巡(中C): 構えの錨(counterPendingAt)は**州が変わったら張り直す**——予告(突き溜め1100ms)から
  // ACTIVEへ持ち越すと、ACTIVE初フレームで見切り(1000ms超)が立って構えられないまま終わる。
  // 張り直すのは錨(時刻)だけで、willAttempt(抽選)は引き直さない=1機会(同じ技)1回の掟。
  const counterArmKeyNow = target.bossState ?? target.aiPhase;
  // armKey未定義(旧データ/錨だけ渡された盤面)は「同じ州のまま」とみなす=張り直さない(安全側)。
  const pendingAtCarried = ghost.counterPendingAt !== undefined
    && ghost.counterArmKey !== undefined && ghost.counterArmKey !== counterArmKeyNow
    ? nowMs
    : ghost.counterPendingAt;
  // ★検収1巡(重1)→2巡(中C/中D)で是正: 表の予告では「無条件で見切らない」ではなく、
  // **見切りの基準を着弾時刻に置き換える**——着弾までの残りが GHOST_COUNTER_WAIT_MS を超える待ちだけ
  // 見切る(=待ちの上限は復活。bossStateUntilが後退し続ける経路[賞金首KB中]でも無限棒立ちにならない)。
  // 反応遅延型(ACTIVE州)は従来どおり counterPendingAt 起点の見切り。
  const counterGaveUp = counterable && (
    windupImpactAt !== undefined
      ? windupImpactAt - gameTime > GHOST_COUNTER_WAIT_MS
      : ghostCounterWaitExpired(pendingAtCarried, nowMs)
  );
  const counterWatching = counterable && !counterGaveUp;

  // 間合い管理: preferredDist(平時)/+安全マージン(予告中)へ寄せる。
  // §2.12追補(社長裁定v0.25.2534): 静止は「カウンター待ち」以外に存在させない。旧実装で立ち尽くして
  // いた場面(帯内静止・止まり癖tick・tank予告中の棒立ち)は全てボス正対の横流れ(オービット)に置換。
  // (orbitSignの確定はGHOST-CMD-1Bで回避計算の前へ移動=上のブロック。)
  // 接線方向(半径ベクトルの90°回転)×速度倍率。dist≈0ではnormが[0,0]を返す=安全に停止。
  const orbitVec = (frac: number): [number, number] => {
    const [rx, ry] = norm(gcx - tcx, gcy - tcy);
    return [-ry * orbitSign * frac, rx * orbitSign * frac];
  };
  let moveX = 0, moveY = 0;
  if (reaction === 'counter' && !counterGaveUp && (isCounterOpportunityNow(target) || windupImpactAt !== undefined || activeDodge === null)) {
    // ★憲法(v0.25.3948): 機会の無い州(溜め等)で回避すべき脅威があるなら、待たずに回避へ落ちる
    // (旧: 溜め中も静止して存在しない窓を待った)。機会が来たら(実行中)従来どおり詰めて待つ。
    // ★判定時置換ミラー(2026-08-27): 着弾時刻の分かる予告中(windupImpactAt)は機会が**着弾時に存在する**
    // ようになったので、プレイヤーが赤の中で構えるのと同じく待つ(v3948の「存在しない窓」前提が変わった)。
    // G4b 'counter': その技をカウンターしにいく=この技の間は回避せず近接間合いへ詰め、
    // 射程内では静止して窓(counterable)を待つ。リズムのゲートも通さない(「行く」と決めた行動は確実に出す)。
    // ※この静止は§2.12追補でも維持=「カウンター待ちしている」という意味のある静止(窓リング表示つき)。
    if (edgeDist > GHOST_MELEE_RANGE) [moveX, moveY] = norm(tcx - gcx, tcy - gcy);
  } else if (activeDodge && reaction !== 'tank') {
    // G4b 'tank'(苦手の再現): この技に限り回避を抑制=逃げずに戦い続ける(①によりダメージは実際に入る)。
    moveX = activeDodge.x; moveY = activeDodge.y;
  } else if (punishRush) {
    // GHOST-CMD-2A 'rush': 隙が開いている間は**カウンター接近と同じ型**で体の縁(GHOST_MELEE_RANGE=74)
    // まで詰める。移動リズム(mobility/approachPerMin)のゲートは通さない=「行くと決めた」ので確実に詰める。
    // 射程内(else)は詰めるのをやめてその場で振る(攻撃側でmeleeBias抽選を通さず必ずmeleeを出す)。
    // **回避(dodge)は上位のまま**=他の脅威は避けながら詰める(この分岐は回避の下)。
    if (edgeDist > GHOST_MELEE_RANGE) [moveX, moveY] = norm(tcx - gcx, tcy - gcy);
  } else if (input.retrieveTarget) {
    // GHOST-SUBS-FINAL: 自分の落し物(クイックマガジン)を拾いに行く。間合い管理より優先だが、
    // 危険(上の回避)とカウンターには譲る。乱数は消費しない=拾い物が無い時は従来と同一。
    [moveX, moveY] = norm(input.retrieveTarget.x - gcx, input.retrieveTarget.y - gcy);
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
      if (edgeDist > desired + GHOST_MOVE_BAND_PX) {
        // 接近は approachPerMin のリズムに従う(詰めない人はじりじりとしか詰めない)。
        if (mustMove || rand() < ghostApproachChance(profile.approachPerMin)) {
          [moveX, moveY] = norm(tcx - gcx, tcy - gcy);
        } else {
          [moveX, moveY] = orbitVec(GHOST_ORBIT_IDLE_FRAC); // 詰めない人=詰めずに横へ流れる
        }
      } else if (edgeDist < desired - GHOST_MOVE_BAND_PX) {
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
  // GHOST-COUNTER-PARITY(社長指示1「CDを820ms周期へ。プレイヤーのCOUNTER_WINDOW/COUNTER_COOLDOWNを
  // importして足す」): カウンターが成立しうるスイングだけをこの周期で塞ぐ。通常近接(meleeReady=
  // 600ms)はこのゲートの対象外=不変(「通常近接まで遅くしてはいけない」)。
  const counterMeleeReady = ghost.lastCounterAttemptAt === undefined
    || nowMs - ghost.lastCounterAttemptAt >= GHOST_COUNTER_MELEE_PERIOD_MS;

  let action: GhostDecision['action'] = 'none';
  let lastShotAt = ghost.lastShotAt;
  let lastMeleeAt = ghost.lastMeleeAt;
  let counterPendingAt = pendingAtCarried; // ★検収2巡(中C): 州が変わっていれば張り直し済みの錨
  let counterWillAttempt = ghost.counterWillAttempt ?? false;
  let lastCounterAttemptAt = ghost.lastCounterAttemptAt;
  // GHOST-COUNTER-PARITY(社長指示3「意図しないスイングで請求を積まない」): この tick の melee が
  // 「カウンターするつもりの振り」だった時だけ true にする(counterWatching分岐の成立時のみ)。
  let meleeIsCounterAttempt = false;

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
    // A-2(§2.18⑩「実行=ベスト・ゴール逆算」): 着弾予告(その終わりにダメージが出る予告)の間は、
    // 反応遅延で振らずに**着弾の瞬間から逆算**して振る=請求(TTL150ms)が着弾時に生きている状態を作る。
    // 実効先行時間は反応の遅さで決まる決定的な値(乱数を使わない=意思決定の乱数消費順は不変)。
    // 遅い霊ほど早く振ってしまい請求がTTL切れして食らう=個性がそのまま結果に出る。
    // 着弾予告以外(実行中/硬直)は従来どおり反応遅延で振る(隙を叩く挙動は維持)。
    // ★判定時置換ミラー(2026-08-27): 着弾逆算をgiantbat限定(aimWindup)から**着弾時刻の分かる
    // 予告全般**(windupImpactAt)へ一般化。giantbatは従来と同じ式に落ちる(aiPhaseUntil経由)。
    // 逆算はgameTime系で完結・窓の生死はDate.now系で完結(2つの時計を直接比較しない=監査R4)。
    const aimImpactAt = aimWindup && target.aiPhaseUntil !== undefined
      ? target.aiPhaseUntil
      : windupImpactAt;
    const aimReady = aimImpactAt !== undefined
      ? ghostAimSwingNow(
          aimImpactAt - gameTime,
          ghostAimLeadMs(ghostAimSlowness01(reactionMs, GHOST_REACTION_MIN_MS, GHOST_REACTION_MAX_MS)),
        )
      : nowMs - counterPendingAt >= reactionMs;
    if (counterWillAttempt && meleeReady && aimReady && counterMeleeReady) {
      action = 'melee'; lastMeleeAt = nowMs; lastCounterAttemptAt = nowMs;
      counterPendingAt = undefined; counterWillAttempt = false;
      meleeIsCounterAttempt = true;
    }
  } else {
    // 窓が無い、または**見切った**(§2.12: 約1秒待って成立しなければ離脱)。見切りの時は
    // counterPendingAt を残す=同じ窓では二度と構え直さない(窓が閉じた時にだけクリアされる)。
    if (!counterable) counterPendingAt = undefined;
    counterWillAttempt = false;
    // 通常の近接/銃の振り分けはmeleeBias(近接の傾向)で抽選。
    // GHOST-CMD-2A: 隙コマンドで'rush'を引いている間は**meleeBias抽選を通さない**(「行くと決めた」ので
    // 確実に振る)。短絡評価なので rand も消費しない。気絶中の処刑は既存の applyGhostMeleeFinisher 経路
    // (useGameLoopの melee 実行ブロック)がそのまま面倒を見る=ここに処刑の分岐は作らない。
    if (inMeleeRange && meleeReady && (punishRush || rand() < profile.meleeBias)) {
      action = 'melee'; lastMeleeAt = nowMs;
    }
  }
  // 近接を選ばなかった tick は、射程内なら銃で代替する(手を空けない)。
  // ただし**窓を見ている最中(counterWatching)は代替しない**=銃を挟まない(反応遅延で待っている/
  // 抽選に外れた、のどちらでも「その窓には手を出さない」で統一する)。見切った後は通常どおり撃つ。
  // ★検収2巡(軽G): 例外=**表の予告(windupImpactAt)を見ているが「振らない」と抽選済み**の霊は撃つ——
  // 予告は最長1秒超あり、試みない霊まで黙らせるのは今回の対象拡大で新しく生まれた沈黙(ACTIVE州の
  // 従来挙動は不変=振らない霊も従来どおり手を止める)。
  const gunHeldByWatch = counterWatching && (counterWillAttempt || windupImpactAt === undefined);
  if (action === 'none' && !gunHeldByWatch && gunReady && gunDist <= weapon.gunRangePx) {
    action = 'shoot'; lastShotAt = nowMs;
  }

  return {
    moveX, moveY, action, targetId: target.id, facing,
    lastShotAt, lastMeleeAt, counterPendingAt, counterWillAttempt,
    counterArmKey: counterPendingAt !== undefined ? counterArmKeyNow : undefined, // ★検収2巡(中C)
    lastCounterAttemptAt, meleeIsCounterAttempt,
    moveRoll, dangerSeenAt, dangerLastAt, orbitSign, tankedBulletKey, tankedBulletUntil,
    // GHOST-CMD-2A: 隙の文脈とモードを次tickへ持ち越す(窓が閉じたら両方undefined=通常へ戻る)。
    punishContext: punishContext ?? undefined, punishMode,
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
