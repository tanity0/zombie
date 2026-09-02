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
import { COUNTER_WINDOW, COUNTER_COOLDOWN, COUNTER_ACCEPT_MS } from '../store/gameStore';
// research/AI_HUMANIZE.md B3(§4「写す」): マイクロリズム(①〜⑧)の保存形+専用乱数流+バケット→値。
import { type MicroRhythmProfile } from './microRhythm';
import {
  createMicroRandCursor,
  sampleStillMs, sampleSwingIntervalMs, sampleDistPx, sampleOrbitSign, sampleHitReact,
  samplePunishDelayMs, sampleDecisionIntervalMs, synthesizeMicroRhythm,
  // ★B3検収(重大1): 止まりエピソード化の占有率保存(§4①逆算式)。
  meanStillMs, stillStartChance, MICRO_STILL_TICK_MS,
} from './microRhythmReplay';
// research/AI_HUMANIZE.md B2(守護霊再生・§2/§2-7/§2-8): コマ台帳(段1)・族別集計(段2)の消費側。
import {
  isEpisodeKey, TRACKED_SHAPE_KEYS,
  habitPos, unhabitPos, shapeForEpisodeReplay, axisForEpisodeReplay, habitFamilyOfShape,
  edgeDistToRect, HABIT_FAMILY_MIN_N,
  type HabitEpisode, type HabitFamilyKey, type HabitFamilyStat, type CounterReachShape,
} from './habitEpisode';
import type { Rect } from '../world/obstacles';

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
  /**
   * research/AI_HUMANIZE.md B3(§4マイクロリズム=操作の指紋): ①〜⑧の分布。**欠損時は旧来の挙動**
   * (このファイルの各消費箇所は `micro` 未定義なら既存コードのまま=分布なしプロファイルの移動は
   * 現行と一致・§7)。実プレイヤーの実測(playerTraits.PlayerProfile.microRhythm)がそのまま載る他、
   * 幻影(phantomTick.phantomProfile)・固定守護霊/オンラインの遠隔プロファイル(directorTick.ts)は
   * §3の「合成既定分布」(synthesizeMicroRhythm)をここへ明示的に埋めて渡す(decideGhost自身は
   * scalarからの自動合成をしない=分布なしプロファイルのビット同一を壊さないため)。
   */
  microRhythm?: MicroRhythmProfile;
  /**
   * research/AI_HUMANIZE.md B2(§2守護霊再生・段1の材料): B1が録ったコマ台帳
   * (episodeKey→直近10件)。**欠損時は段1を使わない**(§7受け入れ条件3=現行とビット同一)。
   * `PlayerProfile.moveHabits` がそのまま載る(directorTick.ts の effectiveGhostProfile 経路)。
   */
  moveHabits?: Record<string, readonly HabitEpisode[]>;
  /**
   * research/AI_HUMANIZE.md B2(§2-7段2の材料): B1が録った族別集計(band/circle/body)。
   * **欠損時は段2を使わない**。`PlayerProfile.habitFamily` がそのまま載る。
   */
  habitFamily?: Partial<Record<HabitFamilyKey, HabitFamilyStat>>;
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

/**
 * research/AI_HUMANIZE.md B3(§3「合成既定分布」・§18「固定守護霊20体も同じ」): 分布(microRhythm)を
 * 既に持つプロファイルはそのまま返す(実測が最優先=実測主義)。持たない場合だけ、
 * 既存スカラー(stationaryFrac/hitsPerMin/preferredDist)から決定的に合成した既定分布を埋める。
 *
 * ★呼び出しは各消費経路の入口(directorTick.ts=守護霊召喚時の`profile`確定・phantomTick.phantomProfile
 * =幻影)に限定し、`decideGhost`自身では呼ばない——`decideGhost`は`profile.microRhythm`の**有無**だけを
 * 見て分岐するので、ここを経由しない生の`GhostProfile`(既存ghostDriver.test.ts等の直呼び出し)は
 * 従来のコード経路のまま=「分布なしプロファイルの移動は現行と一致」(§7)が保たれる。
 */
export const withSynthesizedMicroRhythm = (profile: GhostProfile): GhostProfile => {
  if (profile.microRhythm) return profile;
  return {
    ...profile,
    microRhythm: synthesizeMicroRhythm(
      profile.stationaryFrac ?? GHOST_DEFAULT_STATIONARY_FRAC,
      profile.hitsPerMin,
      profile.preferredDist,
    ),
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

// ---- research/AI_HUMANIZE.md B2(守護霊再生・§2/§2-7/§2-8。**全て叩き台=実機調整前提**) -------------
/** §2「フォールバック3段」段1のしきい値: その episodeKey のコマが3件以上あれば段1(新設・旧n<3ゲートとは別物)。 */
export const GHOST_HABIT_STAGE1_MIN_N = 3;
/** §2-1「届かなくても発火はする」: 逆写像した目標の縁距離の床(体内目標を作らない)。 */
export const GHOST_HABIT_TARGET_FLOOR_PX = 48;
/** §2-3「振り判断時点(T−500ms)」。 */
export const GHOST_HABIT_SWING_DECIDE_LEAD_MS = 500;
/** §2-1到達後の静止判定に使うデッドバンド(§4オーバーシュートのデッドバンド±6pxと同型の考え方)。 */
export const GHOST_HABIT_ARRIVE_PX = 10;

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
 * ★検収是正(軽5・実態合わせ): B3以降、この戻り値は毎tick抽選だけでなく、①(止まりの長さ)分布
 * 保持者の「止まりエピソード占有率」の**保存目標(targetOcc)**としても使われる
 * (decideGhost内・microRhythmReplay.stillStartChance)。分布が無ければ従来どおり毎tick抽選のまま。
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
 *
 * `excludeTelegraphFor`(省略可能・research/AI_HUMANIZE.md B2 §2-1「回避外しの実仕組み」・
 * 検収是正#4で州単位へ拡張): 段1/段2の位置取り中、対象敵×**対象州だけ**の予告回避
 * (base側のtelegraphDodge**と**全ボス予告台帳の差分の両方)を抑止する(敵が同時に出している
 * 別州のハザードは従来どおり避ける)。呼ぶと抑止したい技キー(`e.aiPhase`/`e.bossState`の値)を
 * 返す関数(抑止しないなら`undefined`)。**省略時は従来と1bit同じ**。
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
  excludeTelegraphFor?: (e: Enemy) => string | undefined,
): { x: number; y: number } | null => {
  const seen = tankedBulletKey === undefined
    ? projectiles
    : projectiles.filter(p => p.srcMoveKey !== tankedBulletKey);
  // v0.25.2547(社長裁定「オンにして」): 接触(体当たり)回避を有効化。maxHealth を渡すと
  // botSkill の既存規格(接触ダメージ >= 最大HPの CONTACT_DANGER_HP_FRAC(20%) の敵が
  // DODGE_CONTACT_DIST(260px) 以内 → 離れる)がそのまま効く=**雑魚向けの規格として維持**。
  // 0を渡すと従来どおり無効(テストの明示用)。
  const base = dodgeVector(GHOST_DODGE_PROFILE, gcx, gcy, enemies, seen, maxHealth, excludeTelegraphFor);
  // base は合成済みの単位ベクトル(強さ1)。差分の脅威は自分の weight(0..1)で足す。
  let sx = base ? base.x : 0, sy = base ? base.y : 0;
  // GHOST-CMD-1B: 接線回転の角度(決定的・randなし)。0なら従来の合成式に1bitも触れない。
  const theta = Math.min(GHOST_DODGE_DIR_MAX_RAD, GHOST_DODGE_DIR_MAX_RAD * ghostDodgeLateralFrac(dodgeDir));
  for (const e of enemies) {
    const extras: GhostDodgeThreat[] = ghostExtraTelegraphDodge(gcx, gcy, e, excludeTelegraphFor?.(e));
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
  // ---- research/AI_HUMANIZE.md B3(§4マイクロリズムの写し。全て`profile.microRhythm`保持者のみ使う) ----
  /** ⑥入力: 自分(守護霊/幻影)の直近被弾打刻(gameTime基準)。呼び出し側がSummon.lastHit/Enemy.lastHitを渡す。 */
  lastHit?: number;
  /** ⑤入力: 自分の現在HP割合(0..1)。省略時は⑤(ピンチ間合い)を判定しない=③のまま。 */
  hpFrac01?: number;
  /** 専用乱数流の消費カーソル(mrand。次tickへ持ち越す)。 */
  microDrawIndex?: number;
  /** ①止まりの長さ: 現在のアイドル(強制静止)エピソードの終了時刻(gameTime)。 */
  microIdleUntil?: number;
  /** ②攻撃間隔: 直近に③分布から引いた通常近接CD(ms)。undefined=既定のGHOST_MELEE_COOLDOWN_MSのまま。 */
  microMeleeCooldownMs?: number;
  /** ③⑤間合い: 直近に分布から引いたpreferredDist(px)。undefined=profile.preferredDistのまま。 */
  microDrawnDist?: number;
  /** ③⑤間合い: 上の抽選をいつ引いたかの識別子(技キー+ピンチ帯)。変化したら引き直す。 */
  microDrawnDistSig?: string;
  /** ④回り方の利き: 分布からの再抽選タイマー(gameTime)。 */
  microOrbitRedrawAt?: number;
  /** ⑥被弾直後の反応: 引いたモード(0=下がる/1=固まる/2=殴り返す)+有効期限(gameTime)。 */
  microHitReactMode?: 0 | 1 | 2;
  microHitReactUntil?: number;
  /** ⑥のエッジ検知用(前tickで見た`lastHit`値)。 */
  microHitReactAnchor?: number;
  /** ⑦硬直パニッシュの速さ: recover窓が開いた時に引いた「発動遅延」の期限(nowMs)。 */
  microPunishDelayUntil?: number;
  /** ⑧判断の間隔: 凍結中の移動モード+その有効期限(nowMs)。 */
  microDecisionMode?: 'approach' | 'retreat' | 'orbit-base' | 'orbit-tank' | 'orbit-idle';
  microDecisionUntil?: number;
  // ---- research/AI_HUMANIZE.md B2(§2守護霊再生。段1/段2適用時のみ使う。次tickへ持ち越す) ----
  /** §2-1位置取りの目標(世界座標)。§4⑧の判断間隔(microDecisionUntilを共有)で再評価する。 */
  microHabitTargetX?: number;
  microHabitTargetY?: number;
  /** §2-8確定事項#4(A6): T(着弾時刻)を構え開始で凍結した値(gameTime)。 */
  microHabitTFrozen?: number;
  /** §2-3: T-500ms時点で確定した「振り始め」(gameTime)。振らないと決まった機会はundefinedのまま。 */
  microHabitSwingAt?: number;
  /** §2-3の振り判断(T-500ms到達→コマ選択)が済んだか。済むまでcounterWillAttemptは暫定true(§2-8確定事項#3=沈黙させない)。 */
  microHabitResolved?: boolean;
  /** §2-3「その召喚中にこの州を見た回数」(episodeKey→カウンタ・20でカンスト=記録側と同じ床)。 */
  microHabitSeqCounts?: Readonly<Record<string, number>>;
  /** どのepisodeKeyについて位置取り目標/凍結Tをキャッシュしているか(§2-1新しい機会の検知に使う。counterArmKeyとは別枠=counterWatching開始前の早期位置取り#13にも対応)。 */
  microHabitArmKey?: string;
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
  /**
   * research/AI_HUMANIZE.md B3(§4「専用乱数流」・シード=召喚id/敵id): マイクロリズムの抽選専用の
   * シード(呼び出し側が`hashSeed(自分のid)`で作る)。既存`rand`とは別系統で、既存randの消費順は
   * 一切変えない(§7-4)。省略時は0(=`profile.microRhythm`が無ければどのみち使われない)。
   */
  microSeed?: number;
  /**
   * research/AI_HUMANIZE.md B2 §2-8確定事項#8(A11): 刀装備の霊(katana/murasame)は段1の**位置取りだけ**
   * 適用しない(成立時に154pxダッシュして構えた位置を捨てるため。タイミング§2-3は適用する)。
   * store依存の判定(isKatanaMode)なので呼び出し側が注入する(meleeDistと同じ作法)。省略時=false。
   */
  isKatanaEquipped?: boolean;
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
  // ---- research/AI_HUMANIZE.md B3(§4マイクロリズムの写し。GhostSelfと同じ意味・次tickへ持ち越す) ----
  microDrawIndex?: number;
  microIdleUntil?: number;
  microMeleeCooldownMs?: number;
  microDrawnDist?: number;
  microDrawnDistSig?: string;
  microOrbitRedrawAt?: number;
  microHitReactMode?: 0 | 1 | 2;
  microHitReactUntil?: number;
  microHitReactAnchor?: number;
  microPunishDelayUntil?: number;
  microDecisionMode?: 'approach' | 'retreat' | 'orbit-base' | 'orbit-tank' | 'orbit-idle';
  microDecisionUntil?: number;
  // ---- research/AI_HUMANIZE.md B2(§2守護霊再生。GhostSelfと同じ意味・次tickへ持ち越す) ----
  microHabitTargetX?: number;
  microHabitTargetY?: number;
  microHabitTFrozen?: number;
  microHabitSwingAt?: number;
  microHabitResolved?: boolean;
  microHabitSeqCounts?: Readonly<Record<string, number>>;
  microHabitArmKey?: string;
}

/** ④回り方の利きの再抽選タイマー(叩き台=旧`GHOST_ORBIT_FLIP_CHANCE`の平均反転間隔@60fpsに寄せる)。 */
export const MICRO_ORBIT_REDRAW_MS = 1 / GHOST_ORBIT_FLIP_CHANCE * (1000 / 60); // ≈4170ms

// =================================================================================================
// research/AI_HUMANIZE.md B2(守護霊再生) — 純関数ヘルパ
// =================================================================================================
/** コマの保存型(0..200/-100..100の整数)を habitPos と同じ実数(0..2/-1..1)へ戻す。 */
const dequantizeHabit = (v: number): number => v / 100;

/** その episodeKey が段1(コマ≥3)か・段2(族の累計≥5)か・段3(現行モデル)かを決める(§2フォールバック3段)。
 * `familyKey` は現在の図形から導いた族(band/circle/body)。図形が無い(=EPISODE_KEYS外)場合は常に段3。 */
export type HabitStage = 1 | 2 | 3;
export const resolveHabitStage = (
  profile: GhostProfile, episodeKey: string, familyKey: HabitFamilyKey | null,
): HabitStage => {
  const episodes = profile.moveHabits?.[episodeKey];
  if (episodes && episodes.length >= GHOST_HABIT_STAGE1_MIN_N) return 1;
  if (familyKey) {
    const stat = profile.habitFamily?.[familyKey];
    if (stat && stat.n >= HABIT_FAMILY_MIN_N) return 2;
  }
  return 3;
};

/** §2-1位置選択の距離(社長裁定「位置は選択に使わない」=posA/posBを見ない・seq/ctxのみ)。 */
const habitPositionDist = (
  ep: Pick<HabitEpisode, 'seq' | 'ctxHp' | 'ctxHit'>, seq: number, ctxHp: 0 | 1, ctxHit: 0 | 1,
): number =>
  0.25 * Math.min(Math.abs(ep.seq - seq), 2) / 2 + 0.5 * Math.abs(ep.ctxHp - ctxHp) + 0.5 * Math.abs(ep.ctxHit - ctxHit);

/**
 * §2-1: 位置取り=seq/ctxの最近傍1件を引く。**裁定済み#7=(a)**: 同距離のコマが複数あれば
 * 専用乱数流(`mrand`)で1件を選ぶ(実在コマのみ=座標・時刻を発明しない)。
 */
export const pickHabitPositionEpisode = (
  episodes: readonly HabitEpisode[], seq: number, ctxHp: 0 | 1, ctxHit: 0 | 1, mrand: () => number,
): HabitEpisode | null => {
  if (episodes.length === 0) return null;
  let best = Infinity;
  let tied: HabitEpisode[] = [];
  for (const ep of episodes) {
    const d = habitPositionDist(ep, seq, ctxHp, ctxHit);
    if (d < best - 1e-9) { best = d; tied = [ep]; }
    else if (d <= best + 1e-9) tied.push(ep);
  }
  if (tied.length <= 1) return tied[0] ?? null;
  const idx = Math.min(tied.length - 1, Math.max(0, Math.floor(mrand() * tied.length)));
  return tied[idx];
};

/**
 * §2-3: 振り=実位置の最近傍コマの押下時刻。距離は図形ローカル位置(posA/posB/sub)+seq/ctx
 * (設計書の式どおり)。タイ崩しの規定は無い=配列の先頭(決定的・追加のrandを消費しない)。
 */
export const pickHabitSwingEpisode = (
  episodes: readonly HabitEpisode[], posA: number, posB: number, sub: number,
  seq: number, ctxHp: 0 | 1, ctxHit: 0 | 1,
): HabitEpisode | null => {
  if (episodes.length === 0) return null;
  let best = Infinity, bestEp: HabitEpisode | null = null;
  for (const ep of episodes) {
    const d = Math.abs(dequantizeHabit(ep.posA) - posA) + Math.abs(dequantizeHabit(ep.posB) - posB)
      + (ep.sub !== sub ? 1 : 0)
      + 0.5 * Math.abs(ep.ctxHp - ctxHp) + 0.5 * Math.abs(ep.ctxHit - ctxHit)
      + 0.25 * Math.min(Math.abs(ep.seq - seq), 2) / 2;
    if (d < best) { best = d; bestEp = ep; }
  }
  return bestEp;
};

/**
 * §2-1: コマ(段1)/族平均(段2)の(posA,posB,sub)を、いま実際にその技が張っている図形へ逆写像し、
 * 世界座標の移動目標を返す。**48pxを床にクランプ**(体内目標を作らない)。
 * `ghostX/Y` は軸退化州(§2-8確定事項#7=A10)で「今の角度を保つ」ための基準点。
 * `shape.kind==='none'`(紫)は対象外=null。
 */
export const habitPositionTarget = (
  shape: CounterReachShape,
  axis: { fromX: number; fromY: number; toX: number; toY: number },
  bossRect: Rect,
  posA: number, posB: number, sub: number,
  ghostX: number, ghostY: number,
): { x: number; y: number } | null => {
  if (shape.kind === 'none') return null;
  let cx: number, cy: number;
  if (shape.kind === 'band') { cx = ghostX; cy = ghostY; } // band分岐では軸・中心は未使用(habitPos/unhabitPosと同型)
  else if (shape.kind === 'body') { cx = bossRect.x + bossRect.width / 2; cy = bossRect.y + bossRect.height / 2; }
  else { cx = shape.cx; cy = shape.cy; }
  const currentAngle = Math.atan2(ghostY - cy, ghostX - cx);
  const raw = unhabitPos(shape, posA, posB, sub, axis.fromX, axis.fromY, axis.toX, axis.toY, bossRect, currentAngle);
  if (raw === null) return null;
  const edge = edgeDistToRect(raw.x, raw.y, bossRect);
  if (edge >= GHOST_HABIT_TARGET_FLOOR_PX) return raw;
  const bcx = bossRect.x + bossRect.width / 2, bcy = bossRect.y + bossRect.height / 2;
  let [dx, dy] = norm(raw.x - bcx, raw.y - bcy);
  // ボス中心と一致(押し出す向きが無い・posA=0の稀な退化)=霊の現在位置基準の方向へ逃がす(より頑健な予備)。
  if (dx === 0 && dy === 0) [dx, dy] = norm(ghostX - bcx, ghostY - bcy);
  if (dx === 0 && dy === 0) return raw; // それでも定まらない(霊もボス中心)=安全側でそのまま返す
  const push = GHOST_HABIT_TARGET_FLOOR_PX - edge;
  return { x: raw.x + dx * push, y: raw.y + dy * push };
};

/**
 * §8裁定済み#16(社長裁定2026-09-02=(a)・打刻を押下基準へ正規化。旧§2-8確定事項#1=A1を置き換え):
 * 記録の`pressOfs`は**記録側(habitEpisode.ts/gameStore.ts)で経路ごとの前隙を引いた「実際の押下」**の
 * 打刻(HABIT_EPISODE_FORMAT_VERSIONで意味を保証=旧版のコマは読み込み時に捨てる)。よって再生は
 * `T + pressOfs`にそのまま置く(**再生側で減算しない**)。`pressOfs===null`はnull(§2-8確定事項#2=A2: 振らない)。
 */
export const habitSwingAtFromPressOfs = (T: number, pressOfs: number | null): number | null =>
  pressOfs === null ? null : T + pressOfs;

/**
 * §8裁定済み#17(社長裁定2026-09-02=(b)「窓が着弾Tを覆えない記録では振らない」):
 * 実際に振る時刻(`swingAt`)から開くカウンター窓(`[swingAt, swingAt+COUNTER_ACCEPT_MS]`)が
 * 着弾 T を覆うか。段1/段2の振りは**この式で毎回判定**する——記録の`pressOfs`が
 * `[-COUNTER_ACCEPT_MS, 0]`の外(=通常の振りが紛れ込んだコマ)だけでなく、CD待ちで遅れて振る
 * 場合(§2-3「計算した振り始めが過ぎていたら即振る」)に**遅れすぎて窓がTを通り過ぎた**ケースも
 * 同じ式1本で弾く(=手写しの重複判定を作らない)。窓300ms=COUNTER_ACCEPT_MSは台帳からimport
 * (数値を書かない)。時計はgameTime側で完結(呼び出し側もswingAt/TともgameTime系のみを渡すこと)。
 */
export const habitSwingWindowCoversT = (swingAt: number, T: number): boolean =>
  swingAt <= T && T <= swingAt + COUNTER_ACCEPT_MS;

/** 毎tick1回呼ぶ純関数。次tickへ持ち越す自己状態(lastShotAt等)も戻り値に含めて返す。 */
export const decideGhost = (input: GhostDriverInput): GhostDecision => {
  const { ghost, player, enemies, projectiles, profile, weapon, gameTime, nowMs } = input;
  const rand = input.rand ?? Math.random;
  // ★AI_HUMANIZE.md B3(§4マイクロリズム): profile.microRhythm が無ければ以下は全て素通り
  // (micro===undefinedの分岐は元のコードのまま=分布なしプロファイルの移動は現行とビット同一)。
  const micro = profile.microRhythm;
  const microSeed = input.microSeed ?? 0;
  // ★検収是正(軽2): microが無いプロファイル(大多数)ではカーソル(mulberry32の閉包)自体を作らない。
  // 戻り値のmicroDrawIndexはindexを素通りさせるだけの軽量オブジェクトで足りる。
  // ★記述の訂正(検収是正・記述と実態の食い違い): 「mrandはどのみち呼ばれない」は誤り——
  // micro(profile.microRhythm)の有無とは無関係に、**段1のタイ崩し**(pickHabitPositionEpisode)と
  // **段2の押下率抽選**(pressRatePct)がmrandを呼ぶ(profile.moveHabits/habitFamilyがあれば発火する)。
  // microが無い間はダミーカーソル(常に0を返す)なので、呼ばれても決定的な0を返すだけで安全
  // (microRhythm由来の抽選消費順を汚さない、という当初の意図は保たれている)。
  const microCursor = micro
    ? createMicroRandCursor(microSeed, ghost.microDrawIndex ?? 0)
    : { rand: () => 0, nextIndex: () => ghost.microDrawIndex ?? 0 };
  const mrand = microCursor.rand;
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
    // ★検収是正(軽3): ⑥被弾直後モードの期限失効判定を無標的経路にも適用する(本線=行769以降の
    // `if (gameTime >= microHitReactUntil) microHitReactMode = undefined;` と同じ判定。ここでだけ
    // 素通しすると、標的が1tickだけ消えた間だけ期限切れのモードがそのまま持ち越される)。
    const hitReactExpired = ghost.microHitReactUntil !== undefined && gameTime >= ghost.microHitReactUntil;
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
      // ★AI_HUMANIZE.md B3: マイクロリズムの持ち越し状態(交戦対象が1tick居ないだけなので消さない。
      // drawIndexだけ進めておく=専用流の消費順を保つ)。
      microDrawIndex: microCursor.nextIndex(), microIdleUntil: ghost.microIdleUntil,
      microMeleeCooldownMs: ghost.microMeleeCooldownMs, microDrawnDist: ghost.microDrawnDist,
      microDrawnDistSig: ghost.microDrawnDistSig, microOrbitRedrawAt: ghost.microOrbitRedrawAt,
      microHitReactMode: hitReactExpired ? undefined : ghost.microHitReactMode,
      microHitReactUntil: ghost.microHitReactUntil,
      microHitReactAnchor: ghost.microHitReactAnchor, microPunishDelayUntil: ghost.microPunishDelayUntil,
      microDecisionMode: ghost.microDecisionMode, microDecisionUntil: ghost.microDecisionUntil,
      // AI_HUMANIZE.md B2: 標的なし=監視も無い(位置取り目標/凍結T/振り解決は消す)。
      // 累計seqカウンタ(microHabitSeqCounts)は召喚中を通じた記録なので持ち越す。
      microHabitTargetX: undefined, microHabitTargetY: undefined,
      microHabitTFrozen: undefined, microHabitSwingAt: undefined, microHabitResolved: undefined,
      microHabitSeqCounts: ghost.microHabitSeqCounts, microHabitArmKey: undefined,
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
  if (rand() < GHOST_ORBIT_FLIP_CHANCE) orbitSign = orbitSign === 1 ? -1 : 1; // ④の写し: 既存rand消費は「引いて捨てる」(消費順不変)
  // ★AI_HUMANIZE.md B3(§4④の写し): 分布保持者は専用流で旋回向きを引き直す(既存反転抽選の結果は使わない)。
  // 再抽選の頻度は旧来の平均反転間隔(GHOST_ORBIT_FLIP_CHANCE@60fps ≈4.2秒に1回)へ寄せる=挙動の質感を保つ。
  let microOrbitRedrawAt = ghost.microOrbitRedrawAt ?? 0;
  if (micro?.orbit && gameTime >= microOrbitRedrawAt) {
    orbitSign = sampleOrbitSign(micro.orbit, mrand);
    microOrbitRedrawAt = gameTime + MICRO_ORBIT_REDRAW_MS;
  }

  // ★AI_HUMANIZE.md B3(§4⑥の写し): 自分(守護霊/幻影)が被弾した直後1秒の反応。エッジ検知は
  // `ghost.lastHit`(gameTime基準)の変化。窓の間は「下がる/固まる/殴り返す」のモードを持ち越す。
  let microHitReactMode = ghost.microHitReactMode;
  let microHitReactUntil = ghost.microHitReactUntil ?? 0;
  const microHitReactAnchor = ghost.lastHit;
  if (micro?.hitReact && ghost.lastHit !== undefined
    && ghost.lastHit > 0 && ghost.lastHit !== ghost.microHitReactAnchor) {
    microHitReactMode = sampleHitReact(micro.hitReact, mrand);
    microHitReactUntil = gameTime + 1000; // 叩き台=microRhythm.HIT_REACT_WINDOW_MSと同じ(録りと揃える)
  }
  if (gameTime >= microHitReactUntil) microHitReactMode = undefined;

  // ★AI_HUMANIZE.md B3(§4③⑤⑧の写し): 次tickへ持ち越す状態(移動判断の凍結・止まりエピソード・
  // 抽選済みの間合い)。移動ブロック本体で読み書きし、最後に戻り値へ積む。
  let microIdleUntil = ghost.microIdleUntil ?? 0;
  let microDrawnDist = ghost.microDrawnDist;
  let microDrawnDistSig = ghost.microDrawnDistSig;
  let microDecisionMode = ghost.microDecisionMode;
  let microDecisionUntil = ghost.microDecisionUntil ?? 0;
  let microMeleeCooldownMs = ghost.microMeleeCooldownMs;
  // AI_HUMANIZE.md B2(§2守護霊再生): 位置取りの目標キャッシュ+振り解決の凍結状態。
  // 「新しい機会が始まった」(pendingAtCarried===undefined)の判定は下のcounterWatchingブロックの
  // 前に確定するので、そこでまとめてリセットする(移動ブロックより前=移動が古い目標を読まない)。
  let microHabitTargetX = ghost.microHabitTargetX;
  let microHabitTargetY = ghost.microHabitTargetY;
  let microHabitTFrozen = ghost.microHabitTFrozen;
  let microHabitSwingAt = ghost.microHabitSwingAt;
  let microHabitResolved = ghost.microHabitResolved;
  let microHabitSeqCounts = ghost.microHabitSeqCounts;
  let microHabitArmKey = ghost.microHabitArmKey;

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
  // ★AI_HUMANIZE.md B3(§4⑦の写し): recover文脈の窓が**新しく**開いた瞬間だけ、⑦分布から
  // 「発動遅延」msを引く(既存punishRushの発動遅延として掛ける・rush/shootの選択自体は上のまま不変)。
  let microPunishDelayUntil = ghost.microPunishDelayUntil ?? 0;
  if (micro?.punishRecoverSpeed && punishContext === 'recover' && punishContext !== ghost.punishContext) {
    microPunishDelayUntil = nowMs + samplePunishDelayMs(micro.punishRecoverSpeed, mrand);
  } else if (punishContext !== 'recover') {
    microPunishDelayUntil = 0;
  }
  // 'rush' = 「詰めて叩く」。'shoot'/窓なしは従来どおり(間合い管理のまま撃つ)。⑦の遅延中はまだ詰めない。
  const punishRush = punishMode === 'rush' && nowMs >= microPunishDelayUntil;

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
  // ★v0.25.3982(実測ログで確定・社長スクショ2026-08-27): 城ボス(giantbat)の着弾予告
  // (GIANT_IMPACT_AT_WINDUP_END=aiPhase基準の既存表)も**同じ値に畳む**——v3979の距離ゲート撤廃を
  // 宣言表(bossState基準)にだけ適用し、城ボスの表が漏れていた(監視がg-dash-charge=密着になる技
  // でしか始まらず、g-stomp/g-trishot/g-bolt等の予告は請求ゼロでゾーン被弾するだけだった)。
  // 消費側は爆風パリィ(blast)と弾反射(窓)が元から居る=構え側だけの写し漏れ。
  const windupImpactAt = impactAtWindupEnd(target.type, target.bossState)
    ? target.bossStateUntil
    : (aimWindup ? target.aiPhaseUntil : undefined);
  // ★社長報告2026-08-27「やはり守護霊はカウンターを取ってない」(v0.25.3979): 表の予告中の構えを
  // **近接間合い(74px)でゲートしない**——守護霊は普段 preferredDist(180〜300px)で立つため、
  // 帯・円(リーチ170〜310px)の**成立域の中に居ても構えが一度も始まらなかった**(請求ゼロ)。
  // プレイヤーは帯の中なら距離に関係なく押して取れる=写し間違い。位置の真実は消費側の図形判定が
  // 持っている(圏外の構えは空振りするだけ=誤爆しない)。実行州(ACTIVE)の監視は従来どおり74px。
  const counterable = !deadWindup
    && ((inMeleeRange && isCounterOpportunityNow(target)) || windupImpactAt !== undefined);
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

  // ---- research/AI_HUMANIZE.md B2(§2/§2-7/§2-8): この機会のhabitKey/図形/軸/族/段 ----
  // 対象はEPISODE_KEYS(コマ台帳34州)のみ。それ以外(idol等)は常に段3=現行モデル(ビット同一・§7受け入れ条件3)。
  const habitKey = counterArmKeyNow !== undefined ? `${target.type}:${counterArmKeyNow}` : null;
  const habitShape: CounterReachShape | null = habitKey !== null && counterArmKeyNow !== undefined && isEpisodeKey(habitKey)
    ? shapeForEpisodeReplay(target.type, counterArmKeyNow, target) : null;
  const habitAxis = habitShape !== null && counterArmKeyNow !== undefined
    ? axisForEpisodeReplay(target.type, counterArmKeyNow, target) : null;
  const habitFamilyKey: HabitFamilyKey | null = habitShape !== null ? habitFamilyOfShape(habitShape) : null;
  const habitStage: HabitStage = (habitKey !== null && habitShape !== null && habitShape.kind !== 'none')
    ? resolveHabitStage(profile, habitKey, habitFamilyKey)
    : 3;
  // §2-8確定事項#8(A11): 刀装備の霊は位置取りだけ適用しない(タイミング§2-3は適用する)。
  // §1-2: 毎フレーム狙い直す図形の州(TRACKED_SHAPE_KEYS=thor:tsuki-windup)は位置取りの対象外。
  const habitPositionApplies = habitStage !== 3 && habitShape !== null && habitShape.kind !== 'none'
    && !input.isKatanaEquipped && !(habitKey !== null && TRACKED_SHAPE_KEYS.includes(habitKey));
  // §2-8確定事項#13(社長裁定2026-09-02=(a)): 段1の位置取りだけ、counterWatching(残り1000ms)を
  // 待たず予告の立ち上がりから始める(振りの判断・窓・請求・判定には触れない)。
  const habitEarlyPositionOk = habitStage === 1 && habitPositionApplies;
  // 「新しい機会が始まった」の検知(counterArmKey/counterPendingAtとは別枠=habitEarlyPositionOkで
  // counterWatchingより前から位置取りが動くため、専用のアーム鍵で管理する)。
  const habitArmKeyNext = (habitKey !== null && habitShape !== null && habitShape.kind !== 'none') ? habitKey : undefined;
  const habitNewArm = habitArmKeyNext !== undefined && habitArmKeyNext !== ghost.microHabitArmKey;
  microHabitArmKey = habitArmKeyNext;
  if (habitNewArm) {
    microHabitTargetX = undefined; microHabitTargetY = undefined;
    // §2-8確定事項#4(A6): T(着弾時刻)は構え開始で凍結する(bossStateUntil/aiPhaseUntilの生値は
    // 後退しうる=賞金首KB中)。episodeKey州はwindupImpactAtが必ず定義済み(EPISODE_KEYSは
    // IMPACT_AT_WINDUP_END_BOSS_STATES/GIANT_IMPACT_AT_WINDUP_ENDの部分集合そのもの)。
    microHabitTFrozen = windupImpactAt;
    microHabitSwingAt = undefined; microHabitResolved = false;
    const prevSeq = microHabitSeqCounts?.[habitArmKeyNext] ?? 0;
    microHabitSeqCounts = { ...(microHabitSeqCounts ?? {}), [habitArmKeyNext]: Math.min(20, prevSeq + 1) };
  }

  // research/AI_HUMANIZE.md B2 §2-1「回避外しの実仕組み」: 段1/段2の位置取りが対象にする敵×州だけ、
  // その予告回避を抑止する。★検収是正#3: 独自の「早取り」判定は持たない——上で確定済みの
  // habitPositionApplies/habitEarlyPositionOk/counterGaveUp(=下の位置取り分岐と**全く同じ式**)を
  // そのまま使う。旧実装は段1・段2のどちらも予告の立ち上がりから抑止していたが、実際に位置取りが
  // 動くのは段1だけ早く(habitEarlyPositionOk)・段2はcounterWatchingが立ってから(!counterGaveUp)
  // なので、段2は「見切っていない」間だけ抑止する(旧実装は段2の空白=避けもせず寄りもしない時間を
  // 作っていた)。katana装備の霊・軸を毎フレーム追う州(TRACKED_SHAPE_KEYS)はhabitPositionAppliesが
  // falseになる=位置取り自体を行わないので抑止もしない(従来どおり)。
  // ★検収是正#4: 敵まるごとではなく**その州(moveKey=bossState/aiPhase)だけ**を落とす
  // (三連射の三拍目・滑空の二撃目・床など、同時進行の別ハザードは従来どおり避け続ける)。
  const habitDodgeExcludeMoveKey = (habitPositionApplies && (habitEarlyPositionOk || !counterGaveUp)
    && counterArmKeyNow !== undefined)
    ? { targetId: target.id, moveKey: counterArmKeyNow }
    : null;
  const habitDodgeExcludeFor = habitDodgeExcludeMoveKey !== null
    ? (e: Enemy): string | undefined =>
      (e.id === habitDodgeExcludeMoveKey.targetId ? habitDodgeExcludeMoveKey.moveKey : undefined)
    : undefined;
  // 回避(§2.12「実行は常に本気」=強さは常に1)。既存 dodgeVector + 全ボス予告台帳の差分。
  // v0.25.2547: maxHealth を渡す=接触(体当たり)回避が有効(危険な接触のみ・botSkill既存規格)。
  // GHOST-CMD-1B: 避け方向の癖(円形タグ付き脅威だけ接線へ≤45°回転・決定的)。欠損=従来とビット一致。
  const dodge = ghostDodgeVector(
    gcx, gcy, enemies, projectiles, ghost.maxHealth, input.meleeDist, tankedBulletKey,
    profile.dodgeDir, orbitSign,
    habitDodgeExcludeFor,
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
  // ★研究書§2-1「移動分岐の入り方」v5是正(増分監査#4/#5): 段1/段2適用州では**袋ロール(reaction)の
  // 移動分岐を使わず**、専用の「習慣位置分岐」に置き換える(現行の reaction==='counter' 分岐とは別)。
  // 分岐の中でactiveDodge(敵弾等)が非nullなら回避を優先し、それ以外は習慣位置へ寄る——dodge/tankロールでも
  // 同じ(「この技を避ける人」の再現は、遠い位置+pressOfs=nullのコマ自体が担う=ロールで二重にしない)。
  // §2-8確定事項#13(社長裁定2026-09-02=(a)): 段1の位置取りだけ counterWatching(残り1000ms)を待たず
  // 予告の立ち上がりから始める(habitEarlyPositionOk)。段2は従来どおり counterGaveUp が明けてから。
  if (habitPositionApplies && (habitEarlyPositionOk || !counterGaveUp) && habitShape && habitAxis) {
    if (activeDodge) {
      moveX = activeDodge.x; moveY = activeDodge.y;
    } else {
      // research/AI_HUMANIZE.md B2 §2-1: 段1(コマ)/段2(族平均)の位置取り。目標は§4⑧の判断間隔
      // (micro.decisionInterval・microDecisionUntil)で再評価する(毎tickではない)。
      const bossRectNow: Rect = { x: target.x, y: target.y, width: target.width, height: target.height };
      const habitKeyNow = habitKey as string;
      const needsHabitPick = microHabitTargetX === undefined
        || (micro?.decisionInterval ? nowMs >= microDecisionUntil : true);
      if (needsHabitPick) {
        const ctxHpNow: 0 | 1 = ghost.hpFrac01 !== undefined && ghost.hpFrac01 <= 0.3 ? 1 : 0;
        // ★記述の訂正(監査C): Summon.lastHitはDate.now基準(設計書が正)。ctxHitの2秒はnowMs側で
        // 測る(記録側=gameTime基準2秒とは別物。§2-3「時計を跨がない」)。
        const ctxHitNow: 0 | 1 = ghost.lastHit !== undefined && ghost.lastHit > 0
          && nowMs - ghost.lastHit <= 2000 ? 1 : 0;
        const seqNow = Math.min(20, microHabitSeqCounts?.[habitKeyNow] ?? 0);
        let picked: { posA: number; posB: number; sub: number } | null = null;
        if (habitStage === 1) {
          const episodes = profile.moveHabits?.[habitKeyNow] ?? [];
          const ep = pickHabitPositionEpisode(episodes, seqNow, ctxHpNow, ctxHitNow, mrand);
          if (ep) picked = { posA: ep.posA / 100, posB: ep.posB / 100, sub: ep.sub };
        } else if (habitStage === 2 && habitFamilyKey) {
          const stat = profile.habitFamily?.[habitFamilyKey];
          if (stat) picked = { posA: stat.avgPosA / 100, posB: stat.avgPosB / 100, sub: 0 };
        }
        if (picked) {
          const pt = habitPositionTarget(habitShape, habitAxis, bossRectNow, picked.posA, picked.posB, picked.sub, gcx, gcy);
          if (pt) { microHabitTargetX = pt.x; microHabitTargetY = pt.y; }
        }
        if (micro?.decisionInterval) {
          microDecisionUntil = nowMs + sampleDecisionIntervalMs(micro.decisionInterval, mrand) + reactionMs;
        }
      }
      if (microHabitTargetX !== undefined && microHabitTargetY !== undefined) {
        const hdx = microHabitTargetX - gcx, hdy = microHabitTargetY - gcy;
        // §2-1「到達後は静止してよい」: デッドバンド内なら静止(=完全停止=カウンター待ちの例外側)。
        if (Math.hypot(hdx, hdy) > GHOST_HABIT_ARRIVE_PX) [moveX, moveY] = norm(hdx, hdy);
      } else if (edgeDist > GHOST_MELEE_RANGE) {
        [moveX, moveY] = norm(tcx - gcx, tcy - gcy); // 逆写像に失敗した異常系の安全側フォールバック
      }
    }
  } else if (reaction === 'counter' && !counterGaveUp && (isCounterOpportunityNow(target) || windupImpactAt !== undefined || activeDodge === null)) {
    // 段3(現行モデル。§7受け入れ条件3=ビット同一)。
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
  } else if (microHitReactMode !== undefined) {
    // ★AI_HUMANIZE.md B3(§4⑥の写し): 被弾直後1秒の反応(下がる/固まる/殴り返す)。
    // カウンター待ち・回避中・punishRush中には割り込まない(上位のまま=優先順は据え置き)。
    // ★B3検収(重大3・裁定v2534): 3モードとも完全停止に落ちる枝を作らない=どのモードも
    // 「動く条件を満たさない」時はorbitVec(GHOST_ORBIT_IDLE_FRAC)のドリフト床へ落とす
    // (旧: 下がるの帯内・殴り返すの射程内でmoveX/Y未設定=完全停止のまま抜けていた)。
    if (microHitReactMode === 0) { // 下がる: 離脱ベクトルを強める(既存の後退ロジックを流用)
      if (edgeDist < GHOST_MOVE_BAND_PX * 4) [moveX, moveY] = norm(gcx - tcx, gcy - tcy);
      else [moveX, moveY] = orbitVec(GHOST_ORBIT_IDLE_FRAC); // 既に離脱済みの帯内=ドリフト床
    } else if (microHitReactMode === 1) { // 固まる: 短停止(ドリフト床は維持=完全停止にしない)
      [moveX, moveY] = orbitVec(GHOST_ORBIT_IDLE_FRAC);
    } else { // 殴り返す(microHitReactMode === 2): 射程外なら詰める、射程内は下の即振り配線に任せる
      if (edgeDist > GHOST_MELEE_RANGE) [moveX, moveY] = norm(tcx - gcx, tcy - gcy);
      else [moveX, moveY] = orbitVec(GHOST_ORBIT_IDLE_FRAC); // 射程内=ドリフト床(完全停止にしない)
    }
  } else if (input.retrieveTarget) {
    // GHOST-SUBS-FINAL: 自分の落し物(クイックマガジン)を拾いに行く。間合い管理より優先だが、
    // 危険(上の回避)とカウンターには譲る。乱数は消費しない=拾い物が無い時は従来と同一。
    [moveX, moveY] = norm(input.retrieveTarget.x - gcx, input.retrieveTarget.y - gcy);
  } else {
    // §2.12(2)(3) 平時の間合い+移動リズム。
    // ★AI_HUMANIZE.md B3(§4③⑤の写し): 分布保持者はpreferredDistを分布から引いた値へ置換
    // (引き直しは召喚時+状態遷移時[技キー変化/ピンチ帯変化]のみ)。
    const pinchNow = ghost.hpFrac01 !== undefined && ghost.hpFrac01 <= 0.3;
    const distDist = pinchNow ? micro?.pinchDistDist : micro?.distDist;
    const distSigNow = `${moveRoll?.moveKey ?? ''}:${pinchNow ? 'p' : 'n'}`;
    if (distDist && (microDrawnDist === undefined || microDrawnDistSig !== distSigNow)) {
      microDrawnDist = sampleDistPx(distDist, mrand, profile.preferredDist);
      microDrawnDistSig = distSigNow;
    }
    // 安全マージンは「予告が出ているのに dodge/tank ロールを引いていない時」だけ足す(§2.12(2)の文言どおり)。
    const desired = ghostDesiredDist(
      microDrawnDist ?? profile.preferredDist,
      windupNow && reaction !== 'tank' && reaction !== 'dodge',
    );
    // **危険時(予告中/脅威あり)は必ず動く**=リズム(止まる癖)は平時のみ。
    const mustMove = dangerNow;
    // tankロールの予告中は「避けようとしたが間に合わない」ゆっくり歩き(速いと苦手技が偶然外れる)。
    const tankHolding = windupNow && reaction === 'tank';

    // ★AI_HUMANIZE.md B3(§4①の写し): 置換するのはghostMoveChanceの抽選のうちstationaryFrac由来の
    // 「止まりの発生」だけ(mobilityは従来どおり効かせる——ghostMoveChance自体がmobility/stationaryFrac
    // の平均で、下のtargetOccとして生きる)。分布保持者は止まりエピソードの長さを①分布から引き、
    // その間は毎tick再抽選しない(引かない人=旧来のghostMoveChanceのまま)。
    // ★占有率の保存(B3検収・重大1): エピソードの「発生確率」は旧ghostMoveChanceの占有率(動いている
    // tick率)を保つよう stillStartChance で逆算する(旧: 発生率にmobilityをそのまま採用していたため、
    // 長さだけ伸びて占有率が反転する事故=実測62.5%→4.8%)。導出式はmicroRhythmReplay.stillStartChance
    // のコメント参照。
    let moving: boolean;
    if (mustMove) {
      moving = true;
    } else if (micro?.stillness) {
      // ★検収是正(中1): 止まりエピソード中も既存rand流を「引いて捨てる」(④と同型=消費順保全。
      // 旧実装はアイドル中このrand()自体を呼ばず、専用流mrandとは別にrand消費回数がズレていた)。
      const r = rand();
      if (gameTime < microIdleUntil) {
        moving = false;
      } else {
        const targetOcc = ghostMoveChance(profile.mobility, profile.stationaryFrac);
        const pStart = stillStartChance(targetOcc, meanStillMs(micro.stillness), MICRO_STILL_TICK_MS);
        moving = r < 1 - pStart;
        if (!moving) microIdleUntil = gameTime + sampleStillMs(micro.stillness, mrand);
      }
    } else {
      moving = rand() < ghostMoveChance(profile.mobility, profile.stationaryFrac);
    }

    if (moving) {
      // ★AI_HUMANIZE.md B3(§4⑧の写し): 「どのゾーン(接近/後退/帯内)にいるか」の判断を⑧分布+
      // reactionMsの間隔で凍結する。毎tickのまま残すもの=接線の再計算(orbitVec呼び出しは常に
      // 現在位置で行う=下)・回避/雑魚反発/クランプ(呼び出し元)。
      const naturalMode: 'approach' | 'retreat' | 'orbit-base' | 'orbit-tank' | 'orbit-idle' =
        edgeDist > desired + GHOST_MOVE_BAND_PX
          // 詰めない人(approachChance抽選に外れた)=詰めずに横へ流れる(旧来どおりIDLE_FRAC・遅い)。
          ? ((mustMove || rand() < ghostApproachChance(profile.approachPerMin)) ? 'approach' : 'orbit-idle')
          : edgeDist < desired - GHOST_MOVE_BAND_PX
            ? 'retreat'
            : (tankHolding ? 'orbit-tank' : 'orbit-base');
      if (micro?.decisionInterval && !mustMove) {
        if (microDecisionMode === undefined || nowMs >= microDecisionUntil) {
          microDecisionMode = naturalMode;
          microDecisionUntil = nowMs + sampleDecisionIntervalMs(micro.decisionInterval, mrand) + reactionMs;
        }
      } else {
        microDecisionMode = naturalMode;
      }
      const mode = microDecisionMode ?? naturalMode;
      if (mode === 'approach') [moveX, moveY] = norm(tcx - gcx, tcy - gcy);
      else if (mode === 'retreat') [moveX, moveY] = norm(gcx - tcx, gcy - tcy);
      else if (mode === 'orbit-idle') [moveX, moveY] = orbitVec(GHOST_ORBIT_IDLE_FRAC);
      else [moveX, moveY] = orbitVec(mode === 'orbit-tank' ? GHOST_ORBIT_TANK_FRAC : GHOST_ORBIT_BASE_FRAC);
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
  // ★AI_HUMANIZE.md B3(§4②の写し): 分布保持者は通常近接CDを②分布から引いた値へ(カウンターの振り
  // には掛けない=下のcounterMeleeReadyは不変)。欠損時はGHOST_MELEE_COOLDOWN_MSのまま=現行どおり。
  const meleeReady = nowMs - ghost.lastMeleeAt >= (microMeleeCooldownMs ?? GHOST_MELEE_COOLDOWN_MS);
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
      // research/AI_HUMANIZE.md B2 §2-8確定事項#2/#3(A2/A3): 段1/段2は「振るか」をコマ/族の
      // pressOfsで決める(袋ロール・counterChance抽選は使わない)。決着(§2-3のT-500ms判定)までは
      // **沈黙させない**=暫定true(下のgunHeldByWatchが銃を挟まない=「待っている」を保つ)。
      counterWillAttempt = habitStage === 3
        ? (reaction === 'counter'
          ? true
          : reaction === 'dodge' || reaction === 'tank'
            ? false
            : rand() < profile.counterChance)
        : true;
    }
    if (habitStage === 1 || habitStage === 2) {
      // ---- research/AI_HUMANIZE.md B2 §2-3+§2-8(A1/A2/A4/A5/A6/A7・#12): コマ/族から振りを決める ----
      const habitKeyNow = habitKey as string;
      // §2-8確定事項#4(A6): T(着弾時刻)は構え開始で凍結した値を使う(habitNewArmの瞬間に確定済み)。
      // ★検収是正#5(A7「時計を混ぜない」違反の是正): 旧実装は `?? nowMs`(Date.now系)で埋めていたが、
      // 直後に `gameTime >= TFrozen - ...` と**gameTime系と直接比較**しており時計が混ざっていた。
      // windupImpactAtはgameTime系の同じ錨(episodeKey州は必ず定義済み=habitNewArmの瞬間に
      // microHabitTFrozenへ複製される値そのもの)なのでフォールバック先として安全。それも無い
      // (理論上到達しない)場合は**nowMsを発明せず、このtickは解決を見送る**(段3への降格はしない
      // =habitStageは既にこのtickの位置取り等で使用済みのため、ここだけ差し替えると分裂する)。
      const TFrozen = microHabitTFrozen ?? windupImpactAt;
      // §2-3「振り判断時点(T−500ms)」に達したら1回だけコマ/族から決める(gameTimeのみ=A7)。
      if (TFrozen !== undefined && !microHabitResolved && gameTime >= TFrozen - GHOST_HABIT_SWING_DECIDE_LEAD_MS) {
        const bossRectNow: Rect = { x: target.x, y: target.y, width: target.width, height: target.height };
        const ctxHpNow: 0 | 1 = ghost.hpFrac01 !== undefined && ghost.hpFrac01 <= 0.3 ? 1 : 0;
        const ctxHitNow: 0 | 1 = ghost.lastHit !== undefined && ghost.lastHit > 0
          && nowMs - ghost.lastHit <= 2000 ? 1 : 0;
        const seqNow = Math.min(20, microHabitSeqCounts?.[habitKeyNow] ?? 0);
        let pressOfs: number | null = null;
        if (habitStage === 1 && habitShape && habitAxis) {
          // §2-3: 振り判断時点の実位置を図形座標へ写し、最近傍1コマの押下時刻を引く。
          const local = habitPos(
            habitShape, gcx, gcy, habitAxis.fromX, habitAxis.fromY, habitAxis.toX, habitAxis.toY, bossRectNow,
          );
          if (local) {
            const episodes = profile.moveHabits?.[habitKeyNow] ?? [];
            const ep = pickHabitSwingEpisode(episodes, local.posA, local.posB, local.sub, seqNow, ctxHpNow, ctxHitNow);
            pressOfs = ep ? ep.pressOfs : null;
          }
        } else if (habitStage === 2 && habitFamilyKey) {
          // §2-8確定事項#6(A8): 段2は族別avgPressOfsのみ(counterAimLagMs/counterAimRateは使わない)。
          // 振るか=押下率(pressRatePct)を専用乱数流で1回引く(既存randは消費しない=§7-4)。
          const stat = profile.habitFamily?.[habitFamilyKey];
          if (stat) pressOfs = mrand() < stat.pressRatePct / 100 ? stat.avgPressOfs : null;
        }
        // §8裁定済み#16: T + pressOfs(記録が押下基準なので再生は減算しない)。
        microHabitSwingAt = habitSwingAtFromPressOfs(TFrozen, pressOfs) ?? undefined;
        // §8裁定済み#17(社長裁定2026-09-02=(b)「窓がTを覆えない記録では振らない」): このコマ通りに
        // 振ったら(=ちょうどmicroHabitSwingAtで振ったら)窓(300ms)が着弾TFrozenを覆うかを、
        // 決定した瞬間に確定させる(pressOfsの値だけで事前に切るのではなく、実際に振る時刻=
        // microHabitSwingAtそのもので判定する)。覆えない記録は pressOfs===null と同じ
        // 「振らない」へ確定させる(=毎tick窓の再判定で偶然coverしても振り直さない。この機会は
        // このコマで確定済み=別のコマを発明しない)。
        if (microHabitSwingAt !== undefined && !habitSwingWindowCoversT(microHabitSwingAt, TFrozen)) {
          microHabitSwingAt = undefined;
        }
        microHabitResolved = true;
        counterWillAttempt = microHabitSwingAt !== undefined; // §2-8確定事項#2(A2): pressOfs=null→振らない
      }
      // §2-8確定事項#5(A7): 振り判断はgameTimeのみで完結。CD(meleeReady相当)は残りmsとして別にAND。
      // ★裁定済み#12(社長裁定2026-09-02=(a)): 段1の振りはmicroMeleeCooldownMsを見ない
      // (固定CD+counterMeleeReadyのみ)。§4②「揺らぎはカウンターの振りに掛けない」を実態として成立させる。
      const habitMeleeReady = habitStage === 1
        ? nowMs - ghost.lastMeleeAt >= GHOST_MELEE_COOLDOWN_MS
        : meleeReady;
      const habitAimReady = microHabitResolved && microHabitSwingAt !== undefined && gameTime >= microHabitSwingAt;
      // §8裁定済み#17: CD待ちで実際に振る瞬間(このtickのgameTime)が予定(microHabitSwingAt)より
      // 遅れ、その遅れで窓がTを通り過ぎた場合も同じ式で振らない(§2-3「即振り」の遅延ケース)。
      // 決定時のチェック(上)は理想時刻=microHabitSwingAt自身で判定済みなので、ここで初めて
      // 割れるのはCD待ちの遅延だけ——見つけたらこの機会も確定して終える(microHabitSwingAtを消し、
      // 以後gameTimeが窓へ再び入っても振り直さない=遅れて偶然合うのを狙い撃ちにしない)。
      if (habitAimReady && TFrozen !== undefined && !habitSwingWindowCoversT(gameTime, TFrozen)) {
        counterWillAttempt = false;
        microHabitSwingAt = undefined;
      } else if (counterWillAttempt && microHabitResolved && habitAimReady && habitMeleeReady && counterMeleeReady) {
        action = 'melee'; lastMeleeAt = nowMs; lastCounterAttemptAt = nowMs;
        counterPendingAt = undefined; counterWillAttempt = false;
        // ★検収是正#5: microHabitTFrozenはここで消さない——「その州(counterArmKey)が続く間は保持する」
        // (§2-8確定事項#4)。振り解決だけをリセットして次の機会に備える(counterPendingAt=undefinedで
        // 同じ州のまま次tickに再度「新しい機会」として構え直ることがある=A6の凍結が効かないと、
        // その再構えが生のwindupImpactAt(賞金首KB等で後退しうる)を拾ってしまう)。
        // 凍結は habitNewArm(=counterArmKeyNowが実際に変わった時)だけが張り直す。
        microHabitResolved = false; microHabitSwingAt = undefined;
        meleeIsCounterAttempt = true;
      }
    } else {
      // 段3=現行モデル(コマ<3・族<5・EPISODE_KEYS外は全てここ。§7受け入れ条件3=ビット同一)。
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
    // ★B3検収(重大3): 「殴り返す」(microHitReactMode===2)は射程内(=inMeleeRange)なら
    // punishRushと同型でmeleeBias抽選を通さず即振り(短絡評価なのでrandは消費しない=punishRushと同じ扱い)。
    if (inMeleeRange && meleeReady && (punishRush || microHitReactMode === 2 || rand() < profile.meleeBias)) {
      action = 'melee'; lastMeleeAt = nowMs;
      // ★AI_HUMANIZE.md B3(§4②の写し): 次の通常近接までの間隔を②分布から引き直す。
      // ★B3検収(重大2): 「CD不変」の裁定=下側をGHOST_MELEE_COOLDOWN_MS(600ms)でクランプする
      // (伸びる方向にだけ揺れる。短縮を許すと通常近接まで速くなりDPS増=バランス変更になってしまう)。
      if (micro?.swingInterval) {
        microMeleeCooldownMs = Math.max(GHOST_MELEE_COOLDOWN_MS, sampleSwingIntervalMs(micro.swingInterval, mrand));
      }
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
    // ★AI_HUMANIZE.md B3: マイクロリズムの持ち越し状態(次tickへ)。
    microDrawIndex: microCursor.nextIndex(),
    microIdleUntil, microMeleeCooldownMs, microDrawnDist, microDrawnDistSig,
    microOrbitRedrawAt, microHitReactMode, microHitReactUntil, microHitReactAnchor,
    microPunishDelayUntil, microDecisionMode, microDecisionUntil,
    // research/AI_HUMANIZE.md B2(§2守護霊再生): 位置取り目標キャッシュ+振り解決の凍結状態。
    microHabitTargetX, microHabitTargetY, microHabitTFrozen, microHabitSwingAt, microHabitResolved,
    microHabitSeqCounts, microHabitArmKey,
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
