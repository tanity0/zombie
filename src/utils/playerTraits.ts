// BOT_AND_GHOST.md G1(プレイヤー実測層)。プレイヤーの「ボス戦での戦い方」を6ノブへ数値化して
// 端末へ保存する(G2のゴースト助っ人が食うプロファイル)。komaLog.ts/botTelemetry.tsと同じ流儀:
// 純関数+モジュールシングルトン。store/React/PixiJS非依存(ヘッドレスでテスト可能)。
//
// 掟(BOT_AND_GHOST.md §2.6/§2.7):
// - 計測は**ボス交戦区間のみ**(directorTickが計算する bossRelax=bossEngagedNowの結果を毎tick
//   受け取って使う。新しい交戦判定はここで発明しない)。
// - **スナップショット差分方式**: 交戦(bossRelaxのon→off一区間=1セッション)の開始時に botTelemetry の
//   ディープコピーを控え、終了時に差分を取る(CLAUDE.md 実装精度の規律3。生きた参照を保存すると
//   差分が常に0になる=v0.25.1343の実バグの型)。
// - **セッション合計30秒未満は混ぜない**(ノイズでEMAが動くのを防ぐ)。
// - **撃破セッションのみ混ぜる(v0.25.2493・社長裁定「Bは混ぜない。基本的に残るのは撃破だけ。
//   その後死のうが生きようが残る」)**: ボスを撃破しなかった交戦(逃げて切れた負け戦)は軸1にも
//   軸2にも一切残さない。撃破済みセッションは以後の死亡に関係なく保留バッファに残る。
// - **集計はEMA(α=0.3)**。保存は1組(直近ランの移動平均・直近1回の事故で人格が変わらない)。
// - **ゴーストが場に居る間は計測しない**(§2.7 制約1の土台)。呼び出し側が ghostActive を渡す。
//   ゴースト同伴中に開いていたセッションは保存せず破棄する(「2人での戦い方」を録音しない)。
// - **G3(§2.7 制約1の本則)**: 守護霊(guardian-spirit)を装備しているラン/`?ghost=1`のランは
//   計測を丸ごと停止する(呼び出し側が ghostRunActive=ghostRunEnabled(ghostDriver.ts) を渡す。
//   「召喚が起きた区間だけ除外」の細かい分岐にはしない——装備中のボス戦は必ず召喚が起きるので同値)。
// - **保存の保留化(v0.25.2476 社長裁定「リザルトで守護霊化するか選べるように」)**: セッション確定
//   (endSession)とサブ様式のラン集計(foldSubStyleTallies)は即 saveProfile せず**ラン内の保留バッファ**
//   に積む。リザルトを閉じる時に settlePendingTraits() が commit(既定・従来と同じ順序でEMA混合=結果は
//   旧実装とビット一致)か全破棄を行う。リザルトを経由しない終了(ブラウザ閉じ等)は保留のまま消える
//   =破棄と同じ(安全側)。
import type { Enemy, EnemyType, Player, PlayerBuildSnapshot } from '../types/game';
import type { AvatarId } from '../data/avatars';
import { getBotTelemetry, snapshotBotTelemetry, type BotTelemetry } from './botTelemetry';
// §2.11 裁定1: 計測時ビルドの写し(純関数・store非依存)/ §2.16 A: 同行守護霊の写し(共通の1枚)
import { snapshotPlayerBuild, type GhostAllySnapshot } from './playerBuild';
import { isGhostEligibleBoss } from './bossEngagement';
import { bossClockDurationMs } from './bossClock'; // v0.25.2577: 撃破タイム=ボスごと交戦時計(共有)
import { isBossCounterableNowApprox } from './bossScript';
import {
  createMeleeSpacingState, stepMeleeSpacing, foldMeleeSpacing, blendMeleeSpacing,
  type MeleeSpacingState, type MeleeSpacingProfile,
} from './meleeSpacing';
import { bitePhaseOf, isBiteSubject } from './enemyBite';
import { isBossType } from './enemyUtils';
import { isHiddenBoss } from './enemyUtils';
import { enemyHitStrip } from '../pixi/renderSpec';
import {
  createMoveReactionState, stepMoveReactions, markMoveReactionCounter, markMoveReactionHit,
  endMoveReactions, blendMoveReactionTable, blendDodgeDirStat, isProjectileMoveKey,
  type MoveReactionState, type MoveReactionTable, type DodgeDirTally, type DodgeDirStat,
  type MoveReactionTally,
} from './moveReaction'; // G4a(BOT_AND_GHOST.md §2.9): 技への反応表の判定中核(純関数)
import {
  createPunishEpisodeState, createPunishTally, stepPunishEpisodes, closePunishEpisodes,
  punishWindowsOpen, blendPunishProfile,
  type PunishEpisodeState, type PunishTally, type PunishProfile,
} from './punishWindow'; // GHOST-CMD-2A(§2.18追補): 隙(気絶/硬直/カウンター直後)の窓判定+票の共通部品
import { loadPlayerName } from './playerName'; // v0.25.2477: 計測時のプレイヤー名(srcName)の出どころ
import { GHOST_KNOB_SET_V, GHOST_PROFILE_DEFAULTS } from '../../shared/ghostSanitize.mjs';
import { bossStyleSlotKey } from './ghostSlot';
export { bossStyleSlotKey } from './ghostSlot';

// ---- 保存フォーマット -------------------------------------------------------------------------
/** G4a(§2.9(3)): サブウェポンの様式(第1弾はwire-anchor/shieldの2種)。nは計測に使った母数の累計。 */
export interface SubStyleProfile {
  /** n=計測した発動回数の累計 / slamRatio=スラム型(敵ヒット)の割合(残り=地点プラント)。 */
  wire: { n: number; slamRatio: number };
  /**
   * n=計測した設置回数の累計 / bashPerPlacement=設置1回あたりのバッシュ回数 /
   * bashDamageFrac=ラン中の総与ダメージに占めるバッシュ与ダメの割合。
   */
  shield: { n: number; bashPerPlacement: number; bashDamageFrac: number };
  /**
   * GHOST-SUBS-FINAL(社長裁定2026-07-31「ロックは秒数平均だけ持っておけば? 大体3秒くらいで
   * 撃ってるなー、とか」): ホーミングの「押す→離す(発射)」までの保持時間の平均(ms)。
   * n=計測した発射回数の累計。**旧プロファイルには無い**=読み側は欠損に耐えること
   * (loadPlayerProfile が normalizeSubStyles で既定を埋める)。
   */
  homing: { n: number; holdMsAvg: number };
}

/**
 * 純関数: 守護霊が使う「押し続ける時間」の計測値(ms)。まだ1度も計測していなければ null=
 * 消費側(homing.ghostHomingHoldMs)が満タン発射へフォールバックする。
 * 旧プロファイル/旧スロット(homingキーが無い保存)にも耐える。
 */
export const subStyleHomingHoldMs = (s: SubStyleProfile | undefined): number | null =>
  s?.homing !== undefined && s.homing.n >= 1 ? s.homing.holdMsAvg : null;

/**
 * G5(BOT_AND_GHOST.md §2.10 仕様1): ボス別攻略スタイル1スロット=撃破セッション1回ぶんのサンプル写し
 * (**EMAしない**)。9ノブは各null可(そのセッションで計測できなかったノブ=消費側がその項目だけ
 * 軸1へフォールバックする合図)。moveReactions(技への反応表)はここに含めない=共有のまま(軸2へ複製しない)。
 */
export interface BossStyleSlot {
  reactionMs: number | null;
  counterChance: number | null;
  preferredDist: number | null;
  meleeBias: number | null;
  mobility: number | null;
  hitsPerMin: number | null;
  subUsesPerMin: number | null;
  stationaryFrac: number | null;
  approachPerMin: number | null;
  /** 仕様4: 同ランのsubStyle保留レコードが有ればそのラン実測レート(EMAなし)、無ければcommit後の軸1コピー。 */
  subStyles: SubStyleProfile;
  srcClass: string | null;
  /** v0.25.2514: 計測時ビルドの写し(旧3項目の上位互換=PlayerBuildSnapshot)。 */
  snapshot: PlayerBuildSnapshot | null;
  srcName: string | null;
  /** v0.25.2603(社長式・記録基準): 評点=(カウンター×3 + 避けた技 − 被弾した技)/分。
   * 旧レコードには無い=欠損可。欠損は「比較できない」扱いで新しい方を採用する(下の比較関数)。 */
  perfScore?: number;
  /** 共有ノブ集合の版。欠損/小さい値は表示上「古い記録」になるが共有自体は可能。 */
  knobsV?: number;
  /** 記録時刻(Date.now()・討伐記録一覧用)。 */
  at: number;
  /** v0.25.2493(社長採用「撃破タイム+カウンター成功率であれば採用」): 交戦開始→撃破までの時間(ms)。
   * 旧レコード(v0.25.2485〜2492)には無い=欠損可。表示側はカウンター成功率(counterChance)と併記する。 */
  clearTimeMs?: number;
  /** v0.25.2553(§2.15 置き場所の訂正/§2.16 A): その撃破に**同行していた守護霊**の持ち主名+ビルド写し。
   * 討伐記録一覧で「同行者の名前」を出し、タップでビルド/ステータスのポップアップを描くための保存。
   * 撃破の瞬間に召喚中のghost-allyから写す=不在なら未保存(欠損可・カード非表示)。 */
  ally?: GhostAllySnapshot;
  /** GHOST-CMD-1B(§2.18-2): 避け方向の癖(そのセッションの生値の写し=EMAなし・丸ごと写しの一部)。
   * このセッションで分類できたdodgeが無ければ未保存(欠損可=消費側が軸1へフォールバック)。 */
  dodgeDir?: DodgeDirStat;
  /** GHOST-CMD-2A(§2.18追補): 隙コマンド(詰めて叩く/撃つ)の文脈別記録。dodgeDirと同じ「丸ごと写し」
   * (そのセッションの生値=EMAなし)。票が1つも無ければ未保存(欠損可=消費側が軸1へフォールバック)。 */
  punish?: PunishProfile;
}

export interface PlayerProfile {
  v: 1;
  runs: number;
  reactionMs: number;
  counterChance: number;
  preferredDist: number;
  meleeBias: number;
  mobility: number;
  hitsPerMin: number;
  /** G2.6(BOT_AND_GHOST.md §2.8): サブウェポン使用回数/分(botTelemetry.subUsesの区間差分)。 */
  subUsesPerMin: number;
  /**
   * G4a(§2.9(2)): ボス交戦中の静止時間割合(立ち止まる癖)。**実座標の変位ベース**
   * (中心の移動速度 < STATIONARY_SPEED_MAX_PX_PER_SEC のtick割合)。mobility(移動入力の割合)とは
   * 定義が異なる=入力を入れていてもノックバック等で動く/動かないを実移動で見る。
   */
  stationaryFrac: number;
  /** G4a(§2.9(2)): 接近エピソード/分(プレイヤー自身の移動でボスへAPPROACH_EPISODE_PX以上詰めた回数)。 */
  approachPerMin: number;
  /** G4a(§2.9(1)): 技への反応表。キー=G2.5のボス×技表の名称(moveReaction.ts参照)。 */
  moveReactions: MoveReactionTable;
  /**
   * GHOST-CMD-1B(§2.18-2 dodgeの味付け): 避け方向の癖(技キー横断のグローバル記録)。
   * awayRate=後退 / lateralRate=横流し / through(前抜け)=1−away−lateral で導出。混合は
   * blendMoveReactionTable と同じ数式を1キー分だけ適用(blendDodgeDirStat)。旧プロファイルには
   * 無い=欠損可(スキーマ版vは据え置き。欠損=undefined=消費側はバイアス0で従来とビット一致)。
   */
  dodgeDir?: DodgeDirStat;
  /**
   * GHOST-CMD-2A(§2.18追補 隙コマンド): 隙(気絶/技後硬直/カウンター成立直後)に「詰めて叩いたか
   * 撃っていたか」の文脈別記録(技キー横断・疎な辞書=観測した文脈だけ入る)。混合はdodgeDirと
   * 同じ数式(初回そのまま・EMA・n累計)。旧プロファイルには無い=欠損可(スキーマ版vは据え置き。
   * 欠損=消費側は既定の'rush'=詰めて叩く)。
   */
  punish?: PunishProfile;
  /** G4a(§2.9(3)): サブウェポンの様式カウンタ(ボス交戦区間に限定しない=ラン単位でEMA)。 */
  subStyles: SubStyleProfile;
  /**
   * ★§8(SAME_ARENA): 近接の間合いの癖。**旧プロファイルには無い**=欠損可
   * (消費側は欠損ならその癖だけ従来のフォールバックへ落ちる)。軸1(共通スタイル)のみ——
   * ボス別スロット(`BossStyleSlot`)へは写さない(技への反応表と同じ扱い)。
   */
  meleeSpacing?: MeleeSpacingProfile;
  /** v0.25.2467(社長指示): 計測時のクラス(ゴーストの絵の選択用)。旧プロファイルには無い=任意。 */
  srcClass?: string;
  /** v0.25.2468(社長指示「HPというか全ステータスをそのまま再現」): 計測時のステータスの写し。
   * ゴーストはこれを100%再現する(無ければ召喚時の本人値へフォールバック)。
   * v0.25.2514(§2.11 裁定1「計測時のビルドをそのまま」): **武器ロードアウト/スキル/装備/クリ率/
   * サブウェポン/PHILL率まで含むビルド丸ごと**へ拡張(PlayerBuildSnapshot=旧3項目の上位互換・
   * 旧プロファイルは追加項目が欠損=消費側がフォールバックする)。 */
  snapshot?: PlayerBuildSnapshot;
  /** v0.25.2477(社長指示「守護霊にプレイヤーの名前を頭上に表示」): 計測時のプレイヤー名
   * (playerName.ts の台帳)。srcClass/snapshotと同じ流儀=旧プロファイルには無い・欠損可。
   * 頭上表示はこの記録名を使う=将来オンラインで他人のゴーストが来た時に「その人の名前」が
   * 出る構造(§2.5 未決5=プロファイルは通信ペイロード)。 */
  srcName?: string;
  /** 守護霊の登場・帰還時に左上通信へ表示する、持ち主が設定した公開コメント。旧データは欠損可。 */
  arrivalComment?: string;
  departureComment?: string;
  /**
   * G5(BOT_AND_GHOST.md §2.10 仕様1): ボス別攻略スタイル(軸2)。キー=bossStyleSlotKey()の戻り値。
   * 撃破が無いボス/計測不能な条件下では触らない=任意フィールド(後方互換=欠損可・v:1のまま)。
   */
  bossStyles?: Record<string, BossStyleSlot>;
}

/**
 * G5(BOT_AND_GHOST.md §2.10 仕様1): ボス別スロットのキー(純関数)。giantbatだけステージ別
 * (`giantbat@<stageId>`。城ボス/グレン/未確認変異体は同typeだが別の戦いのため)、他typeはtypeそのまま。
 * 計測側(このファイル・notifyBossClear)と消費側(directorTick.ts・effectiveGhostProfile)が同じ関数を
 * 使う(ズレ防止)。stageIdは呼び出し側が `getSelectedStageId()`(src/data/progress.ts)で取得して渡す
 * (このファイルはstore/data非依存を保つため、ここではimportしない)。
 */
const STORAGE_KEY = 'zombie-ghost-profile-v1';

// 何もデータが無い状態から最初のEMAを起こす時の「種」の値(botSkillのcasual相当に寄せた叩き台)。
// ghostDriver.ts の defaultGhostProfile とは別に持つ(playerTraits はゴーストの既定値そのものには
// 関与しない=循環import回避。数値がここと重複するのは意図的=どちらも「casual相当」の同じ目安のため)。
export const SEED_PROFILE: Omit<PlayerProfile, 'v' | 'runs' | 'moveReactions' | 'subStyles'> = {
  ...GHOST_PROFILE_DEFAULTS,
};

// G4a: 表/様式の「データ無し」初期値。n=0が「まだ計測していない」の印(n<1=記録なしはG4b側で
// グローバルノブへフォールバックする約束=§2.18でn≥1は袋式・旧n<3ゲートはGHOST-CMD-1で廃止)なので、
// レート値はダミーの0でよい。
const defaultSubStyles = (): SubStyleProfile => ({
  wire: { n: 0, slamRatio: 0 },
  shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 },
  homing: { n: 0, holdMsAvg: 0 },
});

/** 後方互換: 旧フォーマット(homingキーが無い保存)を既定で埋める(欠損したキーだけ)。 */
const normalizeSubStyles = (v: SubStyleProfile | undefined): SubStyleProfile => {
  const d = defaultSubStyles();
  if (!v) return d;
  return { wire: v.wire ?? d.wire, shield: v.shield ?? d.shield, homing: v.homing ?? d.homing };
};

const EMA_ALPHA = 0.3;
const MIN_SESSION_MS = 30_000;
const REACTION_CLAMP_MIN = 100;
const REACTION_CLAMP_MAX = 800;
const DIST_BUCKET_PX = 50;
const DIST_BUCKET_COUNT = 16; // 0..800px(BOT_AND_GHOST.md §2.6)
// MELEE_RADIUS(gameStore.ts)=74 の複製値。store非依存を保つためimportせず、同じ値をここへ複製する
// (playtestBot.ts の MELEE_ENGAGE_DIST=80 が既存前例=このプロジェクトで確立済みの作法)。
const MELEE_RADIUS_MIRROR = 74;
const OPPORTUNITY_RANGE = MELEE_RADIUS_MIRROR * 2;

// ---- localStorage 読み書き(tutorialArchive.tsと同じ作法・try/catchでプライベートモード耐性) ----
const isValidProfile = (v: unknown): v is PlayerProfile => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.v === 1 && typeof o.runs === 'number'
    && typeof o.reactionMs === 'number' && typeof o.counterChance === 'number'
    && typeof o.preferredDist === 'number' && typeof o.meleeBias === 'number'
    && typeof o.mobility === 'number' && typeof o.hitsPerMin === 'number'
    // G2.6で追加したノブ。旧フォーマット(6ノブ時代の保存)は欠損を許し、load側で既定値を埋める(後方互換)。
    && (o.subUsesPerMin === undefined || typeof o.subUsesPerMin === 'number')
    // ★v0.25.2766(品質監査D-2): srcName の型ゲート。ここは将来G6で他人から届くペイロードの入口に
    // なる場所で、壊れた/手で書き換えたJSONの `srcName: 12345` や `{}` が ghostName へ流れて
    // 文字列連結されるのを防ぐ。欠損は許す(旧フォーマット互換)。中身の浄化は displayNameFrom。
    && (o.srcName === undefined || typeof o.srcName === 'string')
    // G4a(§2.9)で追加した項目。同じく欠損を許し、load側で既定値を埋める(後方互換)。
    && (o.stationaryFrac === undefined || typeof o.stationaryFrac === 'number')
    && (o.approachPerMin === undefined || typeof o.approachPerMin === 'number')
    && (o.moveReactions === undefined || (typeof o.moveReactions === 'object' && o.moveReactions !== null))
    // GHOST-CMD-1B: dodgeDir(避け方向の癖)。欠損可(旧プロファイル=undefinedのまま読める)。
    && (o.dodgeDir === undefined || (typeof o.dodgeDir === 'object' && o.dodgeDir !== null))
    // GHOST-CMD-2A: punish(隙コマンドの文脈別記録)。同じく欠損可(旧プロファイル)。
    && (o.punish === undefined || (typeof o.punish === 'object' && o.punish !== null))
    && (o.subStyles === undefined || (typeof o.subStyles === 'object' && o.subStyles !== null))
    // G5(§2.10仕様1): bossStylesは任意オブジェクトとして許容(後方互換=欠損可)。
    && (o.bossStyles === undefined || (typeof o.bossStyles === 'object' && o.bossStyles !== null));
};

// PACING_PUZZLE.md §10-12#4/§10-14#10(EXボス「フィル(変異体)」バッチ1): bossStylesのスロットキーも
// ghostDossier/bossEncounterと同じく 'giantbat@stage-ex1' → 'phillboss@stage-ex1' へ読み替える
// (初回ロード時に1度だけ移行して旧キーを削除=恒久2キー併存を避ける)。
const LEGACY_PHILLBOSS_STYLE_KEY = 'giantbat@stage-ex1';
const PHILLBOSS_STYLE_KEY = 'phillboss@stage-ex1';
const migrateLegacyPhillbossStyle = (
  bossStyles: Record<string, BossStyleSlot> | undefined,
): { styles: Record<string, BossStyleSlot> | undefined; changed: boolean } => {
  if (!bossStyles || !(LEGACY_PHILLBOSS_STYLE_KEY in bossStyles)) return { styles: bossStyles, changed: false };
  const { [LEGACY_PHILLBOSS_STYLE_KEY]: legacy, ...rest } = bossStyles;
  // 新キーに既に記録がある(重複保存等の異常系)なら、既存の新キーを優先し旧キーはただ捨てる。
  return { styles: { ...rest, [PHILLBOSS_STYLE_KEY]: rest[PHILLBOSS_STYLE_KEY] ?? legacy }, changed: true };
};

/** 保存済みプロファイル。無ければ null(G2側が既定プロファイルへフォールバックする)。 */
export const loadPlayerProfile = (): PlayerProfile | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidProfile(parsed)) return null;
    const { styles: migratedBossStyles, changed: bossStylesMigrated } = migrateLegacyPhillbossStyle(parsed.bossStyles);
    // 後方互換: 旧フォーマット(欠損ノブ)は控えめな既定値(SEED)/空表で埋めて返す。
    const profile: PlayerProfile = {
      ...parsed,
      subUsesPerMin: parsed.subUsesPerMin ?? SEED_PROFILE.subUsesPerMin,
      stationaryFrac: parsed.stationaryFrac ?? SEED_PROFILE.stationaryFrac,
      approachPerMin: parsed.approachPerMin ?? SEED_PROFILE.approachPerMin,
      moveReactions: parsed.moveReactions ?? {},
      subStyles: normalizeSubStyles(parsed.subStyles),
      bossStyles: migratedBossStyles,
    };
    if (bossStylesMigrated) saveProfile(profile);
    return profile;
  } catch {
    return null;
  }
};

const saveProfile = (p: PlayerProfile): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* 保存できなくても計測自体は成立する(次ランでまた測るだけ) */
  }
};

// ---- 計測セッション ---------------------------------------------------------------------------
interface Session {
  startGameTime: number;
  lastGameTime: number;
  telemetryStart: BotTelemetry;
  distBuckets: number[];        // 長さ DIST_BUCKET_COUNT
  reactionSamplesMs: number[];
  opportunities: number;
  successes: number;
  movedTicks: number;
  totalTicks: number;
  hits: number;
  wasOpportunity: boolean;         // 「機会」のエッジ検知用
  pendingOpportunityAt: number | null; // 機会が開いた Date.now() ms(reactionMs算出の起点)
  lastHealth: number | null;       // 被弾検知(前tickのhealth)
  // ---- G4a(§2.9) ----
  moveReactions: MoveReactionState; // (1) 技への反応表(エピソード状態機械はmoveReaction.tsの純関数)
  stationaryTicks: number;          // (2) 実移動速度が閾値未満だったtick数
  motionTicks: number;              // (2) 静止判定ができたtick数(dt>0の2tick目以降)
  approachEpisodes: number;         // (2) 接近エピソード数
  approachAcc: number;              // (2) 進行中の接近量の累積(px)
  lastPcx: number | null;           // 前tickのプレイヤー中心(静止/接近の変位算出用)
  lastPcy: number | null;
  // ---- GHOST-CMD-2A(§2.18追補): 隙コマンドの計測(文脈ごとに1エピソード1票) ----
  punish: PunishEpisodeState;       // 進行中の窓(文脈ごと・開いた瞬間の近接与ダメ累計を控える)
  punishTally: PunishTally;         // このセッションの票(rush/shoot)
  // ---- G5(§2.10) ----
  // このセッション中にnotifyBossClearされたスロット(重複無し)。clearTimeMs=交戦開始→撃破の時間
  // (v0.25.2493・撃破の瞬間のlastGameTimeで確定=同tick精度)。ally=撃破の瞬間に同行していた
  // 守護霊の写し(v0.25.2553・§2.16 A。不在ならnull)。
  clearedSlots: { key: string; clearTimeMs: number; ally: GhostAllySnapshot | null }[];
  // ---- §8(SAME_ARENA): 近接の間合いの癖 ----
  spacing: MeleeSpacingState;
  /** `meleeSwingCommitAt` の前tick値(エッジ検知。絶対時刻の引き算をしない=打刻の掟どおり)。 */
  lastSeenSwingCommitAt: number | null;
}

let session: Session | null = null;
// v0.25.2467: このプロセスで最後に計測対象になったクラス(fold時にプロファイルsrcClassへ記録)。
let sessionSrcClass: string | null = null;
// v0.25.2468: 計測時ステータスの写し(社長指示「全ステータスをそのまま再現」)。
// v0.25.2514: ビルド丸ごと(PlayerBuildSnapshot)へ拡張。毎tickの純粋コピー(生きた参照を持たない=
// CLAUDE.md 実装精度の規律3。ボス交戦中だけ・ゴーストランでは作らないので負荷1/10)。
let sessionSnapshot: PlayerBuildSnapshot | null = null;
// 裁定4(PHILL): このランのPHILL発射数/ヘッドショット数。ラン単位で数え(サブ様式tallyと同じ流儀)、
// セッション確定時のスナップショットへ率として焼く。resetPlayerTraits(ラン開始)でリセット。
let phillShots = 0;
let phillHeadshots = 0;

const startSession = (gameTime: number): Session => ({
  startGameTime: gameTime,
  lastGameTime: gameTime,
  telemetryStart: snapshotBotTelemetry(),
  distBuckets: new Array(DIST_BUCKET_COUNT).fill(0) as number[],
  reactionSamplesMs: [],
  opportunities: 0,
  successes: 0,
  movedTicks: 0,
  totalTicks: 0,
  hits: 0,
  wasOpportunity: false,
  pendingOpportunityAt: null,
  lastHealth: null,
  moveReactions: createMoveReactionState(),
  stationaryTicks: 0,
  motionTicks: 0,
  approachEpisodes: 0,
  approachAcc: 0,
  lastPcx: null,
  lastPcy: null,
  punish: createPunishEpisodeState(),
  punishTally: createPunishTally(),
  clearedSlots: [],
  spacing: createMeleeSpacingState(),
  lastSeenSwingCommitAt: null,
});

/**
 * ★§8: 「今、**カウンターを狙える攻撃**が自分へ向かって来ているか」(計測専用)。
 * ボスは既存の近似判定(`isBossCounterableNowApprox`)、通常敵は**噛みつき台本の最中**を機会とみなす。
 * ★噛みつきの判定成立は最後の200msだけ(社長裁定2026-08-25)だが、**人が「来る」と認識するのは
 * 赤点滅の始まり**なので、機会の開始は台本の開始に取る(反応の速さを測るための起点)。
 * 距離は既存の `OPPORTUNITY_RANGE` を流用=新しい間合いを発明しない。
 */
const counterOpportunityOpen = (
  enemies: readonly Enemy[], pcx: number, pcy: number, gameTime: number,
): boolean => enemies.some(e => {
  const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
  if (Math.hypot(ecx - pcx, ecy - pcy) > OPPORTUNITY_RANGE) return false;
  if (isBiteSubject(e, isBossType)) return bitePhaseOf(e, gameTime) !== 'none';
  return isBossCounterableNowApprox(e.aiPhase, e.bossState);
});

// G4a(§2.9(2))の計測定数(計測専用・挙動には無関係)。
// 静止: 歩行速度(~200px/s)より十分低い実移動速度なら「立ち止まっている」とみなす。
const STATIONARY_SPEED_MAX_PX_PER_SEC = 12;
// 接近: プレイヤー自身の移動でボスとの距離をこの累計px以上詰めたら1エピソード。
// 後退(離れる向きの実移動がこの速度を超えた)で累積をリセットする。
const APPROACH_EPISODE_PX = 150;
const APPROACH_RESET_SPEED_PX_PER_SEC = 40;

const median = (arr: readonly number[]): number | null => {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// 16バケットのヒストグラムから中央値バケットの代表距離(バケット中点)を返す。
const medianBucketDist = (buckets: readonly number[]): number | null => {
  const total = buckets.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const half = total / 2;
  let cum = 0;
  for (let i = 0; i < buckets.length; i++) {
    cum += buckets[i];
    if (cum >= half) return i * DIST_BUCKET_PX + DIST_BUCKET_PX / 2;
  }
  return (buckets.length - 1) * DIST_BUCKET_PX + DIST_BUCKET_PX / 2;
};

// enemyMeleeDist(gameStore.ts)と同式(BOT_AND_GHOST.md §2.6「ボスの判定帯への最近点距離」)。
// store非依存を保つため gameStore.ts からは import せず、その式が使っている pure な部品
// (enemyHitStrip/isHiddenBoss)だけを直接使う。
const bossBandDist = (px: number, py: number, e: Enemy): number => {
  const r = isHiddenBoss(e.type) ? { x: e.x, y: e.y, width: e.width, height: e.height } : enemyHitStrip(e);
  const nx = Math.max(r.x, Math.min(px, r.x + r.width));
  const ny = Math.max(r.y, Math.min(py, r.y + r.height));
  return Math.hypot(px - nx, py - ny);
};

// §6.38 B1.5-6(賞金首): isEngageableBoss→isGhostEligibleBossへ(この計測は最終的にbossStyles経由で
// notifyBossClearへ流れ込むため、賞金首を早い入口(ここ)で既に除いておく=下流ゲートの二重管理を防ぐ)。
const nearestEngagedBoss = (pcx: number, pcy: number, enemies: readonly Enemy[]): Enemy | null => {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (!isGhostEligibleBoss(e.type) || e.dormant === true) continue;
    const d = Math.hypot((e.x + e.width / 2) - pcx, (e.y + e.height / 2) - pcy);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
};

const blend = (sample: number | null, base: number, isFirstEverSave: boolean): number => {
  if (sample === null) return base; // このノブは今回計測できなかった=前回値(無ければ種)を維持
  return isFirstEverSave ? sample : base * (1 - EMA_ALPHA) + sample * EMA_ALPHA;
};

// ---- 保留バッファ(v0.25.2476 社長裁定「リザルトで今回のプレイを守護霊に反映しない、を選べるように」) ----
// endSession(ボス交戦セッション確定)と foldSubStyleTallies(サブ様式のラン集計)は、ここへ「記録」を
// 積むだけで localStorage には触らない。リザルトを閉じる操作で settlePendingTraits() が
// commit(既定)か全破棄を行う。commit は積んだ順に「load→従来と同一の式でEMA→save」を1件ずつ
// 再生するので、既定経路の保存結果は旧実装(即時保存)とビットレベルで一致する(テストで固定)。

/** ボス交戦セッション1件ぶんの確定サンプル(endSession時点で計算済み・commit時にEMA混合)。 */
export interface PendingSessionRecord {
  kind: 'session';
  reactionSample: number | null;
  counterChanceSample: number | null;
  preferredDistSample: number | null;
  meleeBiasSample: number | null;
  mobilitySample: number | null;
  hitsPerMinSample: number | null;
  subUsesPerMinSample: number | null;
  stationarySample: number | null;
  approachSample: number | null;
  moveTally: MoveReactionState['tally'];
  /** GHOST-CMD-1B: 避け方向の癖のセッション集計(dodgeで確定したエピソードの3分類カウント)。 */
  dodgeDirSample: DodgeDirTally;
  /** GHOST-CMD-2A: 隙コマンドのセッション集計(文脈ごとのrush/shoot票)。 */
  punishSample: PunishTally;
  /** ★§8: 近接の間合いの癖のセッション標本(接敵0件なら n=0=前回値を保つ)。 */
  meleeSpacingSample: MeleeSpacingProfile | null;
  srcClass: string | null;
  snapshot: PlayerBuildSnapshot | null;
  /** v0.25.2477: セッション確定時点のプレイヤー名(loadPlayerName=無ければ生成される)。 */
  srcName: string | null;
}

/** サブ様式のラン集計1件ぶん。分母(ラン総与ダメージ)は積む時点で確定する(resetBotTelemetry耐性)。 */
export interface PendingSubStyleRecord {
  kind: 'subStyle';
  tally: SubStyleTally;
  totalDamage: number;
}

/**
 * G5(BOT_AND_GHOST.md §2.10 仕様2/3): ボス撃破1件ぶんの保留レコード。サンプルは
 * PendingSessionRecordと**同じセッション確定値**(撃破ボスの数だけ複製・EMAはしない=ベスト保持のみ)。
 */
export interface PendingBossStyleRecord {
  kind: 'bossStyle';
  slotKey: string;
  reactionSample: number | null;
  counterChanceSample: number | null;
  preferredDistSample: number | null;
  meleeBiasSample: number | null;
  mobilitySample: number | null;
  hitsPerMinSample: number | null;
  subUsesPerMinSample: number | null;
  stationarySample: number | null;
  approachSample: number | null;
  /** GHOST-CMD-1B: 避け方向の癖(セッションレコードと同じ確定値の写し)。 */
  dodgeDirSample: DodgeDirTally;
  /** GHOST-CMD-2A: 隙コマンドの票(セッションレコードと同じ確定値の写し)。 */
  punishSample: PunishTally;
  srcClass: string | null;
  snapshot: PlayerBuildSnapshot | null;
  srcName: string | null;
  at: number;
  /** v0.25.2603(社長式): 記録の勝ち負けを決める評点。null=比較不能(技に一度も晒されていない)。
   * 交戦時間はこのボスの clearTimeMs を使う(セッション全体ではなく**そのボスと戦った時間**)。 */
  perfScoreSample: number | null;
  /** v0.25.2603(社長裁定A): リザルトで**明示的に「採用」された**撃破か。
   * true の時はベスト保持の比較を通さず**無条件で上書き**する(社長の意思が自動判定に勝つ)。
   * undefined/false = 自動判定(下の isBetterBossStyleSample)に委ねる。 */
  adopted?: boolean;
  /** v0.25.2493: 交戦開始→撃破の時間(ms・撃破の瞬間に確定)。 */
  clearTimeMs: number;
  /** v0.25.2553(§2.16 A): 撃破の瞬間に同行していた守護霊の写し(不在ならnull)。 */
  ally: GhostAllySnapshot | null;
}

export type PendingTraitRecord = PendingSessionRecord | PendingSubStyleRecord | PendingBossStyleRecord;

let pendingRecords: PendingTraitRecord[] = [];

const endSession = (): void => {
  const s = session;
  session = null;
  if (!s) return;
  const durationMs = s.lastGameTime - s.startGameTime;
  // v0.25.2493(社長裁定「Bは混ぜない。基本的に残るのは撃破だけ。その後死のうが生きようが残る」):
  // **撃破が無かったセッションは軸1(共通スタイル)にも混ぜず丸ごと破棄**。逃げて交戦を切った負け戦が
  // EMAへ混ざる旧挙動(v0.25.2441〜2492)はここで終了。撃破済みならこの後どこで死んでも保留バッファに
  // 残る(リザルト経由でcommit)=裁定どおり。サブ様式(ラン単位・ボス交戦に非依存)は対象外で従来どおり。
  if (s.clearedSlots.length === 0) return;
  // v0.25.2579(社長報告「城ボスを倒したのに記録されない・採用UIも出ない」の真因): 旧実装は
  // 30秒フロア(§2.6「短い交戦は混ぜない」)が撃破チェックより**前**にあり、撃破スロット記録まで
  // 丸ごと捨てていた=**30秒未満で倒し切った最速の勝ち戦ほど記録が消える**。裁定v0.25.2493
  // 「撃破は残る」と食い違うため適用先を分離: 撃破スロット(bossStyle)は交戦時間に関わらず必ず積む。
  // フロアは軸1(共通スタイル=sessionレコード)だけに適用する(下のif)。短い交戦のスタイル標本が
  // 薄いのは§2.18の裁定(n=1でも事実は事実)どおり許容。
  const sessionLongEnough = durationMs >= MIN_SESSION_MS;

  const telemetryEnd = getBotTelemetry();
  const meleeDelta = Math.max(0, telemetryEnd.damageDealt.melee - s.telemetryStart.damageDealt.melee);
  const gunDelta = Math.max(0, telemetryEnd.damageDealt.gun - s.telemetryStart.damageDealt.gun);
  const meleeBiasSample = (meleeDelta + gunDelta) > 0 ? meleeDelta / (meleeDelta + gunDelta) : null;
  // G2.6: サブウェポン使用回数(全キー合算)の区間差分(スナップショット差分方式=他ノブと同じ掟)。
  const subUsesTotal = (t: BotTelemetry): number =>
    Object.values(t.subUses).reduce<number>((a, b) => a + (b ?? 0), 0);
  const subUsesDelta = Math.max(0, subUsesTotal(telemetryEnd) - subUsesTotal(s.telemetryStart));

  const reactionRaw = median(s.reactionSamplesMs);
  const reactionSample = reactionRaw === null ? null
    : Math.max(REACTION_CLAMP_MIN, Math.min(REACTION_CLAMP_MAX, reactionRaw));
  const counterChanceSample = s.opportunities > 0 ? s.successes / s.opportunities : null;
  const preferredDistSample = medianBucketDist(s.distBuckets);
  const mobilitySample = s.totalTicks > 0 ? s.movedTicks / s.totalTicks : null;
  const hitsPerMinSample = durationMs > 0 ? s.hits / (durationMs / 60000) : null;
  const subUsesPerMinSample = durationMs > 0 ? subUsesDelta / (durationMs / 60000) : null;
  const stationarySample = s.motionTicks > 0 ? s.stationaryTicks / s.motionTicks : null;
  const approachSample = durationMs > 0 ? s.approachEpisodes / (durationMs / 60000) : null;
  // v0.25.2467/2468: クラスとステータス写しは従来のendSession時点(=いま)の値を確定して積む。
  const srcClass = sessionSrcClass;
  // v0.25.2514(裁定4): PHILLの実測(ラン累計)をこのセッションのビルド写しへ焼き込む。
  // 母数0(PHILLを撃っていないラン)なら率は載せない=消費側は0扱い(ヘッドショットしない)。
  const snapshot: PlayerBuildSnapshot | null = sessionSnapshot === null
    ? null
    : phillShots > 0
      ? { ...sessionSnapshot, phillShots, phillHeadshots, phillHeadshotRate: phillHeadshots / phillShots }
      : sessionSnapshot;
  // v0.25.2477: プレイヤー名も同じくendSession時点で確定(未設定なら台帳が初期名を生成して返す)。
  const srcName = loadPlayerName();
  // G4a: 技への反応表の確定(開いている/残響中のエピソードも全部畳む)。
  // GHOST-CMD-1B: 避け方向の癖(dodgeDir)も同じ確定で返る。30秒フロアの手前で確定するのは、
  // 撃破スロット(bossStyle=フロア対象外・v0.25.2579)にも同じサンプルを写すため。フロアの適用先は
  // 従来どおり軸1(sessionレコード)だけ=既存ゲートに新しい例外は作らない。
  const moveResult = endMoveReactions(s.moveReactions);
  // GHOST-CMD-2A: まだ開いている隙の窓も畳んで票にする(moveReactionの開きエピソードと同じ流儀)。
  closePunishEpisodes(s.punish, s.punishTally, telemetryEnd.damageDealt.melee);
  const punishSample = s.punishTally;

  // v0.25.2476: サンプル計算は従来のまま。ここで保存せず保留バッファへ積む(EMA混合はcommit時)。
  // v0.25.2579: 軸1(共通スタイル)だけ30秒フロアの対象(撃破スロットは下のループで無条件に積む)。
  if (sessionLongEnough) {
    pendingRecords.push({
      kind: 'session',
      reactionSample, counterChanceSample, preferredDistSample, meleeBiasSample, mobilitySample,
      hitsPerMinSample, subUsesPerMinSample,
      // G4a: 移動2ノブのサンプル+技への反応表(+GHOST-CMD-1Bの避け方向)の確定値。
      stationarySample, approachSample,
      moveTally: moveResult.tally,
      dodgeDirSample: moveResult.dodgeDir,
      punishSample, // GHOST-CMD-2A: 隙コマンドの票(文脈別)
      // ★§8: 間合いの癖(接敵イベント0件なら n=0 → blend が前回値を保つ)。
      meleeSpacingSample: foldMeleeSpacing(s.spacing, durationMs),
      srcClass, snapshot, srcName,
    });
  }

  // G5(§2.10 仕様2): このセッション中に撃破されたslotごとに、同じ確定値を写した保留レコードを積む
  // (EMAはしない=ベスト保持はcommit時)。v0.25.2493: clearTimeMs=撃破の瞬間に確定した交戦時間を写す。
  for (const cleared of s.clearedSlots) {
    pendingRecords.push({
      kind: 'bossStyle', slotKey: cleared.key,
      reactionSample, counterChanceSample, preferredDistSample, meleeBiasSample, mobilitySample,
      hitsPerMinSample, subUsesPerMinSample, stationarySample, approachSample,
      dodgeDirSample: moveResult.dodgeDir, // GHOST-CMD-1B: セッションと同じ確定値の写し
      punishSample,                        // GHOST-CMD-2A: 同上(丸ごと写し)
      // v0.25.2603(社長式): 評点=1技あたりの平均点(時間では割らない。速さはタイブレーク)。
      perfScoreSample: bossStylePerfScore(moveResult.tally, cleared.clearTimeMs),
      srcClass, snapshot, srcName, at: Date.now(), clearTimeMs: cleared.clearTimeMs,
      ally: cleared.ally, // v0.25.2553(§2.16 A): 撃破の瞬間に写した同行守護霊(不在ならnull)
    });
  }
};

/**
 * 純関数: 保留セッション1件を旧endSessionと**同一の式・同一の順序**でプロファイルへ畳む。
 * (prev=null なら初回保存=サンプルそのまま。EMAの数学は不変=旧実装とビット一致がテストで固定される。)
 */
export const applyPendingSession = (prev: PlayerProfile | null, r: PendingSessionRecord): PlayerProfile => {
  const base: PlayerProfile = prev ?? { v: 1 as const, runs: 0, ...SEED_PROFILE, moveReactions: {}, subStyles: defaultSubStyles() };
  const isFirstEverSave = prev === null;
  return {
    v: 1,
    runs: base.runs + 1,
    reactionMs: blend(r.reactionSample, base.reactionMs, isFirstEverSave),
    counterChance: blend(r.counterChanceSample, base.counterChance, isFirstEverSave),
    preferredDist: blend(r.preferredDistSample, base.preferredDist, isFirstEverSave),
    meleeBias: blend(r.meleeBiasSample, base.meleeBias, isFirstEverSave),
    mobility: blend(r.mobilitySample, base.mobility, isFirstEverSave),
    hitsPerMin: blend(r.hitsPerMinSample, base.hitsPerMin, isFirstEverSave),
    subUsesPerMin: blend(r.subUsesPerMinSample, base.subUsesPerMin, isFirstEverSave),
    stationaryFrac: blend(r.stationarySample, base.stationaryFrac, isFirstEverSave),
    approachPerMin: blend(r.approachSample, base.approachPerMin, isFirstEverSave),
    // 技への反応表は技ごとにn=0を初回として個別にEMA(blendMoveReactionTable内)。
    moveReactions: blendMoveReactionTable(base.moveReactions, r.moveTally, EMA_ALPHA),
    // GHOST-CMD-1B: 避け方向の癖も同じ数式で1キー分だけ混合(サンプル0なら前回値=欠損なら欠損のまま)。
    dodgeDir: blendDodgeDirStat(base.dodgeDir, r.dodgeDirSample, EMA_ALPHA),
    // GHOST-CMD-2A: 隙コマンドも同じ数式を文脈ごとに適用(票0の文脈は前回値を維持=欠損なら欠損のまま)。
    punish: blendPunishProfile(base.punish, r.punishSample, EMA_ALPHA),
    // ★§8: 間合いの癖も同じ数式。**nullのノブは前回値を保つ**(測れなかったを0で上書きしない)。
    meleeSpacing: blendMeleeSpacing(base.meleeSpacing, r.meleeSpacingSample, EMA_ALPHA),
    // サブ様式はボス交戦区間に限定しない=セッションではなくラン単位(subStyleレコード)で更新する。
    subStyles: base.subStyles,
    // v0.25.2467: 計測時のクラス(このセッションで観測できなければ前回値を保持)。
    srcClass: r.srcClass ?? base.srcClass,
    // v0.25.2468: 計測時ステータスの写し(同上)。
    snapshot: r.snapshot ?? base.snapshot,
    // v0.25.2477: 計測時のプレイヤー名(同上)。
    srcName: r.srcName ?? base.srcName,
    // G5(§2.10): このレコード自体はbossStylesを触らない(bossStyleレコードは別途最後に適用される)が、
    // ここで持ち越さないと以前保存済みのbossStylesが毎セッションcommitで消えてしまうため必ず引き継ぐ。
    bossStyles: base.bossStyles,
  };
};

export interface PlayerTraitsTickInput {
  /** directorTickが毎tick計算している bossRelax(bossEngagedNowの結果)。新しい交戦判定は発明しない。 */
  inCombat: boolean;
  /** ゴースト(summons中のkind='ghost')が場に居るか。true の間は計測を丸ごと止める(§2.7 制約1)。 */
  ghostActive: boolean;
  /** G3(§2.7 制約1): ゴーストが出うるラン(守護霊装備 or `?ghost=1`)。true の間はラン全体で計測しない。 */
  ghostRunActive: boolean;
  gameTime: number;
  player: { x: number; y: number; width: number; height: number; health: number; maxHealth: number;
    /** v0.25.2467: 計測時のクラス(プロファイルsrcClassへ記録=ゴーストの絵の選択用)。 */
    characterClass?: string;
    /** v0.25.2468: 計測時ステータスの写し(snapshot)用。 */
    speed?: number; level?: number;
    /** GHOST-CMD-2A(§2.18追補): カウンター成立の錨点(Date.now基準・player.lastCounterSuccessTime)。
     * afterCounter文脈の窓判定に使う。省略(旧呼び出し/テスト)= その文脈は開かない。 */
    lastCounterSuccessTime?: number;
    /**
     * ★§8(間合いの癖): 「**プレイヤーが近接を振った**」の打刻(`Date.now`)。カウンター演出からは
     * 打たれない専用の打刻なので、これのエッジ=本人が振った瞬間。省略(旧呼び出し/テスト)=振らない扱い。
     */
    meleeSwingCommitAt?: number };
  /** v0.25.2514(§2.11 裁定1): ビルド写し(武器/スキル/装備/クリ率/サブ)の元になる本人オブジェクト。
   * 省略可(旧呼び出し/テスト)=その場合はビルド項目なしの旧snapshot相当だけを記録する。 */
  buildSource?: Player;
  /** v0.25.3271: 記録時に選択していたアバター(gameStore.avatarId・視覚のみ)。省略/undefinedはnull扱い。 */
  avatarId?: AvatarId | null;
  enemies: readonly Enemy[];
  /** このtickにプレイヤーの移動入力(上下左右いずれか)があったか。 */
  movementInput: boolean;
}

/** 毎tick1回、directorTickから呼ぶ。無効条件(非交戦/ゴースト同伴)ではスカラー比較のみで即return。 */
export const tickPlayerTraits = (input: PlayerTraitsTickInput): void => {
  if (input.ghostActive || input.ghostRunActive) {
    // §2.7 制約1: ゴースト同伴中/ゴーストが出うるラン(守護霊装備・?ghost=1)は計測しない。
    // 開いていたセッションがあれば保存せず破棄する
    // (「2人での戦い方」が次世代のゴーストへ紛れ込むのを防ぐ=劣化コピー防止)。
    // G4a: サブ様式のラン集計(ボス交戦に限定しない)も同じゲートに従う=このランの分は丸ごと破棄
    // (実際の破棄は foldSubStyleTallies がこのフラグを見て行う)。
    subStyleGhostRun = true;
    session = null;
    return;
  }
  if (!input.inCombat) {
    if (session) endSession();
    return;
  }
  if (!session) session = startSession(input.gameTime);
  if (input.player.characterClass) sessionSrcClass = input.player.characterClass; // v0.25.2467
  if (input.buildSource) {
    // v0.25.2514(§2.11 裁定1): ビルド丸ごと(武器ロードアウト/スキル+Lv/装備+集計効果/クリ率/サブ)を
    // 純粋コピーで控える。PHILL率はendSessionで焼く(ラン累計が母数なので確定はセッション終わり)。
    // v0.25.3271: アバター(視覚のみ)も同じスナップショットへ載せる。
    sessionSnapshot = snapshotPlayerBuild(input.buildSource, undefined, input.avatarId);
  } else if (input.player.speed !== undefined && input.player.level !== undefined) { // v0.25.2468(旧経路)
    sessionSnapshot = {
      maxHealth: input.player.maxHealth, speed: input.player.speed, level: input.player.level,
      avatarId: input.avatarId ?? null,
    };
  }
  const s = session;
  const prevGameTime = s.lastGameTime;
  s.lastGameTime = input.gameTime;
  const dtMs = input.gameTime - prevGameTime;
  s.totalTicks += 1;
  if (input.movementInput) s.movedTicks += 1;

  if (s.lastHealth !== null && input.player.health < s.lastHealth) s.hits += 1;
  s.lastHealth = input.player.health;

  // G4a(§2.9(1)): 技への反応表のエピソード開閉+自己中心技の暴露判定+残響の確定(純関数)。
  stepMoveReactions(s.moveReactions, input.enemies, input.player, input.gameTime);

  const pcx = input.player.x + input.player.width / 2;
  const pcy = input.player.y + input.player.height / 2;

  // G4a(§2.9(2)) stationaryFrac: 実座標の変位速度で「立ち止まっているtick」を数える(初tickはdt=0/前位置なしで対象外)。
  if (dtMs > 0 && s.lastPcx !== null && s.lastPcy !== null) {
    s.motionTicks += 1;
    const moveSpeed = Math.hypot(pcx - s.lastPcx, pcy - s.lastPcy) / (dtMs / 1000);
    if (moveSpeed < STATIONARY_SPEED_MAX_PX_PER_SEC) s.stationaryTicks += 1;
  }

  // ---- §8(SAME_ARENA): 近接の間合いの癖。**ボスに限らない**(雑魚に間合いへ入られた時の癖も
  // 幻影/守護霊が使う)ので、boss の早期returnより前で回す。
  {
    const commitAt = input.player.meleeSwingCommitAt ?? 0;
    const swungThisTick = s.lastSeenSwingCommitAt !== null && commitAt !== s.lastSeenSwingCommitAt;
    s.lastSeenSwingCommitAt = commitAt;
    stepMeleeSpacing(s.spacing, {
      enemies: input.enemies,
      pcx, pcy,
      reachPx: MELEE_RADIUS_MIRROR,
      gameTime: input.gameTime,
      swungThisTick,
      counterWindowOpen: counterOpportunityOpen(input.enemies, pcx, pcy, input.gameTime),
    });
  }

  const boss = nearestEngagedBoss(pcx, pcy, input.enemies);

  // GHOST-CMD-2A(§2.18追補): 隙(punish window)の計測。3文脈の窓を毎tick判定し、**閉じた瞬間に
  // 1票**入れる(窓中に近接与ダメが出た=`rush`/出ない=`shoot`)。窓判定は消費側(ghostDriver)と
  // 共有の純関数(punishWindow.ts)=気絶/硬直の判定をここで発明しない。boss=null(交戦相手が
  // 消えた瞬間)は stun/recover が閉じる=開いていた窓はここで票になる。
  stepPunishEpisodes(
    s.punish, s.punishTally,
    punishWindowsOpen(boss, input.gameTime, input.player.lastCounterSuccessTime, Date.now()),
    getBotTelemetry().damageDealt.melee,
  );

  if (!boss) {
    s.wasOpportunity = false;
    s.pendingOpportunityAt = null;
    s.approachAcc = 0;
    s.lastPcx = pcx;
    s.lastPcy = pcy;
    return;
  }

  const dist = bossBandDist(pcx, pcy, boss);
  const bucket = Math.max(0, Math.min(DIST_BUCKET_COUNT - 1, Math.floor(dist / DIST_BUCKET_PX)));
  s.distBuckets[bucket] += 1;

  // G4a(§2.9(2)) approachPerMin: **プレイヤー自身の移動による**接近量だけを積む(ボスの現在位置を
  // 固定して前tick位置→今tick位置の距離差を取る=ボス側が跳んで距離が縮んでも数えない。ボスの
  // 場外退避(g-dive)やジャンプで距離が暴れても汚れない)。累計がAPPROACH_EPISODE_PXで1エピソード。
  if (dtMs > 0 && s.lastPcx !== null && s.lastPcy !== null) {
    const bcx = boss.x + boss.width / 2, bcy = boss.y + boss.height / 2;
    const closing = Math.hypot(s.lastPcx - bcx, s.lastPcy - bcy) - Math.hypot(pcx - bcx, pcy - bcy);
    if (closing / (dtMs / 1000) < -APPROACH_RESET_SPEED_PX_PER_SEC) {
      s.approachAcc = 0; // 明確な後退で仕切り直し
    } else if (closing > 0) {
      s.approachAcc += closing;
      if (s.approachAcc >= APPROACH_EPISODE_PX) {
        s.approachEpisodes += 1;
        s.approachAcc = 0;
      }
    }
  }

  const opportunityNow = dist <= OPPORTUNITY_RANGE && isBossCounterableNowApprox(boss.aiPhase, boss.bossState);
  if (opportunityNow && !s.wasOpportunity) {
    s.opportunities += 1;
    s.pendingOpportunityAt = Date.now();
  } else if (!opportunityNow && s.wasOpportunity) {
    s.pendingOpportunityAt = null; // 機会窓を捕まえられなかった(=不成立のまま閉じた)
  }
  s.wasOpportunity = opportunityNow;
  s.lastPcx = pcx;
  s.lastPcy = pcy;
};

/**
 * カウンター成立の通知(挙動不変・計測のみ)。フック点(BOT_AND_GHOST.md指示どおり1行ずつ):
 * combatTick.ts の dashParried 成立箇所 / angelBossTick.ts の angelCounterHit(miguel/jibril/rafi/
 * uri/suriel/acrasielの共通処理) / useGameLoop.ts の thorCounterHit・hiddenBossCounterHit・
 * idolCounterHit。開いている「機会」窓が無ければ何もしない(ボス戦以外での通常カウンターは無視)。
 */
export const notifyCounterHit = (): void => {
  const s = session;
  if (!s || s.pendingOpportunityAt === null) return;
  const reactionMs = Date.now() - s.pendingOpportunityAt;
  s.reactionSamplesMs.push(reactionMs);
  s.successes += 1;
  s.pendingOpportunityAt = null; // 同じ窓での二重成立を防ぐ(次のnotifyCounterHitは機会なしとして無視される)。
  // **s.wasOpportunity はここで触らない**: エッジ検知(機会=カウンター可能状態に入った回数)と
  // 成立(pendingOpportunityAt)は別物。ここで false に戻すと、まだ同じwindup/recoverが続いている
  // 次tickに opportunityNow===true(継続中)&&wasOpportunity===false という偽の立ち上がりが起き、
  // 同じ窓が2回目の「機会」として二重計上されてしまう(実装中に発覚したバグ)。
};

// ==== G4a(BOT_AND_GHOST.md §2.9): 記録専用の通知フック ==========================================

/**
 * カウンター成立の通知(技への反応表用・挙動不変)。フック点=counterMaster.refundCounterCooldownの
 * 呼び出し箇所と同じ7箇所(①弾反射/②ジャンプ着地パリィ/③突進パリィ=combatTick.ts、
 * ④thorCounterHit/⑤hiddenBossCounterHit/⑥idolCounterHit=useGameLoop.ts、⑦angelCounterHit=
 * angelBossTick.ts)。セッションが無ければ(非交戦/ゴーストラン)何もしない。
 * ※G1のnotifyCounterHit(機会→成立のマッチング)とは独立: あちらの呼び出し箇所は増やさない
 * (増やすと既存counterChanceノブの計測が変わる)。
 */
export const notifyMoveCounter = (): void => {
  if (session) markMoveReactionCounter(session.moveReactions);
};

/**
 * 裁定4(PHILL・§2.11): PHILL銃(phill-revolver)を1発撃った(gameStore.firePhillShotの発砲確定点に1行)。
 * 記録専用=挙動不変。ラン単位の累計で、撃破セッション確定時にビルド写しへ率として焼かれる。
 * ※ゴーストランでも数えるが、そのランのセッション自体が保存されない(§2.7 制約1)ので影響しない。
 */
export const recordPhillShot = (): void => { phillShots += 1; };

/**
 * 裁定4(PHILL): PHILL弾が頭部に命中した(useGameLoopの着弾ロールでheadshot===trueになった合流点に1行)。
 * 記録専用=挙動不変。
 */
export const recordPhillHeadshot = (): void => { phillHeadshots += 1; };

/**
 * 技キー付き被弾の通知(技への反応表用・挙動不変)。gameStore.damagePlayerが
 * damageSourceMove(オプション引数・既定undefined=従来どおり)を受け取った時だけ呼ぶ。
 */
export const notifyMoveDamage = (moveKey: string): void => {
  if (session) markMoveReactionHit(session.moveReactions, moveKey);
};

/**
 * ★技への反応表の**読み口**(research/BOSS_GAUNTLET.md 検出器3・v0.25.3603)。**記録専用・挙動不変**。
 *
 * なぜ要るか: 反応表は「撃破してリザルトを通ったセッション」だけがプロファイルへcommitされ、
 * 途中経過を**外から読む口が1つも無かった**。ガントレット(1戦ごとに読んで畳む)や、
 * 撃破に至らなかった戦い(タイムアウト・死亡)の記録がそのまま消えてしまう。
 *
 * ★**ディープコピーを返す**(CLAUDE.md 実装精度の規律3=集計のアンカーは必ずコピー)。
 * 生きた参照を返すと、呼び出し側が控えた「開始時点」が後から書き換わって差分が常に0になる。
 *
 * 粗さ(読む人向け): tally は**確定したエピソード**の集計。まだ開いている技・残響(linger)中の技は
 * 入らない(それらは技が切り替わるか残響が切れた時に足される)。
 */
export const snapshotMoveTally = (): MoveReactionState['tally'] => {
  const src = session?.moveReactions.tally;
  if (!src) return {};
  const out: MoveReactionState['tally'] = {};
  for (const key of Object.keys(src) as (keyof MoveReactionState['tally'])[]) {
    const row = src[key];
    if (row) out[key] = { exposures: row.exposures, counters: row.counters, hits: row.hits };
  }
  return out;
};

/**
 * 技への反応表を**この時点から測り直す**(1戦ごとに区切って読むため)。記録専用・挙動不変。
 * エピソード状態機械ごと作り直す=開いている技・残響も捨てる(前の戦いの残りを次の戦いへ持ち越さない)。
 * セッションが無い(非交戦/ゴーストラン)時は何もしない。
 */
export const resetMoveTally = (): void => {
  if (session) session.moveReactions = createMoveReactionState();
};

// ==== G5(BOT_AND_GHOST.md §2.10): ボス撃破の通知(1行フック) ======================================

/**
 * ボス撃破の通知。呼び出し箇所の全数表はBOT_AND_GHOST.md §2.10実装結果を参照
 * (gameStore.damageEnemyの死亡分岐+grantMeleeKillRewardsの2箇所=近接/銃/接触/爆発/DoT/カウンター等
 * 全キル経路の合流点)。**セッション(ボス交戦計測)が開いている時だけ**記録する(セッション外の死亡は
 * 無視=狭い側)。ゴーストランは§2.7の既存ゲート(tickPlayerTraitsがghostActive/ghostRunActiveの間
 * session=null にする)により自動的に記録されない(劣化コピー防止・軸1と同じ理屈)。
 * 対象は `isGhostEligibleBoss`(bossEngagement.tsが正本=isEngageableBoss−賞金首)の型のみ
 * (reaper/hunter/pumpkin/lab-zombie-3等は無視。§6.38 v6 B-2で賞金首も対象外に追加)。
 *
 * v0.25.2553(§2.16 A): 第3引数 `ally` = **撃破の瞬間に召喚中だった同行守護霊の写し**
 * (呼び出し側が `ghostAllySnapshot(findGhostAlly(summons))` で作る)。省略/nullなら「同行者なし」=未保存。
 */
export const notifyBossClear = (
  bossType: EnemyType, stageId: string, ally: GhostAllySnapshot | null = null,
): void => {
  const s = session;
  // §6.38 v6 B-2(賞金首): ソロ台帳にも賞金首を乗せない(isEngageableBoss − 賞金首 = isGhostEligibleBoss)。
  if (!s || !isGhostEligibleBoss(bossType)) return;
  const key = bossStyleSlotKey(bossType, stageId);
  // v0.25.2493: 撃破タイム=交戦開始→撃破(撃破の瞬間に確定=同tick精度)。
  // v0.25.2577(社長裁定「ボスごとのタイムにはしたいな」): 起点はそのまま、時計を**ボスごと**の
  // 共有時計(bossClock.ts)から読む。旧: セッション窓1本=交戦が途切れない連戦で2体目のタイムが
  // 1体目の交戦開始から数えられていた。時計が無い縮退のみ旧来のセッション窓へフォールバック。
  if (!s.clearedSlots.some(c => c.key === key)) {
    const clockMs = bossClockDurationMs(key);
    s.clearedSlots.push({ key, clearTimeMs: clockMs ?? (s.lastGameTime - s.startGameTime), ally });
  }
};

// ==== G4a(§2.9(3)): サブウェポンの様式カウンタ(ラン単位・ボス交戦区間に限定しない) ==============
// サブの使い方は平時に出るため、セッション(ボス交戦区間)ではなくラン全体で数え、ラン境界
// (gameStore.resetGame)で foldSubStyleTallies がプロファイルへEMA混合する。
interface SubStyleTally {
  wireSlams: number;
  wirePlants: number;
  shieldPlacements: number;
  shieldBashes: number;
  shieldBashDamage: number;
  /** GHOST-SUBS-FINAL: ホーミングの「押す→離す」保持時間(ms)の合計と回数(平均はfold時に取る)。 */
  homingHoldCount: number;
  homingHoldSumMs: number;
}
const createSubStyleTally = (): SubStyleTally => ({
  wireSlams: 0, wirePlants: 0, shieldPlacements: 0, shieldBashes: 0, shieldBashDamage: 0,
  homingHoldCount: 0, homingHoldSumMs: 0,
});
let subStyleTally: SubStyleTally = createSubStyleTally();
// このランでゴースト系が有効だったか(§2.7 制約1)。tickPlayerTraitsが立て、foldが見て丸ごと破棄する。
let subStyleGhostRun = false;

/** wire-anchor発動の様式(gameStore.triggerWireAnchorの既存分岐に1行ずつ)。slam=敵ヒット/plant=地点プラント。 */
export const recordWireAnchorUse = (kind: 'slam' | 'plant'): void => {
  if (kind === 'slam') subStyleTally.wireSlams += 1;
  else subStyleTally.wirePlants += 1;
};

/** shield設置1回(useGameLoopの設置ブロックに1行)。 */
export const recordShieldPlacement = (): void => {
  subStyleTally.shieldPlacements += 1;
};

/** shieldバッシュ1回(近接スイングで盾を押し出した瞬間。gameStoreの既存バッシュイベントに1行)。 */
export const recordShieldBash = (count = 1): void => {
  subStyleTally.shieldBashes += count;
};

/** shieldバッシュの与ダメージ(バッシュで敵に入れたdmgの累計)。 */
export const recordShieldBashDamage = (amount: number): void => {
  subStyleTally.shieldBashDamage += amount;
};

/**
 * GHOST-SUBS-FINAL(社長裁定2026-07-31): ホーミングを「押してから離して撃つまで」の保持時間(ms)。
 * 呼び出し点=useGameLoopのホーミングブロック(指が離れて実際に発射が成立したフレーム)1箇所。
 * 記録専用=挙動不変。ゴーストランは既存ゲート(foldSubStyleTalliesがsubStyleGhostRunで丸ごと破棄)に従う。
 */
export const recordHomingHold = (holdMs: number): void => {
  if (!Number.isFinite(holdMs) || holdMs < 0) return;
  subStyleTally.homingHoldCount += 1;
  subStyleTally.homingHoldSumMs += holdMs;
};

/**
 * ラン境界でサブ様式集計を**保留バッファへ積む**(v0.25.2476: 即保存からの保留化。実際のEMA混合は
 * commitPendingTraits)。settlePendingTraits(リザルトを閉じる操作)から、**resetBotTelemetry()より
 * 前に**呼ばれること(バッシュ与ダメ割合の分母=ラン総与ダメージをbotTelemetry.damageDealtから
 * 読んでここで確定するため。リセット後だと分母が常に0になる)。
 * - ゴーストが出うるランだった場合は積まず破棄(§2.7 制約1=6ノブの計測停止と同じゲート)。
 * - プロファイル未保存なら保存しない、の判定は**commit時**(applyPendingSubStyle適用時)に行う:
 *   同ラン内の先行ボスセッションがcommitでプロファイルを新規作成するケースがあり、判定順を
 *   旧実装(セッション保存→fold)と揃えないと結果が変わるため。
 */
export const foldSubStyleTallies = (): void => {
  const t = subStyleTally;
  const wasGhostRun = subStyleGhostRun;
  subStyleTally = createSubStyleTally();
  subStyleGhostRun = false;
  if (wasGhostRun) return;
  const wireUses = t.wireSlams + t.wirePlants;
  // 何も使っていないランはプロファイルに触らない(ホーミングだけ使ったランも拾う=v0.25.2563)。
  if (wireUses === 0 && t.shieldPlacements === 0 && t.homingHoldCount === 0) return;
  const tel = getBotTelemetry();
  pendingRecords.push({
    kind: 'subStyle',
    tally: t,
    totalDamage: tel.damageDealt.gun + tel.damageDealt.melee + tel.damageDealt.other,
  });
};

/**
 * 純関数: 保留サブ様式1件を旧foldSubStyleTallies後半と**同一の式**でプロファイルへ畳む。
 * prev=null(プロファイル未保存)のスキップは呼び出し側(commitPendingTraits)が行う:
 * ここで新規作成すると loadPlayerProfile()!==null になり、守護霊ランのゴーストが
 * defaultGhostProfile(casual: counterChance0.65等)ではなくSEED(0.5)で動いてしまう=
 * 「挙動1bit不変」の掟に反するため(記録より不変を優先する保守側の裁定・従来どおり)。
 */
export const applyPendingSubStyle = (prev: PlayerProfile, r: PendingSubStyleRecord): PlayerProfile => {
  const t = r.tally;
  const wireUses = t.wireSlams + t.wirePlants;
  const wire = prev.subStyles.wire;
  const nextWire = wireUses > 0
    ? {
      n: wire.n + wireUses,
      slamRatio: wire.n > 0
        ? wire.slamRatio * (1 - EMA_ALPHA) + (t.wireSlams / wireUses) * EMA_ALPHA
        : t.wireSlams / wireUses,
    }
    : wire;

  const shield = prev.subStyles.shield;
  let nextShield = shield;
  if (t.shieldPlacements > 0) {
    const totalDamage = r.totalDamage;
    const bashPerSample = t.shieldBashes / t.shieldPlacements;
    const fracSample = totalDamage > 0 ? t.shieldBashDamage / totalDamage : null;
    nextShield = {
      n: shield.n + t.shieldPlacements,
      bashPerPlacement: shield.n > 0
        ? shield.bashPerPlacement * (1 - EMA_ALPHA) + bashPerSample * EMA_ALPHA
        : bashPerSample,
      bashDamageFrac: fracSample === null
        ? shield.bashDamageFrac // 分母が無い(このランは与ダメ0)=このレートだけ前回値を維持
        : shield.n > 0
          ? shield.bashDamageFrac * (1 - EMA_ALPHA) + fracSample * EMA_ALPHA
          : fracSample,
    };
  }

  // GHOST-SUBS-FINAL: ホーミングの保持時間もwire/shieldと**同じ流儀**でEMA(初回はサンプルそのまま)。
  const homing = prev.subStyles.homing ?? defaultSubStyles().homing;
  const holdSample = t.homingHoldCount > 0 ? t.homingHoldSumMs / t.homingHoldCount : null;
  const nextHoming = holdSample === null
    ? homing
    : {
      n: homing.n + t.homingHoldCount,
      holdMsAvg: homing.n > 0
        ? homing.holdMsAvg * (1 - EMA_ALPHA) + holdSample * EMA_ALPHA
        : holdSample,
    };
  return { ...prev, subStyles: { wire: nextWire, shield: nextShield, homing: nextHoming } };
};

// ==== G5(BOT_AND_GHOST.md §2.10): ボス別攻略スタイル(軸2)の commit 側 ==========================

/**
 * v0.25.2603(社長式 + 社長の「上手いの概念」= **カウンター > 避ける > 当たらない > 早い**):
 * 記録の勝ち負けを決める**評点**。高いほど良い。
 *
 *   評点 = (カウンター×3 + 避けた技 − 食らった技) ÷ **技の回数**
 *   同点なら撃破が速い方(=「そして早い」は最後の優先度=タイブレーク)
 *
 * **分母が「時間」ではなく「技の回数」なのが要点**(社長式からの唯一の変更・v0.25.2603で検算):
 * 時間で割ると「早い」が全項目に掛かる支配項になり、社長が**最後**に置いた優先度が**最優先**に
 * 化ける。技の回数で割れば「来た技にどう応えたか」だけを率として測れる
 * (全部カウンター=3.0 / 全部回避=0 / 全部被弾=−2.0)。速さは最後に秒数として引く。
 *
 * - **弾を撃つ技は「避けた/食らった」を数えない**(避けようが当たろうが弾は弾)。
 *   **ただしカウンター(反射)が成立した回だけは分子・分母とも数える**(社長の但し書き)。
 * - 「カウンターしたら避けにはしない」は計測側が既に保証している(1エピソード=
 *   counter > hit > dodge の**排他**分類・moveReaction.ts)。二重計上は構造的に起きない。
 *
 * 旧基準(被弾/分)は**分あたり**だったため「1発20秒=3.0/分」が「3発3分=1.0/分」に負ける=
 * **速く倒すほど不利**という直感に反する挙動だった(社長報告「上書きしたはずなのに前の守護霊が出る」)。
 */
/**
 * v0.25.2818(社長式・確定): 記録の勝ち負けを決める**評点**。高いほど良い。
 *
 *   評点 = 60 × (3×カウンター率 − 2×被弾率) − かかった秒数
 *
 * 全技カウンター=3分短縮、全技被弾=2分加算の価値として、腕と速さを同じ秒尺度で比べる。
 *
 * 設計の根拠(いずれも検算で確かめた。**むやみに項を足さないこと**):
 *  - **避けた数は入れない。** 1つの技は必ず カウンター/避け/被弾 のどれか1つに決まる(排他3分類・
 *    moveReaction.ts)ので、カウンター率と被弾率が決まれば避け率は自動的に決まる=独立した情報ではない。
 *    しかも避けに点を付けると重み比が勝手にズレる: 避け+1点にすると式は
 *    `1 + 2×カウンター率 − 3×被弾率` に化け、確定した3:2とは別の評価になる。
 *  - **DPSは入れない。** ボスのHPは固定なので DPS = HP/交戦時間 = **1/時間そのもの**。
 *    時間と別に足すと同じものを2回数える(そもそもボス毎の与ダメージは計測していない)。
 *  - **時間は引き算・スケールは60。** 基礎値1.0=60評点=60秒ぶん、実時間は1秒ごとに1評点を引く。
 *    したがってカウンター重み3は3分、被弾重み2は2分にそのまま対応する。全技カウンターでも
 *    極端に遅ければ、速く無傷で倒した記録が上回れる。
 *  - **生の回数ではなく率で比べる。** 回数を足すと、同じ腕でも技を20回出された長期戦が10回の戦いの
 *    2倍稼げてしまう。技数で割った率なら「来た技へどう応えたか」を戦闘時間と分離して比べられる。
 *
 * 旧基準(被弾/分)は**分あたり**だったため「1発20秒=3.0/分」が「3発3分=1.0/分」に負ける=
 * **速く倒すほど不利**という直感に反する挙動だった(社長報告「上書きしたはずなのに前の守護霊が出る」)。
 */
export const MOVE_COUNTER_WEIGHT = 3;
/** 被弾(ミス)の重み(社長指定・**引く**側なので正の数で持つ)。 */
export const MOVE_HIT_WEIGHT = 2;
/** 基礎値1.0が何秒ぶんの価値か。60=基礎値1.0が60評点、実時間は1秒ごとに1評点減点。 */
export const PERF_TIME_SCALE_SEC = 60;

/**
 * 純関数: 技への反応表(1セッションぶんの生tally)と交戦時間から評点を出す。
 *
 *   評点 = 60 × (3×カウンター率 − 2×被弾率) − かかった秒数
 *
 * 技に一度も晒されていない(分母0)なら null=**比較不能**(比較側が扱いを決める)。
 *
 * 弾を撃つ技の扱い(社長の但し書き「弾はカウントしない。ただしカウンターしたらカウンターをカウント」):
 * **カウンターできた回だけ**分子・分母の両方に数える。避け/被弾は数えない(分母にも入れない——
 * 入れると弾幕の多いボスほど分母が膨らんで近接技のカウンター率が薄まるため)。
 */
export const bossStylePerfScore = (
  tally: Readonly<Record<string, MoveReactionTally>>,
  durationMs: number,
): number | null => {
  if (!(durationMs > 0)) return null;
  let counters = 0, hits = 0, moves = 0;
  for (const [key, t] of Object.entries(tally)) {
    counters += t.counters;
    if (isProjectileMoveKey(key)) { moves += t.counters; continue; } // 弾技=反射できた回だけ
    moves += t.exposures;
    hits += t.hits;
  }
  if (moves === 0) return null;
  const base = MOVE_COUNTER_WEIGHT * (counters / moves) - MOVE_HIT_WEIGHT * (hits / moves);
  return PERF_TIME_SCALE_SEC * base - durationMs / 1000;
};

/**
 * 純関数(ベスト保持判定): 新しい撃破の方が良ければ true。
 *  1. 評点が高い方
 *  2. 同点なら**撃破が速い方**(社長の順位の最後=タイブレーク)
 *  3. それも同じなら新しい方(スナップショット/レベルが新鮮)
 * 例外:
 *  - **既存slotが無い(初記録)** → 必ず採用。評点が出せなくても残す(比較相手が居ない)。
 *  - **既存slotに評点が無い**(旧レコード / 技への反応表を持たないボス=天使・idol・裏ボス3体)
 *    → 比較の土台が無いので**新しい方**を採用(それらのボスでは実質「最新の撃破が残る」)。
 *  - 既存には評点があるのに新サンプルが null(技に晒される前に倒し切った等) → 既存を守る(保守側)。
 */
export const isBetterBossStyleSample = (
  prevScore: number | null | undefined,
  nextScore: number | null,
  hasPrevSlot = prevScore !== undefined,
  prevClearMs?: number | null,
  nextClearMs?: number | null,
): boolean => {
  if (!hasPrevSlot) return true;
  // 既存記録に評点が無い(旧レコード / 技への反応表を持たないボス)=比較の土台が無い → 新しい方を採る。
  // ※この順序が要点: 下の「新サンプルnullは不採用」より**先**に置く。逆にすると、計測対象外のボスは
  //   両方nullで永久に初回の記録が居座る(=ビルドを更新できない)。
  if (prevScore === null || prevScore === undefined) return true;
  if (nextScore === null) return false; // 既存には評点があるのに今回は比較不能 → 既存を守る(保守側)
  if (nextScore !== prevScore) return nextScore > prevScore;
  if (prevClearMs != null && nextClearMs != null && nextClearMs !== prevClearMs) return nextClearMs < prevClearMs;
  return true;
};

/**
 * 純関数: ボス別スロットのsubStyles写し=「そのラン実測レート(EMAなし)」(§2.10 仕様4)。
 * applyPendingSubStyleのサンプル計算と同じ式だが、既存値との混合(EMA)はしない
 * (1ラン分の生値のみ=撃破ランそのものの様式を写す)。
 */
export const sampleSubStylesFromRecord = (r: PendingSubStyleRecord): SubStyleProfile => {
  const t = r.tally;
  const wireUses = t.wireSlams + t.wirePlants;
  const wire = wireUses > 0 ? { n: wireUses, slamRatio: t.wireSlams / wireUses } : defaultSubStyles().wire;
  const shield = t.shieldPlacements > 0
    ? {
      n: t.shieldPlacements,
      bashPerPlacement: t.shieldBashes / t.shieldPlacements,
      bashDamageFrac: r.totalDamage > 0 ? t.shieldBashDamage / r.totalDamage : 0,
    }
    : defaultSubStyles().shield;
  const homing = t.homingHoldCount > 0
    ? { n: t.homingHoldCount, holdMsAvg: t.homingHoldSumMs / t.homingHoldCount }
    : defaultSubStyles().homing;
  return { wire, shield, homing };
};

/**
 * 純関数: 保留bossStyleレコード1件をベスト保持規則(isBetterBossStyleSample)でプロファイルへ適用する。
 * subStylesForSlotは呼び出し側(commitPendingTraits)が仕様4のとおり解決して渡す
 * (同ランにsubStyleレコードが有ればsampleSubStylesFromRecord、無ければcommit後の軸1コピー)。
 */
export const applyPendingBossStyle = (
  prev: PlayerProfile, r: PendingBossStyleRecord, subStylesForSlot: SubStyleProfile,
): PlayerProfile => {
  // v0.25.2604(社長裁定・最終): **守護霊のデータは評点を見ずに必ず最新の撃破で上書きする。**
  // 理由=「じゃないとリプレイにならん」。この写しは"戦績"ではなく**その戦いの再生データ**なので、
  // ベスト保持にすると霊が過去の自分のまま固まり、今の腕・今のビルドを映さなくなる。
  // 評点(perfScore)は**表示(記録更新バッジ/討伐記録一覧)と既定の基準**にだけ使う=ここでは使わない。
  // どのスロットを書くか自体は、リザルトの採用チェック(selectPendingForSettlement)が先に絞っている。
  // GHOST-CMD-1B: そのセッションの生値(EMAなし=prev:undefinedへの適用はサンプルそのまま)。
  // 分類できたdodgeが無いセッションはundefined=載せない(消費側が軸1へフォールバック)。
  const dodgeDir = blendDodgeDirStat(undefined, r.dodgeDirSample, EMA_ALPHA);
  // GHOST-CMD-2A: 隙コマンドも同じ扱い(そのセッションの生値・票が1つも無ければ載せない)。
  const punish = blendPunishProfile(undefined, r.punishSample, EMA_ALPHA);
  const slot: BossStyleSlot = {
    ...(r.ally ? { ally: r.ally } : {}), // v0.25.2553(§2.16 A): 同行者が居た撃破だけ写しを載せる
    ...(dodgeDir ? { dodgeDir } : {}),
    ...(punish ? { punish } : {}),
    reactionMs: r.reactionSample,
    counterChance: r.counterChanceSample,
    preferredDist: r.preferredDistSample,
    meleeBias: r.meleeBiasSample,
    mobility: r.mobilitySample,
    hitsPerMin: r.hitsPerMinSample,
    perfScore: r.perfScoreSample ?? undefined, // v0.25.2603: 記録の勝ち負けを決める評点(社長式)
    knobsV: GHOST_KNOB_SET_V,
    subUsesPerMin: r.subUsesPerMinSample,
    stationaryFrac: r.stationarySample,
    approachPerMin: r.approachSample,
    subStyles: subStylesForSlot,
    srcClass: r.srcClass,
    snapshot: r.snapshot,
    srcName: r.srcName,
    at: r.at,
    clearTimeMs: r.clearTimeMs, // v0.25.2493: 討伐記録一覧用(表示はカウンター成功率と併記)
  };
  return { ...prev, bossStyles: { ...(prev.bossStyles ?? {}), [r.slotKey]: slot } };
};

// ==== 保留バッファの決算(リザルト画面が呼ぶ・v0.25.2476) ==========================================

/** リザルト表示用: このランで保留中の記録が1件以上あるか(=チェックボックスを出す条件)。 */
export const hasPendingTraitRecords = (): boolean => pendingRecords.length > 0;

/**
 * リザルト年表(§2.13/§2.16 B)用の読み取り専用ビュー: **このランで撃破した順**に保留中の
 * bossStyleレコードを並べて返す(保留バッファは撃破順に積まれる)。コピーを返す=UI側が触っても
 * 保留バッファは汚れない。**スコアは保存しない裁定**なので、ここも生値(撃破タイム/被弾per分/
 * カウンター成功率)だけを渡し、合成はUI側(ghostAlbum.ts)が表示時に行う。
 */
export interface PendingBossClearView {
  slotKey: string;
  clearTimeMs: number;
  hitsPerMin: number | null;
  counterChance: number | null;
  /** v0.25.2603(社長式): 記録の勝ち負けを決める評点。「記録更新」表示の判定に使う。 */
  perfScore: number | null;
  at: number;
  ally: GhostAllySnapshot | null;
}

export const pendingBossClears = (): PendingBossClearView[] =>
  pendingRecords
    .filter((r): r is PendingBossStyleRecord => r.kind === 'bossStyle')
    .map(r => ({
      slotKey: r.slotKey,
      clearTimeMs: r.clearTimeMs,
      hitsPerMin: r.hitsPerMinSample,
      counterChance: r.counterChanceSample,
      perfScore: r.perfScoreSample,
      at: r.at,
      ally: r.ally,
    }));

/**
 * 純関数(§2.16 A スロット別決算): リザルトの「守護霊へ採用」チェックを保留バッファへ適用する。
 * - `adopted === undefined`: **従来どおり全採用**(1文字も落とさない=既定経路のビット一致を保つ)。
 * - 保留に撃破(bossStyle)が1件も無い: 採用の対象が存在しない=そのまま返す(サブ様式だけのランは従来どおり)。
 * - 採用が0件(全不採用): **全破棄**=従来の「今回のプレイを守護霊に反映しない」と同義。
 * - 採用が1件以上: 採用スロットのbossStyleレコードだけを残し、**軸1(session/subStyle)は反映する**
 *   (§2.13「軸1(共通傾向)は採用1件以上のセッションぶんのみ反映」)。
 */
export const selectPendingForSettlement = (
  records: readonly PendingTraitRecord[],
  adopted: readonly string[] | undefined,
): PendingTraitRecord[] => {
  if (adopted === undefined) return [...records];
  const hasBossStyle = records.some(r => r.kind === 'bossStyle');
  if (!hasBossStyle) return [...records];
  const keep = new Set(adopted);
  // v0.25.2603(社長裁定A): 残った撃破=社長がリザルトで**明示的に採用**したもの。印を付けて渡し、
  // commit側(applyPendingBossStyle)はベスト保持の比較を通さず無条件で上書きする。
  // adopted===undefined(年表を出さない=撃破なしのラン等)はここへ来ないので、自動判定の経路は不変。
  const kept = records.filter(r => r.kind !== 'bossStyle' || keep.has(r.slotKey))
    .map(r => (r.kind === 'bossStyle' ? { ...r, adopted: true } : r));
  if (!kept.some(r => r.kind === 'bossStyle')) return []; // 全不採用=反映しない
  return kept;
};

/**
 * 保留バッファを積んだ順に「load→従来と同一の式でEMA→save」で1件ずつ再生して確定する(既定経路)。
 * 旧実装は各確定点で即 load/save していたので、同順再生の結果はビットレベルで一致する
 * (JSONの数値round-tripは可逆・保存はplayerTraitsだけが行うため間に割り込む書き手も居ない)。
 *
 * G5(§2.10 仕様4): session/subStyle は**従来どおり先に、積んだ順で**適用する(=軸1の保存結果は
 * 旧実装とビット一致のまま。bossStyleが混ざっていてもこのループは1文字も変わらない)。bossStyleは
 * 後段でまとめて**最後に**適用する。
 */
export const commitPendingTraits = (): void => {
  const records = pendingRecords;
  pendingRecords = [];
  const bossStyleRecords: PendingBossStyleRecord[] = [];
  for (const r of records) {
    if (r.kind === 'session') {
      saveProfile(applyPendingSession(loadPlayerProfile(), r));
    } else if (r.kind === 'subStyle') {
      const prev = loadPlayerProfile();
      if (prev === null) continue; // applyPendingSubStyleのコメント参照(新規作成はセッションだけ)
      saveProfile(applyPendingSubStyle(prev, r));
    } else {
      bossStyleRecords.push(r); // G5: 最後にまとめて適用する(下記)
    }
  }
  if (bossStyleRecords.length === 0) return;
  // 仕様4: 同ラン(=このバッチ)にsubStyleレコードが有ればそのラン実測レート(EMAなし)を、
  // 無ければcommit後の軸1subStylesをそのまま写す。
  const subStyleRecord = records.find((r): r is PendingSubStyleRecord => r.kind === 'subStyle');
  for (const r of bossStyleRecords) {
    // v0.25.2579(裁定v0.25.2493「撃破は残る」の徹底): 軸1が未保存でも撃破スロットは保存する
    // (旧: prev===nullでスキップ=初プレイヤーの初撃破が30秒未満だと記録ごと消えた)。
    // ベースはapplyPendingSessionの初回作成と同じSEED形。subStyleは従来どおり保守側(新規作成しない)。
    const prev = loadPlayerProfile()
      ?? { v: 1 as const, runs: 0, ...SEED_PROFILE, moveReactions: {}, subStyles: defaultSubStyles() };
    const subStylesForSlot = subStyleRecord ? sampleSubStylesFromRecord(subStyleRecord) : prev.subStyles;
    saveProfile(applyPendingBossStyle(prev, r, subStylesForSlot));
  }
};

/** 保留バッファを全破棄する(「今回のプレイを守護霊に反映しない」)。localStorageには触らない。 */
export const discardPendingTraits = (): void => {
  pendingRecords = [];
};

/**
 * リザルト画面を閉じる操作(OK/もう一度プレイ/メニューに戻る)で1回呼ぶ決算の合流点。
 * まずサブ様式のラン集計を保留に積み(ゴーストラン/未使用ならno-op)、チェック状態に応じて
 * commit(optOut=false・既定)か全破棄(optOut=true)する。resetGame(次ラン開始)より前=
 * botTelemetryがまだ生きているうちに呼ばれる前提(分母の確定はfold側)。2回呼んでも2回目はno-op。
 *
 * v0.25.2553(§2.16 A スロット別決算): 第2引数 `adoptedSlotKeys` = リザルト年表で「守護霊へ採用」に
 * チェックが入っているボススロット。**省略(undefined)なら従来どおり全採用**(年表を出さないラン=
 * 撃破なし/ベンチ等はこの経路のまま)。空配列(全不採用)は「反映しない」と同義=全破棄になる。
 */
export const settlePendingTraits = (optOut: boolean, adoptedSlotKeys?: readonly string[]): void => {
  foldSubStyleTallies();
  if (optOut) { discardPendingTraits(); return; }
  pendingRecords = selectPendingForSettlement(pendingRecords, adoptedSlotKeys);
  commitPendingTraits();
};

// ==== G5(BOT_AND_GHOST.md §2.10 仕様5): 消費側(召喚時の合成) ======================================

/**
 * 純関数: 召喚時のプロファイル合成。`profile.bossStyles?.[slotKey]` が有れば**ノブ単位で軸2値を
 * 優先**(そのノブがnull=このセッションでは計測できなかった場合だけ軸1へフォールバック)、
 * snapshot/srcClass/srcNameもslot優先(絵と名前=その撃破ランのもの)。moveReactionsは共有のまま
 * (軸2に複製しない=常に軸1のものを使う)。slotが無ければ軸1をそのまま返す。
 * **ghostDriver.ts はこの関数を経由するだけで変更不要**(戻り値はPlayerProfileのまま=形は不変)。
 */
export const effectiveGhostProfile = (profile: PlayerProfile, slotKey: string): PlayerProfile => {
  const slot = profile.bossStyles?.[slotKey];
  if (!slot) return profile;
  return {
    ...profile,
    reactionMs: slot.reactionMs ?? profile.reactionMs,
    counterChance: slot.counterChance ?? profile.counterChance,
    preferredDist: slot.preferredDist ?? profile.preferredDist,
    meleeBias: slot.meleeBias ?? profile.meleeBias,
    mobility: slot.mobility ?? profile.mobility,
    hitsPerMin: slot.hitsPerMin ?? profile.hitsPerMin,
    subUsesPerMin: slot.subUsesPerMin ?? profile.subUsesPerMin,
    stationaryFrac: slot.stationaryFrac ?? profile.stationaryFrac,
    approachPerMin: slot.approachPerMin ?? profile.approachPerMin,
    // GHOST-CMD-1B: 避け方向の癖もノブ単位でslot優先(slot欠損=そのセッションで分類できたdodgeなし
    // →軸1へフォールバック。軸1も欠損ならundefined=消費側はバイアス0)。
    dodgeDir: slot.dodgeDir ?? profile.dodgeDir,
    // GHOST-CMD-2A: 隙コマンドもノブ単位でslot優先(slot欠損=そのセッションで票なし→軸1へ。
    // 両方欠損=undefined=消費側は既定の'rush')。
    punish: slot.punish ?? profile.punish,
    subStyles: slot.subStyles,
    srcClass: slot.srcClass ?? profile.srcClass,
    snapshot: slot.snapshot ?? profile.snapshot,
    srcName: slot.srcName ?? profile.srcName,
  };
};

// gameStore.resetGame(ラン開始)で呼ぶ。前ランの未確定セッションを持ち越さない
// (テストの beforeEach リセットにも使う。localStorage には触らない)。
// G4a: サブ様式のラン集計とゴーストフラグも一緒にリセットする。
// v0.25.2476: 保留バッファも破棄する——通常経路はリザルトの settlePendingTraits が先に決算済みで
// 空のはず。ここに残っている=リザルトを経由しなかったランの記録なので、破棄が安全側(仕様どおり)。
export const resetPlayerTraits = (): void => {
  session = null;
  subStyleTally = createSubStyleTally();
  subStyleGhostRun = false;
  pendingRecords = [];
  // v0.25.2514(裁定4): PHILL計測もラン単位=ラン境界でリセット。
  phillShots = 0;
  phillHeadshots = 0;
};
