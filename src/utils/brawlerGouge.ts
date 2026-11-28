// ★格闘の新技「抉り打ち」の溜めと離し(research/BRAWLER.md §37・§37-7)。純関数だけ(store / pixi は読むだけ・描画も store も import しない)。
// 出し方: 立ち止まって近接を0.5秒(実時間・テンポ係数は掛けない)押し続けて離す。0.5秒未満の押下は今までどおり(段・連打・フリック・ステップ)。
// プレイヤーだけが使う(幻影・孫悟空・守護霊・拳鬼の AI はこのファイルを読まない)。
import type { BrawlerState } from './brawlerTypes';
import { brawlerPressDecision, brawlerStepping, isBrawlerGuardingAt, brawlerGougeChargeSink, BRAWLER_GOUGE_GLOW_DELAY_MS } from './brawler';

/** 溜まるまでの長さ(ms・実時間=Date.now。テンポ係数は掛けない・§37-2)。 */
export const BRAWLER_GOUGE_CHARGE_MS = 500;
/** 溜めの間(押し始めから)段のつながり(chainUntil)を保つ余り(ms・gameTime)。毎フレームこの先まで延ばし直す=離した瞬間まで切れない。
 *  延ばす前の値は gougeChainOrig に残し、溜めが消えた(0.5秒未満で離した・移動・被弾の後の離し)時は元へ戻す=0.5秒未満の押下は今と同じ。 */
export const BRAWLER_GOUGE_CHAIN_KEEP_MS = 100;
/** 溜めの光と構えの絵を出し始めるまでの長さ(ms・実時間)。これより短い押下(タップ・連打)では光も構えも一切出ない(値は utils/brawler に置く=姿勢も読む)。 */
export { BRAWLER_GOUGE_GLOW_DELAY_MS };

/** 溜めの判断に要る、状態の外の事情(store が毎回集めて渡す)。 */
export interface BrawlerGougeCtx {
  /** 格闘の入口の関所が開いているか(死亡・対人の紫/気絶・掴まれ・乗車・シーカー・被弾のしゃがみ・秘奥義の最中なら false)。 */
  gateOk: boolean;
  /** 浮いている間(攻撃できない間・§36-0)。 */
  airLocked: boolean;
  /** 移動の入力が入っている(タッチ=指が遊びの外 / PC=移動キー / パッド=スティック)。速度では測らない(§37-7)。 */
  moveInput: boolean;
}

/**
 * いまの体が溜めをどう扱うか。
 *  - 'charge' = 溜めを数える(待機・1〜4段目の最中)。
 *  - 'wait'   = 技・構え・ステップ・5段目(締め)の最中(この間に押した押下は、それが終わった時刻から数える。5段目の後は段のつなぎにはしない=待機からの抉り打ち)。
 *  - 'none'   = 溜められない(関所が閉じている・浮いている・移動の入力・秘奥義)。
 */
export type BrawlerGougeBody = 'charge' | 'wait' | 'none';
export const brawlerGougeBody = (s: BrawlerState, t: number, c: BrawlerGougeCtx): BrawlerGougeBody => {
  if (!c.gateOk || c.airLocked || c.moveInput || s.secret) return 'none';
  if (s.phase === 'attack') return s.stage >= 1 && s.stage <= 4 ? 'charge' : 'wait'; // 5段目(締め)の最中は終わってから数える(つなぎにはしない・§37-7)
  if (s.phase === 'tech' || isBrawlerGuardingAt(s, t) || brawlerStepping(s, t)) return 'wait';
  return 'charge';
};

/**
 * 押し始めた時刻が「次の段へつながる受付」の内か(§37-7)。今の段(1〜4段目)の先行入力の受付〜段の後のつながり(chainUntil)の間。
 * この内で押し始めた溜めから出た抉り打ちは、段のつなぎとして数える。
 */
export const brawlerGougeLinkable = (s: BrawlerState, t: number): boolean => {
  if (s.phase === 'attack') return s.stage >= 1 && s.stage <= 4 && brawlerPressDecision({ ...s, buffered: false }, t) === 'buffer';
  return s.phase === 'idle' && s.nextStage >= 2 && s.nextStage <= 5 && s.chainUntil > 0 && t <= s.chainUntil;
};

/**
 * 溜めの欄を全部消した状態(押下の記録も消す=離せば今までどおり)。欄が無ければ同じ物を返す。
 * 溜めのために延ばした段のつながりは元の値へ戻す(0.5秒未満の押下・移動で消えた溜めは、延ばさなかった時と同じ)。
 * now(Date.now)を渡すと、構えの絵が出ていた時はその沈みを抜けの起点として残す(描画が加減速つきで戻す)。
 */
export const brawlerGougeClear = (s: BrawlerState, now?: number): BrawlerState => {
  if (s.gougePressAt === undefined && s.gougeChargeAt === undefined && s.gougeReadyAt === undefined && !s.gougeWait && !s.gougeLink && !s.gougeDead
    && s.gougeChainOrig === undefined && s.gougeLinkHits === undefined) return s;
  const sink = now !== undefined ? brawlerGougeChargeSink(s, now) : 0;
  return {
    ...s, gougePressAt: undefined, gougeChargeAt: undefined, gougeReadyAt: undefined, gougeWait: false, gougeLink: false, gougeDead: false,
    gougeChainOrig: undefined, gougeLinkHits: undefined,
    ...(s.gougeChainOrig !== undefined ? { chainUntil: s.gougeChainOrig } : {}),
    ...(sink > 0.001 && now !== undefined ? { gougeEndAt: now, gougeEndSink: sink } : {}),
  };
};

/** 押した(指を置いた・ボタンを押した)。溜められる体なら溜めを始める(技・構え・ステップの最中なら終わるのを待つ)。now=Date.now。 */
export const brawlerGougePress = (s: BrawlerState, t: number, now: number, c: BrawlerGougeCtx): BrawlerState => {
  const base = brawlerGougeClear(s);
  const body = brawlerGougeBody(s, t, c);
  if (body === 'none') return base;
  return { ...base, gougePressAt: now, gougeChargeAt: now, gougeReadyAt: undefined, gougeWait: body === 'wait', gougeLink: brawlerGougeLinkable(s, t), gougeDead: false };
};

/**
 * 段のつなぎの溜めの間、つながっているコンボの数(HIT)を覚えておく(m=いまの数)。押している間に敵の固まりが切れて画面の数が消えても、
 * 離して出た抉り打ちの当たりはこの数の続きとして数える(§37-7)。つなぎでない溜め・溜めていない時は何もしない(同じ物を返す)。
 */
export const brawlerGougeNoteLinkHits = (s: BrawlerState, m: number): BrawlerState =>
  s.gougePressAt !== undefined && s.gougeLink && !s.gougeDead && m > (s.gougeLinkHits ?? 0) ? { ...s, gougeLinkHits: m } : s;
/** 当たり1回の HIT の数(base=その敵のいまの続きの数+1・carry=段のつなぎとして出た抉り打ちが持ち越した数)。持ち越しの続きより小さくしない。 */
export const brawlerLinkWithCarry = (base: number, carry: number | undefined): number => Math.max(base, (carry ?? 0) > 0 ? (carry ?? 0) + 1 : 0);

/** いま溜まっているか(溜まった時刻が付いている・または数え始めてから0.5秒経った=毎フレームの判定より先に離した時も同じ結果)。 */
export const brawlerGougeCharged = (s: BrawlerState, now: number): boolean =>
  s.gougePressAt !== undefined && !s.gougeDead && !s.gougeWait
  && (s.gougeReadyAt !== undefined || (s.gougeChargeAt !== undefined && now - s.gougeChargeAt >= BRAWLER_GOUGE_CHARGE_MS));

/**
 * 毎フレーム(格闘の時計)。ready=この瞬間に溜まった(合図の音と光を出す)。
 *  - 溜められない体になった(移動の入力・関所・浮いた・秘奥義)=溜めは消える(押下の記録も消える=離せば今どおり)。
 *  - 溜めの途中で技・構え・ステップに入った=溜めは消える。技・構え・ステップの最中に押した押下は、それが終わった時刻から数え始める。
 *  - 被弾で消えた溜め(gougeDead)は、離すまでそのまま(離しは何も出さない)。
 *  - 段の受付の内で押し始めた溜めは、押し始めから離すまでつながり(chainUntil)を延ばす(溜めのせいでつながりが切れない)。
 *    延ばす前の値は gougeChainOrig に残す(溜めが消えた時・0.5秒未満で離した時は brawlerGougeClear が元へ戻す)。
 */
export const brawlerGougeTick = (s: BrawlerState, t: number, now: number, c: BrawlerGougeCtx): { state: BrawlerState; ready: boolean } => {
  if (s.gougePressAt === undefined || s.gougeDead) return { state: s, ready: false };
  const body = brawlerGougeBody(s, t, c);
  if (body === 'none') return { state: brawlerGougeClear(s, now), ready: false };
  if (body === 'wait') return { state: s.gougeWait ? s : brawlerGougeClear(s, now), ready: false };
  if (s.gougeWait) return { state: { ...s, gougeWait: false, gougeChargeAt: now }, ready: false };
  let next = s;
  let ready = false;
  if (s.gougeReadyAt === undefined && s.gougeChargeAt !== undefined && now - s.gougeChargeAt >= BRAWLER_GOUGE_CHARGE_MS) {
    next = { ...next, gougeReadyAt: now };
    ready = true;
  }
  // 段のつながり: 押し始めから、待機で次の段が生きている間は切らない(0.5秒未満で離した時は元の値へ戻る=今と同じ)。
  if (next.gougeLink && next.phase === 'idle' && next.nextStage > 1 && next.chainUntil >= t && next.chainUntil < t + BRAWLER_GOUGE_CHAIN_KEEP_MS) {
    next = { ...next, chainUntil: t + BRAWLER_GOUGE_CHAIN_KEEP_MS, gougeChainOrig: next.gougeChainOrig ?? next.chainUntil };
  }
  return { state: next, ready };
};

/**
 * 離した時に何を出すか。
 *  - 'gouge'  = 抉り打ちを出す(溜まっている)。
 *  - 'none'   = 何も出さない(溜めの途中で被弾して溜めが消えた押下を0.5秒以上押していた)。
 *  - 'normal' = 今までどおり(0.5秒未満・溜めていない・溜めが消えた押下)。
 * ★0.5秒未満の押下は必ず 'normal'(被弾で溜めが消えていても=今と同じ)。
 */
export type BrawlerGougeRelease = 'gouge' | 'none' | 'normal';
export const brawlerGougeReleaseKind = (s: BrawlerState, now: number): BrawlerGougeRelease => {
  if (s.gougePressAt === undefined) return 'normal';
  if (s.gougeDead) return now - s.gougePressAt >= BRAWLER_GOUGE_CHARGE_MS ? 'none' : 'normal';
  return brawlerGougeCharged(s, now) ? 'gouge' : 'normal';
};

/**
 * 被弾した(体力が減って怯む被弾=レバーガードで受け切った・スーパーアーマーの被弾は呼び手が kill=false で渡す)。
 * 溜めている押下なら溜めは消え、その押下の離しは何も出さない(gougeDead)。
 */
export const brawlerGougeAfterHurt = (s: BrawlerState, kill: boolean): BrawlerState =>
  kill && s.gougePressAt !== undefined && !s.gougeDead
    ? { ...s, gougeChargeAt: undefined, gougeReadyAt: undefined, gougeWait: false, gougeLink: false, gougeDead: true }
    : s;

/**
 * 離して出す時の出し方(状態から)。'fresh'=待機から(段の受付の内で押し始めていればつなぎとして数える)/
 * 'cancel'=1〜4段目の後隙を取り消して出す / null=出さない(段の前隙の間・技の最中など)。
 */
export const brawlerGougeFireFrom = (s: BrawlerState): 'fresh' | 'cancel' | null => {
  if (s.secret) return null;
  if (s.phase === 'idle') return 'fresh';
  if (s.phase === 'attack' && s.stage >= 1 && s.stage <= 4 && s.resolved) return 'cancel';
  return null;
};

/**
 * 溜めの光の強さ(描画が読む)。数え始めてから BRAWLER_GOUGE_GLOW_DELAY_MS までは 0(タップ・連打では一切光らない)。
 * そこから溜まるまで直線で 0→1(150ms を超えたらすぐ手応えが返る)。溜まった後は 1 を下回らずに脈打つ(1〜1.15=しぼまない)。溜めていなければ 0。
 */
export const brawlerGougeGlow = (s: BrawlerState, now: number): { level: number; ready: boolean; sinceReady: number } => {
  if (s.gougePressAt === undefined || s.gougeDead || s.gougeWait || s.gougeChargeAt === undefined) return { level: 0, ready: false, sinceReady: -1 };
  if (s.gougeReadyAt !== undefined) {
    const since = Math.max(0, now - s.gougeReadyAt);
    return { level: 1 + 0.15 * (0.5 - 0.5 * Math.cos(since / 95)), ready: true, sinceReady: since };
  }
  const el = now - s.gougeChargeAt;
  if (el <= BRAWLER_GOUGE_GLOW_DELAY_MS) return { level: 0, ready: false, sinceReady: -1 };
  return { level: Math.min(1, (el - BRAWLER_GOUGE_GLOW_DELAY_MS) / (BRAWLER_GOUGE_CHARGE_MS - BRAWLER_GOUGE_GLOW_DELAY_MS)), ready: false, sinceReady: -1 };
};

/** 溜めの間に拳へ吸い込まれる粒の数(絵だけ)。 */
export const BRAWLER_GOUGE_MOTES = 5;
/** 粒1つが外から拳へ入るまでの長さ(ms)と、出てくる半径(px・拳から)。 */
export const BRAWLER_GOUGE_MOTE_MS = 280;
export const BRAWLER_GOUGE_MOTE_R_PX = 30;
/**
 * 溜めの間の粒 i の位置(拳からのずれ・前向きが +dx)・大きさ・濃さ。el=光が出始めてからの ms。溜まった後・まだ出ていない粒は null。
 * 周りから拳へ、加速しながら吸い込まれる(半径は 1−u² で縮む=慣性)。出始めは薄く、入る直前に濃く小さくなって消える。純関数(描画が読む)。
 */
export const brawlerGougeMote = (i: number, el: number, ready: boolean): { dx: number; dy: number; size: number; alpha: number } | null => {
  if (ready || el < 0) return null;
  const P = BRAWLER_GOUGE_MOTE_MS;
  const ti = el - (i * P) / BRAWLER_GOUGE_MOTES;
  if (ti < 0) return null;
  const cyc = Math.floor(ti / P);
  const u = (ti - cyc * P) / P;
  const a = i * 2.39996 + cyc * 1.7 + 0.4;
  const r = BRAWLER_GOUGE_MOTE_R_PX * (1 - u * u) * (0.8 + 0.2 * ((i * 7 + cyc * 3) % 5) / 4);
  const fadeIn = Math.min(1, u / 0.25);
  const fadeOut = u > 0.88 ? 1 - (u - 0.88) / 0.12 : 1;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r * 0.75, size: 2.6 - 1.2 * u, alpha: 0.9 * fadeIn * fadeOut };
};
