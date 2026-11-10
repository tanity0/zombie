// research/BRAWLER_PHANTOM.md §4-2: 格闘の幻影(拳鬼)の頭脳(判定だけの純関数・store/PixiJS 非依存)。
//
// 幻影の上で、プレイヤーと同じ格闘の状態機械(utils/brawler.ts)を回す。ここは「いま何を押すか」だけを決める
// (押した後の段・技・つながり・取り消し・秘奥義の数えは、プレイヤーと同じ純関数がそのまま担う)。
// 反応は人の下限(HUMAN_REACTION_MS=250ms)を通す。読みで張る構えは、プレイヤーの近接の「当たりを解く時刻」の
// リズム(gameTime で記録)から予測する(前隙が反応の下限より短いので、見てからは間に合わない=プレイヤーと同条件)。
import type { BrawlerState, BrawlerTechKind } from './brawlerTypes';
import {
  BRAWLER_KICK_RANGE, BRAWLER_KIKO_RANGE, BRAWLER_SECRET_GAP_MS, BRAWLER_SECRET_ORDER, BRAWLER_GUARD_MS,
  brawlerCanPay, brawlerInHitstop, brawlerNextKickN, brawlerPressDecision, brawlerStageForPress, brawlerTechAllowed, brawlerTechCost,
  isBrawlerGuardingAt,
} from './brawler';
import { HUMAN_REACTION_MS } from './bossSkeleton';
import { kenkiLeapChance } from './kenkiLeap';
import {
  createKenkiRetreatMind, kenkiRetreating, kenkiRetreatReady, kenkiRetreatMeleeDecision, kenkiRetreatStart, kenkiRetreatMs, kenkiRetreatMsFor,
  kenkiRetreatExtend, kenkiRetreatStop, type KenkiRetreatMind,
} from './kenkiRetreat';

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
// 旧の「当たった2・3段目から確率で技へ取り消す」(PB_CANCEL_BASE)は、台本(下の PB_SCRIPTS)に置き換えて撤去した
// (research/BRAWLER_PHANTOM.md §16-1)。

// ---- 攻めの台本(research/BRAWLER_PHANTOM.md §16・社長「攻撃は今後、技の単発以外は、台本化する」) ----
/** 台本の1手(通常の何段目か/技)。 */
export type PbScriptStep = { kind: 'stage'; stage: 1 | 2 | 3 | 4 | 5 } | { kind: 'tech'; tech: 'kick' | 'stomp' | 'kiko' };
/** 届く距離の内の連続の台本の番号(§16-1 の表の #)。 */
export type PbScriptId = 1 | 2 | 3 | 4 | 5;
const st = (stage: 1 | 2 | 3 | 4 | 5): PbScriptStep => ({ kind: 'stage', stage });
const te = (tech: 'kick' | 'stomp' | 'kiko'): PbScriptStep => ({ kind: 'tech', tech });
/**
 * 台本1〜5(§16-1)。つなぎの規則はプレイヤーと同じ純関数(段→段=当たった後の先行入力・段→技/技→技=当たった後の取り消し)。
 *  1: 通常5連 / 2: 1-2-3 → 飛び蹴り → 大叩き潰し → 気功 / 3: 1-2 → 気功 / 4: 1-2-3-4 → 大叩き潰し / 5: 1 → 飛び蹴り×3
 */
export const PB_SCRIPTS: Readonly<Record<PbScriptId, readonly PbScriptStep[]>> = {
  1: [st(1), st(2), st(3), st(4), st(5)],
  2: [st(1), st(2), st(3), te('kick'), te('stomp'), te('kiko')],
  3: [st(1), st(2), te('kiko')],
  4: [st(1), st(2), st(3), st(4), te('stomp')],
  5: [st(1), te('kick'), te('kick'), te('kick')],
};
export const PB_SCRIPT_IDS: readonly PbScriptId[] = [1, 2, 3, 4, 5];
/** 台本6(§16-3)・溜め(§16-8): 拳鬼のHPがこの割合以下。 */
export const PB_SECRET_HP_FRAC = 0.5;
/**
 * HP による振る舞いの切り替え(1か所・社長裁定2026-11-10 §16-8「HP半分以下では技を使う台本を控えて溜める
 * (通常5連=台本1と構えだけ)。満タンになったら台本6」)。
 *  - hold=溜める: 台本は1だけ・詰めの飛び蹴り(台本7の頭)と気功の単発は出さない(技ポイントを使わない)。
 *    構え・ステップ・縮地・跳びかかり(ポイントを使わない)は今どおり。
 *  - secretLeap=台本6を狙う(条件の残り=満タン・間隔は pbSecretLeapReady)。
 */
export const pbHpPolicy = (i: {
  hpFrac?: number; pointCap?: number; discount: (kind: BrawlerTechKind) => number;
}): {
  hold: boolean; scripts: readonly PbScriptId[]; approachKick: boolean; kikoSingle: boolean; secretLeap: boolean;
} => {
  // ★溜めるのは「満タンで秘奥義が払える」記録だけ(検収監査2026-11-10): 技ポイントの上限が秘奥義の合計に届かない記録
  //   (格闘Lv1・2)で絞ると、台本6が永久に出ないまま技なしで溜め続ける=その時は絞らない。上限が渡されない呼び手も絞らない。
  const low = i.hpFrac !== undefined && i.hpFrac <= PB_SECRET_HP_FRAC
    && i.pointCap !== undefined && i.pointCap >= BRAWLER_SECRET_ORDER.reduce((a, k) => a + brawlerTechCost(k, false, i.discount(k)), 0);
  return low
    ? { hold: true, scripts: [1], approachKick: false, kikoSingle: false, secretLeap: true }
    : { hold: false, scripts: PB_SCRIPT_IDS, approachKick: true, kikoSingle: true, secretLeap: false };
};
/** 台本の値段(技の合計・タイムキーパーの割引込み)。 */
export const pbScriptCost = (id: PbScriptId, discount: (kind: BrawlerTechKind) => number): number =>
  PB_SCRIPTS[id].reduce((a, x) => a + (x.kind === 'tech' ? brawlerTechCost(x.tech, false, discount(x.tech)) : 0), 0);
/** いまのポイントで始めから終わりまで払える台本(台本1は常に払える)。allowed=いま使ってよい台本(HP半分以下の溜め=pbHpPolicy)。 */
export const pbAffordableScripts = (
  points: number, discount: (kind: BrawlerTechKind) => number, allowed: readonly PbScriptId[] = PB_SCRIPT_IDS,
): PbScriptId[] => allowed.filter(id => pbScriptCost(id, discount) <= points);
/** 払える台本から等しい確率で1本。直前と同じ台本は引かない(払えるのが1本だけなら同じでよい)。 */
export const pbPickScript = (
  points: number, discount: (kind: BrawlerTechKind) => number, last: PbScriptId | null, rand: () => number,
  allowed: readonly PbScriptId[] = PB_SCRIPT_IDS,
): PbScriptId => {
  const ok = pbAffordableScripts(points, discount, allowed);
  const pool = ok.length > 1 ? ok.filter(id => id !== last) : ok;
  const r = rand();
  const k = Number.isFinite(r) ? Math.max(0, Math.min(0.999999, r)) : 0;
  return pool[Math.floor(k * pool.length)] ?? 1;
};
/** 台本の k 手目が飛び蹴りなら何発目か(続けて並んだ蹴りの数)。蹴りでなければ 0。 */
export const pbScriptKickN = (steps: readonly PbScriptStep[], k: number): number => {
  let n = 0;
  for (let j = k; j >= 0; j--) { const x = steps[j]; if (x.kind === 'tech' && x.tech === 'kick') n++; else break; }
  return n;
};
/** 台本の k 手目が、いま出ている行動か。 */
export const pbScriptStepRunning = (s: BrawlerState, steps: readonly PbScriptStep[], k: number): boolean => {
  const x = steps[k];
  if (!x) return false;
  if (x.kind === 'stage') return s.phase === 'attack' && s.stage === x.stage;
  return s.phase === 'tech' && s.tech === x.tech && (x.tech !== 'kick' || s.kickN === pbScriptKickN(steps, k));
};

// ---- 届く距離の外の詰め方(社長指示2026-11-10「一定の射程に入ったら飛び蹴りでも詰めてくる(常には使わないこと 人間味を入れること)」) ----
// 考える拍ごとに「跳ぶか・撃つか・待つか・歩くか」を引く。値は全部ここ(叩き台・実機で絞る)。
/** 考える拍の間隔(ms)のゆらぎ。 */
export const PB_APPROACH_BEAT_MIN_MS = 350;
export const PB_APPROACH_BEAT_MAX_MS = 750;
/** 「ここなら跳ぶ」距離(プレイヤーの箱の縁から・px)。試みごとに引き直す。上限は飛び蹴りの届く距離。 */
export const PB_KICK_JUMP_MIN_PX = 140;
export const PB_KICK_JUMP_MAX_PX = 220;
/** 跳ぶ確率(拍ごと)。人格の meleeBias(0〜1)で MIN→MAX の間を取る。 */
export const PB_KICK_P_MIN = 0.35;
export const PB_KICK_P_MAX = 0.55;
/** 気功を撃つ確率(拍ごと)。近接寄りの人格ほど撃たない(1−meleeBias で MIN→MAX)。 */
export const PB_KIKO_P_MIN = 0.2;
export const PB_KIKO_P_MAX = 0.45;
/** 同じ詰め方の連発を避ける: 前に出してから RECENT_MIN までは確率×RECENT_MULT、RECENT_MAX にかけて元へ戻す。 */
export const PB_RECENT_MIN_MS = 2000;
export const PB_RECENT_MAX_MS = 4000;
export const PB_RECENT_MULT = 0.2;
/** 跳ばなかった拍で、間合いの端(跳ぶ距離の外側 BAND の内)なら一瞬止まって様子を見る確率と尺。1回の試みに1回まで。 */
export const PB_HOLD_P = 0.3;
export const PB_HOLD_BAND_PX = 60;
export const PB_HOLD_MIN_MS = 200;
export const PB_HOLD_MAX_MS = 500;

/** 頭脳の持ち越し(PhantomTickState に置く)。 */
export interface PhantomBrawlerMind extends KenkiRetreatMind { // 後ろへ下がる歩き(レバーガード・§16-10)の持ち越しも同じ箱
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
  /** 届く距離の外: 次に考える拍の時刻。 */
  approachBeatAt: number;
  /** この試みの「ここなら跳ぶ」距離(null=まだ引いていない)。 */
  jumpAtPx: number | null;
  /** この試みで、もう様子見をしたか。 */
  heldThisTry: boolean;
  /** 様子見で止まっている締め切り(この時刻まで歩かない)。 */
  holdUntil: number;
  /** 詰めの飛び蹴り/気功を最後に出した時刻(連発を避ける)。 */
  lastKickAt: number;
  lastKikoAt: number;
  /** 台本(§16-1): 番号と、出した手の数(idx=次に出す手の位置)。fromKick=台本7(詰めの飛び蹴りの続き)で始めた。 */
  script: { id: PbScriptId; idx: number; fromKick?: boolean } | null;
  /** 直前に選んだ台本(同じ台本を続けて引かない)。 */
  lastScriptId: PbScriptId | null;
  /** 台本7(§16-2): 詰めの飛び蹴りを出した(当たったら 1〜5 へ続ける)。 */
  approachKick: boolean;
  /**
   * 最後に「当たった」(体力を削った=strikePlayer の landed)行動の始まりの時刻(BrawlerState.startAt)。
   * 制御が判定を解いた時に書く。構えで受けられた・0ダメージの当たりは書かない=外れ扱い(§16-7)。
   */
  landedStartAt: number;
  /** 台本6(§16-3): 秘奥義を狙うための跳びかかりを出した(着地したら秘奥義を狙う)。 */
  leapForSecret: boolean;
  /**
   * 台本が終わった(出し切った・打ち切った)=次の待機で息継ぎを引く(社長指摘「拳鬼の攻撃間隔がやたら速い」の是正)。
   * 待機を通らずに次の連続へ入れるのは台本7(詰めの飛び蹴りの後)だけなので、待機で引けば台本と台本の間に必ず息継ぎが入る。
   */
  breathOwed: boolean;
  /**
   * この判断で書いた「使った」打刻の、書く前の値(検収監査2026-11-10)。技を決めた時点で書く打刻(詰めの蹴り・気功の単発の
   * 「直前に出した」・秘奥義の1手目を出した印)は、予備動作を取り消されたら(=技は出ていない)制御が pbUndoStamps で巻き戻す。
   * 判断のたびに作り直す(技を決めなかった判断では null)。
   */
  undo: PbUndo | null;
}
/** 巻き戻す打刻(書く前の値)。 */
export interface PbUndo { lastKickAt?: number; lastKikoAt?: number; secretLaunched?: boolean }
/** 予備動作を取り消された=技は出ていない: 決めた時点で書いた「使った」打刻を元へ戻す。 */
export const pbUndoStamps = (m: PhantomBrawlerMind, u: PbUndo | null): void => {
  if (!u) return;
  if (u.lastKickAt !== undefined) m.lastKickAt = u.lastKickAt;
  if (u.lastKikoAt !== undefined) m.lastKikoAt = u.lastKikoAt;
  if (u.secretLaunched !== undefined) m.secretLaunched = u.secretLaunched;
};
export const createPhantomBrawlerMind = (): PhantomBrawlerMind => ({
  nextStringAt: 0, guardReadyAt: 0, lastPressureRollAt: -Infinity, strikeTimes: [], rolledForPredictedAt: -1,
  secretPlan: false, lastSecretAt: -Infinity, secretLaunched: false, lastSeenCommitAt: 0, wasBusy: false,
  approachBeatAt: 0, jumpAtPx: null, heldThisTry: false, holdUntil: 0, lastKickAt: -Infinity, lastKikoAt: -Infinity,
  script: null, lastScriptId: null, approachKick: false, leapForSecret: false, landedStartAt: -1, breathOwed: false, undo: null,
  ...createKenkiRetreatMind(),
});

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * clamp01(k);
/** 直前に出したばかりなら確率を下げる係数(RECENT_MIN までは RECENT_MULT、RECENT_MAX にかけて1へ)。 */
export const pbRecentMult = (sinceMs: number): number => {
  if (!(sinceMs < PB_RECENT_MAX_MS)) return 1;
  if (sinceMs <= PB_RECENT_MIN_MS) return PB_RECENT_MULT;
  return lerp(PB_RECENT_MULT, 1, (sinceMs - PB_RECENT_MIN_MS) / (PB_RECENT_MAX_MS - PB_RECENT_MIN_MS));
};
/** 拍ごとに跳ぶ確率(人格+連発の抑え)。 */
export const pbKickChance = (meleeBias: number, sinceLastKickMs: number): number =>
  lerp(PB_KICK_P_MIN, PB_KICK_P_MAX, meleeBias) * pbRecentMult(sinceLastKickMs);
/** 拍ごとに気功を撃つ確率(人格+連発の抑え)。 */
export const pbKikoChance = (meleeBias: number, sinceLastKikoMs: number): number =>
  lerp(PB_KIKO_P_MIN, PB_KIKO_P_MAX, 1 - meleeBias) * pbRecentMult(sinceLastKikoMs);
/** この試みの「ここなら跳ぶ」距離。 */
export const pbRollJumpAt = (rand: () => number): number => lerp(PB_KICK_JUMP_MIN_PX, PB_KICK_JUMP_MAX_PX, rand());
/** 様子見で止まっているか(歩かない)。 */
export const phantomBrawlerHolding = (m: PhantomBrawlerMind, t: number): boolean => t < m.holdUntil;

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
  /** 覚えている先行入力を捨てる(台本7: 蹴りの押しで届く距離の外へ出た・§16-7)。 */
  | { kind: 'drop' }
  | { kind: 'tech'; tech: BrawlerTechKind }
  | { kind: 'step'; dirX: number; dirY: number }
  /** 跳びかかり(ボス技・research/BRAWLER_PHANTOM.md §15)。 */
  | { kind: 'leap' }
  /** 後ろへ下がる歩きを始めた(レバーガード・§16-10)。歩く向きは制御(phantomTick)が mind から引く=ここは台本の打ち切りの合図だけ。 */
  | { kind: 'retreat' }
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
  /** 弾への対処(この tick で実行すべきもの)。返す=構え・避ける=ステップ(向き)・下がってガード=弾の飛んできた向きへ下がる(§16-10)。 */
  bullet: { kind: 'counter' } | { kind: 'dodge'; dirX: number; dirY: number } | { kind: 'retreat'; dirX: number; dirY: number; etaMs?: number } | null;
  rand: () => number;
  /**
   * 跳びかかり(§15): 使える場面か(距離・クールダウン)と、撃たれ続けているか。未指定=使わない。
   * eligibleNear=距離の下限を外した使える場面(台本6=秘奥義を狙う跳びかかり・§16-3)。
   */
  leap?: { eligible: boolean; underFire: boolean; eligibleNear?: boolean };
  /** 拳鬼のHPの割合(health/maxHealth)と技ポイントの上限(台本6の条件・§16-3)。未指定=台本6を使わない。 */
  hpFrac?: number;
  pointCap?: number;
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
  m.undo = null;
  const act = decideInner(i, m);
  // 台本の途中に構え/ステップが入った=台本は打ち切り(人がやっても崩れたら組み直す・§16-7)。
  // 下がり(レバーガード・§16-10)も同じ(下がっている間は攻めない)。
  if (act && (act.kind === 'step' || act.kind === 'retreat' || (act.kind === 'tech' && act.tech === 'guard'))) pbInterruptScript(m);
  return act;
};
const decideInner = (i: PhantomBrawlerInput, m: PhantomBrawlerMind): PhantomBrawlerAction => {
  const { s, t } = i;
  if (s.secret) { m.secretPlan = false; m.secretLaunched = false; return null; }
  if (isBrawlerGuardingAt(s, t)) return null;
  const idle = s.phase === 'idle';
  // 後ろへ下がっている間(レバーガード・§16-10)は攻めない(短い=300〜500ms)。ただし弾への対処は捨てない(検収監査2026-11-10):
  //  - 下がりで受けられる弾(制御が向きと間に合うかを見て 'retreat' で渡す)= 下がりを続け、着弾の少し後まで延ばす(上限つき)。
  //  - 受けられない弾(向きが合わない・間に合わない)= 下がりをやめて、構えで返す/ステップで避ける。
  if (kenkiRetreating(m, t)) {
    const b = i.bullet;
    if (b?.kind === 'retreat') { kenkiRetreatExtend(m, t, b.etaMs ?? 0); return null; }
    if (b?.kind === 'counter' && t >= m.guardReadyAt && canTech(i, 'guard')) { kenkiRetreatStop(m); return { kind: 'tech', tech: 'guard' }; }
    if (b?.kind === 'dodge' && idle) { kenkiRetreatStop(m); return { kind: 'step', dirX: b.dirX, dirY: b.dirY }; }
    return null;
  }
  // 台本が終わった後の最初の待機で息継ぎを引く(台本と台本の間に必ず入る)。
  if (idle && m.breathOwed) {
    m.breathOwed = false;
    m.nextStringAt = Math.max(m.nextStringAt, t + phantomBrawlerBreath(i.rand));
  }

  // 1 守り(弾): 返す=構え(ポイントがあれば)/避ける=ステップ(待機の時だけ)。
  if (i.bullet?.kind === 'counter' && t >= m.guardReadyAt && canTech(i, 'guard')) return { kind: 'tech', tech: 'guard' };
  if (i.bullet?.kind === 'dodge' && idle) return { kind: 'step', dirX: i.bullet.dirX, dirY: i.bullet.dirY };
  // 3つ目の手(§16-10): 弾の飛んできた向きへ下がってガード(待機の時だけ・間隔が明けている時だけ=亀にしない)。
  if (i.bullet?.kind === 'retreat' && idle && kenkiRetreatReady(m, t)) {
    // 着弾(etaMs 後)まで下がり続ける長さにする(下がったのに当たる前に止まって食らう、を作らない)。
    const ms = i.bullet.etaMs !== undefined ? kenkiRetreatMsFor(i.bullet.etaMs, i.rand()) : kenkiRetreatMs(i.rand());
    kenkiRetreatStart(m, t, ms, { x: i.bullet.dirX, y: i.bullet.dirY });
    return { kind: 'retreat' };
  }

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

  // 1' 守り(下がってガード・§16-10): 上で構えを出さなかった/出せなかった(ポイント不足・クールダウン)時、予測した当たりが
  //   反応の下限の後〜1回の下がりの内に来るなら、人格の確率で後ろへ下がる(プレイヤーから離れる向き)。待機の時だけ・間隔が明けている時だけ。
  if (!m.secretPlan) {
    const ms = kenkiRetreatMeleeDecision(m, {
      t, idle, inRange: i.edgeDist <= guardRange, predictedAt: predictNextStrikeAt(m.strikeTimes), counterChance: i.counterChance, rand: i.rand,
    });
    if (ms !== null) { kenkiRetreatStart(m, t, ms, null); return { kind: 'retreat' }; }
  }

  // 2 秘奥義: 台本6(§16-3)の跳びかかりの着地の後だけ狙う(pbSecretAfterLeap が secretPlan を立てる)。
  //   旧の「合計のポイントが足りていて蹴りの届く距離なら狙い始める」は撤去(§16-3「秘奥義はこの台本からだけ」)。
  //   順番は今の進み(secretProgress)の次。
  if (m.secretPlan) {
    const prog = s.secretProgress ?? 0;
    // 1手目を出した後に順番が0のまま待機へ戻った(蹴りが外れた)/前の技の終わりから間が空いた=打ち切る。
    const gapOver = prog > 0 && idle && (s.secretLastEndAt ?? 0) > 0 && t - (s.secretLastEndAt ?? 0) > BRAWLER_SECRET_GAP_MS;
    if ((m.secretLaunched && prog === 0 && idle) || gapOver) {
      m.secretPlan = false; m.secretLaunched = false;
    } else {
      const kind = BRAWLER_SECRET_ORDER[Math.max(0, Math.min(BRAWLER_SECRET_ORDER.length - 1, prog))];
      if (!brawlerCanPay(s, kind, false, i.discount(kind))) { m.secretPlan = false; m.secretLaunched = false; return null; }
      // 1手目(蹴り)は待機からだけ。2手目以降は前の技が当たった後の取り消し(§19: 受付の内・締めの構えは気功を撃った後の受付の内)・
      // 終わりの後(待機から出し直す=順番は今どおり数える)のどちらでも。
      if ((prog > 0 || idle) && brawlerTechAllowed(s, kind, t) && !(prog === 0 && m.secretLaunched)) {
        if (prog === 0) { m.undo = { secretLaunched: m.secretLaunched }; m.secretLaunched = true; }
        return { kind: 'tech', tech: kind };
      }
      return null;
    }
  }

  // 3 台本6(§16-3): HP半分以下・技ポイントが上限ちょうど・秘奥義の間隔が明けている → 跳びかかり(距離の下限は外す・
  //   跳びかかり自身のクールダウンは守る)→ 着地したら秘奥義を狙う。合計のポイントが無ければ狙わない(秘奥義が出ない跳びを出さない)。
  if (!m.script && idle && pbSecretLeapReady(i, m)) {
    // 秘奥義の間隔(lastSecretAt)はここでは使わない=跳びかかりが実際に跳んだ時に使う(pbOnLeapJumped・溜めで取り消されたら使わない)。
    m.leapForSecret = true; m.approachKick = false;
    return { kind: 'leap' };
  }
  // 4 台本の続き(§16-1)。
  if (m.script) return pbRunScript(i, m);
  // 5 台本7(§16-2): 詰めの飛び蹴りが当たったら、着地の後そのまま 1〜5 から1本を選んで続ける。外れたら何も続けない。
  if (m.approachKick) {
    if (s.phase === 'tech' && s.tech === 'kick' && s.kickN === 1) {
      if (!s.resolved) return null;
      m.approachKick = false;
      if (!pbLanded(s, m)) return null;
      if (i.edgeDist > i.reach) return null; // 蹴りで詰め切れなかった=続けない
      const id = pbPickScript(s.points, i.discount, m.lastScriptId, i.rand, pbHpPolicy(i).scripts);
      m.lastScriptId = id;
      m.script = { id, idx: 1, fromKick: true };
      return s.buffered ? null : { kind: 'buffer' }; // 蹴りの戻りの終わりで1段目が出る
    }
    m.approachKick = false; // 蹴りが出なかった(予備動作の取り消し等)
  }
  // 届く距離の内: 台本を選んで1段目を押す(息継ぎ・反応の下限の後)。台本の外では段の続きを押さない。
  if (i.edgeDist <= i.reach) {
    if (!idle) return null;
    const chainLive = s.nextStage > 1 && t <= s.chainUntil;
    if (chainLive || t < m.nextStringAt || !i.reachReady) return null; // 息継ぎ・反応の下限
    if (brawlerPressDecision(s, t) !== 'start') return null;
    const id = pbPickScript(s.points, i.discount, m.lastScriptId, i.rand, pbHpPolicy(i).scripts);
    m.lastScriptId = id;
    m.script = { id, idx: 1 };
    return { kind: 'attack' };
  }
  if (!idle) return null;
  if (t < m.nextStringAt) return null;
  // 届く距離の外(社長指示2026-11-10「一定の射程に入ったら飛び蹴りでも詰めてくる(常には使わないこと 人間味を入れること)」):
  // 考える拍(350〜750ms のゆらぎ)ごとに引く。跳ぶ距離は試みごとに引き直す。直前に出したばかりなら出にくい。
  // 跳ばない拍は歩いて詰める(null)。ときどき間合いの端で一瞬止まって様子を見る(行くか・待つかの迷い)。
  if (t < m.holdUntil) return null;
  if (t < m.approachBeatAt) return null;
  m.approachBeatAt = t + lerp(PB_APPROACH_BEAT_MIN_MS, PB_APPROACH_BEAT_MAX_MS, i.rand());
  // 跳びかかり(§15・社長「一つだけボス技をつけるのは?ジャンプ攻撃。赤予告あり。」): 飛び蹴りの届く距離より遠い時の詰め手。
  // 拍ごとに引く(撃たれ続けている時は上がる)。クールダウン・距離は呼び手が eligible で渡す。
  if (i.leap?.eligible && i.rand() < kenkiLeapChance(i.leap.underFire)) return { kind: 'leap' };
  if (m.jumpAtPx === null) { m.jumpAtPx = Math.min(BRAWLER_KICK_RANGE, pbRollJumpAt(i.rand)); m.heldThisTry = false; }
  const pol = pbHpPolicy(i);
  if (pol.approachKick && i.edgeDist <= m.jumpAtPx && canTech(i, 'kick')) {
    if (i.rand() < pbKickChance(i.meleeBias, t - m.lastKickAt)) {
      m.undo = { lastKickAt: m.lastKickAt };
      m.lastKickAt = t; m.jumpAtPx = null;
      m.approachKick = true; // 台本7: 当たったら 1〜5 へ続ける
      return { kind: 'tech', tech: 'kick' };
    }
  } else if (pol.kikoSingle && i.edgeDist <= BRAWLER_KIKO_RANGE && i.kikoClear && canTech(i, 'kiko')) {
    if (i.rand() < pbKikoChance(i.meleeBias, t - m.lastKikoAt)) {
      m.undo = { lastKikoAt: m.lastKikoAt };
      m.lastKikoAt = t;
      return { kind: 'tech', tech: 'kiko' };
    }
  }
  // 間合いの端(跳ぶ距離の少し外〜跳ぶ距離の内)で、一瞬止まって様子を見る(1回の試みに1回まで)。
  if (!m.heldThisTry && i.edgeDist <= m.jumpAtPx + PB_HOLD_BAND_PX && i.rand() < PB_HOLD_P) {
    m.heldThisTry = true;
    m.holdUntil = t + lerp(PB_HOLD_MIN_MS, PB_HOLD_MAX_MS, i.rand());
  }
  return null;
};

/** 連続が切れた(行動中→待機・つながりの受付も過ぎた)時に、次の連続までの息継ぎを引く。 */
export const phantomBrawlerBreath = (rand: () => number): number =>
  PB_BREATH_MIN_MS + Math.max(0, Math.min(1, rand())) * (PB_BREATH_MAX_MS - PB_BREATH_MIN_MS);

/** 台本6(§16-3)の条件が揃っているか(待機・台本の外で呼ぶ)。 */
export const pbSecretLeapReady = (i: PhantomBrawlerInput, m: PhantomBrawlerMind): boolean =>
  !m.secretPlan && !!i.leap?.eligibleNear && i.pointCap !== undefined
  && pbHpPolicy(i).secretLeap && i.s.points >= i.pointCap && i.s.points >= secretTotalCost(i.discount)
  && i.t - m.lastSecretAt >= PB_SECRET_COOLDOWN_MS;

/** 跳びかかりが終わった(着地後の停止が明けた)。台本6の跳びなら秘奥義を狙い始める(当たり外れに関わらず)。 */
export const pbSecretAfterLeap = (m: PhantomBrawlerMind): void => {
  if (!m.leapForSecret) return;
  m.leapForSecret = false;
  m.secretPlan = true; m.secretLaunched = false;
  pbInterruptScript(m);
};

/**
 * 台本の続き(§16-1)。idx=出した手の数。直前に出した手が当たっていれば次の手を出す。
 *  - 段→段: 当たった後の先行入力(届く距離の内でだけ=台本にする前と同じ)。
 *  - 段→技・技→技: 当たった後の取り消し(プレイヤーと同じ brawlerTechAllowed=道の表の上・当たった時だけ・取り消しの受付の内だけ・
 *    research/BRAWLER.md §19-1・§19-2)。受付が開く前(止めの間)は待つ。受付を過ぎたら次の手は出ない=待機へ戻って台本は終わる。
 *    蹴り→蹴りは止めが明けてから。
 *  - 途中で外れたら(当たらずに判定を解いたら)打ち切り。書いた手を出し切ったら終わり。
 *  - 出した手が出ていない(被弾で先行入力が捨てられた・予備動作が取り消された・別の行動が割り込んだ)=打ち切り。
 */
export const pbRunScript = (i: PhantomBrawlerInput, m: PhantomBrawlerMind): PhantomBrawlerAction => {
  const { s, t } = i;
  const sc = m.script!;
  const steps = PB_SCRIPTS[sc.id];
  const lastI = sc.idx - 1;
  const last = steps[lastI];
  const next = steps[sc.idx];
  const end = (): null => { m.script = null; m.breathOwed = true; return null; };
  if (!last) return end();
  if (pbScriptStepRunning(s, steps, lastI)) {
    if (!s.resolved) return null;
    // 気功は弾なので判定を解いた時点では当たりが分からない=台本の終わり(2・3)にだけ置いてある。
    if (!pbLanded(s, m) && !(last.kind === 'tech' && last.tech === 'kiko')) return end();
    if (!next) return end();
    if (next.kind === 'stage') {
      if (i.edgeDist > i.reach) return null;
      if (!s.buffered && brawlerPressDecision(s, t) === 'buffer') { sc.idx++; return { kind: 'buffer' }; }
      return null;
    }
    // 次の技が払えない=打ち切り(§16-7)。払えて、まだ取り消しの受付の前(止めの間など)なら待つ。
    if (!brawlerCanPay(s, next.tech, false, i.discount(next.tech))) return end();
    if (next.tech === 'kick' && last.kind === 'tech' && last.tech === 'kick' && brawlerInHitstop(s, t)) return null;
    if (brawlerTechAllowed(s, next.tech, t)) { sc.idx++; return { kind: 'tech', tech: next.tech }; }
    return null;
  }
  // 次の段を先行入力して、前の行動の終わりを待っている間(台本7の頭=詰めの蹴りの戻りの間も)。
  if (s.buffered && last.kind === 'stage') {
    if (lastI >= 1 && pbScriptStepRunning(s, steps, lastI - 1)) return null;
    if (lastI === 0 && sc.fromKick && s.phase === 'tech' && s.tech === 'kick') {
      // 台本7の頭: 蹴りの押しで届く距離の外へ出たら打ち切り(先行入力も捨てる・§16-7)。
      if (i.edgeDist > i.reach) { end(); return { kind: 'drop' }; }
      return null;
    }
  }
  // 前の行動が終わって待機に戻った: 段のつながり・蹴りの連続の受付の内なら次を出す。
  if (s.phase === 'idle' && next) {
    if (next.kind === 'stage' && last.kind === 'stage' && s.nextStage > 1 && t <= s.chainUntil && brawlerStageForPress(s, t) === next.stage) {
      if (i.edgeDist > i.reach) return null;
      sc.idx++; return { kind: 'attack' };
    }
    if (next.kind === 'tech' && next.tech === 'kick' && last.kind === 'tech' && last.tech === 'kick'
      && brawlerNextKickN(s, t) === pbScriptKickN(steps, sc.idx) && brawlerCanPay(s, 'kick', false, i.discount('kick'))) {
      sc.idx++; return { kind: 'tech', tech: 'kick' };
    }
  }
  return end();
};

/** 直前の行動が「当たった」(判定を解いて体力を削った)か。構えで受けられた・0ダメージは外れ(§16-7)。 */
export const pbLanded = (s: BrawlerState, m: PhantomBrawlerMind): boolean =>
  s.resolved && s.connected && m.landedStartAt === s.startAt;

/** 台本の途中で拳鬼が殴られた・縮地が入った=台本は打ち切り(§16-7)。台本7・台本6の跳びの続きも捨てる。 */
export const pbInterruptScript = (m: PhantomBrawlerMind): void => {
  if (m.script) m.breathOwed = true; // 打ち切った台本の後も息継ぎ
  m.script = null; m.approachKick = false;
};

/** いま判定を解いた気功が、台本(2・3)の締めの気功か(§16-8: 近接の打撃と同じ扱いで当てる)。単発の気功は false。 */
export const pbScriptFinisherKiko = (m: PhantomBrawlerMind): boolean => {
  const sc = m.script;
  if (!sc) return false;
  const last = PB_SCRIPTS[sc.id][sc.idx - 1];
  return !!last && last.kind === 'tech' && last.tech === 'kiko' && sc.idx === PB_SCRIPTS[sc.id].length;
};

/** 跳びかかりが実際に跳んだ(溜めが明けた)。台本6の跳びなら、ここで秘奥義の間隔を使う(溜めで取り消された跳びでは使わない)。 */
export const pbOnLeapJumped = (m: PhantomBrawlerMind, t: number): void => {
  if (m.leapForSecret) m.lastSecretAt = t;
};

/**
 * 縮地が入った(§14・§16-7): 台本は打ち切るが、息継ぎは入れない(一気に詰めてそのまま次の行動へ・検収監査2026-11-10)。
 * 制御の「行動中→待機で息継ぎ」も拾わないように、行動中の印も下ろす。
 */
export const pbOnShukuchi = (m: PhantomBrawlerMind, t: number): void => {
  pbInterruptScript(m);
  m.breathOwed = false;
  m.wasBusy = false;
  m.nextStringAt = t; m.approachBeatAt = 0; m.holdUntil = 0;
};
