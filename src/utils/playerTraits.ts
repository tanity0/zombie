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
import type { Enemy } from '../types/game';
import { getBotTelemetry, snapshotBotTelemetry, type BotTelemetry } from './botTelemetry';
import { isEngageableBoss } from './bossEngagement';
import { isBossCounterableNowApprox } from './bossScript';
import { isHiddenBoss } from './enemyUtils';
import { enemyHitStrip } from '../pixi/renderSpec';
import {
  createMoveReactionState, stepMoveReactions, markMoveReactionCounter, markMoveReactionHit,
  endMoveReactions, blendMoveReactionTable,
  type MoveReactionState, type MoveReactionTable,
} from './moveReaction'; // G4a(BOT_AND_GHOST.md §2.9): 技への反応表の判定中核(純関数)
import { loadPlayerName } from './playerName'; // v0.25.2477: 計測時のプレイヤー名(srcName)の出どころ

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
  /** G4a(§2.9(3)): サブウェポンの様式カウンタ(ボス交戦区間に限定しない=ラン単位でEMA)。 */
  subStyles: SubStyleProfile;
  /** v0.25.2467(社長指示): 計測時のクラス(ゴーストの絵の選択用)。旧プロファイルには無い=任意。 */
  srcClass?: string;
  /** v0.25.2468(社長指示「HPというか全ステータスをそのまま再現」): 計測時のステータスの写し。
   * ゴーストはこれを100%再現する(無ければ召喚時の本人値へフォールバック)。 */
  snapshot?: { maxHealth: number; speed: number; level: number };
  /** v0.25.2477(社長指示「守護霊にプレイヤーの名前を頭上に表示」): 計測時のプレイヤー名
   * (playerName.ts の台帳)。srcClass/snapshotと同じ流儀=旧プロファイルには無い・欠損可。
   * 頭上表示はこの記録名を使う=将来オンラインで他人のゴーストが来た時に「その人の名前」が
   * 出る構造(§2.5 未決5=プロファイルは通信ペイロード)。 */
  srcName?: string;
}

const STORAGE_KEY = 'zombie-ghost-profile-v1';

// 何もデータが無い状態から最初のEMAを起こす時の「種」の値(botSkillのcasual相当に寄せた叩き台)。
// ghostDriver.ts の defaultGhostProfile とは別に持つ(playerTraits はゴーストの既定値そのものには
// 関与しない=循環import回避。数値がここと重複するのは意図的=どちらも「casual相当」の同じ目安のため)。
const SEED_PROFILE: Omit<PlayerProfile, 'v' | 'runs' | 'moveReactions' | 'subStyles'> = {
  reactionMs: 250, counterChance: 0.5, preferredDist: 180, meleeBias: 0.4, mobility: 0.6, hitsPerMin: 3,
  // G2.6: 控えめな既定値(ghostDriver.DEFAULT_SUB_USES_PER_MINと同値=どちらも「casual相当」の目安。
  // 重複は意図的=循環import回避、上のコメント参照)。旧フォーマット(このノブが無い保存)の欠損埋めにも使う。
  subUsesPerMin: 2,
  // G4a: 移動2ノブの種(casual相当の叩き台。G4bの消費側が入るまでは記録専用)。
  stationaryFrac: 0.35, approachPerMin: 3,
};

// G4a: 表/様式の「データ無し」初期値。n=0が「まだ計測していない」の印(n<3はG4b側で
// グローバルノブへフォールバックする約束=§2.9(1))なので、レート値はダミーの0でよい。
const defaultSubStyles = (): SubStyleProfile => ({
  wire: { n: 0, slamRatio: 0 },
  shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 },
});

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
    // G4a(§2.9)で追加した項目。同じく欠損を許し、load側で既定値を埋める(後方互換)。
    && (o.stationaryFrac === undefined || typeof o.stationaryFrac === 'number')
    && (o.approachPerMin === undefined || typeof o.approachPerMin === 'number')
    && (o.moveReactions === undefined || (typeof o.moveReactions === 'object' && o.moveReactions !== null))
    && (o.subStyles === undefined || (typeof o.subStyles === 'object' && o.subStyles !== null));
};

/** 保存済みプロファイル。無ければ null(G2側が既定プロファイルへフォールバックする)。 */
export const loadPlayerProfile = (): PlayerProfile | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidProfile(parsed)) return null;
    // 後方互換: 旧フォーマット(欠損ノブ)は控えめな既定値(SEED)/空表で埋めて返す。
    return {
      ...parsed,
      subUsesPerMin: parsed.subUsesPerMin ?? SEED_PROFILE.subUsesPerMin,
      stationaryFrac: parsed.stationaryFrac ?? SEED_PROFILE.stationaryFrac,
      approachPerMin: parsed.approachPerMin ?? SEED_PROFILE.approachPerMin,
      moveReactions: parsed.moveReactions ?? {},
      subStyles: parsed.subStyles ?? defaultSubStyles(),
    };
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
}

let session: Session | null = null;
// v0.25.2467: このプロセスで最後に計測対象になったクラス(fold時にプロファイルsrcClassへ記録)。
let sessionSrcClass: string | null = null;
// v0.25.2468: 計測時ステータスの写し(社長指示「全ステータスをそのまま再現」)。
let sessionSnapshot: { maxHealth: number; speed: number; level: number } | null = null;

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

const nearestEngagedBoss = (pcx: number, pcy: number, enemies: readonly Enemy[]): Enemy | null => {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (!isEngageableBoss(e.type) || e.dormant === true) continue;
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
  srcClass: string | null;
  snapshot: { maxHealth: number; speed: number; level: number } | null;
  /** v0.25.2477: セッション確定時点のプレイヤー名(loadPlayerName=無ければ生成される)。 */
  srcName: string | null;
}

/** サブ様式のラン集計1件ぶん。分母(ラン総与ダメージ)は積む時点で確定する(resetBotTelemetry耐性)。 */
export interface PendingSubStyleRecord {
  kind: 'subStyle';
  tally: SubStyleTally;
  totalDamage: number;
}

export type PendingTraitRecord = PendingSessionRecord | PendingSubStyleRecord;

let pendingRecords: PendingTraitRecord[] = [];

const endSession = (): void => {
  const s = session;
  session = null;
  if (!s) return;
  const durationMs = s.lastGameTime - s.startGameTime;
  if (durationMs < MIN_SESSION_MS) return; // §2.6: 交戦合計30秒未満は混ぜない

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
  // v0.25.2476: サンプル計算は従来のまま。ここで保存せず保留バッファへ積む(EMA混合はcommit時)。
  pendingRecords.push({
    kind: 'session',
    reactionSample,
    counterChanceSample: s.opportunities > 0 ? s.successes / s.opportunities : null,
    preferredDistSample: medianBucketDist(s.distBuckets),
    meleeBiasSample,
    mobilitySample: s.totalTicks > 0 ? s.movedTicks / s.totalTicks : null,
    hitsPerMinSample: durationMs > 0 ? s.hits / (durationMs / 60000) : null,
    subUsesPerMinSample: durationMs > 0 ? subUsesDelta / (durationMs / 60000) : null,
    // G4a: 移動2ノブのサンプル+技への反応表の確定(開いている/残響中のエピソードも全部畳む)。
    stationarySample: s.motionTicks > 0 ? s.stationaryTicks / s.motionTicks : null,
    approachSample: durationMs > 0 ? s.approachEpisodes / (durationMs / 60000) : null,
    moveTally: endMoveReactions(s.moveReactions),
    // v0.25.2467/2468: クラスとステータス写しは従来のendSession時点(=いま)の値を確定して積む。
    srcClass: sessionSrcClass,
    snapshot: sessionSnapshot,
    // v0.25.2477: プレイヤー名も同じくendSession時点で確定(未設定なら台帳が初期名を生成して返す)。
    srcName: loadPlayerName(),
  });
};

/**
 * 純関数: 保留セッション1件を旧endSessionと**同一の式・同一の順序**でプロファイルへ畳む。
 * (prev=null なら初回保存=サンプルそのまま。EMAの数学は不変=旧実装とビット一致がテストで固定される。)
 */
export const applyPendingSession = (prev: PlayerProfile | null, r: PendingSessionRecord): PlayerProfile => {
  const base = prev ?? { v: 1 as const, runs: 0, ...SEED_PROFILE, moveReactions: {}, subStyles: defaultSubStyles() };
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
    // サブ様式はボス交戦区間に限定しない=セッションではなくラン単位(subStyleレコード)で更新する。
    subStyles: base.subStyles,
    // v0.25.2467: 計測時のクラス(このセッションで観測できなければ前回値を保持)。
    srcClass: r.srcClass ?? base.srcClass,
    // v0.25.2468: 計測時ステータスの写し(同上)。
    snapshot: r.snapshot ?? base.snapshot,
    // v0.25.2477: 計測時のプレイヤー名(同上)。
    srcName: r.srcName ?? base.srcName,
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
    speed?: number; level?: number };
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
  if (input.player.speed !== undefined && input.player.level !== undefined) { // v0.25.2468
    sessionSnapshot = { maxHealth: input.player.maxHealth, speed: input.player.speed, level: input.player.level };
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

  const boss = nearestEngagedBoss(pcx, pcy, input.enemies);
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
 * 技キー付き被弾の通知(技への反応表用・挙動不変)。gameStore.damagePlayerが
 * damageSourceMove(オプション引数・既定undefined=従来どおり)を受け取った時だけ呼ぶ。
 */
export const notifyMoveDamage = (moveKey: string): void => {
  if (session) markMoveReactionHit(session.moveReactions, moveKey);
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
}
const createSubStyleTally = (): SubStyleTally => ({
  wireSlams: 0, wirePlants: 0, shieldPlacements: 0, shieldBashes: 0, shieldBashDamage: 0,
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
  if (wireUses === 0 && t.shieldPlacements === 0) return; // 何も使っていないランはプロファイルに触らない
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
  return { ...prev, subStyles: { wire: nextWire, shield: nextShield } };
};

// ==== 保留バッファの決算(リザルト画面が呼ぶ・v0.25.2476) ==========================================

/** リザルト表示用: このランで保留中の記録が1件以上あるか(=チェックボックスを出す条件)。 */
export const hasPendingTraitRecords = (): boolean => pendingRecords.length > 0;

/**
 * 保留バッファを積んだ順に「load→従来と同一の式でEMA→save」で1件ずつ再生して確定する(既定経路)。
 * 旧実装は各確定点で即 load/save していたので、同順再生の結果はビットレベルで一致する
 * (JSONの数値round-tripは可逆・保存はplayerTraitsだけが行うため間に割り込む書き手も居ない)。
 */
export const commitPendingTraits = (): void => {
  const records = pendingRecords;
  pendingRecords = [];
  for (const r of records) {
    if (r.kind === 'session') {
      saveProfile(applyPendingSession(loadPlayerProfile(), r));
    } else {
      const prev = loadPlayerProfile();
      if (prev === null) continue; // applyPendingSubStyleのコメント参照(新規作成はセッションだけ)
      saveProfile(applyPendingSubStyle(prev, r));
    }
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
 */
export const settlePendingTraits = (optOut: boolean): void => {
  foldSubStyleTallies();
  if (optOut) discardPendingTraits();
  else commitPendingTraits();
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
};
