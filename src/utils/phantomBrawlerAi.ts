// research/BRAWLER_PHANTOM.md §4-2: 格闘の幻影(拳鬼)の頭脳(判定だけの純関数・store/PixiJS 非依存)。
//
// 幻影の上で、プレイヤーと同じ格闘の状態機械(utils/brawler.ts)を回す。ここは「いま何を押すか」だけを決める
// (押した後の段・技・つながり・取り消し・秘奥義の数えは、プレイヤーと同じ純関数がそのまま担う)。
// 反応は人の下限(HUMAN_REACTION_MS=250ms)を通す。読みで張る構えは、プレイヤーの近接の「当たりを解く時刻」の
// リズム(gameTime で記録)から予測する(前隙が反応の下限より短いので、見てからは間に合わない=プレイヤーと同条件)。
import type { BrawlerState, BrawlerTechKind } from './brawlerTypes';
import {
  BRAWLER_KICK_RANGE, BRAWLER_KIKO_RANGE, BRAWLER_SECRET_GAP_MS, BRAWLER_SECRET_ORDER, BRAWLER_GUARD_MS,
  brawlerCanPay, brawlerPressDecision, brawlerTechAllowed, brawlerTechCost, isBrawlerGuardingAt,
} from './brawler';
import { HUMAN_REACTION_MS } from './bossSkeleton';

/** 連続が切れてから次の連続までの息継ぎ(ms・叩き台)。 */
export const PB_BREATH_MIN_MS = 300;
export const PB_BREATH_MAX_MS = 700;
/** 構えた後、次に構えるまで(ms)。受けると技ポイントが全回復するので、張り続けると亀になる。 */
export const PB_GUARD_COOLDOWN_MS = 3000;
/** リズムの記録が足りない間、間合いの内で構えを振る間隔(ms)と確率の係数。 */
export const PB_PRESSURE_ROLL_MS = 600;
export const PB_PRESSURE_GUARD_K = 0.25;
/** 当たりのリズムを覚える数。 */
export const PB_RHYTHM_KEEP = 6;
/** 秘奥義を狙う間隔(ms・叩き台)。 */
export const PB_SECRET_COOLDOWN_MS = 20_000;
/** 当たった2・3段目から技へ取り消す確率の基準(人格の meleeBias を掛ける)。 */
export const PB_CANCEL_BASE = 0.35;

/** 頭脳の持ち越し(PhantomTickState に置く)。 */
export interface PhantomBrawlerMind {
  /** 次の連続を始めてよい時刻(息継ぎ)。 */
  nextStringAt: number;
  /** 次に構えてよい時刻。 */
  guardReadyAt: number;
  /** 間合いの圧で構えを振った最後の時刻。 */
  lastPressureRollAt: number;
  /** プレイヤーの近接の当たりを解いた時刻(gameTime・新しい順ではなく古い順)。 */
  strikeTimes: number[];
  /** 予測した当たりに対して構えを振ったか(同じ予測で2回振らない)。 */
  rolledForPredictedAt: number;
  /** 秘奥義を狙っている間(順番を進める)。 */
  secretPlan: boolean;
  /** 前に秘奥義を狙い始めた時刻。 */
  lastSecretAt: number;
  /** 秘奥義の1手目(蹴り)を出したか。 */
  secretLaunched: boolean;
  /** 前の tick までに見た、プレイヤーの meleeSwingCommitAt(Date.now)。変化したら当たりを解いた。 */
  lastSeenCommitAt: number;
  /** 直前に立っていた「行動中」の印(行動が終わった瞬間を拾う)。 */
  wasBusy: boolean;
}
export const createPhantomBrawlerMind = (): PhantomBrawlerMind => ({
  nextStringAt: 0, guardReadyAt: 0, lastPressureRollAt: -Infinity, strikeTimes: [], rolledForPredictedAt: -1,
  secretPlan: false, lastSecretAt: -Infinity, secretLaunched: false, lastSeenCommitAt: 0, wasBusy: false,
});

/** プレイヤーの当たりを解いた時刻を覚える(古い順・上限つき)。 */
export const notePlayerStrike = (m: PhantomBrawlerMind, gameTime: number): void => {
  m.strikeTimes.push(gameTime);
  if (m.strikeTimes.length > PB_RHYTHM_KEEP) m.strikeTimes.splice(0, m.strikeTimes.length - PB_RHYTHM_KEEP);
};

/** 次の当たりの予測時刻(gameTime)。記録が2回未満なら null。間隔の中央値を最後の当たりへ足す。 */
export const predictNextStrikeAt = (times: readonly number[]): number | null => {
  if (times.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  gaps.sort((a, b) => a - b);
  const mid = gaps.length % 2 === 1 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
  if (!(mid > 0)) return null;
  return times[times.length - 1] + mid;
};

export type PhantomBrawlerAction =
  | { kind: 'attack' }
  | { kind: 'buffer' }
  | { kind: 'tech'; tech: BrawlerTechKind }
  | { kind: 'step'; dirX: number; dirY: number }
  | null;

export interface PhantomBrawlerInput {
  s: BrawlerState;
  t: number;
  /** 幻影の中心からプレイヤーの箱の縁までの距離(px)。 */
  edgeDist: number;
  /** 幻影の近接の届く距離(huntingMeleeRadius=74)。 */
  reach: number;
  /** 間合いに入ってから人の反応の下限が経ったか(入った瞬間に打ち始めない=今の幻影の reachSwingReady と同じ考え方)。 */
  reachReady: boolean;
  /** プレイヤーの近接の届く距離(読みの間合い)。 */
  playerReach: number;
  /** 気功の見通し(壁に遮られていない)。 */
  kikoClear: boolean;
  /** タイムキーパーの割引(技ごと)。 */
  discount: (kind: BrawlerTechKind) => number;
  /** 人格の癖。 */
  counterChance: number;
  meleeBias: number;
  /** 弾への対処(この tick で実行すべきもの)。返す=構え・避ける=ステップ(向き)。 */
  bullet: { kind: 'counter' } | { kind: 'dodge'; dirX: number; dirY: number } | null;
  rand: () => number;
}

/** 秘奥義の合計の値段(タイムキーパー込み)。 */
export const secretTotalCost = (discount: (kind: BrawlerTechKind) => number): number =>
  BRAWLER_SECRET_ORDER.reduce((a, k) => a + brawlerTechCost(k, false, discount(k)), 0);

const canTech = (i: PhantomBrawlerInput, kind: BrawlerTechKind): boolean =>
  brawlerCanPay(i.s, kind, false, i.discount(kind)) && brawlerTechAllowed(i.s, kind, i.t);

/**
 * いま何を押すか。行動中でも呼ぶ(当たった段からの技への取り消し・つながりの先行入力・秘奥義の順番)。
 * 秘奥義の最中・構えの最中は何もしない(構えの延長はしない=叩き台)。
 */
export const decidePhantomBrawler = (i: PhantomBrawlerInput, m: PhantomBrawlerMind): PhantomBrawlerAction => {
  const { s, t } = i;
  if (s.secret) { m.secretPlan = false; m.secretLaunched = false; return null; }
  if (isBrawlerGuardingAt(s, t)) return null;
  const idle = s.phase === 'idle';

  // 1 守り(弾): 返す=構え(ポイントがあれば)/避ける=ステップ(待機の時だけ)。
  if (i.bullet?.kind === 'counter' && t >= m.guardReadyAt && canTech(i, 'guard')) return { kind: 'tech', tech: 'guard' };
  if (i.bullet?.kind === 'dodge' && idle) return { kind: 'step', dirX: i.bullet.dirX, dirY: i.bullet.dirY };

  // 1 守り(近接の読み): 間合いの内で、予測した当たりが反応の下限の後〜構えの尺の内に来るなら、人格の確率で構える。
  const guardRange = i.reach + i.playerReach + 20;
  if (!m.secretPlan && i.edgeDist <= guardRange && t >= m.guardReadyAt && canTech(i, 'guard')) {
    const next = predictNextStrikeAt(m.strikeTimes);
    if (next !== null) {
      const dt = next - t;
      if (dt >= HUMAN_REACTION_MS && dt <= BRAWLER_GUARD_MS && m.rolledForPredictedAt !== next) {
        m.rolledForPredictedAt = next;
        if (i.rand() < i.counterChance) return { kind: 'tech', tech: 'guard' };
      }
    } else if (t - m.lastPressureRollAt >= PB_PRESSURE_ROLL_MS) {
      m.lastPressureRollAt = t;
      if (i.rand() < i.counterChance * PB_PRESSURE_GUARD_K) return { kind: 'tech', tech: 'guard' };
    }
  }

  // 2 秘奥義: 合計のポイントがあり・間隔が明けていて・蹴りの届く距離なら狙い始める。順番は今の進み(secretProgress)の次。
  if (!m.secretPlan && idle && t - m.lastSecretAt >= PB_SECRET_COOLDOWN_MS
    && s.points >= secretTotalCost(i.discount) && i.edgeDist <= BRAWLER_KICK_RANGE) {
    m.secretPlan = true;
    m.lastSecretAt = t;
  }
  if (m.secretPlan) {
    const prog = s.secretProgress ?? 0;
    // 1手目を出した後に順番が0のまま待機へ戻った(蹴りが外れた)/前の技の終わりから間が空いた=打ち切る。
    const gapOver = prog > 0 && idle && (s.secretLastEndAt ?? 0) > 0 && t - (s.secretLastEndAt ?? 0) > BRAWLER_SECRET_GAP_MS;
    if ((m.secretLaunched && prog === 0 && idle) || gapOver) {
      m.secretPlan = false; m.secretLaunched = false;
    } else {
      const kind = BRAWLER_SECRET_ORDER[Math.max(0, Math.min(BRAWLER_SECRET_ORDER.length - 1, prog))];
      if (!brawlerCanPay(s, kind, false, i.discount(kind))) { m.secretPlan = false; m.secretLaunched = false; return null; }
      // 1手目(蹴り)は待機からだけ。2手目以降は前の技が当たった後の取り消し・終わりの後のどちらでも。
      if ((prog > 0 || idle) && brawlerTechAllowed(s, kind, t) && !(prog === 0 && m.secretLaunched)) {
        if (prog === 0) m.secretLaunched = true;
        return { kind: 'tech', tech: kind };
      }
      return null;
    }
  }

  // 3 攻め: 当たった2・3段目から技へ取り消す。
  if (s.phase === 'attack' && s.resolved && s.connected && (s.stage === 2 || s.stage === 3)) {
    if (i.rand() < PB_CANCEL_BASE * i.meleeBias) {
      const pick: BrawlerTechKind = s.stage === 3 && canTech(i, 'stomp') ? 'stomp' : 'kick';
      if (canTech(i, pick)) return { kind: 'tech', tech: pick };
    }
  }
  // 届く距離の内: 通常の5段(押す/つながりの先行入力)。
  if (i.edgeDist <= i.reach) {
    const chainLive = s.nextStage > 1 && t <= s.chainUntil;
    if (idle && !chainLive && (t < m.nextStringAt || !i.reachReady)) return null; // 息継ぎ・反応の下限
    const d = brawlerPressDecision(s, t);
    if (d === 'start') return { kind: 'attack' };
    if (d === 'buffer' && !s.buffered && (s.phase !== 'attack' || s.connected || !s.resolved)) return { kind: 'buffer' };
    return null;
  }
  if (!idle) return null;
  if (t < m.nextStringAt) return null;
  // 届く距離の外: 飛び蹴り(220px以内)→気功(420px以内・見通しあり)。払えなければ歩く(null)。
  if (i.edgeDist <= BRAWLER_KICK_RANGE && canTech(i, 'kick')) return { kind: 'tech', tech: 'kick' };
  if (i.edgeDist <= BRAWLER_KIKO_RANGE && i.kikoClear && canTech(i, 'kiko')) return { kind: 'tech', tech: 'kiko' };
  return null;
};

/** 連続が切れた(行動中→待機・つながりの受付も過ぎた)時に、次の連続までの息継ぎを引く。 */
export const phantomBrawlerBreath = (rand: () => number): number =>
  PB_BREATH_MIN_MS + Math.max(0, Math.min(1, rand())) * (PB_BREATH_MAX_MS - PB_BREATH_MIN_MS);
