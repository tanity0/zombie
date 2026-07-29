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
import type { Enemy } from '../types/game';
import { getBotTelemetry, snapshotBotTelemetry, type BotTelemetry } from './botTelemetry';
import { isEngageableBoss } from './bossEngagement';
import { isBossCounterableNowApprox } from './bossScript';
import { isHiddenBoss } from './enemyUtils';
import { enemyHitStrip } from '../pixi/renderSpec';

// ---- 保存フォーマット -------------------------------------------------------------------------
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
}

const STORAGE_KEY = 'zombie-ghost-profile-v1';

// 何もデータが無い状態から最初のEMAを起こす時の「種」の値(botSkillのcasual相当に寄せた叩き台)。
// ghostDriver.ts の defaultGhostProfile とは別に持つ(playerTraits はゴーストの既定値そのものには
// 関与しない=循環import回避。数値がここと重複するのは意図的=どちらも「casual相当」の同じ目安のため)。
const SEED_PROFILE: Omit<PlayerProfile, 'v' | 'runs'> = {
  reactionMs: 250, counterChance: 0.5, preferredDist: 180, meleeBias: 0.4, mobility: 0.6, hitsPerMin: 3,
  // G2.6: 控えめな既定値(ghostDriver.DEFAULT_SUB_USES_PER_MINと同値=どちらも「casual相当」の目安。
  // 重複は意図的=循環import回避、上のコメント参照)。旧フォーマット(このノブが無い保存)の欠損埋めにも使う。
  subUsesPerMin: 2,
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
    && (o.subUsesPerMin === undefined || typeof o.subUsesPerMin === 'number');
};

/** 保存済みプロファイル。無ければ null(G2側が既定プロファイルへフォールバックする)。 */
export const loadPlayerProfile = (): PlayerProfile | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidProfile(parsed)) return null;
    // 後方互換: 旧フォーマット(subUsesPerMin無し)は控えめな既定値(SEED)で埋めて返す。
    return { ...parsed, subUsesPerMin: parsed.subUsesPerMin ?? SEED_PROFILE.subUsesPerMin };
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
}

let session: Session | null = null;

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
});

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
  const counterChanceSample = s.opportunities > 0 ? s.successes / s.opportunities : null;
  const preferredDistSample = medianBucketDist(s.distBuckets);
  const mobilitySample = s.totalTicks > 0 ? s.movedTicks / s.totalTicks : null;
  const hitsPerMinSample = durationMs > 0 ? s.hits / (durationMs / 60000) : null;
  const subUsesPerMinSample = durationMs > 0 ? subUsesDelta / (durationMs / 60000) : null;

  const prev = loadPlayerProfile();
  const base = prev ?? { v: 1 as const, runs: 0, ...SEED_PROFILE };
  const isFirstEverSave = prev === null;
  const next: PlayerProfile = {
    v: 1,
    runs: base.runs + 1,
    reactionMs: blend(reactionSample, base.reactionMs, isFirstEverSave),
    counterChance: blend(counterChanceSample, base.counterChance, isFirstEverSave),
    preferredDist: blend(preferredDistSample, base.preferredDist, isFirstEverSave),
    meleeBias: blend(meleeBiasSample, base.meleeBias, isFirstEverSave),
    mobility: blend(mobilitySample, base.mobility, isFirstEverSave),
    hitsPerMin: blend(hitsPerMinSample, base.hitsPerMin, isFirstEverSave),
    subUsesPerMin: blend(subUsesPerMinSample, base.subUsesPerMin, isFirstEverSave),
  };
  saveProfile(next);
};

export interface PlayerTraitsTickInput {
  /** directorTickが毎tick計算している bossRelax(bossEngagedNowの結果)。新しい交戦判定は発明しない。 */
  inCombat: boolean;
  /** ゴースト(summons中のkind='ghost')が場に居るか。true の間は計測を丸ごと止める(§2.7 制約1)。 */
  ghostActive: boolean;
  gameTime: number;
  player: { x: number; y: number; width: number; height: number; health: number; maxHealth: number };
  enemies: readonly Enemy[];
  /** このtickにプレイヤーの移動入力(上下左右いずれか)があったか。 */
  movementInput: boolean;
}

/** 毎tick1回、directorTickから呼ぶ。無効条件(非交戦/ゴースト同伴)ではスカラー比較のみで即return。 */
export const tickPlayerTraits = (input: PlayerTraitsTickInput): void => {
  if (input.ghostActive) {
    // §2.7 制約1: ゴースト同伴中は計測しない。開いていたセッションがあれば保存せず破棄する
    // (「2人での戦い方」が次世代のゴーストへ紛れ込むのを防ぐ=劣化コピー防止)。
    session = null;
    return;
  }
  if (!input.inCombat) {
    if (session) endSession();
    return;
  }
  if (!session) session = startSession(input.gameTime);
  const s = session;
  s.lastGameTime = input.gameTime;
  s.totalTicks += 1;
  if (input.movementInput) s.movedTicks += 1;

  if (s.lastHealth !== null && input.player.health < s.lastHealth) s.hits += 1;
  s.lastHealth = input.player.health;

  const pcx = input.player.x + input.player.width / 2;
  const pcy = input.player.y + input.player.height / 2;
  const boss = nearestEngagedBoss(pcx, pcy, input.enemies);
  if (!boss) {
    s.wasOpportunity = false;
    s.pendingOpportunityAt = null;
    return;
  }

  const dist = bossBandDist(pcx, pcy, boss);
  const bucket = Math.max(0, Math.min(DIST_BUCKET_COUNT - 1, Math.floor(dist / DIST_BUCKET_PX)));
  s.distBuckets[bucket] += 1;

  const opportunityNow = dist <= OPPORTUNITY_RANGE && isBossCounterableNowApprox(boss.aiPhase, boss.bossState);
  if (opportunityNow && !s.wasOpportunity) {
    s.opportunities += 1;
    s.pendingOpportunityAt = Date.now();
  } else if (!opportunityNow && s.wasOpportunity) {
    s.pendingOpportunityAt = null; // 機会窓を捕まえられなかった(=不成立のまま閉じた)
  }
  s.wasOpportunity = opportunityNow;
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

// gameStore.resetGame(ラン開始)で呼ぶ。前ランの未確定セッションを持ち越さない
// (テストの beforeEach リセットにも使う。localStorage には触らない)。
export const resetPlayerTraits = (): void => { session = null; };
