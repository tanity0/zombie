// research/TELEGRAPH_FIXES.md §1「突進まわり」(1-0 共通の型・D06・E02・E12・N01)の純関数。
// 描画(pixiScene)は戻り値を描く経路(drawAngelDashLine / zoneCapsuleTick)の引数へそのまま渡すだけ=位相を作り直さない。
//
// 突進の赤は2つの部品だけ(社長裁定5「斬り抜けの帯だけ太く。走る道は細い線のまま」):
//  1. 走る道の細い線(drawAngelDashLine の線)
//  2. 斬り抜けの帯(斬り抜けを持つ技だけ・判定と同じ幅)
// 走っている体に体幅の帯は付けない(v0.25.4475 で社長が却下した見せ方)。
//
// ★★赤い予告の4つの掟: ①流星=meteorPhase 1本(自前の位相を作らない) ②出る=溜め開始 ③消え切る=当たる
//   ④通る技は当たり得る間ずっと赤(走りの間に体当たりが有る型は、走りの全フレームで線が在る)。
//   型③の例外(社長裁定5): 斬り抜けの帯は斬る瞬間に消え切るが、斬り抜けの判定は strikeMs の間残る。
//   その間の危険の絵は既存の斬撃の絵(刀+ストリーク/drawMiguelSlash/drawUriSlash)で、赤い帯は出さない。
// 時計は全部 `gameTime`(store の時計)。
import { meteorPhase } from './telegraphStyle';
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';

export type DashPath = 'straight' | 'curved';

export interface DashRunSpec {
  /** 走りの間の線の型(直進=位置の割合で食わせる/曲がる=今の体→今の終点を毎フレーム引き直す)。 */
  path: DashPath;
  /** 走りの間に体当たり(isBodySlamNow)が生きているか。false の型は線を溜めの中で消し切る。 */
  bodySlamInRun: boolean;
  /** 斬り抜け(到達後の帯)を持つか。 */
  hasStrike: boolean;
}

/**
 * 突進の**走りの州そのもの**(runOn の述語)。`isBodySlamNow` は 'jump'・'g-glide-active'・'g-dive-windup' など
 * 突進でない州でも真になり biteAt でも切れるので、線の出し入れの述語には使わない(設計書 1-0「runOn」)。
 * キーは `aiPhase:<名>` / `bossState:<名>`。
 */
export const DASH_RUN_TABLE: Readonly<Record<string, DashRunSpec>> = {
  'bossState:thor-dash-move': { path: 'straight', bodySlamInRun: true, hasStrike: true },  // トール 突進
  'bossState:mdash-move': { path: 'straight', bodySlamInRun: true, hasStrike: true },      // ミゲル 踏み込み
  'bossState:thrust': { path: 'straight', bodySlamInRun: false, hasStrike: true },         // ウリ 踏み込み突き
  'bossState:bm-charge': { path: 'straight', bodySlamInRun: true, hasStrike: false },      // 馬乗り 突進
  'aiPhase:charge': { path: 'curved', bodySlamInRun: true, hasStrike: false },             // 犬/Lv2/大蝙蝠/ハンター
  'aiPhase:g-dash-charge': { path: 'curved', bodySlamInRun: true, hasStrike: false },      // 城ボス 突進
  'aiPhase:g-quad-charge': { path: 'curved', bodySlamInRun: true, hasStrike: false },      // 城ボス 三連(段ごと)
  'bossState:dash': { path: 'curved', bodySlamInRun: true, hasStrike: false },             // 裏ボス 突進
};

/** その敵が今、表にある走りの州か(州そのものの一致だけで決める)。 */
export const dashRunSpecOf = (e: { aiPhase?: string; bossState?: string }): DashRunSpec | null =>
  (e.bossState !== undefined ? DASH_RUN_TABLE[`bossState:${e.bossState}`] : undefined)
  ?? (e.aiPhase !== undefined ? DASH_RUN_TABLE[`aiPhase:${e.aiPhase}`] : undefined)
  ?? null;

export interface Pt { x: number; y: number }

export interface DashTelegraphInput {
  gameTime: number;
  /** 溜めの尺・走りの尺(各技の表の値。雑魚・城ボスは速度倍率込みの式で割った値)。 */
  windupMs: number;
  moveMs: number;
  /** 到着後の斬り抜けの尺(斬り抜けを持つ直進の型の「到着後の線」を州の終わりで0にするため)。 */
  strikeMs?: number;
  state: 'windup' | 'run' | 'other';
  /** 溜めの間の時刻の出どころ(雑魚・城ボスは aiPhaseUntil を読み替えて渡す)。 */
  bossStateUntil: number;
  /** 走りの間の時刻の出どころ(走り出す瞬間に書かれる値。溜めの間は使わない)。 */
  aiStartedAt: number;
  path: DashPath;
  bodySlamInRun: boolean;
  /** 線の根元。溜めの間=今の体の中心/直進の型の走りの間=走りに入ったフレームに焼いた体の中心。 */
  lineFrom: Pt;
  /** 線の終点(直進=斬り抜けの先端まで伸ばした点/曲がる=今の終点)。 */
  lineEnd: Pt;
  /** 今の体の中心。 */
  runnerPos: Pt;
  hasStrike: boolean;
  drawFrac?: number;
}

export interface DashLineArgs {
  /** drawAngelDashLine の prog。 */
  prog: number;
  /** drawAngelDashLine の eraseOverride(undefined=中で meteorPhase を引く)。 */
  eraseOverride: number | undefined;
  /** 線全体の濃さ(到着後の線を州の終わりへ向けて薄める)。 */
  alpha: number;
  from: Pt;
  to: Pt;
}

export interface DashBandArgs {
  /** zoneCapsuleTick の prog(溜め始め=0、斬る瞬間=1)。 */
  prog: number;
  /** zoneCapsuleTick の windupOn(帯にとっての「溜め」は斬る瞬間まで)。 */
  windupOn: boolean;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** 直進の型の「走者の位置の割合」: 伸ばした全長(lineFrom→lineEnd)に対して、走者がどこまで来たか。 */
export const dashRunnerFrac = (lineFrom: Pt, lineEnd: Pt, runnerPos: Pt): number => {
  const dx = lineEnd.x - lineFrom.x, dy = lineEnd.y - lineFrom.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-6) return 1;
  return clamp01(((runnerPos.x - lineFrom.x) * dx + (runnerPos.y - lineFrom.y) * dy) / (len * len));
};

/** 溜め始め・走り出し・斬る瞬間の時刻(設計書 1-0「時刻の式」)。 */
export const dashTimes = (inp: Pick<DashTelegraphInput, 'state' | 'bossStateUntil' | 'aiStartedAt' | 'windupMs' | 'moveMs'>) => {
  const runStart = inp.state === 'run' ? inp.aiStartedAt : inp.bossStateUntil;
  return { windupStart: runStart - inp.windupMs, runStart, strikeStart: runStart + inp.moveMs };
};

export const dashTelegraphPhase = (inp: DashTelegraphInput): { line: DashLineArgs | null; band: DashBandArgs | null } => {
  if (inp.state === 'other') {
    // 走りの州を抜けた=帯は windupOn=false(完走なら zoneCapsuleTick は何も描かない/中断なら残りを消し切る)。
    return { line: null, band: inp.hasStrike ? { prog: 1, windupOn: false } : null };
  }
  const { windupStart, strikeStart } = dashTimes(inp);
  const band: DashBandArgs | null = inp.hasStrike
    ? {
      prog: clamp01((inp.gameTime - windupStart) / Math.max(1, strikeStart - windupStart)),
      windupOn: inp.gameTime < strikeStart,
    }
    : null;
  if (inp.state === 'windup') {
    const wProg = clamp01((inp.gameTime - windupStart) / Math.max(1, inp.windupMs));
    if (!inp.bodySlamInRun) {
      // 溜めの中で描いて消し切る(今の dashLineTick と同じ)。
      return { line: { prog: wProg, eraseOverride: undefined, alpha: 1, from: inp.lineFrom, to: inp.lineEnd }, band };
    }
    // 描きの位置は meteorPhase から取り、消しは走りへ持ち越す(④)。
    const ph = meteorPhase(wProg, inp.drawFrac);
    return { line: { prog: ph.p, eraseOverride: 0, alpha: 1, from: inp.lineFrom, to: inp.lineEnd }, band };
  }
  // ---- 走りの間 ----
  if (!inp.bodySlamInRun) return { line: null, band };
  if (inp.path === 'curved') {
    return { line: { prog: 1, eraseOverride: 0, alpha: 1, from: inp.runnerPos, to: inp.lineEnd }, band };
  }
  const er = dashRunnerFrac(inp.lineFrom, inp.lineEnd, inp.runnerPos);
  let alpha = 1;
  if (inp.hasStrike && inp.gameTime >= strikeStart) {
    // 到着後の線: 州の終わり(strikeStart + strikeMs)にちょうど0(easeIn)。
    const u = clamp01((inp.gameTime - strikeStart) / Math.max(1, inp.strikeMs ?? 1));
    alpha = 1 - u * u;
  }
  return { line: { prog: 1, eraseOverride: er, alpha, from: inp.lineFrom, to: inp.lineEnd }, band };
};

/**
 * トールの突進の走りの間の体の中心(判定 useGameLoop の thor-dash-move と描画の両方が読む)。
 * 補間は両端で速度0の曲線(ease01 を呼び出し側が渡す=useGameLoop の airHopEase01)、
 * 置き場は「行ける帯」(clampRectToPlayableArea)を通した後の矩形の中心。
 */
export const thorDashRunCenter = (
  from: Pt, target: Pt, eased01: number, box: { width: number; height: number }, opts: PlayableAreaCtx,
): Pt => {
  const nx0 = from.x + (target.x - from.x) * eased01;
  const ny0 = from.y + (target.y - from.y) * eased01;
  const placed = clampRectToPlayableArea(nx0 - box.width / 2, ny0 - box.height / 2, box.width, box.height, opts);
  return { x: placed.x + box.width / 2, y: placed.y + box.height / 2 };
};

/** トールの突進の到達点=斬り抜けの帯の始点(クランプ後の目標の中心)。 */
export const thorDashArrival = (
  from: Pt, target: Pt, box: { width: number; height: number }, opts: PlayableAreaCtx,
): Pt => thorDashRunCenter(from, target, 1, box, opts);

/** 斬り抜けの帯の終点=始点 + 進行方向(normalize(target − from))× range。 */
export const dashStrikeBandEnd = (from: Pt, target: Pt, start: Pt, range: number): Pt => {
  let dx = target.x - from.x, dy = target.y - from.y;
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  return { x: start.x + dx * range, y: start.y + dy * range };
};
